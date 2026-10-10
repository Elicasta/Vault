"use client";
import { useEffect,useRef,useState } from "react";
import { ensureProxySession, SECURITY_V2_ENABLED } from "@/lib/security-session";
import { buildVaultMediaItem } from "@/lib/media-capture-import.mjs";
import { itemKey,sourceIdOf } from "@/lib/utils";

export default function SourceInspector({ pageUrl, folder, onSave, onExplorePage, existingUrls=[] }) {
  const [target,setTarget]=useState(pageUrl||"");
  const [open,setOpen]=useState(false);
  const [state,setState]=useState("idle");
  const [kind,setKind]=useState("all");
  const [data,setData]=useState(null);
  const [error,setError]=useState("");
  const [saved,setSaved]=useState([]);
  const [saving,setSaving]=useState("");
  const [copied,setCopied]=useState("");
  const controller=useRef(null);
  useEffect(()=>{
    controller.current?.abort();
    setTarget(pageUrl||"");
    setData(null);setState("idle");setError("");setCopied("");setOpen(false);
    return ()=>controller.current?.abort();
  },[pageUrl]);

  const inspect=async (url=target, type=kind)=>{
    const trimmed=String(url||"").trim();
    if(!/^https?:\/\//i.test(trimmed)){setError("Paste a public website or media URL, starting with https://");return;}
    controller.current?.abort();
    const c=new AbortController();controller.current=c;
    setState("loading");setError("");setData(null);setOpen(true);
    try {
      if(SECURITY_V2_ENABLED)await ensureProxySession();
      const send=()=>fetch("/api/source-inspector?url="+encodeURIComponent(trimmed)+"&kind="+encodeURIComponent(type),{
        method:"GET",signal:c.signal,credentials:"same-origin",cache:"no-store",
      });
      let res=await send();
      if(res.status===401&&SECURITY_V2_ENABLED){await ensureProxySession(null,{force:true});res=await send();}
      const json=await res.json().catch(()=>({}));
      if(!res.ok)throw new Error(json.error||"Could not inspect the source.");
      if(!c.signal.aborted){setData(json);setState("done");}
    }catch(e){if(!c.signal.aborted){setState("error");setError(e.message||"Source lookup failed.");}}
  };
  const save=async source=>{
    if(!source?.verified||saving)return;
    setSaving(source.url);setError("");
    try {
      await onSave(buildVaultMediaItem(source,folder,itemKey,sourceIdOf));
      setSaved(x=>[...x,source.url]);
    }catch(e){setError(e.message||"Save failed");}
    finally{setSaving("");}
  };
  const copy=async url=>{
    try{await navigator.clipboard.writeText(url);setCopied(url);}
    catch{setError("Clipboard unavailable. Open the source link and copy it from your browser.");}
  };
  const stored=new Set([...existingUrls,...saved]);
  return <section className="vv-source-inspector" aria-label="Find the original media URL">
    <div className="vv-source-header">
      <div><span className="vv-media-eyebrow">SOURCE FINDER</span><h3>Find the actual image or video link</h3>
        <p>Vault checks the selected page and its immediate image/video details. It verifies file URLs when a public content-type response is available.</p>
      </div>
      <button type="button" onClick={()=>{setOpen(x=>!x);if(!open&&!data)inspect();}} aria-expanded={open}>
        {open?"Hide sources":"Find source URL"}
      </button>
    </div>
    {open&&<div className="vv-source-body">
      <label>Page or media link
        <input value={target} onChange={e=>setTarget(e.target.value)} type="url" autoComplete="url"
          placeholder="https://website.example/post/123" aria-label="Source page URL"/>
      </label>
      <div className="vv-source-actions">
        <select value={kind} onChange={e=>setKind(e.target.value)} aria-label="Source file type">
          <option value="all">Images + videos</option>
          <option value="image">Only images</option>
          <option value="video">Only videos</option>
        </select>
        <button type="button" disabled={state==="loading"||!target.trim()} onClick={()=>inspect()}>
          {state==="loading"?"Inspecting…":"Inspect source"}
        </button>
      </div>
      {state==="loading"&&<p role="status">Checking media metadata, image details and video players…</p>}
      {error&&<p role="alert" className="vv-source-error">{error}</p>}
      {data&&<div className="vv-source-summary">
        <strong>{data.counts?.verified||0} verified media file{data.counts?.verified===1?"":"s"} · {data.sources?.length||0} candidates</strong>
        {data.reason&&<p role="status">{data.reason}</p>}
        {data.sources?.map((source,i)=>{
          const already=stored.has(source.url);
          return <div className="vv-source-result" key={source.type+"|"+source.url+"|"+i}>
            <div className="vv-source-result-title">
              <span className={"vv-source-reliability"+(source.verified?" verified":"")}>{source.verified?"Verified "+source.type:"Unverified "+source.type}</span>
              <strong>{source.title||source.type}</strong>
            </div>
            <p className="vv-source-address">{source.url}</p>
            <small>{source.verified?"Server confirmed "+source.mimeType:"The website exposed this address, but its file type could not be verified."}</small>
            <div className="vv-source-result-actions">
              {source.verified&&<button type="button" onClick={()=>save(source)} disabled={!!saving||already}>
                {already?"Saved to Vault":saving===source.url?"Saving…":"Save verified file"}
              </button>}
              <button type="button" onClick={()=>copy(source.url)}>{copied===source.url?"Copied":"Copy URL"}</button>
              <a href={source.url} target="_blank" rel="noopener noreferrer">Open source</a>
            </div>
          </div>;
        })}
        {!!data.detailPages?.length&&<details className="vv-source-pages">
          <summary>Explore {data.detailPages.length} linked media pages</summary>
          {data.detailPages.map(item=><button key={item.url} type="button" onClick={()=>{setTarget(item.url);inspect(item.url,item.type||kind);}}>
            {item.title||"Media detail"} · {item.type} ↗
          </button>)}
        </details>}
        <p className="vv-source-disclaimer">{data.guidance}</p>
      </div>}
      <p className="vv-source-footnote">On iPhone, a generator's Download button may produce a file with no public URL. Save that file to Files, then upload it into Vault. Vault cannot read another site's protected browser memory or create public links for inline data: and blob: images.</p>
    </div>}
  </section>;
}
