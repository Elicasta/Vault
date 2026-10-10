"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ensureProxySession, SECURITY_V2_ENABLED } from "@/lib/security-session";
import { buildVaultMediaItem, parseCapturedMedia } from "@/lib/media-capture-import.mjs";
import { isPlayableVideoSource, uniqueVideoSources, prepareVideoToSave } from "@/lib/video-source-resolver.mjs";
import VideoPreviewModal from "./VideoPreviewModal";
import GalleryImporter, { ImageDetailPanel } from "./GalleryImporter";
import SourceInspector from "./SourceInspector";
import CapturedMediaImport from "./CapturedMediaImport";
import { isEliteBabesUrl } from "@/lib/server/site-adapters/elitebabes.mjs";
import { siteNeedsBrowser, markSiteBrowserFirst, clearBrowserFirst, isWebsiteAccessDenial, isUnsupportedDiscoveryResponse } from "@/lib/browser-first-fallback.mjs";
import { itemKey, sourceIdOf } from "@/lib/utils";

const truncate = (text, max = 80) => String(text || "").length > max ? String(text).slice(0, max - 1) + "…" : String(text || "");

function Thumbnail({ item }) {
  const [failed, setFailed] = useState(false);
  const [direct, setDirect] = useState(false);
  useEffect(() => { setFailed(false); setDirect(false); }, [item.url, item.thumbnail]);
  if (!item.thumbnail || failed) return <div className="vv-media-placeholder" aria-hidden="true">{item.type === "video" ? "VIDEO" : "IMAGE"}</div>;
  return <img loading="lazy" alt="" src={direct ? item.thumbnail : "/api/media?url=" + encodeURIComponent(item.thumbnail)} onError={() => { if (!direct) setDirect(true); else setFailed(true); }} referrerPolicy="no-referrer" className="vv-media-thumb" />;
}

