"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ensureProxySession, SECURITY_V2_ENABLED } from "@/lib/security-session";
import { buildVaultMediaItem, parseCapturedMedia } from "@/lib/media-capture-import.mjs";
import { itemKey, sourceIdOf } from "@/lib/utils";

const DEFAULT_COUNTS = { videos: 0, images: 0 };
const truncate = (text, max = 80) => String(text || "").length > max ? String(text).slice(0, max - 1) + "…" : String(text || "");

function Thumbnail({ item }) {
  const [failed, setFailed] = useState(false);
  const [direct, setDirect] = useState(false);
  useEffect(() => { setFailed(false); setDirect(false); }, [item.url, item.thumbnail]);
  if (!item.thumbnail || failed) return <div className="vv-media-placeholder" aria-hidden="true">{item.type === "video" ? "VIDEO" : "IMAGE"}</div>;
  return <img loading="lazy" alt="" src={direct ? item.thumbnail : "/api/media?url=" + encodeURIComponent(item.thumbnail)} onError={() => { if (!direct) setDirect(true); else setFailed(true); }} referrerPolicy="no-referrer" className="vv-media-thumb" />;
}

export default function MediaDiscoveryPanel({ pageUrl, folder, folders, onFolderChange, onCreateFolder, onSave, existingUrls = [] }) {
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState([]);
  const [extra, setExtra] = useState([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveReport, setSaveReport] = useState("");
  const [newFolder, setNewFolder] = useState("");
  const [addingFolder, setAddingFolder] = useState(false);
  const abort = useRef(null);
  const seq = useRef(0);

  const scan = async (url) => {
    if (!url) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const ticket = ++seq.current;
    setStatus("loading"); setResult(null); setSelected([]); setExtra([]);
    setError(""); setSaveReport("");
    try {
      if (SECURITY_V2_ENABLED) await ensureProxySession();
      const request = () => fetch("/api/media-discovery?url=" + encodeURIComponent(url), { signal: controller.signal, credentials: "same-origin", cache: "no-store" });
      let response = await request();
      if (response.status === 401 && SECURITY_V2_ENABLED) {
        await ensureProxySession(null, { force: true });
        response = await request();
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Media discovery failed (HTTP " + response.status + ")");
      if (controller.signal.aborted || ticket !== seq.current) return;
      setResult(data);
      setStatus("done");
    } catch (e) {
      if (controller.signal.aborted || ticket !== seq.current) return;
      setStatus("error"); setError(e.message || "Media discovery failed");
    }
  };

  useEffect(() => {
    scan(pageUrl);
    return () => { abort.current?.abort(); ++seq.current; };
    // scan belongs to this page instance; do not restart for a rerender.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageUrl]);

  const items = useMemo(() => {
    const map = new Map();
    for (const item of [...extra, ...(result?.media || [])]) {
      if (item?.url && !map.has(item.url)) map.set(item.url, item);
    }
    return [...map.values()];
  }, [extra, result]);
  const saved = useMemo(() => new Set(existingUrls), [existingUrls]);
  const visible = useMemo(() => items.filter((v) => filter === "all" || v.type === filter), [items, filter]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const newVisible = visible.filter((item) => !saved.has(item.url));
  const selectedCount = items.filter((i) => selectedSet.has(i.url) && !saved.has(i.url)).length;
  const counts = useMemo(() => ({
    videos: items.filter((i) => i.type === "video").length,
    images: items.filter((i) => i.type === "image").length,
  }), [items]);

  const selectVisible = (values) => setSelected((previous) => {
    const next = new Set(previous);
    for (const item of values) if (!saved.has(item.url)) next.add(item.url);
    return [...next];
  });
  const toggle = (url) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(url)) next.delete(url); else next.add(url);
    return [...next];
  });

  const addCapture = () => {
    try {
      const captures = parseCapturedMedia(importText, pageUrl);
      if (!captures.length) throw new Error("No supported video or image URLs found. Paste the URLs copied from the Vault Chrome capture extension.");
      setExtra((previous) => {
        const map = new Map([...previous, ...captures].map((item) => [item.url, item]));
        return [...map.values()];
      });
      selectVisible(captures);
      setImportError(""); setImportOpen(false); setImportText("");
      setSaveReport(captures.length + " captured media link" + (captures.length === 1 ? "" : "s") + " added for review.");
    } catch (e) { setImportError(e.message || "Invalid captured media"); }
  };

  const saveSelected = async () => {
    if (saving || !selectedCount) return;
    const targets = items.filter((item) => selectedSet.has(item.url) && !saved.has(item.url));
    setSaving(true); setSaveReport("");
    const completed = []; const failures = [];
    try {
      for (const item of targets) {
        try {
          await onSave(buildVaultMediaItem(item, folder, itemKey, sourceIdOf));
          completed.push(item.url);
        } catch (error) { failures.push({ title: item.title, reason: error?.message || "Save failed" }); }
      }
      setSelected((old) => old.filter((u) => !completed.includes(u)));
      setSaveReport(completed.length + " saved" + (failures.length ? "; " + failures.length + " failed. Try again." : " to " + (folder || "your Vault") + "."));
    } finally { setSaving(false); }
  };

  const addFolder = async () => {
    const name = newFolder.trim();
    if (!name || addingFolder) return;
    setAddingFolder(true);
    try { await onCreateFolder(name); onFolderChange(name); setNewFolder(""); }
    catch (e) { setSaveReport(e?.message || "Couldn't create collection."); }
    finally { setAddingFolder(false); }
  };

  return <div className="vv-media-discovery">
    <div className="vv-media-head">
      <div>
        <div className="vv-media-eyebrow">MEDIA COLLECTOR</div>
        <h2>{result?.pageTitle || "Discover media"}</h2>
        <p>Review individual video and image links. Ads and duplicate media are filtered when identifiable.</p>
      </div>
      <button type="button" className="vv-media-refresh" onClick={() => scan(pageUrl)} disabled={status === "loading" || saving}>Rescan page</button>
    </div>

    <div className="vv-media-collection">
      <label htmlFor="vv-media-folder">Save into</label>
      <select id="vv-media-folder" value={folder} onChange={(e) => onFolderChange(e.target.value)}>
        <option value="">My Library</option>
        {folders.map((f) => <option value={f.name} key={f.name}>{f.name}</option>)}
      </select>
      <button type="button" onClick={() => setAddingFolder((v) => !v)} aria-label="Create collection" title="Create collection">+ Collection</button>
    </div>
    {addingFolder && <div className="vv-media-new-folder"><input aria-label="New collection name" autoFocus placeholder="Collection name" value={newFolder} onChange={(e) => setNewFolder(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addFolder(); }} /><button type="button" onClick={addFolder} disabled={!newFolder.trim()}>Create</button><button type="button" onClick={() => setAddingFolder(false)}>Cancel</button></div>}

    <div className="vv-media-tools">
      <div className="vv-media-filters" role="group" aria-label="Filter media">
        <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All {items.length}</button>
        <button type="button" aria-pressed={filter === "video"} onClick={() => setFilter("video")}>Videos {counts.videos}</button>
        <button type="button" aria-pressed={filter === "image"} onClick={() => setFilter("image")}>Images {counts.images}</button>
      </div>
      <div className="vv-media-select-actions">
        <button type="button" onClick={() => selectVisible(newVisible)} disabled={!newVisible.length}>Select visible</button>
        <button type="button" onClick={() => setSelected([])} disabled={!selected.length}>Clear</button>
      </div>
    </div>

    {status === "loading" && <div className="vv-media-message" role="status">Inspecting images, video players and individual media links…</div>}
    {status === "error" && <div className="vv-media-message" role="alert">{error} <button type="button" onClick={() => scan(pageUrl)}>Retry</button></div>}
    {status === "done" && !items.length && <div className="vv-media-message">No public media links were exposed in this page's HTML. Try the Chrome network capture option below for dynamically loaded videos.</div>}
    {result?.truncated && <p className="vv-media-note">This page contains more media than the current scan limit. The highest-confidence matches are shown.</p>}
    {result?.filteredAds > 0 && <p className="vv-media-note">{result.filteredAds} advertising or invalid URL candidates excluded.</p>}

    <div className="vv-media-grid">
      {visible.map((item) => {
        const alreadySaved = saved.has(item.url);
        const checked = selectedSet.has(item.url);
        return <label key={item.url} className={"vv-media-item" + (checked ? " selected" : "") + (alreadySaved ? " saved" : "")}>
          <input type="checkbox" checked={alreadySaved || checked} disabled={alreadySaved || saving} onChange={() => toggle(item.url)} aria-label={"Select " + item.title} />
          <div className="vv-media-image"><Thumbnail item={item} /><span className="vv-media-kind">{item.type}</span></div>
          <div className="vv-media-label">
            <strong title={item.title}>{truncate(item.title, 68)}</strong>
            <span>{alreadySaved ? "Already saved" : item.confidence === "high" ? "High-confidence source" : "Page-detected media"}</span>
            <span className="vv-media-url" title={item.url}>{truncate(item.url, 95)}</span>
          </div>
        </label>;
      })}
    </div>

    <div className="vv-capture-import">
      <button type="button" className="vv-media-import-toggle" onClick={() => setImportOpen((v) => !v)} aria-expanded={importOpen}>
        {importOpen ? "Hide captured URLs" : "Import actual URLs from Chrome capture"}
      </button>
      {importOpen && <div className="vv-capture-body">
        <p>Copy captured image/video requests from the companion Chrome extension, then paste them here. Media URLs can expire; original post links are often more durable.</p>
        <textarea rows={4} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="Paste captured URL list or Vault Media Capture JSON" aria-label="Captured media URLs" />
        {importError && <p role="alert">{importError}</p>}
        <button type="button" onClick={addCapture} disabled={!importText.trim()}>Add detected URLs</button>
      </div>}
    </div>

    {saveReport && <p className="vv-media-report" role="status">{saveReport}</p>}
    <div className="vv-media-footer">
      <span>{selectedCount} selected</span>
      <button type="button" disabled={!selectedCount || saving} onClick={saveSelected}>{saving ? "Saving media…" : "Save " + selectedCount + " to Vault"}</button>
    </div>
    <p className="vv-media-footnote">Vault saves URLs, not copies of the media files. Protected, private, expiring, and DRM streams may not be directly playable.</p>
  </div>;
}
