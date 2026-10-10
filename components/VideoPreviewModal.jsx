"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ensureProxySession, SECURITY_V2_ENABLED } from "@/lib/security-session";
import { isPlayableVideoSource, uniqueVideoSources } from "@/lib/video-source-resolver.mjs";
import GoogleDriveSave from "./GoogleDriveSave";

function playableUrl(url) {
  return "/api/stream?url=" + encodeURIComponent(url);
}

function VideoPlayer({ source, poster }) {
  const ref = useRef(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    setMessage("");
    if (!source?.url || !/\.m3u8(?:$|[?#])/i.test(source.url)) return;
    const el = ref.current;
    if (!el || el.canPlayType("application/vnd.apple.mpegurl")) return;
    let canceled = false;
    let instance;
    import("hls.js").then(({ default: Hls }) => {
      if (canceled || !Hls.isSupported() || !ref.current) {
        if (!canceled) setMessage("HLS is not supported in this browser.");
        return;
      }
      instance = new Hls({ enableWorker: true, maxBufferLength: 20 });
      instance.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) setMessage("Stream preview could not play. Try opening the original source.");
      });
      instance.loadSource(playableUrl(source.url));
      instance.attachMedia(el);
    }).catch(() => { if (!canceled) setMessage("HLS preview is unavailable."); });
    return () => { canceled = true; instance?.destroy(); };
  }, [source?.url]);
  const isHls = /\.m3u8(?:$|[?#])/i.test(source?.url || "");
  const nativeHls = typeof document !== "undefined" && !!document.createElement("video").canPlayType("application/vnd.apple.mpegurl");
  return <div>
    <video
      ref={ref}
      key={source?.url}
      src={isHls && !nativeHls ? undefined : playableUrl(source.url)}
      controls
      playsInline
      preload="metadata"
      poster={poster ? "/api/media?url=" + encodeURIComponent(poster) : undefined}
      onError={() => setMessage("Preview could not decode this video. The URL can still be opened outside Vault.")}
      onLoadedMetadata={(e) => {
        const video = e.currentTarget;
        if (video.videoWidth === 0 && video.videoHeight === 0) setMessage("The source appears audio-only in this browser. Do not save unless the video plays correctly.");
      }}
      className="vv-video-preview-player"
    />
    {message && <p className="vv-video-preview-warning" role="alert">{message}</p>}
  </div>;
}

export default function VideoPreviewModal({ item, onClose, onChoose, onSave, saving }) {
  const [sources, setSources] = useState([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(item?.type === "video");
  const [error, setError] = useState("");
  const dialog = useRef(null);
  const token = useRef(0);

  useEffect(() => {
    if (!item) return;
    const controller = new AbortController();
    const sequence = ++token.current;
    setError("");
    if (item.type !== "video") { setSources([]); setSelected(""); setLoading(false); return; }
    const own = uniqueVideoSources([item]);
    if (own.length) {
      setSources(own); setSelected(own[0].url); setLoading(false);
      onChoose(item.url, own[0]); return;
    }
    setLoading(true); setSources([]); setSelected("");
    (async () => {
      if (SECURITY_V2_ENABLED) await ensureProxySession();
      const fetchSources = () => fetch("/api/video-sources?url=" + encodeURIComponent(item.url), { signal: controller.signal, cache: "no-store", credentials: "same-origin" });
      let response = await fetchSources();
      if (response.status === 401 && SECURITY_V2_ENABLED) {
        await ensureProxySession(null, { force: true });
        response = await fetchSources();
      }
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Source resolution failed.");
      if (controller.signal.aborted || sequence !== token.current) return;
      const options = uniqueVideoSources(result.sources || [], { sourcePage: item.url, thumbnail: item.thumbnail });
      setSources(options);
      if (options.length === 1) {
        setSelected(options[0].url);
        onChoose(item.url, options[0]);
      } else if (!options.length) setError(result.reason || "No playable video URL found in the page. The image is only a cover. Use Chrome capture for videos loaded dynamically.");
    })().catch((e) => { if (!controller.signal.aborted) setError(e.message || "Could not resolve video source."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); ++token.current; };
  }, [item?.url, item?.type]);

  useEffect(() => {
    const last = document.activeElement;
    dialog.current?.querySelector("[data-preview-close]")?.focus();
    const close = (e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("keydown", close); last?.focus?.(); };
  }, [onClose]);

  if (!item || typeof document === "undefined") return null;
  const active = sources.find((s) => s.url === selected) || null;
  return createPortal(<>
    <div className="vv-preview-backdrop" onMouseDown={onClose} />
    <section ref={dialog} className="vv-preview-dialog" role="dialog" aria-modal="true" aria-label={item.type === "video" ? "Video preview and source" : "Image preview"}>
      <header className="vv-preview-header">
        <div><strong>{item.title || "Media preview"}</strong><span>{item.type === "video" ? "Video URL + cover image" : "Image URL"}</span></div>
        <button type="button" data-preview-close onClick={onClose} aria-label="Close preview">Close</button>
      </header>
      <div className="vv-preview-scroll">
        {item.type === "image" ? <img className="vv-preview-image" alt={item.title || ""} src={"/api/media?url=" + encodeURIComponent(item.url)} /> : <>
          {loading && <div className="vv-media-message" role="status">Finding the playable video URL…</div>}
          {error && <div className="vv-media-message" role="alert">{error}</div>}
          {sources.length > 1 && <label className="vv-preview-select">Choose a video source<select value={selected} onChange={(e) => {
            const next = sources.find((s) => s.url === e.target.value);
            setSelected(e.target.value);
            if (next) onChoose(item.url, next);
          }}><option value="">Choose video</option>{sources.map((s) => <option key={s.url} value={s.url}>{s.url.length > 90 ? s.url.slice(0, 87) + "…" : s.url}</option>)}</select></label>}
          {active ? <VideoPlayer source={active} poster={item.thumbnail} /> : (item.thumbnail && <img className="vv-preview-image" alt="Video cover only" src={"/api/media?url=" + encodeURIComponent(item.thumbnail)} />)}
        </>}
        <div className="vv-preview-facts">
          {item.type === "video" && <><strong>Video URL (saved to library)</strong><code>{active?.url || "No confirmed video URL"}</code></>}
          <strong>{item.type === "video" ? "Cover image URL (thumbnail only)" : "Image URL"}</strong><code>{item.thumbnail || (item.type === "image" ? item.url : "No cover detected")}</code>
        </div>
        {item.type === "video" && !active && !loading && <p className="vv-media-note">Saving is disabled until a playable video source is detected. The cover image will not be saved as a video.</p>}
        <GoogleDriveSave
          url={item.type === "image" ? item.url : active?.url || ""}
          type={item.type}
          title={item.title}
          onOpenOriginal={() => window.open(item.sourcePage || item.url, "_blank", "noopener,noreferrer")}
        />
        <div className="vv-preview-actions">
          {active && <a href={active.url} target="_blank" rel="noreferrer noopener">Open video URL</a>}
          <button type="button" onClick={() => onSave(item, active)} disabled={saving || (item.type === "video" && !active)}>{saving ? "Saving…" : "Save " + (item.type === "video" ? "video + cover" : "image")}</button>
        </div>
      </div>
    </section>
  </>, document.body);
}
