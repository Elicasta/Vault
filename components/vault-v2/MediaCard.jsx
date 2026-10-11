"use client";
import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icons";
import SyncBadge from "@/components/SyncBadge";
import { getSourceMeta, getThumbCandidates } from "@/lib/sources";
import { proxiedMediaUrl } from "@/lib/utils";

function pct(data) {
  const p = Number(data?.progress || 0);
  const d = Number(data?.duration || 0);
  return d > 0 ? Math.max(0, Math.min(100, (p / d) * 100)) : 0;
}

export default function MediaCard({ item, state = {}, onOpen }) {
  const source = getSourceMeta(item.url || "");
  const isLink = item.type === "link";
  const isImage = source.id === "image" || String(item.type || "").toLowerCase().includes("image");
  const candidates = useMemo(() => {
    // Never invent image URLs from gallery pages. Try the stored preview first;
    // an actual image can also fall back to its own URL when the proxy fails.
    const originals = [item.display_thumbnail, item.thumbnail,
      ...(isLink ? [] : getThumbCandidates(item.url || "")),
      ...(!isLink && isImage ? [item.url] : []),
    ].filter(Boolean);
    return [...new Set(originals.flatMap((url) => {
      const proxied = proxiedMediaUrl(url);
      return proxied && proxied !== url ? [proxied, url] : [url];
    }))];
  }, [item.display_thumbnail, item.thumbnail, item.url, isLink, isImage]);
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [item.key]);
  const thumb = candidates[index] || "";
  const progress = pct(state);

  return (
    <article className="v2-card" data-kind={isImage ? "image" : isLink ? "link" : "video"}>
      <button
        type="button"
        className="v2-card-button"
        onClick={() => onOpen(item)}
        aria-label={`Open ${item.title || "media"}`}
      >
        <div className="v2-art">
          <div className="v2-art-fallback"><Icon name={isLink ? "link" : isImage ? "grid" : "play"} size={28} /></div>
          {thumb ? (
            <img
              src={thumb}
              alt={item.title ? `${item.title} cover` : ""}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setIndex((i) => i + 1)}
            />
          ) : null}
          <div className="v2-art-shade" />
          <div className="v2-playbubble"><Icon name={isLink ? "link" : isImage ? "zoomIn" : "play"} size={17} filled={!isImage&&!isLink} /></div>
          {state.favorite ? <div className="v2-favbadge" aria-label="Favorite"><Icon name="star" size={15} filled /></div> : null}
          <SyncBadge entityKey={item.key} style={{ left: 10, right: "auto", top: 10, bottom: "auto" }} />
        </div>
        <div className="v2-card-meta">
          <div className="v2-card-title" title={item.title || item.url}>{item.title || item.url}</div>
          <div className="v2-card-sub">
            <span>{isLink ? "Saved link" : source.name}</span>
            {state.rating ? <><span className="v2-dot" /><span>★ {state.rating}</span></> : null}
            {item.folder || state.folder ? <><span className="v2-dot" /><span>{item.folder || state.folder}</span></> : null}
          </div>
          {progress > 0 ? <div className="v2-progress" aria-label={`${Math.round(progress)}% complete`}><span style={{ width: `${progress}%` }} /></div> : null}
        </div>
      </button>
    </article>
  );
}