export default function MediaDiscoveryPanel({ pageUrl, folder, folders, onFolderChange, onCreateFolder, onSave, existingUrls = [], onExploreVideoPage, onExplorePage, onLoginToWebsite, focusedVideo = null, drillDepth = 0, canExploreMore = true }) {
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
  const [previewItem, setPreviewItem] = useState(null);
  const [resolvedSources, setResolvedSources] = useState({});
  const [savedThisSession, setSavedThisSession] = useState([]);
  const [detailSources, setDetailSources] = useState([]);
  const [detailState, setDetailState] = useState("idle");
  const [detailError, setDetailError] = useState("");
  const abort = useRef(null);
  const seq = useRef(0);

  const scan = async (url, force = false) => {
    if (!url) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const ticket = ++seq.current;
    setStatus("loading"); setResult(null); setSelected([]); setExtra([]); setResolvedSources({});
    setError(""); setSaveReport("");
    if (!force && siteNeedsBrowser(url)) {
      setStatus("browser");
      setError("This site has already declined automated scanning in this browser session. Use browser capture or retry once.");
      return;
    }
    try {
      if (SECURITY_V2_ENABLED) await ensureProxySession();
      const request = () => fetch("/api/media-discovery?url=" + encodeURIComponent(url), { signal: controller.signal, credentials: "same-origin", cache: "no-store" });
      let response = await request();
      if (response.status === 401 && SECURITY_V2_ENABLED) {
        await ensureProxySession(null, { force: true });
        response = await request();
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (isWebsiteAccessDenial(response, data)) {
          markSiteBrowserFirst(url);
          setStatus("browser");
          setError(data.error || "The site denied server-side scanning. Use browser capture.");
          return;
        }
        if (isUnsupportedDiscoveryResponse(response,data)) {
          // This is a non-HTML *page*, not necessarily a blocked website.
          // Keep other pages on the host eligible for gallery scanning.
          setStatus("browser");
          setError(data.error || "This link isn't a readable HTML gallery.");
          return;
        }
        throw new Error(data.error || "Media discovery failed (HTTP " + response.status + ")");
      }
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

  useEffect(() => {
    if (focusedVideo?.type === "image" || !focusedVideo?.url || focusedVideo.url !== pageUrl) {
      setDetailSources([]); setDetailState("idle"); setDetailError(""); return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setDetailSources([]); setDetailError(""); setDetailState("loading");
    (async () => {
      if (SECURITY_V2_ENABLED) await ensureProxySession();
      const request = () => fetch("/api/video-sources?url=" + encodeURIComponent(pageUrl), { signal: controller.signal, credentials: "same-origin", cache: "no-store" });
      let response = await request();
      if (response.status === 401 && SECURITY_V2_ENABLED) {
        await ensureProxySession(null, { force: true }); response = await request();
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not inspect the video page.");
      if (cancelled) return;
      const sources = uniqueVideoSources(data.sources || [], { sourcePage: pageUrl, thumbnail: focusedVideo.thumbnail });
      setDetailSources(sources);
      setDetailState("done");
      if (!sources.length) setDetailError(data.reason || "This page exposes only its cover. Try Chrome network capture.");
      if (sources.length === 1) setResolvedSources((old) => ({ ...old, [pageUrl]: sources[0] }));
    })().catch((e) => { if (!cancelled) { setDetailState("error"); setDetailError(e.message || "Video lookup failed."); } });
    return () => { cancelled = true; controller.abort(); };
  }, [pageUrl, focusedVideo?.url, focusedVideo?.thumbnail]);

  const detailItem = focusedVideo && focusedVideo.type !== "image" && focusedVideo.url === pageUrl
    ? { ...focusedVideo, type: "video", title: result?.pageTitle || focusedVideo.title || "Video", thumbnail: result?.media?.find((m) => m.type === "video" && m.thumbnail)?.thumbnail || focusedVideo.thumbnail || "" }
    : null;

  const items = useMemo(() => {
    const map = new Map();
    for (const item of [...extra, ...(result?.media || [])]) {
      if (item?.url && !map.has(item.url)) map.set(item.url, item);
    }
    return [...map.values()];
  }, [extra, result]);
  const saved = useMemo(() => new Set([...existingUrls, ...savedThisSession]), [existingUrls, savedThisSession]);
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

  const resolveForSave = async (item, selectedVideo = null) => {
    if (item.type !== "video") return item;
    if (selectedVideo && isPlayableVideoSource(selectedVideo)) return prepareVideoToSave(item, selectedVideo);
    const remembered = resolvedSources[item.url];
    if (remembered && isPlayableVideoSource(remembered)) return prepareVideoToSave(item, remembered);
    if (isPlayableVideoSource(item)) return prepareVideoToSave(item);
    // Don't confuse a video's cover / page URL with its actual playable asset.
    if (SECURITY_V2_ENABLED) await ensureProxySession();
    const fetchSources = () => fetch("/api/video-sources?url=" + encodeURIComponent(item.url), { cache: "no-store", credentials: "same-origin" });
    let response = await fetchSources();
    if (response.status === 401 && SECURITY_V2_ENABLED) { await ensureProxySession(null, { force: true }); response = await fetchSources(); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Video source lookup failed.");
    const options = uniqueVideoSources(data.sources || [], { sourcePage: item.url, thumbnail: item.thumbnail });
    if (!options.length) throw new Error("No actual video URL detected. Preview the card or capture the network media URL in Chrome.");
    if (options.length > 1) throw new Error("Multiple video sources found. Open Preview to choose the correct clip.");
    setResolvedSources((prev) => ({ ...prev, [item.url]: options[0] }));
    return prepareVideoToSave(item, options[0]);
  };

  const persistMedia = async (item, selectedVideo = null) => {
    const actual = await resolveForSave(item, selectedVideo);
    if (saved.has(actual.url)) throw new Error("This actual video URL is already in your library.");
    await onSave(buildVaultMediaItem(actual, folder, itemKey, sourceIdOf));
    setSavedThisSession((prev) => [...prev, item.url, actual.url]);
    return actual;
  };

  const saveFromPreview = async (item, chosen) => {
    if (saving) return;
    setSaving(true); setSaveReport("");
    try {
      const media = await persistMedia(item, chosen);
      setSelected((old) => old.filter((url) => url !== item.url));
      setSaveReport("Saved " + (media.type === "video" ? "video with its cover" : "image") + " to " + (folder || "your Vault") + ".");
      setPreviewItem(null);
    } catch (e) { setSaveReport(e.message || "Save failed."); }
    finally { setSaving(false); }
  };

  const saveSelected = async () => {
    if (saving || !selectedCount) return;
    const targets = items.filter((item) => selectedSet.has(item.url) && !saved.has(item.url));
    setSaving(true); setSaveReport("");
    const completed = []; const failures = [];
    try {
      for (const item of targets) {
        try {
          await persistMedia(item);
          completed.push(item.url);
        } catch (error) { failures.push({ title: item.title, reason: error?.message || "Save failed" }); }
      }
      setSelected((old) => old.filter((u) => !completed.includes(u)));
      setSaveReport(completed.length + " saved" + (failures.length ? "; " + failures.length + " need a playable source. Open Preview to choose or capture one. " + failures[0].reason : " to " + (folder || "your Vault") + "."));
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
        <div className="vv-media-eyebrow">{isEliteBabesUrl(pageUrl) ? "ELITEBABES · VAULT GALLERY ADAPTER" : "MEDIA COLLECTOR"}</div>
        <h2>{result?.pageTitle || "Discover media"}</h2>
        <p>Review individual video and image links. Ads and duplicate media are filtered when identifiable.</p>
      </div>
      <button type="button" className="vv-media-refresh" onClick={() => scan(pageUrl)} disabled={status === "loading" || saving}>Rescan page</button>
    </div>

    <SourceInspector pageUrl={pageUrl} folder={folder} onSave={onSave} existingUrls={[...existingUrls,...savedThisSession]}/>

    {detailItem && <section className="vv-video-detail-focus" aria-label="Individual video page">
      <div className="vv-video-detail-cover"><Thumbnail item={detailItem} /></div>
      <div className="vv-video-detail-copy">
        <div className="vv-media-eyebrow">INDIVIDUAL VIDEO PAGE · LEVEL {drillDepth + 1}</div>
        <strong>{detailItem.title}</strong>
        {detailState === "loading" && <p role="status">Searching this video page for the playable stream…</p>}
        {detailState === "done" && detailSources.length > 0 && <p role="status">Found {detailSources.length} playable video source{detailSources.length === 1 ? "" : "s"}. The image stays separate as its cover.</p>}
        {detailError && <p role="status">{detailError}</p>}
        <div className="vv-media-link-actions">
          <button className="vv-media-preview-button" type="button" onClick={() => setPreviewItem(detailItem)}>Preview / choose video URL</button>
          {detailSources.length === 1 && <button type="button" disabled={saving} onClick={() => saveFromPreview(detailItem, detailSources[0])}>Save actual video + cover</button>}
        </div>
      </div>
    </section>}

    {focusedVideo?.type === "image" && focusedVideo.url === pageUrl && <ImageDetailPanel
      page={focusedVideo} folder={folder} onSave={onSave} saving={saving}
      onSaved={(url) => setSavedThisSession((old) => [...old, url])}
    />}

    <div className="vv-media-collection">
      <label htmlFor="vv-media-folder">Save into</label>
      <select id="vv-media-folder" value={folder} onChange={(e) => onFolderChange(e.target.value)}>
        <option value="">My Library</option>
        {folders.map((f) => <option value={f.name} key={f.name}>{f.name}</option>)}
      </select>
      <button type="button" onClick={() => setAddingFolder((v) => !v)} aria-label="Create collection" title="Create collection">+ Collection</button>
    </div>
    {addingFolder && <div className="vv-media-new-folder"><input aria-label="New collection name" autoFocus placeholder="Collection name" value={newFolder} onChange={(e) => setNewFolder(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addFolder(); }} /><button type="button" onClick={addFolder} disabled={!newFolder.trim()}>Create</button><button type="button" onClick={() => setAddingFolder(false)}>Cancel</button></div>}

    <GalleryImporter
      result={result} folder={folder} onFolderChange={onFolderChange}
      onCreateFolder={onCreateFolder} folders={folders} onSave={onSave}
      existingUrls={[...existingUrls, ...savedThisSession]}
      onSaved={(url) => setSavedThisSession((old) => [...old, url])}
    />

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
    {(status === "error" || status === "browser") && <div className="vv-media-message" role="alert">{error}
      <button type="button" onClick={() => { clearBrowserFirst(pageUrl); scan(pageUrl,true); }}>Retry scan</button>
      <button type="button" onClick={() => onLoginToWebsite?.()}>Open original website</button>
      <p>Some addresses return downloads, API data, or browser-only pages rather than readable HTML. Other sites block server access. Website cookies cannot be transferred to Vault's server scanner. Open the original page to use its own Download action, or import Chrome-captured URLs; saving the page URL is always available.</p>
    </div>}
    {status === "browser" && <><p className="vv-media-note">{isEliteBabesUrl(pageUrl) ? "This site has a gallery adapter; when its page is unavailable to Vault, use the original website and capture accessible media in your own browser." : "This site requires a browser-first import. Review and save its accessible media directly in Vault below."}</p>
      <CapturedMediaImport pageUrl={pageUrl} folder={folder} onSave={onSave} existingUrls={[...existingUrls,...savedThisSession]}/></>}
    {status === "done" && !items.length && !(result?.videoPages || []).length && !(result?.imagePages || []).length && <div className="vv-media-message">No links were visible in this page's HTML. Some sites load them dynamically; try the Chrome capture extension or visit the individual video page.</div>}
    {result?.truncated && <p className="vv-media-note">This page contains more media than the current scan limit. The highest-confidence matches are shown.</p>}
    {result?.filteredAds > 0 && <p className="vv-media-note">{result.filteredAds} advertising or invalid URL candidates excluded.</p>}

    {(result?.videoPages || []).length > 0 && <section className="vv-video-pages" aria-label="Explore video pages">
      <div className="vv-video-pages-header">
        <div><h3>Explore video pages</h3><p>Thumbnails can link to individual posts. Open one inside Vault to identify its playable video URL.</p></div>
        <span>{result.videoPages.length} pages</span>
      </div>
      <div className="vv-video-pages-grid">
        {result.videoPages.map((page) => <button type="button" key={page.url} className="vv-video-page-card"
          onClick={() => onExploreVideoPage?.(page)} disabled={!canExploreMore} title={page.url}>
          <div className="vv-video-page-cover"><Thumbnail item={{ ...page, type: "video" }} /><span>OPEN PAGE →</span></div>
          <strong>{truncate(page.title || page.url, 75)}</strong>
          <small>{page.confidence === "likely-video" ? "Likely video page" : "Possible detail page · verify"}</small>
        </button>)}
      </div>
      {!canExploreMore && <p className="vv-media-note">Exploration depth limit reached. Go back to continue browsing.</p>}
    </section>}

    {(result?.imagePages || []).length > 0 && <section className="vv-video-pages" aria-label="Explore image pages">
      <div className="vv-video-pages-header"><div><h3>Explore image pages</h3>
        <p>Open a gallery photo's detail page to look for the original image URL rather than its smaller cover.</p></div>
        <span>{result.imagePages.length} pages</span>
      </div>
      <div className="vv-video-pages-grid">
        {result.imagePages.map((page) => <button type="button" key={page.url} className="vv-video-page-card"
          onClick={() => onExplorePage?.(page)} title={page.url}>
          <div className="vv-video-page-cover"><Thumbnail item={{ ...page, type: "image" }} /><span>OPEN IMAGE →</span></div>
          <strong>{truncate(page.title || page.url, 75)}</strong>
          <small>{page.confidence === "likely-image" ? "Image detail page" : "Linked gallery page · verify"}</small>
        </button>)}
      </div>
    </section>}

    <div className="vv-media-grid">
      {visible.map((item) => {
        const alreadySaved = saved.has(item.url);
        const checked = selectedSet.has(item.url);
        return <label key={item.url} className={"vv-media-item" + (checked ? " selected" : "") + (alreadySaved ? " saved" : "")}>
          <input type="checkbox" checked={alreadySaved || checked} disabled={alreadySaved || saving} onChange={() => toggle(item.url)} aria-label={"Select " + item.title} />
          <div className="vv-media-image"><Thumbnail item={item} /><span className="vv-media-kind">{item.type}</span></div>
          <div className="vv-media-label">
            <strong title={item.title}>{truncate(item.title, 68)}</strong>
            <span>{alreadySaved ? "Already saved" : item.type === "video" && !isPlayableVideoSource(item) && !resolvedSources[item.url] ? "Cover / post detected · video source needed" : item.confidence === "high" ? "High-confidence source" : "Page-detected media"}</span>
            <span className="vv-media-url" title={item.url}>{truncate(item.url, 95)}</span>
            <span className="vv-media-link-actions">
              {item.type === "video" && !isPlayableVideoSource(item) && canExploreMore &&
                <button type="button" className="vv-media-preview-button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onExploreVideoPage?.(item); }}>Open video page →</button>}
              <button type="button" className={item.type === "video" && !isPlayableVideoSource(item) ? "" : "vv-media-preview-button"} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPreviewItem(item); }}>Preview {item.type === "video" ? "video" : "image"}</button>
              <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigator.clipboard.writeText(resolvedSources[item.url]?.url || item.url).then(() => setSaveReport("URL copied to clipboard.")).catch(() => setSaveReport("Clipboard unavailable; use Open URL.")); }}>Copy URL</button>
              <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(item.url, "_blank", "noopener,noreferrer"); }}>Open URL</button>
            </span>
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
    <p className="vv-media-footnote">For Google Drive file copies, choose Preview on an image or video. For videos, Vault saves the playable stream URL as the item and the image as its cover. Unknown stream URLs cannot be saved as videos. Signed or DRM streams may still expire or be unplayable.</p>
    {previewItem && <VideoPreviewModal item={previewItem} onClose={() => setPreviewItem(null)} saving={saving} onChoose={(origin, source) => setResolvedSources((old) => ({ ...old, [origin]: source }))} onSave={saveFromPreview} />}
  </div>;
}
