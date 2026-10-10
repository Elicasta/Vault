"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icons";
import { T } from "@/lib/theme";
import { itemKey, sourceIdOf } from "@/lib/utils";
import { ensureProxySession, SECURITY_V2_ENABLED } from "@/lib/security-session";
import MediaDiscoveryPanel from "./MediaDiscoveryPanel";
import GoogleDriveSave from "./GoogleDriveSave";
import "./InAppBrowser.css";

const HISTORY_KEY = "vv_browser_history";

function normalizeUrl(input) {
  const raw = String(input || "").trim();
  if (!raw || /[\u0000-\u001f\u007f]/.test(raw)) return "";
  try {
    // Try any HTTP(S) public site, regardless of hostname, TLD or provider.
    const scheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
    const url = new URL(scheme ? raw : "https://" + raw);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) return "";
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
    // Local and private networks must not be navigable through the collector.
    if (/^(?:localhost|metadata\.google\.internal)$/.test(host) ||
        /\.(?:localhost|local|lan|home|internal)$/.test(host) ||
        /^(?:127\.|10\.|192\.168\.|169\.254\.|0\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host) ||
        /^(?:::1|::|fc[0-9a-f]{2}:|fd[0-9a-f]{2}:|fe80:|ff[0-9a-f]{2}:)/i.test(host)) return "";
    if (!scheme && !host.includes(".") && !/^\d+\.\d+\.\d+\.\d+$/.test(host)) return "";
    return url.href;
  } catch { return ""; }
}

function isLikelyUrl(input) { return Boolean(normalizeUrl(input)); }

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

