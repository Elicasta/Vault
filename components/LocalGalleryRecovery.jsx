"use client";
import { useRef, useState } from "react";

// This recovery intentionally never requests the blocked gallery from Vault's
// server. The user brings files already saved or copied by their own browser.
export default function LocalGalleryRecovery({
  sourceUrl="", onImportFiles, uploading=false, compact=false,
}) {
  const inputRef=useRef(null);
  const [message,setMessage]=useState("");
  const [working,setWorking]=useState(false);
  const busy=uploading||working;

  const chooseFiles=async event=>{
    const files=Array.from(event.target.files||[]);
    event.target.value="";
    if(!files.length)return;
    setMessage("");
    try {
      await onImportFiles(files);
    } catch(err) {setMessage(err?.message||"Could not start file import.");}
  };

  const pasteImage=async()=>{
    if(busy)return;
    setWorking(true);setMessage("");
    try{
      if(!navigator.clipboard?.read)throw new Error("This browser does not allow Vault to read copied images. Use Choose saved images instead.");
      const entries=await navigator.clipboard.read();
      const files=[];
      for(const entry of entries){
        const type=entry.types.find(t=>/^image\/(?:png|jpeg|webp|gif|heic|heif)$/i.test(t));
        if(!type)continue;
        const blob=await entry.getType(type);
        const ext=type.split("/")[1]==="jpeg"?"jpg":type.split("/")[1];
        files.push(new File([blob],"Copied image "+(files.length+1)+"."+ext,{type}));
        if(files.length>=20)break;
      }
      if(!files.length)throw new Error("No image file found in the clipboard. On the original website, choose Copy Image—not Copy Link—or save it to Photos/Files.");
      await onImportFiles(files);
      setMessage("Clipboard image handed to Vault for private upload.");
    }catch(err){setMessage(err?.message||"Could not read the copied image. Use Choose saved images instead.");}
    finally{setWorking(false);}
  };

  return <section className={"vv-local-gallery-recovery"+(compact?" is-compact":"")}
    aria-label="Import images without scanning the blocked website">
    <div>
      <span className="v2-eyebrow">NO PROXY · NO GALLERY SCANNING</span>
      <h3>Save from the website, then add to Vault</h3>
      <p>When a gallery returns 403 to Vault, open it in your regular browser and use the website's Save Image, Save to Photos, or Save to Files option. Bring those actual files into Vault without asking that website for them again.</p>
    </div>
    <div className="vv-local-gallery-actions">
      <button type="button" disabled={busy} onClick={()=>inputRef.current?.click()}>
        {uploading?"Uploading…":"Choose saved images"}
      </button>
      <button type="button" disabled={busy} onClick={pasteImage}>Paste copied image</button>
      {/^https?:\/\//i.test(sourceUrl)&&<a href={sourceUrl} target="_blank" rel="noopener noreferrer">Open original gallery ↗</a>}
    </div>
    <input ref={inputRef} type="file" accept="image/*,.heic,.heif,.jpg,.jpeg,.png,.webp,.gif,.avif"
      multiple style={{display:"none"}} onChange={chooseFiles} disabled={busy}
      aria-label="Choose images previously saved from a gallery"/>
    {message&&<p role="status">{message}</p>}
    {!compact&&<p className="vv-local-gallery-tip">On iPhone: save images to Photos or Files, return here, tap <strong>Choose saved images</strong>, and select several at once. Each file is stored privately in your chosen Vault collection. Image links aren't needed.</p>}
  </section>;
}
