"use client";
import {useEffect,useMemo,useState} from "react";
import {itemKey} from "@/lib/utils";
import {galleryPageLinkItem} from "@/lib/in-app-url-batch.mjs";

export default function GalleryPageLinkSaver({pages=[],folder="",onSave,onCreateFolder,existingUrls=[]}){
 const unique=useMemo(()=>{
  const map=new Map();
  for(const page of pages){
   if(page?.url&&!map.has(page.url))map.set(page.url,page);
  }
  return [...map.values()];
 },[pages]);
 const [selected,setSelected]=useState([]);
 const [saved,setSaved]=useState([]);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 const signature=unique.map(p=>p.url).join("\n");
 useEffect(()=>{
  setSelected(unique.filter(p=>p.kind!=="category").map(p=>p.url));
  setMessage("");setError("");
 },[signature]); // Reset when browsing into a different category or gallery.
 const known=useMemo(()=>new Set([...existingUrls,...saved]),[existingUrls,saved]);
 const pending=unique.filter(x=>selected.includes(x.url)&&!known.has(x.url));
 const savePages=async()=>{
  if(busy||!pending.length)return;
  setBusy(true);setError("");setMessage("");
  let completed=0,failed=0;
  try{
   if(folder)await onCreateFolder?.(folder);
   for(const page of pending){
    const item=galleryPageLinkItem(page,{folder,keyOf:itemKey});
    if(!item){failed++;continue;}
    try{
     await onSave(item);
     setSaved(old=>old.includes(item.url)?old:[...old,item.url]);
     completed++;
    }catch(e){failed++;setError(old=>old||e?.message||"Failed to save a gallery link.");}
   }
   setMessage(completed+" gallery/page URLs saved to your library."+(failed?" "+failed+" failed.":""));
  }catch(e){setError(e?.message||"Could not save gallery links.");}
  finally{setBusy(false);}
 };
 if(!unique.length)return null;
 return <section className="vv-gallery-url-saver" aria-label="Save discovered gallery links">
  <div className="vv-gallery-url-saver-head">
   <div>
    <h4>Gallery URL list</h4>
    <p>{unique.length} page links detected. Save them directly to Vault even when their image galleries return 403.</p>
   </div>
   <span>{pending.length} selected</span>
  </div>
  <div className="vv-gallery-url-saver-actions">
   <button type="button" onClick={()=>setSelected(unique.filter(p=>!known.has(p.url)).map(p=>p.url))} disabled={busy}>Select unsaved</button>
   <button type="button" onClick={()=>setSelected([])} disabled={busy}>Clear</button>
   <button type="button" className="vv-gallery-url-saver-save" disabled={busy||!pending.length} onClick={savePages}>
    {busy?"Saving…":"Save "+pending.length+" gallery URLs"}
   </button>
  </div>
  <div className="vv-gallery-url-saver-list">
   {unique.map(page=><label key={page.url} className="vv-gallery-url-saver-item">
    <input type="checkbox" checked={known.has(page.url)||selected.includes(page.url)} disabled={busy||known.has(page.url)}
      onChange={e=>setSelected(old=>e.target.checked?[...old,page.url]:old.filter(u=>u!==page.url))}/>
    <span><strong>{page.title||"Gallery link"}</strong>
     <small>{page.kind==="category"?"Category":page.kind==="gallery"?"Gallery":"Linked page"}</small>
     <a href={page.url} target="_blank" rel="noopener noreferrer">{page.url}</a>
    </span>
    {known.has(page.url)&&<small>Saved</small>}
   </label>)}
  </div>
  {message&&<p role="status">{message}</p>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}
