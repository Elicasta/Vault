"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { uploadVaultMedia, deleteVaultMedia } from "@/lib/supabase";
import { itemKey } from "@/lib/utils";
import { buildGeneratorUrlItem, normalizeGeneratorPublicUrl } from "@/lib/generator-save-url.mjs";
import SourceInspector from "./SourceInspector";
import ImportGallerySection from "./ImportGallerySection";
import CapturedMediaImport from "./CapturedMediaImport";
import { withDiscreetMediaLabels } from "@/lib/private-media-labels.mjs";

function safeFileName(name) {
  return String(name || "Imported media").normalize("NFKC")
    .replace(/[\\/:*?"<>|\x00-\x1f]/g,"-").trim().slice(0,100) || "Imported media";
}

export default function ImportMediaWorkspace({ userId, folders=[], items=[], onSave, onCreateFolder }) {
  const [folder,setFolder]=useState("");
  const [sourceUrl,setSourceUrl]=useState("");
  const [sourceTitle,setSourceTitle]=useState("");
  const [privateLabels,setPrivateLabels]=useState(true);
  const saveToVault=useCallback(item=>onSave(withDiscreetMediaLabels(item,privateLabels)),[onSave,privateLabels]);
  const [savingUrl,setSavingUrl]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [dragging,setDragging]=useState(false);
  const [status,setStatus]=useState("");
  const [error,setError]=useState("");
  const [newFolder,setNewFolder]=useState("");
  const [creatingFolder,setCreatingFolder]=useState(false);
  const fileRef=useRef(null);
  const rootRef=useRef(null);

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const url=normalizeGeneratorPublicUrl(params.get("url")||"");
    if(url){setSourceUrl(url);setSourceTitle(String(params.get("title")||"").slice(0,180));}
  },[]);

  const ensureFolder=useCallback(async name=>{
    if(name && !folders.some(f=>f.name===name))await onCreateFolder(name);
  },[folders,onCreateFolder]);

  const createFolder=async()=>{
    const name=newFolder.trim();
    if(!name||creatingFolder)return;
    setCreatingFolder(true);setError("");
    try{await ensureFolder(name);setFolder(name);setNewFolder("");setStatus("Collection "+name+" is ready.");}
    catch(e){setError(e.message||"Could not create collection.");}
    finally{setCreatingFolder(false);}
  };

  const saveUrl=async()=>{
    if(savingUrl||uploading)return;
    setSavingUrl(true);setError("");setStatus("");
    try{
      if(!userId)throw new Error("Sign in to Vault to save a link.");
      const url=normalizeGeneratorPublicUrl(sourceUrl);
      if(!url)throw new Error("Paste a public HTTP(S) page, image, or video URL. A blob: or data: URL requires a file upload.");
      await ensureFolder(folder);
      const media=buildGeneratorUrlItem(url,{
        site:"import",siteName:"Vault Import",folder,title:sourceTitle,keyOf:itemKey,
      });
      await saveToVault(media);
      setStatus("URL saved to "+(folder||"My Library")+".");
    }catch(e){setError(e.message||"Could not save URL.");}
    finally{setSavingUrl(false);}
  };

  const importFiles=useCallback(async incoming=>{
    const files=Array.from(incoming||[]).filter(Boolean).slice(0,20);
    if(!files.length||uploading)return;
    setUploading(true);setError("");setStatus("");
    let saved=0,failed=0;
    try{
      if(!userId)throw new Error("Sign in to Vault before uploading files.");
      await ensureFolder(folder);
      for(const file of files){
        let upload=null;
        try{
          if(!/^(image|video|audio)\//i.test(file.type||""))throw new Error("Choose an image, video, or audio file.");
          upload=await uploadVaultMedia(userId,file);
          const key=itemKey(upload.locator);
          const media={
            id:"uploaded-"+key,key,url:upload.locator,
            thumbnail:upload.type==="image"?upload.locator:"",
            type:upload.type,title:safeFileName(file.name),
            note:sourceUrl.trim()?"Source page: "+sourceUrl.trim().slice(0,400):"",
            tags:["imported","vault-file"],folder:folder||null,
            tab:folder||"Vault Library",isVaultItem:true,
            isUploadedMedia:true,storagePath:upload.path,addedAt:new Date().toISOString(),
          };
          try{await saveToVault(media);saved++;}
          catch(error){await deleteVaultMedia(userId,upload.locator).catch(()=>{});throw error;}
        }catch(error){failed++;setError(old=>old||error.message||"One file could not be uploaded.");}
        setStatus(saved+" file"+(saved===1?"":"s")+" uploaded to "+(folder||"My Library")+
          (failed?" · "+failed+" failed":""));
      }
    }catch(error){setError(error.message||"Upload failed.");}
    finally{setUploading(false);if(fileRef.current)fileRef.current.value="";}
  },[folder,folders,userId,saveToVault,ensureFolder,sourceUrl,uploading]);

  useEffect(()=>{
    const handlePaste=event=>{
      if(!rootRef.current?.contains(document.activeElement))return;
      if(document.activeElement?.matches?.("input,textarea,[contenteditable]"))return;
      const imageFiles=Array.from(event.clipboardData?.files||[]).filter(f=>f.type.startsWith("image/"));
      if(!imageFiles.length)return;
      event.preventDefault();
      importFiles(imageFiles);
    };
    document.addEventListener("paste",handlePaste);
    return()=>document.removeEventListener("paste",handlePaste);
  },[importFiles]);

  const imported=items.filter(item=>folder ? item.folder===folder : !item.folder).slice(0,18);
  return <section ref={rootRef} className="vv-generator-workspace" aria-label="Import media into Vault" tabIndex={-1}>
    <div className="vv-generator-header">
      <div>
        <div className="v2-eyebrow">VAULT · MEDIA LIBRARY</div>
        <h2>Import Media</h2>
        <p>Save a URL first, or upload the original file for permanent private storage. Works with images, videos, audio, and media from any website.</p>
      </div>
    </div>

    <label className="vv-generator-private-toggle" style={{display:"flex",gap:10,alignItems:"flex-start",margin:"10px 0 18px"}}>
      <input type="checkbox" checked={privateLabels} onChange={e=>setPrivateLabels(e.target.checked)} aria-label="Use discreet titles and notes" />
      <span><strong>Discreet titles and notes</strong><small style={{display:"block",opacity:.75}}>On by default. Saved cards use neutral names and notes. Original URLs are kept so links still work. This does not hide your browser history or encrypt external links.</small></span>
    </label>

    <section className="vv-generator-url-primary" aria-label="Save URL to Vault">
      <div className="v2-eyebrow">PRIMARY · SAVE THE LINK</div>
      <h3>1. Save URL to Vault</h3>
      <p>Store a public page, image, or video link in your library without downloading it.</p>
      <div className="vv-generator-link-fields">
        <label>URL to save
          <input type="url" value={sourceUrl} onChange={e=>setSourceUrl(e.target.value)}
            placeholder="https://example.com/media" autoComplete="url" aria-label="URL to save to Vault"/>
        </label>
        <label>Title (optional)
          <input type="text" maxLength={180} value={sourceTitle} onChange={e=>setSourceTitle(e.target.value)}
            placeholder="Name this item"/>
        </label>
        <label>Save to collection
          <select value={folder} onChange={e=>setFolder(e.target.value)}>
            <option value="">My Library</option>
            {folders.map(f=><option value={f.name} key={f.name}>{f.name}</option>)}
          </select>
        </label>
      </div>
      <div className="vv-generator-primary-actions">
        <button type="button" className="vv-generator-save-url" disabled={!sourceUrl.trim()||savingUrl||uploading} onClick={saveUrl}>
          {savingUrl?"Saving…":"Save URL to Vault"}
        </button>
        {normalizeGeneratorPublicUrl(sourceUrl) && <button type="button" className="vv-generator-open-source"
          onClick={()=>window.open(normalizeGeneratorPublicUrl(sourceUrl),"_blank","noopener,noreferrer")}>Open original website</button>}
      </div>
      <div className="vv-import-folder-create">
        <input aria-label="New collection name" value={newFolder} onChange={e=>setNewFolder(e.target.value)}
          placeholder="New collection name" maxLength={90}/>
        <button type="button" onClick={createFolder} disabled={!newFolder.trim()||creatingFolder}>
          {creatingFolder?"Creating…":"Create collection"}
        </button>
      </div>
    </section>

    <SourceInspector pageUrl={sourceUrl} folder={folder} onSave={saveToVault}
      existingUrls={items.map(item=>item.url||item.canonical_url).filter(Boolean)}/>

    <ImportGallerySection pageUrl={sourceUrl} folder={folder} folders={folders}
      onFolderChange={setFolder} onCreateFolder={onCreateFolder} onSave={saveToVault}
      existingUrls={items.map(item=>item.url||item.canonical_url).filter(Boolean)}/>

    <CapturedMediaImport pageUrl={sourceUrl} folder={folder} onSave={saveToVault}
      existingUrls={items.map(item=>item.url||item.canonical_url).filter(Boolean)}/>

    <section className="vv-generator-section">
      <div className="v2-eyebrow">OPTIONAL · ACTUAL FILE</div>
      <h3>3. Upload a permanent copy</h3>
      <p>Use this when a site's link expires, only shows a thumbnail, or is a temporary blob: or data: address. The file is saved in private Supabase Storage.</p>
      <div className={"vv-generator-drop"+(dragging?" dragging":"")}
        onDragOver={e=>{e.preventDefault();setDragging(true);}}
        onDragLeave={()=>setDragging(false)}
        onDrop={e=>{e.preventDefault();setDragging(false);if(e.dataTransfer?.files?.length)importFiles(e.dataTransfer.files);}}>
        <strong>Drop an image, video, audio file, or clean screenshot</strong>
        <span>Or select files from your device · up to 50 MB each</span>
        <input ref={fileRef} type="file" accept="image/*,video/*,audio/*" multiple
          aria-label="Select media files to upload" onChange={e=>importFiles(e.target.files)} disabled={uploading}/>
        <small>Images copied to your clipboard can also be pasted while this import area is focused.</small>
      </div>
      {uploading&&<p role="status">Uploading to Vault…</p>}
    </section>

    {status&&<p className="vv-generator-status" role="status">{status}</p>}
    {error&&<p className="vv-generator-error" role="alert">{error}</p>}

    <div className="vv-generator-backup">
      <h3>4. Back up imported files</h3>
      <p>Private files can be backed up to Google Drive through Vault Settings when Drive authentication is configured. Saved URLs remain links; they are not uploaded copies.</p>
    </div>
    {!!imported.length&&<div className="vv-generator-recent">
      <h3>Recently saved in {folder||"My Library"}</h3>
      <div>{imported.map(item=><div key={item.key||item.id}><span>{item.title}</span><small>{item.type||"Media"}</small></div>)}</div>
    </div>}
  </section>;
}
