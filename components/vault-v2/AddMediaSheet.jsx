"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icons";
import { itemKey, proxiedMediaUrl } from "@/lib/utils";
import { getSourceMeta, getThumbCandidates } from "@/lib/sources";

const IMAGE_URL = /\.(?:jpe?g|png|gif|webp|avif|bmp)(?:$|[?#])/i;
function validHttp(value) {
  try {
    const u = new URL(String(value || "").trim());
    return (u.protocol === "https:" || u.protocol === "http:") && !u.username && !u.password &&
      !["localhost","0.0.0.0"].includes(u.hostname) && !/^(127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname);
  } catch { return false; }
}
function tagList(value) {
  return [...new Set(String(value || "").split(/[,\n]/).map(s => s.trim().toLowerCase()).filter(Boolean))];
}

export default function AddMediaSheet({
  open, onClose, onSave, folders = [], onCreateCollection,
  initialItem = null, initialFolder = "",
}) {
  const dialog = useRef(null);
  const lock = useRef(false);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [folder, setFolder] = useState("");
  const [newFolder, setNewFolder] = useState("");
  const [coverMode, setCoverMode] = useState("auto");
  const [coverUrl, setCoverUrl] = useState("");
  const [metadata, setMetadata] = useState(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [previewMode, setPreviewMode] = useState(0);
  const [coverReady, setCoverReady] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setUrl(initialItem?.canonical_url || initialItem?.url || "");
    setName(initialItem?.title || "");
    setDescription(initialItem?.note || "");
    setTags(Array.isArray(initialItem?.tags) ? initialItem.tags.join(", ") : "");
    setFolder(initialItem?.folder || initialFolder || "");
    setNewFolder("");
    setCoverMode(initialItem?.cover_mode === "manual" || initialItem?.thumbnail_source === "manual" ? "manual" : "auto");
    setCoverUrl(initialItem?.thumbnail || "");
    setMetadata(null);
    setMetadataLoading(false);
    setPreviewMode(0);
    setCoverReady(false);
    setCoverFailed(false);
    setError("");
  }, [open, initialItem, initialFolder]);

  useEffect(() => {
    if (!open || !validHttp(url)) { setMetadata(null); setMetadataLoading(false); return; }
    let active = true;
    const controller = new AbortController();
    setMetadata(null);
    setMetadataLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/metadata?url=" + encodeURIComponent(url.trim()), {
          cache:"no-store", signal:controller.signal, credentials:"same-origin"
        });
        const data = response.ok ? await response.json() : null;
        if (!active) return;
        setMetadata(data ? {...data, forUrl:url.trim()} : null);
        setName(current => current || data?.title || "");
      } catch {
        if (active) setMetadata(null);
      } finally {
        if (active) setMetadataLoading(false);
      }
    }, 420);
    return () => {active=false;clearTimeout(timer);controller.abort();};
  }, [open, url]);

  const safeMetadata = metadata?.forUrl === url.trim() ? metadata : null;
  const automaticCover = useMemo(() => {
    const target = url.trim();
    if (!validHttp(target)) return "";
    const fromSite = safeMetadata?.thumbnail;
    if (validHttp(fromSite)) return fromSite;
    const provider = getThumbCandidates(target).find(validHttp);
    return provider || (IMAGE_URL.test(target) ? target : "");
  }, [url, safeMetadata]);
  const resolvedCover = coverMode === "manual" ? coverUrl.trim() : automaticCover;
  const coverCandidate = validHttp(resolvedCover) ? resolvedCover : "";
  const previewSrc = previewMode === 0 ? proxiedMediaUrl(coverCandidate) : coverCandidate;
  useEffect(() => {
    setPreviewMode(0);
    setCoverReady(false);
    setCoverFailed(false);
  }, [coverCandidate]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const root = dialog.current;
    root?.querySelector("input")?.focus();
    const onKey = event => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!lock.current) onClose?.();
      }
      if (event.key !== "Tab" || !root) return;
      const nodes = [...root.querySelectorAll("button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled])")];
      if (!nodes.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {event.preventDefault();last.focus();}
      else if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first.focus();}
    };
    document.addEventListener("keydown", onKey);
    return () => {document.removeEventListener("keydown", onKey);previous?.focus?.();};
  }, [open, onClose]);

  if (!open) return null;
  const valid = validHttp(url) && name.trim() && coverCandidate && coverReady && !coverFailed && !metadataLoading;
  const close = () => {if (!lock.current) onClose?.();};
  const submit = async event => {
    event.preventDefault();
    if (!valid || lock.current) return;
    lock.current = true;
    setSaving(true);
    setError("");
    try {
      const target = url.trim();
      let destination = folder;
      if (newFolder.trim()) {
        destination = await onCreateCollection?.(newFolder.trim()) || newFolder.trim();
      }
      const oldUrl = initialItem?.canonical_url || initialItem?.url || "";
      const source = getSourceMeta(target);
      const data = {
        ...(initialItem || {}),
        id:initialItem?.id || "vault-"+Date.now(),
        key:itemKey(target),previousKey:initialItem?.key,
        url:target, canonical_url:target,
        title:name.trim(),note:description.trim(),tags:tagList(tags),
        thumbnail:coverCandidate, canonical_thumbnail:coverCandidate,
        thumbnail_source:coverMode==="manual"?"manual":(safeMetadata?.thumbnail?"metadata":source.id==="image"?"image_source":"provider"),
        cover_mode:coverMode,
        source:source.id,
        type:IMAGE_URL.test(target)?"image":(safeMetadata?.type || initialItem?.type || "link"),
        folder:destination || null, tab:destination || "Vault Library",
        isVaultItem:true,addedAt:initialItem?.addedAt || new Date().toISOString(),
        updatedAt:new Date().toISOString(),
      };
      // The old record is replaced by the parent save handler when its key changes.
      if (oldUrl !== target) { data.isUploadedMedia=false;data.storage_path=null; }
      await onSave(data);
      onClose?.();
    } catch(e) {
      setError(e?.message || "Couldn't save this media. Your entries are still here.");
    } finally {
      lock.current=false;
      setSaving(false);
    }
  };
  return <>
    <div className="v2-backdrop" onMouseDown={close} aria-hidden="true"/>
    <section ref={dialog} className="v2-sheet v2-simple-add" role="dialog" aria-modal="true" aria-labelledby="v2-add-title">
      <header className="v2-sheet-head">
        <div><div className="v2-eyebrow">YOUR PRIVATE LIBRARY</div><div className="v2-modal-title" id="v2-add-title">{initialItem ? "Edit Media" : "Add to Vault"}</div></div>
        <button type="button" className="v2-iconbtn" disabled={saving} onClick={close} aria-label="Close"><Icon name="x" size={18}/></button>
      </header>
      <form onSubmit={submit} className="v2-simple-add-form">
        <div className="v2-simple-add-fields">
          <label className="v2-field">
            <span>Media URL</span>
            <input className="v2-input" type="url" required value={url} onChange={e=>setUrl(e.target.value)}
              placeholder="https://example.com/video-or-image" autoCapitalize="none" autoCorrect="off"/>
          </label>
          <div className="v2-field">
            <span>Cover</span>
            <div className="v2-segmented v2-cover-switch" role="group" aria-label="Cover source">
              <button type="button" aria-pressed={coverMode==="auto"} className={coverMode==="auto"?"active":""} onClick={()=>setCoverMode("auto")}>Automatic</button>
              <button type="button" aria-pressed={coverMode==="manual"} className={coverMode==="manual"?"active":""} onClick={()=>setCoverMode("manual")}>Cover URL</button>
            </div>
          </div>
          {coverMode === "manual" ? <label className="v2-field">
            <span>Cover image URL</span>
            <input className="v2-input" type="url" value={coverUrl} onChange={e=>setCoverUrl(e.target.value)}
              placeholder="https://example.com/cover.jpg" autoCapitalize="none" autoCorrect="off"/>
          </label> : <p className="v2-hint v2-cover-help">{metadataLoading?"Finding cover artwork…":automaticCover?"Cover found automatically.":"Paste a URL above to find its cover. If none appears, choose Cover URL."}</p>}
          <label className="v2-field">
            <span>Name</span>
            <input className="v2-input" required value={name} onChange={e=>setName(e.target.value)} placeholder="Give this title a name"/>
          </label>
          <label className="v2-field">
            <span>Tags</span>
            <input className="v2-input" value={tags} onChange={e=>setTags(e.target.value)} placeholder="Favorites, music, inspiration" />
          </label>
          <label className="v2-field">
            <span>Description</span>
            <textarea className="v2-input v2-description" rows={3} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Optional description"/>
          </label>
          <label className="v2-field">
            <span>Collection</span>
            <select className="v2-select" value={folder} onChange={e=>setFolder(e.target.value)}>
              <option value="">No collection</option>
              {folders.map(f=><option key={f.name} value={f.name}>{f.name}</option>)}
            </select>
          </label>
          <label className="v2-field">
            <span>Or create a collection</span>
            <input className="v2-input" value={newFolder} onChange={e=>setNewFolder(e.target.value)} placeholder="New collection name (optional)"/>
          </label>
        </div>
        <div className="v2-simple-add-preview">
          <span className="v2-eyebrow">COVER PREVIEW</span>
          <div className="v2-simple-cover-art">
            {coverCandidate && !coverFailed ? <img src={previewSrc} alt="Cover preview" onLoad={()=>setCoverReady(true)}
              onError={()=>{setCoverReady(false);if(previewMode===0)setPreviewMode(1);else setCoverFailed(true);}}/> : <div className="v2-simple-cover-empty"><Icon name="image" size={28}/><span>{coverFailed?"Cover image cannot be displayed":"Your cover appears here"}</span></div>}
          </div>
          <p className="v2-hint">{coverReady?"Cover ready to save.":coverFailed?"Choose another Cover URL.": "A working cover is required to keep your library clean."}</p>
        </div>
        {error ? <p className="v2-error" role="alert">{error}</p> : null}
        <div className="v2-sheet-foot v2-simple-add-actions">
          <button type="button" className="v2-btn" disabled={saving} onClick={close}>Cancel</button>
          <button type="submit" className="v2-btn v2-btn-primary" disabled={!valid || saving}>{saving?"Saving…":initialItem?"Save changes":"Add to Vault"}</button>
        </div>
      </form>
    </section>
  </>;
}
