"use client";
import {useMemo,useRef,useState} from "react";
import {ensureProxySession,SECURITY_V2_ENABLED} from "@/lib/security-session";
import {itemKey,DEFAULT_SHEET_SOURCE} from "@/lib/utils";
import {parseInAppUrlBatch,galleryPageLinkItem} from "@/lib/in-app-url-batch.mjs";

export default function GalleryUrlBatchImport({folder="",onSave,onCreateFolder,existingUrls=[]}){
 const [raw,setRaw]=useState("");
 const [sheetUrl,setSheetUrl]=useState("");
 const [entries,setEntries]=useState([]);
 const [selected,setSelected]=useState([]);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 const [saved,setSaved]=useState([]);
 const inputRef=useRef(null);
 const known=useMemo(()=>new Set([...existingUrls,...saved]),[existingUrls,saved]);
 const toSave=entries.filter(x=>selected.includes(x.url)&&!known.has(x.url));
 const preview=(text)=>{
  const parsed=parseInAppUrlBatch(text,{folder});
  setEntries(parsed.items);setSelected(parsed.items.map(x=>x.url));
  setError("");
  setMessage(parsed.items.length+" gallery/media links ready to save · "+
    parsed.duplicates+" duplicate · "+parsed.invalid+" invalid"+(parsed.truncated?" · import capped at 1,000 links":""));
 };
 const loadFile=async event=>{
  const file=event.target.files?.[0];event.target.value="";
  if(!file)return;
  if(file.size>1_000_000){setError("Choose a CSV or TSV file under 1 MB.");return;}
  try{const body=await file.text();setRaw(body);preview(body);}
  catch(e){setError(e?.message||"Could not read file.");}
 };
 const loadSheet=async(sourceOverride="")=>{
  const source=String(sourceOverride||sheetUrl||"").trim();
  let u;try{u=new URL(source);}catch{setError("Enter a Google Sheets link.");return;}
  const match=u.hostname==="docs.google.com"&&u.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]{20,160})/);
  if(!match){setError("Enter a valid Google Sheets document link.");return;}
  setBusy(true);setError("");setMessage("");
  try{
   if(SECURITY_V2_ENABLED)await ensureProxySession();
   const gid=u.searchParams.get("gid")||u.hash.match(/gid=(\d+)/)?.[1]||"";
   const request=()=>fetch("/api/sheet-import",{
    method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({sheetId:match[1],tabNames:gid?["gid:"+gid]:[]}),
   });
   let response=await request();
   if(response.status===401&&SECURITY_V2_ENABLED){
    await ensureProxySession(null,{force:true});response=await request();
   }
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Could not read this Sheet.");
   const rows=Array.isArray(data.items)?data.items:[];
   const unique=new Map();
   for(const item of rows){
    if(!/^https?:\/\//i.test(item.url||""))continue;
    unique.set(item.url,{url:item.url,title:item.title||"Gallery link",folder:item.folder||folder,
      type:item.type||"link",thumbnail:item.thumbnail||"",sourcePage:item.url});
   }
   const list=[...unique.values()].slice(0,1000);
   setEntries(list);setSelected(list.map(x=>x.url));
   setMessage(list.length+" Sheet links loaded. Select and import them as Vault gallery links."+
     (data.errors?.length?" Some Sheet tabs couldn't be read: "+data.errors.slice(0,2).join("; "):""));
   if(!list.length&&data.errors?.length)setError(data.errors.join("; "));
  }catch(e){setError(e?.message||"Could not load the Sheet. For a private Sheet, paste its cells or upload CSV.");}
  finally{setBusy(false);}
 };
 const save=async()=>{
  if(busy||!toSave.length)return;
  setBusy(true);setError("");setMessage("");
  let count=0;const errors=[];
  const folders=new Set();
  for(const item of toSave){
   const name=(item.folder||folder||"").trim();
   if(name&&!folders.has(name.toLowerCase())){
    try{await onCreateFolder?.(name);folders.add(name.toLowerCase());}
    catch(e){errors.push("Collection "+name+": "+(e?.message||"failed"));continue;}
   }
   try{
    const media=galleryPageLinkItem({...item,kind:"gallery"},{folder:name,keyOf:itemKey});
    if(!media)throw new Error("Invalid URL");
    await onSave(media);count++;
    setSaved(p=>p.includes(media.url)?p:[...p,media.url]);
    if(count%20===0)setMessage(count+" gallery URLs saved…");
   }catch(e){errors.push(e?.message||"Unable to save a URL");}
  }
  setMessage(count+" gallery links saved to your Vault library."+ (errors.length?" "+errors.length+" failed.":""));
  if(errors.length)setError(errors[0]);
  setBusy(false);
 };
 const changeAll=checked=>setSelected(checked?entries.filter(x=>!known.has(x.url)).map(x=>x.url):[]);
 return <section className="vv-generator-section vv-url-list-import" aria-label="Import lists of gallery URLs">
  <div className="v2-eyebrow">NO IMAGE DOWNLOADS REQUIRED</div>
  <h3>Import gallery URLs in bulk</h3>
  <p>Paste gallery links from Google Sheets, import a public Sheet, or upload CSV/TSV. Vault saves the gallery links as library entries—even when the gallery itself returns HTTP 403.</p>
  <div className="vv-url-list-fields">
   <label>Paste URLs or Sheet cells
    <textarea rows={5} value={raw} onChange={e=>setRaw(e.target.value)}
      placeholder={"https://example.com/gallery/one\nhttps://example.com/gallery/two\n\nOr paste URL, Title, Collection columns from Sheets"}
      aria-label="Gallery URL list"/>
   </label>
   <div className="vv-generator-primary-actions">
    <button type="button" disabled={!raw.trim()||busy} onClick={()=>preview(raw)}>Review URL list</button>
    <button type="button" disabled={busy} onClick={()=>inputRef.current?.click()}>Choose CSV / TSV</button>
    <input ref={inputRef} type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values,text/plain"
      aria-label="Upload URL spreadsheet CSV or TSV" hidden onChange={loadFile}/>
   </div>
   <label>Or import a public Google Sheet
    <input type="url" value={sheetUrl} onChange={e=>setSheetUrl(e.target.value)}
      placeholder="https://docs.google.com/spreadsheets/d/.../edit?gid=..."
      aria-label="Google Sheet URL"/>
   </label>
   <div className="vv-generator-primary-actions">
    <button type="button" disabled={!sheetUrl.trim()||busy} onClick={()=>loadSheet()}>Load Sheet URL list</button>
    <button type="button" disabled={busy} onClick={()=>{setSheetUrl(DEFAULT_SHEET_SOURCE.url);loadSheet(DEFAULT_SHEET_SOURCE.url);}}>
      Load existing Vault Sheet
    </button>
   </div>
  </div>
  {!!entries.length&&<>
   <div className="vv-url-list-toolbar">
    <strong>{entries.length} links · {toSave.length} to save</strong>
    <button type="button" disabled={busy} onClick={()=>changeAll(true)}>Select unsaved</button>
    <button type="button" disabled={busy} onClick={()=>changeAll(false)}>Clear selection</button>
    <button type="button" disabled={busy||!toSave.length} onClick={save}>{busy?"Saving…":"Save selected gallery links"}</button>
   </div>
   <div className="vv-url-list-results">
    {entries.slice(0,100).map(item=><label key={item.url} className="vv-url-list-row">
      <input type="checkbox" disabled={busy||known.has(item.url)}
       checked={known.has(item.url)||selected.includes(item.url)}
       onChange={e=>setSelected(p=>e.target.checked?[...p,item.url]:p.filter(u=>u!==item.url))}/>
      <span><strong>{item.title}</strong><small>{item.folder||folder||"My Library"}</small>
       <a href={item.url} target="_blank" rel="noopener noreferrer">{item.url}</a></span>
      {known.has(item.url)&&<small>Saved</small>}
     </label>)}
    {entries.length>100&&<p>Showing the first 100 links. All selected links are included when saving.</p>}
   </div>
  </>}
  {message&&<p role="status">{message}</p>}
  {error&&<p role="alert" className="vv-generator-error">{error}</p>}
  <small>Saved gallery links remain clickable references, not stored image files. Vault won't retry blocked images to import these links.</small>
 </section>;
}
