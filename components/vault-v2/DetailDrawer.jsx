"use client";
import {useEffect,useRef,useState} from "react";
import Icon from "@/components/Icons";
import {getSourceMeta} from "@/lib/sources";
import {proxiedMediaUrl} from "@/lib/utils";

export default function DetailDrawer({item,state={},folders=[],currentIndex=-1,totalItems=0,onNavigate,onClose,onPlay,onFavorite,onFolder,onRating,onEdit,onDelete}) {
  const panel=useRef(null),locked=useRef(false),nav=useRef({});
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[confirm,setConfirm]=useState(false);
  const [coverFallback,setCoverFallback]=useState(0);
  const [folder,setFolder]=useState(""),[rating,setRating]=useState(0);
  const close=()=>{if(!locked.current)onClose?.()};
  const run=async(fn)=>{
    if(locked.current)return;
    locked.current=true;setBusy(true);setError("");
    try {await fn();}catch(e){setError(e?.message||"Could not save. Try again.");}
    finally {locked.current=false;setBusy(false);}
  };
  useEffect(()=>{
    if(!item)return;
    setFolder(item.folder||state.folder||"");
    setRating(Number(state.rating)||0);
    setConfirm(false);setError("");setCoverFallback(0);
  },[item?.key,state.folder,state.rating]);
  nav.current={onClose,onNavigate,currentIndex,totalItems};
  useEffect(()=>{
    if(!item)return;
    const prior=document.activeElement;
    panel.current?.querySelector("[data-close]")?.focus();
    const onKey=e=>{
      if(e.key==="Escape"){e.preventDefault();if(!locked.current)nav.current.onClose?.();}
      if(["INPUT","SELECT","TEXTAREA"].includes(document.activeElement?.tagName))return;
      if(e.key==="ArrowLeft"&&nav.current.currentIndex>0){e.preventDefault();nav.current.onNavigate?.(nav.current.currentIndex-1);}
      if(e.key==="ArrowRight"&&nav.current.currentIndex<nav.current.totalItems-1){e.preventDefault();nav.current.onNavigate?.(nav.current.currentIndex+1);}
    };
    document.addEventListener("keydown",onKey);
    return()=>{document.removeEventListener("keydown",onKey);prior?.focus?.();};
  },[item?.key]);
  if(!item)return null;
  const cover=item.display_thumbnail||item.thumbnail||"";
  const coverSrc=coverFallback===0?proxiedMediaUrl(cover):cover;
  const source=getSourceMeta(item.url||"").name;
  return <>
    <div className="v2-backdrop" aria-hidden="true" onMouseDown={close}/>
    <section ref={panel} className="v2-sheet v2-clean-detail" role="dialog" aria-modal="true" aria-labelledby="v2-detail-title">
      <div className="v2-sheet-head">
        <div className="v2-detail-pager">
          <button type="button" className="v2-iconbtn" disabled={busy||currentIndex<=0} onClick={()=>onNavigate?.(currentIndex-1)} aria-label="Previous item"><Icon name="chevronLeft" size={18}/></button>
          <span className="v2-hint">{currentIndex>=0?String(currentIndex+1)+" of "+totalItems:"Item"}</span>
          <button type="button" className="v2-iconbtn" disabled={busy||currentIndex>=totalItems-1} onClick={()=>onNavigate?.(currentIndex+1)} aria-label="Next item"><Icon name="chevronRight" size={18}/></button>
        </div>
        <button data-close type="button" className="v2-iconbtn" disabled={busy} onClick={close} aria-label="Close"><Icon name="x" size={18}/></button>
      </div>
      <div className="v2-clean-detail-body">
        <div className="v2-clean-detail-poster">
          {cover&&coverFallback<2?<img src={coverSrc} alt={item.title||"Media cover"} onError={()=>setCoverFallback(n=>n+1)}/>:
            <div className="v2-simple-cover-empty"><Icon name="grid" size={25}/><span>Cover unavailable</span></div>}
        </div>
        <div className="v2-clean-detail-copy">
          <div className="v2-eyebrow">{source} · {item.folder||"Library"}</div>
          <h2 id="v2-detail-title">{item.title||"Untitled media"}</h2>
          {item.note?<p className="v2-clean-description">{item.note}</p>:null}
          {item.tags?.length?<div className="v2-tag-row">{item.tags.map(t=><span className="v2-tag" key={t}>{t}</span>)}</div>:null}
          <div className="v2-clean-detail-actions">
            <button className="v2-btn v2-btn-primary" disabled={busy} type="button" onClick={()=>onPlay(item)}><Icon name="play" size={17}/> Open Media</button>
            <a className="v2-btn" href={item.url} target="_blank" rel="noopener noreferrer" aria-label="Open original source"><Icon name="external" size={16}/> Original</a>
            <button className="v2-btn" disabled={busy} type="button" onClick={()=>run(()=>onFavorite(item.key,!!state.favorite))}><Icon name="star" size={17} filled={!!state.favorite}/>{state.favorite?"Favorited":"Favorite"}</button>
          </div>
          <div className="v2-clean-detail-fields">
            <label className="v2-field"><span>Collection</span>
              <select className="v2-select" disabled={busy} value={folder} onChange={e=>{const value=e.target.value;setFolder(value);run(()=>onFolder(item,value));}}>
                <option value="">No Collection</option>
                {folders.map(f=><option key={f.name} value={f.name}>{f.name}</option>)}
              </select>
            </label>
            <label className="v2-field"><span>Rating</span>
              <select className="v2-select" disabled={busy} value={rating} onChange={e=>{const value=Number(e.target.value);setRating(value);run(()=>onRating(item.key,value));}}>
                <option value={0}>Not rated</option>
                {[5,4,3,2,1].map(n=><option value={n} key={n}>{n} stars</option>)}
              </select>
            </label>
          </div>
          <div className="v2-clean-detail-footer">
            <button className="v2-btn" disabled={busy} type="button" onClick={()=>onEdit(item)}>Edit Media</button>
            {confirm?<div className="v2-clean-delete-confirm">
              <span>Delete this title from Vault?</span>
              <button className="v2-btn v2-btn-danger" type="button" disabled={busy} onClick={()=>run(()=>onDelete(item))}>{busy?"Deleting…":"Confirm delete"}</button>
              <button className="v2-btn" type="button" disabled={busy} onClick={()=>setConfirm(false)}>Cancel</button>
            </div>:<button className="v2-btn v2-btn-danger" type="button" disabled={busy} onClick={()=>setConfirm(true)}><Icon name="trash" size={16}/> Delete</button>}
          </div>
          {error?<div className="v2-error" role="alert">{error}</div>:null}
        </div>
      </div>
    </section>
  </>;
}
