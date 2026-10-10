"use client";

import { useMemo, useState } from "react";
import { buildVaultMediaItem, parseCapturedMedia } from "@/lib/media-capture-import.mjs";
import { itemKey, sourceIdOf } from "@/lib/utils";

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
  const existing = useMemo(() => new Set([...existingUrls, ...savedLocally]), [existingUrls, savedLocally]);
  const pending = entries.filter(item => selected.includes(item.url) && !existing.has(item.url));

  const inspect = () => {
    setError(""); setStatus("");
    try {
      const list = parseCapturedMedia(payload, pageUrl);
      if (!list.length) throw new Error("No image or video URLs found. In Chrome, open the page, run Vault Media Capture, and copy the selected links.");
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
    <div className="v2-eyebrow">BROWSER-FIRST FALLBACK · ALL WEBSITES</div>
    <h3>2b. Import from your browser</h3>
    <p>When a site rejects automated scanning (403), open it normally in desktop Chrome. Vault Media Capture reads image and video URLs already loaded in that tab. Copy selected URLs, paste them below, and save them without sending cookies or passwords to Vault.</p>
    {pageUrl && /^https?:\/\//i.test(pageUrl) && <p>
      <a href={pageUrl} target="_blank" rel="noopener noreferrer">Open the original page</a>
    </p>}
    <p>Desktop Chrome only. On iPhone or iPad, save the original page URL or use the site's permitted download option followed by Upload a permanent copy.</p>
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
      <div style={{maxHeight:240,overflowY:"auto"}}>
        {entries.map((item) => <label key={item.url} style={{display:"flex",gap:8,padding:"6px 0",alignItems:"center"}}>
          <input type="checkbox" checked={existing.has(item.url) || selected.includes(item.url)} disabled={busy || existing.has(item.url)}
            onChange={e => setSelected(old => e.target.checked ? [...old,item.url] : old.filter(url => url !== item.url))} />
          <span style={{overflowWrap:"anywhere",fontSize:12}}>{item.type === "image" ? "Image" : "Video"} · {item.title || "Media"} {existing.has(item.url) ? "(saved)" : ""}</span>
        </label>)}
      </div>
      <button type="button" onClick={saveSelected} disabled={busy || !pending.length}>{busy ? "Importing…" : "Save " + pending.length + " selected to Vault"}</button>
    </div>}
    {status && <p role="status">{status}</p>}
    {error && <p role="alert">{error}</p>}
    <small>Original URLs remain subject to the source site's access rules. Expiring links may need a file upload instead.</small>
  </section>;
}