export default function InAppBrowser({ onClose, onSave, folders = [], existingItems = [], isMobile = false, onCreateFolder, initialQuery = "" }) {
  const [address, setAddress] = useState("");
  const [currentUrl, setCurrentUrl] = useState("");
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingFrame, setLoadingFrame] = useState(false);
  const [frameBlocked, setFrameBlocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [metadata, setMetadata] = useState(null);
  const [metaState, setMetaState] = useState("idle");
  const [folder, setFolder] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchState, setSearchState] = useState("idle");
  const [searchResults, setSearchResults] = useState([]);
  const [searchError, setSearchError] = useState("");
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [viewMode, setViewMode] = useState("media");
  const [videoTrail, setVideoTrail] = useState([]);
  const [focusedVideo, setFocusedVideo] = useState(null);
  const [showQuickSave, setShowQuickSave] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const showQuickSaveRef = useRef(showQuickSave);
  showQuickSaveRef.current = showQuickSave;
  const inputRef = useRef(null);
  const searchAbort = useRef(null);
  const searchSequence = useRef(0);

  useEffect(() => {
    try { setHistory(JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]")); } catch { setHistory([]); }
    // Do not focus a mobile address bar on mount: iOS otherwise opens its
    // keyboard, reduces the visual viewport and makes the sheet appear huge.
    if (!isMobile) inputRef.current?.focus();
    const h = (e) => {
      if (e.key !== "Escape") return;
      if (showQuickSaveRef.current) { setShowQuickSave(false); return; }
      onCloseRef.current?.();
    };
    window.addEventListener("keydown", h);
    return () => { window.removeEventListener("keydown", h); searchAbort.current?.abort(); ++searchSequence.current; };
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile || typeof window === "undefined" || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const baseline = window.innerHeight;
    const update = () => setKeyboardOpen(viewport.height < baseline * 0.78);
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, [isMobile]);

  useEffect(() => {
    if (!currentUrl) return;
    setMetadata(null);
    setMetaState("checking");
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/metadata?url=${encodeURIComponent(currentUrl)}`, { signal: controller.signal });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Could not read link");
        setMetadata(j);
        setMetaState("ok");
      } catch (e) {
        if (e.name !== "AbortError") {
          setMetadata(null);
          setMetaState("fail");
        }
      }
    }, 200);
    return () => { clearTimeout(t); controller.abort(); };
  }, [currentUrl]);

  useEffect(() => {
    if (!loadingFrame) return;
    const t = setTimeout(() => {
      setLoadingFrame(false);
      setFrameBlocked(true);
    }, 6500);
    return () => clearTimeout(t);
  }, [loadingFrame, currentUrl]);

  const currentHost = useMemo(() => hostOf(currentUrl), [currentUrl]);

  const commitHistory = (url, meta = null) => {
    const row = { url, title: meta?.title || hostOf(url) || url, visitedAt: new Date().toISOString() };
    const next = [row, ...history.filter((h) => h.url !== url)].slice(0, 80);
    setHistory(next);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch {}
  };

  const runSearch = async (query) => {
    const q = String(query || "").trim();
    if (!q) return;
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    const sequence = ++searchSequence.current;
    setSearchQuery(q);
    setVideoTrail([]);
    setFocusedVideo(null);
    setViewMode("results");
    setShowQuickSave(false);
    setCurrentUrl("");
    setMetadata(null);
    setMetaState("idle");
    setSearchState("loading");
    setSearchResults([]);
    setSearchError("");
    setShowHistory(false);
    try {
      if (SECURITY_V2_ENABLED) await ensureProxySession();
      const requestSearch = () => fetch(`/api/browser-search?q=${encodeURIComponent(q)}`, {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      });
      let response = await requestSearch();
      if (response.status === 401 && SECURITY_V2_ENABLED) {
        await ensureProxySession(null, { force: true });
        response = await requestSearch();
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Web search failed (HTTP ${response.status})`);
      if (sequence !== searchSequence.current || controller.signal.aborted) return;
      setSearchResults(Array.isArray(data.results) ? data.results : []);
      setSearchState("done");
    } catch (error) {
      if (sequence !== searchSequence.current || controller.signal.aborted) return;
      setSearchError(error.message || "Search failed");
      setSearchState("fail");
    }
  };

  useEffect(() => {
    const q = String(initialQuery || "").trim();
    if (!q) return;
    setAddress(q);
    runSearch(q);
    // Initial search should run once when this browser instance opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openUrl = (url, { addHistory = true, preserveTrail = false } = {}) => {
    const target = normalizeUrl(url);
    if (!target) return;
    if (!preserveTrail) { setVideoTrail([]); setFocusedVideo(null); }
    searchAbort.current?.abort();
    ++searchSequence.current;
    setCurrentUrl(target);
    setViewMode("media");
    setShowQuickSave(false);
    setAddress(target);
    setSearchQuery("");
    setShowHistory(false);
    // Attempt every public website; a site's own embedding policy may still prevent iframe display.
    setFrameBlocked(false);
    setLoadingFrame(true);
    if (addHistory) commitHistory(target);
  };

  const exploreVideoPage = (card) => {
    const target = normalizeUrl(card?.url);
    if (!target || target === currentUrl) return;
    setVideoTrail((old) => [...old, { url: currentUrl, focused: focusedVideo }].slice(-79));
    openUrl(target, { preserveTrail: true });
    setFocusedVideo({
      ...card, type: "video",
      thumbnail: card.thumbnail || "",
      sourcePage: currentUrl || card.sourcePage || target,
    });
  };

  const exploreAnyPage = (page) => {
    const target = normalizeUrl(page?.url);
    if (!target || target === currentUrl) return;
    setVideoTrail((old) => [...old, { url: currentUrl, focused: focusedVideo }].slice(-79));
    openUrl(target, { preserveTrail: true });
    setFocusedVideo(page?.kind === "image-page" ? { ...page, type: "image" } : null);
  };

  const backVideoPage = () => {
    if (!videoTrail.length) return;
    const last = videoTrail[videoTrail.length - 1];
    setVideoTrail((old) => old.slice(0, -1));
    openUrl(last.url, { addHistory: false, preserveTrail: true });
    setFocusedVideo(last.focused);
  };

  const go = (value = address) => {
    const raw = String(value || "").trim();
    if (!raw) return;
    if (isLikelyUrl(raw)) openUrl(raw);
    else runSearch(raw);
  };

  const removeHistoryItem = (url) => {
    const next = history.filter((h) => h.url !== url);
    setHistory(next);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch {}
  };

  const clearHistory = () => {
    setHistory([]);
    try { localStorage.removeItem(HISTORY_KEY); } catch {}
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name || creatingFolder) return;
    setCreatingFolder(true);
    try {
      await onCreateFolder?.(name);
      setFolder(name);
      setNewFolderName("");
    } finally {
      setCreatingFolder(false);
    }
  };

  const saveUrl = async (url, meta = {}) => {
    if (!url) return;
    setSaving(true);
    try {
      let finalMeta = meta;
      if (!finalMeta.title) {
        try {
          const r = await fetch(`/api/metadata?url=${encodeURIComponent(url)}`);
          if (r.ok) finalMeta = await r.json();
        } catch {}
      }
      const item = {
        id: `browser-${Date.now()}`,
        key: itemKey(url),
        url,
        title: finalMeta.title || hostOf(url) || url,
        note: finalMeta.description || finalMeta.snippet || "",
        tags: [],
        source: sourceIdOf(url),
        folder: folder || null,
        tab: folder || "Vault Library",
        thumbnail: finalMeta.thumbnail || "",
        type: finalMeta.type || "link",
        siteName: finalMeta.siteName || finalMeta.host || hostOf(url),
        isVaultItem: true,
        addedAt: new Date().toISOString(),
      };
      await onSave?.(item);
      commitHistory(url, finalMeta);
    } finally {
      setSaving(false);
    }
  };

  const saveCurrent = async () => saveUrl(currentUrl, metadata || {});
  const saveResult = async (result) => saveUrl(result.url, { title: result.title, description: result.snippet, host: result.host });

  const openExternal = (url = currentUrl) => {
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const previewResult = (result) => openUrl(result.url);

  const currentDirectType = /\.(?:jpe?g|png|webp|gif|avif|bmp)(?:$|[?#])/i.test(currentUrl)
    ? "image" : /\.(?:mp4|m4v|mov|webm|ogv)(?:$|[?#])/i.test(currentUrl) ? "video" : "";
  const selectedTitle = metadata?.title || currentHost || (searchQuery ? `Search: ${searchQuery}` : "No page selected");
  const selectedDesc = metadata?.description || (currentUrl ? currentUrl : searchQuery ? "Choose a result below, or save a result directly." : "Search or paste a link to begin.");
  const existingUrls = useMemo(() => existingItems.map((x) => x?.canonical_url || x?.url).filter(Boolean), [existingItems]);

  return (
    <>
      <div onClick={() => onCloseRef.current?.()} className="vv-browser-backdrop" aria-hidden="true" />
      <div className="vv-browser-shell" role="dialog" aria-modal="true" aria-label="Vault media browser" style={{
        position: "fixed", zIndex: 1199, inset: isMobile ? "0" : "3dvh 3vw", height: isMobile ? "100dvh" : "94dvh",
        minHeight: 0, maxHeight: "100dvh", boxSizing: "border-box", background: "rgba(9,9,9,0.98)",
        border: `1px solid ${T.border}`, borderRadius: isMobile ? 0 : 18, boxShadow: "0 30px 90px rgba(0,0,0,0.7)",
        display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "Inter, sans-serif",
      }}>
        <div className="vv-browser-topbar" style={{ display: "flex", alignItems: "center", gap: 8, padding: isMobile ? "10px" : "12px 14px", borderBottom: `1px solid ${T.borderSub}`, background: "rgba(255,255,255,0.03)", flexShrink: 0, minWidth: 0 }}>
          <button onClick={onClose} style={toolBtn} title="Close"><Icon name="x" size={16} /></button>
          <form onSubmit={(e) => { e.preventDefault(); go(); }} style={{ flex: 1, minWidth: 0, display: "flex", gap: 8 }}>
            <input ref={inputRef} value={address} onChange={(e) => setAddress(e.target.value)} onFocus={() => setShowHistory(false)} placeholder="Search or paste a link..." style={inputStyle} />
            <button type="submit" style={{ ...toolBtn, width: 42 }} title="Search"><Icon name="search" size={15} /></button>
          </form>
          {!isMobile && <button onClick={() => openExternal()} disabled={!currentUrl} style={toolBtn} title="Open original"><Icon name="external" size={15} /></button>}
          <button onClick={() => setShowHistory((v) => !v)} style={toolBtn} title="History"><Icon name="clock" size={15} /></button>
        </div>

        <div className="vv-browser-modebar" role="toolbar" aria-label="Browser views">
          {videoTrail.length > 0 && <button type="button" className="vv-browser-back" onClick={backVideoPage} title="Back to previous page">← Back</button>}
          <span className="vv-browser-locator">{currentHost || (searchQuery ? "Search results" : "Browse the web")}{focusedVideo ? " · Video detail" : ""}</span>
          {currentUrl && <div className="vv-browser-switch" role="group" aria-label="Page mode">
            <button type="button" aria-pressed={viewMode === "media"} onClick={() => { setViewMode("media"); setShowHistory(false); }}>Media</button>
            <button type="button" aria-pressed={viewMode === "page"} onClick={() => { setViewMode("page"); setShowHistory(false); }}>Page preview</button>
          </div>}
          {isMobile && <button type="button" className="vv-browser-save-toggle" aria-expanded={showQuickSave} onClick={() => { setShowQuickSave((v) => !v); setShowHistory(false); }}>{showQuickSave ? "Close save options" : "Save options"}</button>}
        </div>

        {showHistory && (
          <div style={{ borderBottom: `1px solid ${T.borderSub}`, background: "rgba(12,12,12,0.98)", maxHeight: isMobile ? 220 : 260, overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", color: T.text4, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
              <span>Browser history</span>
              {history.length > 0 && <button onClick={clearHistory} style={plainBtn}>Clear all</button>}
            </div>
            {history.length === 0 ? <div style={{ padding: "18px 14px", color: T.text4, fontSize: 13 }}>No history yet.</div> : history.map((h) => (
              <div key={h.url} style={{ display: "flex", gap: 8, alignItems: "center", padding: "9px 14px", borderTop: `1px solid ${T.borderSub}` }}>
                <button onClick={() => openUrl(h.url)} style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", color: T.text2, textAlign: "left", cursor: "pointer" }}>
                  <div style={ellipsis}>{h.title || h.url}</div>
                  <div style={{ ...ellipsis, fontSize: 11, color: T.text4 }}>{h.url}</div>
                </button>
                <button onClick={() => removeHistoryItem(h.url)} style={{ ...toolBtn, width: 30, height: 30 }} title="Delete"><Icon name="trash" size={13} /></button>
              </div>
            ))}
          </div>
        )}

        <div className="vv-browser-content" style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "minmax(0,1fr) minmax(280px,340px)", gridTemplateRows: "minmax(0,1fr)", position: "relative", overflow: "hidden" }}>
          <div className="vv-browser-main" style={{ minHeight: 0, minWidth: 0, background: "#050505", position: "relative", overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}>
            {!currentUrl && !searchQuery ? (
              <EmptySearch />
            ) : searchQuery ? (
              <SearchResults state={searchState} error={searchError} query={searchQuery} results={searchResults} onPreview={previewResult} onSave={saveResult} onOpen={openExternal} onRetry={() => runSearch(searchQuery)} saving={saving} />
            ) : currentUrl && viewMode === "media" ? (
              <MediaDiscoveryPanel
                pageUrl={currentUrl}
                folder={folder}
                folders={folders}
                onFolderChange={setFolder}
                onCreateFolder={onCreateFolder}
                onSave={onSave}
                existingUrls={existingUrls}
                onExploreVideoPage={exploreVideoPage}
                focusedVideo={focusedVideo}
                drillDepth={videoTrail.length}
                canExploreMore={true}
                onExplorePage={exploreAnyPage}
                onLoginToWebsite={() => openExternal(currentUrl)}
              />
            ) : (
              <div className="vv-browser-preview-container">
                {loadingFrame && <div style={loadBadge}>Loading website…</div>}
                <div className="vv-website-fallback">
                  <span>{frameBlocked ? "Preview may be blocked by this website." : "Blank preview? The website may prevent embedding."}</span>
                  <button type="button" onClick={() => openExternal(currentUrl)}>Sign in on original website <Icon name="external" size={12}/></button>
                  <button type="button" onClick={() => { setViewMode("media"); setShowQuickSave(false); }}>Rescan / find media</button>
                </div>
                <iframe key={currentUrl} src={currentUrl} onLoad={() => { setLoadingFrame(false); }}
                  title="Website preview" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                  referrerPolicy="no-referrer-when-downgrade" style={{ width:"100%", flex:1, minHeight:0, border:"none", background:"#fff" }} />
              </div>
            )}
          </div>

          <div className={"vv-browser-save-pane" + (isMobile ? " vv-browser-save-mobile" : "")} style={{
            borderLeft: isMobile ? "none" : `1px solid ${T.borderSub}`,
            borderTop: isMobile ? `1px solid ${T.borderSub}` : "none",
            padding: keyboardOpen && isMobile ? 0 : 14,
            background: "rgba(255,255,255,0.025)",
            overflowY: "auto",
            overscrollBehavior: "contain",
            minHeight: 0,
            maxHeight: isMobile ? "min(55dvh, 440px)" : "100%",
            display: keyboardOpen && isMobile ? "none" : "block",
            ...(isMobile && !showQuickSave ? { display: "none" } : {}),
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text1 }}>Quick save</div>
              {isMobile && <button type="button" onClick={() => setShowQuickSave(false)} className="vv-close-save">Close</button>}
              {metaState === "checking" && <span style={{ fontSize: 11, color: T.text4 }}>Reading link...</span>}
              {metaState === "fail" && <span style={{ fontSize: 11, color: T.text4 }}>Manual save</span>}
            </div>

            {metadata?.thumbnail && <img src={`/api/media?url=${encodeURIComponent(metadata.thumbnail)}`} alt="" style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", borderRadius: 10, border: `1px solid ${T.border}`, marginBottom: 10 }} />}

            <div style={{ fontSize: 15, fontWeight: 600, color: T.text1, lineHeight: 1.3, marginBottom: 6, wordBreak: "break-word" }}>{selectedTitle}</div>
            <div style={{ fontSize: 12, color: T.text4, lineHeight: 1.45, marginBottom: 12, display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{selectedDesc}</div>

            <FolderPicker folders={folders} folder={folder} setFolder={setFolder} newFolderName={newFolderName} setNewFolderName={setNewFolderName} handleCreateFolder={handleCreateFolder} creatingFolder={creatingFolder} />

            <button onClick={saveCurrent} disabled={!currentUrl || saving} style={{ width: "100%", padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.18)", background: currentUrl ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)", color: currentUrl ? T.text1 : T.text4, cursor: currentUrl ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 14 }}>
              {saving ? "Saving..." : "Save current link"}
            </button>

            <details className="vv-browser-drive-tools">
              <summary>Save to Google Drive instead</summary>
              <GoogleDriveSave url={currentDirectType ? currentUrl : ""} type={currentDirectType || "image"}
                title={selectedTitle} compact onOpenOriginal={() => openExternal(currentUrl)} />
              {!currentDirectType && <p>For an embedded video, open its Media preview to find the actual stream first. On desktop Chrome, the official Save to Google Drive extension can also save media from the original website.</p>}
            </details>
            <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.04)", color: T.text4, fontSize: 11, lineHeight: 1.45 }}>
              You can visit any public HTTP(S) website and inspect its media. Some sites disable embedded previews; use Open original. To sign in via Google, use "Sign in on original website"; Google blocks most embedded sign-in flows. Vault cannot reuse external-site login cookies or bypass DRM.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function FolderPicker({ folders, folder, setFolder, newFolderName, setNewFolderName, handleCreateFolder, creatingFolder }) {
  return <>
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginBottom: 10 }}>
      <select value={folder} onChange={(e) => setFolder(e.target.value)} style={{ width: "100%", minWidth: 0, padding: "10px 12px", background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.text1, fontSize: 13, outline: "none" }}>
        <option value="" style={{ background: "#111" }}>No folder</option>
        {folders.map((f) => <option key={f.name} value={f.name} style={{ background: "#111" }}>{f.name}</option>)}
      </select>
      <button onClick={() => setNewFolderName((v) => v ? "" : " ")} style={{ padding: "0 11px", borderRadius: 10, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.07)", color: T.text1, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>+ Folder</button>
    </div>
    {newFolderName !== "" && (
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginBottom: 10 }}>
        <input value={newFolderName.trimStart()} onChange={(e) => setNewFolderName(e.target.value)} placeholder="New folder name" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreateFolder(); } }} style={inputStyle} />
        <button onClick={handleCreateFolder} disabled={!newFolderName.trim() || creatingFolder} style={{ padding: "0 12px", borderRadius: 10, border: `1px solid ${T.border}`, background: newFolderName.trim() ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)", color: newFolderName.trim() ? T.text1 : T.text4, cursor: newFolderName.trim() ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 700 }}>{creatingFolder ? "Adding..." : "Add"}</button>
      </div>
    )}
  </>;
}

function EmptySearch() {
  return <div style={{ height: "100%", minHeight: 420, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
    <div><Icon name="search" size={34} style={{ color: T.text4, marginBottom: 12 }} /><div style={{ color: T.text2, fontSize: 15, fontWeight: 600 }}>Quick search</div><div style={{ color: T.text4, fontSize: 12, marginTop: 6 }}>Search for a website or video page, inspect its images and videos, then save individual media into your Vault.</div></div>
  </div>;
}

function SearchResults({ state, error, query, results, onPreview, onSave, onOpen, onRetry, saving }) {
  return <div style={{ padding: 16 }}>
    <div style={{ color: T.text1, fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Search results</div>
    <div style={{ color: T.text4, fontSize: 12, marginBottom: 14 }}>Find individual videos and images in results for “{query}”. Pick a page to scan its media.</div>
    {state === "loading" && <div style={panel}>Searching...</div>}
    {state === "fail" && <div style={panel}>{error || "Search failed"}<div style={{ display:"flex", gap:8, marginTop:12 }}><button style={smallAction} onClick={onRetry}>Retry</button><button style={smallAction} onClick={() => onOpen(`https://www.google.com/search?q=${encodeURIComponent(query)}`)}>Search in browser</button></div></div>}
    {state === "done" && results.length === 0 && <div style={panel}>No results found. Try a more specific search.</div>}
    <div style={{ display: "grid", gap: 10 }}>
      {results.map((r) => <div key={r.url} style={{ padding: 12, border: `1px solid ${T.border}`, borderRadius: 14, background: "rgba(255,255,255,0.035)" }}>
        <button onClick={() => onPreview(r)} style={{ background: "transparent", border: "none", color: T.text1, padding: 0, textAlign: "left", fontSize: 14, fontWeight: 750, cursor: "pointer", lineHeight: 1.25 }}>{r.title}</button>
        <div style={{ color: T.text4, fontSize: 11, marginTop: 5 }}>{r.host}</div>
        {r.snippet && <div style={{ color: T.text3, fontSize: 12, lineHeight: 1.45, marginTop: 7 }}>{r.snippet}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button onClick={() => onPreview(r)} style={{ ...smallAction, background:"rgba(255,255,255,.18)", fontWeight:800 }}>Find media</button>
          <button onClick={() => onSave(r)} disabled={saving} style={smallAction}>{saving ? "Saving..." : "Save page"}</button>
          <button onClick={() => onOpen(r.url)} style={smallAction}>Open site</button>
        </div>
      </div>)}
    </div>
  </div>;
}

function BlockedPreview({ url, host, onOpen }) {
  return <div style={{ minHeight: 420, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
    <div style={{ maxWidth: 360 }}>
      <Icon name="external" size={34} style={{ color: T.text4, marginBottom: 12 }} />
      <div style={{ color: T.text1, fontSize: 16, fontWeight: 800 }}>Preview blocked</div>
      <div style={{ color: T.text4, fontSize: 12, lineHeight: 1.45, marginTop: 8 }}>{host || "This site"} does not allow in-app iframe viewing. You can still save the link or open it externally.</div>
      <button onClick={onOpen} style={{ marginTop: 14, padding: "10px 14px", borderRadius: 12, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.1)", color: T.text1, fontWeight: 700 }}>Open original</button>
    </div>
  </div>;
}

const inputStyle = { flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 10, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.06)", color: T.text1, fontSize: 16, outline: "none" };
const plainBtn = { background: "transparent", border: "none", color: T.text3, cursor: "pointer", fontSize: 11 };
const ellipsis = { fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const loadBadge = { position: "absolute", top: 10, left: 10, zIndex: 2, padding: "5px 8px", borderRadius: 999, background: "rgba(0,0,0,0.72)", color: T.text3, fontSize: 11 };
const panel = { padding: 14, border: `1px solid ${T.border}`, borderRadius: 14, color: T.text3, background: "rgba(255,255,255,0.035)", fontSize: 13 };
const smallAction = { padding: "7px 10px", borderRadius: 9, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.07)", color: T.text2, fontSize: 12, fontWeight: 700, cursor: "pointer" };
const toolBtn = { width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.06)", color: T.text2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
