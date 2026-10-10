"use client";

import { useMemo, useState } from "react";
import { buildVaultMediaItem, parseCapturedMedia } from "@/lib/media-capture-import.mjs";
import { itemKey, sourceIdOf } from "@/lib/utils";
import { browserGalleryBookmarklet } from "@/lib/browser-gallery-capture.mjs";
import ResilientImage from "./ResilientImage";

// Use media already loaded by a user's normal browser, never imitate their
// cookies or try to defeat HTTP 403 in Vault's server-side fetch.
export default function CapturedMediaImport({ pageUrl = "", onSave, folder = "", existingUrls = [] }) {
  const [payload, setPayload] = useState("");
  const [entries, setEntries] = useState([]);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [savedLocally, setSavedLocally] = useState([]);
  const [setupOpen,setSetupOpen] = useState(false);
  const [copyStatus,setCopyStatus] = useState("");
  const existing = useMemo(() => new Set([...existingUrls, ...savedLocally]), [existingUrls, savedLocally]);
  const pending = entries.filter(item => selected.includes(item.url) && !existing.has(item.url));

  const copyCaptureAction = async () => {
    setCopyStatus("");
    try {
      await navigator.clipboard.writeText(browserGalleryBookmarklet());
      setCopyStatus("Capture Gallery bookmarklet copied. Follow the Safari setup steps below.");
      setSetupOpen(true);
    } catch { setSetupOpen(true);setCopyStatus("Clipboard unavailable. You can select and copy the bookmarklet code below."); }
  };

  const inspect = () => {
    setError(""); setStatus("");
    try {
      const list = parseCapturedMedia(payload, pageUrl);
      if (!list.length) throw new Error("No media links were found. Open the actual gallery in your browser, scroll until its images load, then run Capture Gallery and paste its results here.");
      setEntries(list);
      setSelected(list.map(item => item.url));
      setStatus(list.length + " media links loaded. Review your selection before importing.");
    } catch (e) {
      setEntries([]); setSelected([]);
      setError(e.message || "Could not read captured links.");
    }
  };

  const saveSelected = async () => {
    if (!pending.length || busy) return;
    setBusy(true); setStatus(""); setError("");
    let saved = 0;
    const failures = [];
    const complete = [];
    try {
      for (const item of pending) {
        try {
          await onSave(buildVaultMediaItem(item, folder, itemKey, sourceIdOf));
          complete.push(item.url);
          saved++;
          setSavedLocally(previous => previous.includes(item.url) ? previous : [...previous, item.url]);
        } catch (e) { failures.push(e?.message || "Could not save a link"); }
      }
      setSelected(old => old.filter(url => !complete.includes(url)));
      setStatus(saved + " saved to " + (folder || "My Library") + (failures.length ? "; " + failures.length + " failed." : "."));
      if (failures.length) setError(failures[0]);
    } finally { setBusy(false); }
  };

  return <section className="vv-capture-import vv-generator-section" aria-label="Import browser-captured media">
    <div className="v2-eyebrow">BROWSER-FIRST · 403-SAFE WORKFLOW</div>
    <h3>Import from the website you're viewing</h3>
    <p>When Vault's server cannot inspect a gallery, capture the public image URLs already shown in your browser. This works with many layouts without a custom website adapter. It does not circumvent access restrictions or download restricted files.</p>
    {pageUrl && /^https?:\/\//i.test(pageUrl) && <p>
      <a href={pageUrl} target="_blank" rel="noopener noreferrer">Open the original page</a>
    </p>}
    <div className="vv-browser-capture-install">
      <div>
        <strong>Safari on iPhone / iPad</strong>
        <p>Set up a Capture Gallery bookmark once. In Safari, open a photo gallery normally, let its images load, then run that bookmark. Return here and paste the image list.</p>
        <button type="button" onClick={copyCaptureAction}>Copy Safari Capture Gallery bookmarklet</button>
        <button type="button" onClick={()=>setSetupOpen(x=>!x)} aria-expanded={setupOpen}>{setupOpen?"Hide setup":"Show setup steps"}</button>
      </div>
      <div>
        <strong>Chrome on desktop</strong>
        <p>Open the gallery normally and run Vault Media Capture. Choose the images and click Copy. Paste them into Vault below.</p>
      </div>
    </div>
    {copyStatus&&<p role="status">{copyStatus}</p>}
    {setupOpen&&<div className="vv-browser-capture-steps">
      <p><strong>Safari setup (once):</strong> Bookmark any webpage in Safari. Edit that bookmark, name it <em>Capture Gallery</em>, replace its address with the copied code, then save.</p>
      <p><strong>For each gallery:</strong> Open it on the original website, scroll until its pictures load, run the Capture Gallery bookmark, then copy its results and return to Vault.</p>
      <p>If Safari prevents clipboard access, the bookmarklet shows a text box for manual copy. Some embedded browsers and websites prevent bookmarklets.</p>
      <textarea aria-label="Safari Capture Gallery bookmarklet code" readOnly value={browserGalleryBookmarklet()} rows={3} onFocus={e=>e.currentTarget.select()} />
    </div>
    <textarea rows={4} value={payload} onChange={e => setPayload(e.target.value)}
      placeholder="Paste the JSON copied from Vault Media Capture, or image/video URLs one per line"
      aria-label="Browser-captured media links" disabled={busy}/>
    <div className="vv-generator-primary-actions">
      <button type="button" onClick={inspect} disabled={busy || !payload.trim()}>Review captured media</button>
      {entries.length > 0 && <button type="button" onClick={() => setSelected(entries.filter(x => !existing.has(x.url)).map(x => x.url))} disabled={busy}>Select unsaved</button>}
      {entries.length > 0 && <button type="button" onClick={() => setSelected([])} disabled={busy}>Clear selection</button>}
    </div>
    {entries.length > 0 && <div className="vv-import-gallery-list">
      <p>{entries.length} detected · {pending.length} selected and not already saved.</p>
      <div className="vv-import-gallery-items" style={{maxHeight:360,overflowY:"auto"}}>
        {entries.map((item) => <label key={item.url} className="vv-browser-captured-item" style={{display:"flex",flexDirection:"column",gap:6,padding:8,alignItems:"start",cursor:"pointer"}}>
          <ResilientImage url={item.thumbnail || item.url} alt="" className="vv-browser-capture-thumb" />
          <span style={{display:"flex",gap:6,alignItems:"center",fontSize:12}}>
            <input type="checkbox" checked={existing.has(item.url) || selected.includes(item.url)} disabled={busy || existing.has(item.url)}
              onChange={e => setSelected(old => e.target.checked ? [...old,item.url] : old.filter(url => url !== item.url))} />
            {item.type === "image" ? "Image" : "Video"} {existing.has(item.url) ? "(saved)" : ""}
          </span>
          <small style={{overflowWrap:"anywhere",fontSize:11}}>{item.title || "Media"}</small>
        </label>)}
      </div>
      <button type="button" onClick={saveSelected} disabled={busy || !pending.length}>{busy ? "Importing…" : "Save " + pending.length + " selected to Vault"}</button>
    </div>}
    {status && <p role="status">{status}</p>}
    {error && <p role="alert">{error}</p>}
    <small>Vault saves source URLs, not the image bytes. Captured links may expire or fail outside the source site. For permanent storage, use the original website's permitted Save Image action and upload the downloaded file.</small>
  </section>;
}
