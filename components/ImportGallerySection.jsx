"use client";

import { useEffect, useRef, useState } from "react";
import { ensureProxySession, SECURITY_V2_ENABLED } from "@/lib/security-session";
import GalleryImporter, { ImageDetailPanel } from "./GalleryImporter";
import SourceInspector from "./SourceInspector";
import ResilientImage from "./ResilientImage";
import ImageAccessPanel from "./ImageAccessPanel";
import { isDirectImageUrl, shouldRememberSiteDenied } from "@/lib/media-access-fallback.mjs";
import { siteNeedsBrowser, markSiteBrowserFirst, clearBrowserFirst, isWebsiteAccessDenial, isUnsupportedDiscoveryResponse } from "@/lib/browser-first-fallback.mjs";

function entry(url,title="Website",kind="page",thumbnail=""){return {url:String(url||""),title,kind,thumbnail};}
const short=(value,max=55)=>String(value||"").length>max?String(value).slice(0,max-1)+"…":String(value||"");

export default function ImportGallerySection({
  pageUrl = "", folder = "", folders = [], existingUrls = [],
  onSave, onCreateFolder, onFolderChange,
}) {
  const [current,setCurrent]=useState(()=>entry(pageUrl,"Start page"));
  const [previous,setPrevious]=useState([]);
  const [next,setNext]=useState([]);
  const [status,setStatus]=useState("idle");
  const [error,setError]=useState("");
  const [gallery,setGallery]=useState(null);
  const [selectedPage,setSelectedPage]=useState(null);
  const [reviewAsGallery,setReviewAsGallery]=useState(false);
  const [newlySaved,setNewlySaved]=useState([]);
  const abort=useRef(null);
  const target=current.url;

  useEffect(()=>{
    abort.current?.abort();
    setCurrent(entry(pageUrl,"Start page"));
    setPrevious([]);setNext([]);setGallery(null);
    setError("");setStatus("idle");setSelectedPage(null);setReviewAsGallery(false);setNewlySaved([]);
    return ()=>abort.current?.abort();
  },[pageUrl]);

  const scan=async (requestedUrl=target,force=false)=>{
    const url=String(requestedUrl||"").trim();
    if(!/^https?:\/\//i.test(url)){setError("Enter the URL of a category or gallery page first.");return;}
    if(!force&&shouldRememberSiteDenied(url)&&siteNeedsBrowser(url)){
      setStatus("browser");setError("This site denied an earlier scan. Open it normally or import browser-captured media.");setGallery(null);
      return;
    }
    abort.current?.abort();
    const controller=new AbortController();abort.current=controller;
    setStatus("loading");setError("");setGallery(null);setSelectedPage(null);setReviewAsGallery(false);
    try{
      if(SECURITY_V2_ENABLED)await ensureProxySession();
      const request=()=>fetch("/api/media-discovery?url="+encodeURIComponent(url),{
        method:"GET",credentials:"same-origin",signal:controller.signal,cache:"no-store",
      });
      let response=await request();
      if(response.status===401&&SECURITY_V2_ENABLED){await ensureProxySession(null,{force:true});response=await request();}
      const data=await response.json().catch(()=>({}));
      if(controller.signal.aborted)return;
      if(!response.ok){
        if(isWebsiteAccessDenial(response,data)){
          if(shouldRememberSiteDenied(url))markSiteBrowserFirst(url);
          setStatus("browser");
          setError(data.error||"Website blocks automated scanning.");return;
        }
        if(isUnsupportedDiscoveryResponse(response,data)){
          setStatus("browser");setError(data.error||"This page is not a readable HTML gallery.");return;
        }
        throw new Error(data.error||"Gallery scan failed.");
      }
      setGallery(data);setStatus("done");
      setCurrent(old=>old.url===url?{...old,title:old.title==="Start page"?(data.pageTitle||old.title):old.title}:old);
    }catch(e){if(!controller.signal.aborted){setStatus("error");setError(e.message||"Could not read this page.");}}
  };

  const openPage=page=>{
    if(!page?.url||page.url===target)return;
    try{
      const old=new URL(target),nextUrl=new URL(page.url);
      if(!["https:","http:"].includes(nextUrl.protocol)||nextUrl.hostname!==old.hostname)return;
    }catch{return;}
    setPrevious(old=>[...old,current].slice(-29));
    setNext([]);
    setCurrent(entry(page.url,page.title||"Page",page.kind||"page",page.thumbnail||""));
    scan(page.url);
  };
  const back=()=>{
    if(!previous.length)return;
    const page=previous[previous.length-1];
    setPrevious(old=>old.slice(0,-1));setNext(old=>[current,...old].slice(0,29));
    setCurrent(page);scan(page.url);
  };
  const forward=()=>{
    if(!next.length)return;
    const page=next[0];setNext(old=>old.slice(1));
    setPrevious(old=>[...old,current].slice(-29));
    setCurrent(page);scan(page.url);
  };
  const breadcrumbTo=index=>{
    if(index>=previous.length)return;
    const chain=[...previous,current],page=chain[index];
    setPrevious(chain.slice(0,index));
    setNext(chain.slice(index+1));
    setCurrent(page);scan(page.url);
  };

  const level=gallery?.pageLevel||"";
  const directImage=isDirectImageUrl(target);
  const blockedImage=(directImage||["image-page","photo-page"].includes(current.kind))&&(status==="browser"||status==="error");
  const coverOnly=blockedImage&&!directImage;
  const viewerUrl=coverOnly?current.thumbnail:(gallery?.media?.find(x=>x.type==="image")?.url||target);
  const browsing=level==="categories"||level==="gallery-list";
  const allPages=gallery?.browsePages?.length?gallery.browsePages:
    (browsing?gallery?.imagePages||[]:[]);
  const visibleImages=(gallery?.media||[]).filter(x=>x.type==="image");
  const galleryReady=level==="gallery"||reviewAsGallery;
  const photoPages=(gallery?.imagePages||[]).filter(p=>reviewAsGallery||!allPages.some(b=>b.url===p.url));
  const pageLabels={categories:"Browse categories", "gallery-list":"Choose a gallery",gallery:"Inside gallery",image:"Individual image",video:"Video file",empty:"No gallery found"};
  const savedUrls=[...existingUrls,...newlySaved];
  const recordSaved=url=>setNewlySaved(old=>old.includes(url)?old:[...old,url]);

  return <section className="vv-import-gallery-section" aria-label="Browse category and gallery pages">
    <div className="vv-import-gallery-heading">
      <div>
        <span className="v2-eyebrow">PAGE NAVIGATION · CATEGORIES → GALLERIES → IMAGES</span>
        <h3>2. Browse and import image galleries</h3>
        <p>Open a category first, then the gallery inside it. Browse its photos and import only when you've reached the actual gallery.</p>
      </div>
      <button type="button" disabled={status==="loading"||!target} onClick={()=>{clearBrowserFirst(target);scan(target,true);}}>
        {status==="loading"?"Loading…":gallery?"Rescan this page":"Scan page"}
      </button>
    </div>
    <nav className="vv-gallery-nav" aria-label="Gallery page navigation">
      <div className="vv-gallery-nav-actions">
        <button type="button" onClick={back} disabled={!previous.length} aria-label="Previous gallery page">← Back</button>
        <button type="button" onClick={forward} disabled={!next.length} aria-label="Next gallery page">Forward →</button>
        <span>{gallery?(pageLabels[level]||"Browse page"):"Start with a category or gallery URL"}</span>
      </div>
      <div className="vv-gallery-breadcrumbs" aria-label="Page path">
        {[...previous,current].map((page,index,chain)=>
          <span key={page.url+"|"+index} className="vv-gallery-breadcrumb">
            {index>0&&<span aria-hidden="true">/</span>}
            {index===chain.length-1?
              <strong aria-current="page" title={page.url}>{short(page.title)}</strong>:
              <button type="button" title={page.url} onClick={()=>breadcrumbTo(index)}>{short(page.title)}</button>}
          </span>)}
      </div>
    </nav>
    <p className="vv-import-gallery-hint">Current page: <a href={target||"#"} target="_blank" rel="noopener noreferrer">{short(target,110)||"Paste a website URL above"}</a></p>
    {error&&<div role="alert" className="vv-generator-error">
      <p>{error}</p>
      <p>You can open the source page normally, use browser capture, or upload a downloaded image. This failed page doesn't prevent navigating to other gallery links.</p>
    </div>}
    {status==="loading"&&<p role="status">Opening the selected page and finding its child galleries or images…</p>}
    {(blockedImage||level==="image")&&<ImageAccessPanel imageUrl={viewerUrl}
      title={current.title||"Original image"} denied={blockedImage} sourcePage={target} coverOnly={coverOnly}/>}
    {gallery&&<>
      <p role="status" className="vv-import-gallery-counts">
        {pageLabels[level]||"Page"} · {allPages.length} linked page{allPages.length===1?"":"s"}
        {level==="gallery"?" · "+visibleImages.length+" detected image files":""}
      </p>
      {allPages.length>0&&<div className="vv-gallery-browser">
        <h4>{level==="categories"?"Select a category":browsing?"Open a gallery":"Open a gallery or photo detail"}</h4>
        <div className="vv-import-gallery-items vv-gallery-navigation-items">
          {allPages.map(page=><button type="button" key={page.url} onClick={()=>openPage(page)} title={page.url}
            aria-label={"Open "+(page.kind==="category"?"category":page.kind==="gallery"?"gallery":"page")+": "+(page.title||page.url)}>
            {page.thumbnail&&<ResilientImage url={page.thumbnail} alt="" className="vv-gallery-card-preview"/>}
            <span><strong>{page.title||"View page"}</strong></span>
            <small>{page.kind==="category"?"CATEGORY":page.kind==="gallery"?"GALLERY":"OPEN PAGE"} →</small>
          </button>)}
        </div>
      </div>}
      {browsing && previous.length>0 && level==="gallery-list" &&
        (gallery.imagePages||[]).length>=2 &&
        !(gallery.browsePages||[]).some(p=>p.kind==="category") &&
        <div className="vv-gallery-advanced-import">
          <p>Are these the individual photos in this gallery, rather than another set of galleries? You can review the originals before importing.</p>
          <button type="button" aria-pressed={reviewAsGallery} onClick={()=>setReviewAsGallery(v=>!v)}>
            {reviewAsGallery?"Return to page navigation":"These are photos · review gallery import"}
          </button>
        </div>}
      {galleryReady&&<>
        <GalleryImporter result={reviewAsGallery?{...gallery,galleryDetected:true}:gallery} folder={folder} folders={folders} onSave={onSave}
          onCreateFolder={onCreateFolder} onFolderChange={onFolderChange}
          existingUrls={savedUrls} onSaved={recordSaved}/>
        {visibleImages.length>0&&<details className="vv-import-gallery-list" open>
          <summary>View {visibleImages.length} detected images</summary>
          <div className="vv-import-gallery-items">
            {visibleImages.slice(0,60).map(item=><a key={item.url} href={item.url} target="_blank"
              rel="noopener noreferrer" title={item.url}>
              <ResilientImage url={item.thumbnail||item.url} alt={item.title||"Image"} className="vv-gallery-card-preview"/>
              <span>{item.title||"Image"}</span>
            </a>)}
          </div>
        </details>}
        {photoPages.length>0&&<details className="vv-import-gallery-list" open>
          <summary>Explore {photoPages.length} photo detail pages</summary>
          <div className="vv-import-gallery-items">
            {photoPages.map(page=><div className="vv-gallery-detail-card" key={page.url}>
              {page.thumbnail&&<ResilientImage url={page.thumbnail} alt="" className="vv-gallery-card-preview"/>}
              <strong>{page.title||"Photo detail"}</strong>
              <button type="button" onClick={()=>openPage(page)}>Open page →</button>
              <button type="button" onClick={()=>setSelectedPage(page)}>Find original</button>
            </div>)}
          </div>
        </details>}
        {selectedPage&&<ImageDetailPanel page={selectedPage} folder={folder} onSave={onSave} onSaved={recordSaved}/>}
      </>}
      {gallery.nextPageUrl&&<button type="button" className="vv-gallery-next-page"
        onClick={()=>openPage(entry(gallery.nextPageUrl,"Next gallery page","gallery"))}>Continue to next gallery page →</button>}
      {browsing&&<p className="vv-import-gallery-hint">
        These cards lead to other pages, not necessarily full-resolution image files. Open a gallery before using bulk import.
      </p>}
      {level==="empty"&&<p className="vv-import-gallery-hint">
        No public gallery links were detected in this page's HTML. Use the original website or browser capture where permitted.
      </p>}
      {(galleryReady||level==="image")&&<SourceInspector pageUrl={target} folder={folder}
        onSave={onSave} existingUrls={savedUrls}/>}
    </>}
    <p className="vv-import-gallery-hint">
      The page trail stays inside Vault. Bulk import works on gallery images and follows up to six pages of the chosen gallery (160 candidates maximum), not unrelated categories.
    </p>
  </section>;
}
