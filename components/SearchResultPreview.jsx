"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icons";
import { getThumbCandidates } from "@/lib/sources";

const posterCache = new Map();
const DIRECT_IMAGE = /\.(?:jpe?g|png|webp|gif|avif|bmp)(?:$|[?#])/i;
const DIRECT_VIDEO = /\.(?:mp4|m4v|webm|ogv)(?:$|[?#])/i;
const PRIVATE_HOST = /^(?:localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|metadata\.google\.internal$)/i;

function safePoster(raw) {
  try {
    const url = new URL(raw);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username && !url.password && !PRIVATE_HOST.test(url.hostname) &&
      !/\.(?:localhost|local|internal)$/i.test(url.hostname) ? url.href : "";
  } catch { return ""; }
}

export default function SearchResultPreview({ result, onPreview, index = 0 }) {
  const node = useRef(null);
  const source = String(result.url || "");
  const directImage = DIRECT_IMAGE.test(source) && !!safePoster(source);
  const directVideo = DIRECT_VIDEO.test(source) && !!safePoster(source);
  const initialPoster = useMemo(() => {
    const candidates = [result.thumbnail, ...getThumbCandidates(source), directImage ? source : ""];
    return candidates.map(safePoster).find(Boolean) || "";
  }, [source, result.thumbnail, directImage]);
  const [poster, setPoster] = useState(initialPoster);
  const [previewType, setPreviewType] = useState(result.type || result.kind);
  const [fallback, setFallback] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setPoster(initialPoster);
    setPreviewType(result.type || result.kind);
    setFallback(0);
    setPlaying(false);
  }, [source, initialPoster, result.type, result.kind]);

  // Only enrich visible results. The metadata endpoint applies the Vault
  // security/session rules and can refuse hosts that deny indexing.
  useEffect(() => {
    if (initialPoster || directVideo || index >= 20 || !safePoster(source)) return;
    const target = node.current;
    if (!target) return;
    let active = true;
    let controller;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      if (posterCache.has(source)) {
        const cached = posterCache.get(source);
        if (active) {
          setPoster(cached.thumbnail);
          setPreviewType(cached.type || result.kind);
        }
        return;
      }
      controller = new AbortController();
      fetch("/api/metadata?url=" + encodeURIComponent(source), {
        cache: "no-store", credentials: "same-origin", signal: controller.signal,
      }).then(async response => response.ok ? response.json().catch(() => null) : null)
        .then(data => {
          const meta = {
            thumbnail: safePoster(data?.thumbnail),
            type: data?.type || result.kind,
          };
          if (posterCache.size >= 240) posterCache.clear();
          posterCache.set(source, meta);
          if (active) {
            setPoster(meta.thumbnail);
            setPreviewType(meta.type);
          }
        }).catch(() => {});
    }, { rootMargin: "150px" });
    observer.observe(target);
    return () => { active = false; observer.disconnect(); controller?.abort(); };
  }, [initialPoster, source, directVideo, index, result.kind]);

  const posterUrl = poster && fallback < 2
    ? (fallback === 0 ? "/api/media?url=" + encodeURIComponent(poster) : poster)
    : "";
  const type = directVideo || previewType === "video" || (previewType === "media" && !directImage) ? "video"
    : directImage || previewType === "image" ? "image" : "gallery";
  const label = type === "video" ? "Video" : type === "image" ? "Image" : "Gallery";
  return <div ref={node} className="vv-result-media" data-kind={type}>
    {directVideo && playing ?
      <video className="vv-result-inline-video" src={source} controls playsInline autoPlay preload="metadata"
        poster={poster || undefined} onError={() => setPlaying(false)}/>
      : <button type="button" className="vv-result-cover"
          aria-label={(directVideo ? "Play " : "Explore ") + (result.title || "media")}
          onClick={() => directVideo ? setPlaying(true) : onPreview(result)}>
          {posterUrl && <img src={posterUrl} alt="" loading="lazy" decoding="async"
            referrerPolicy="no-referrer" onError={() => setFallback(x => x + 1)}/>}
          <span className={"vv-result-cover-placeholder" + (posterUrl ? " has-image" : "")}>
            <Icon name={type === "video" ? "play" : type === "image" ? "grid" : "link"} size={24}/>
          </span>
          {type === "video" && <span className="vv-result-play-icon"><Icon name="play" size={18} filled/></span>}
        </button>}
    <span className="vv-result-kind-badge">{label}{directVideo ? " · Playable" : directImage ? " · Viewable" : ""}</span>
  </div>;
}
