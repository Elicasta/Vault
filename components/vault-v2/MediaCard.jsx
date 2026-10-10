"use client";
import { useMemo, useState } from "react";
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
  const candidates = useMemo(() => {
    // A blocked gallery is a link. Never guess its image URL from the page path.
    const list = [item.display_thumbnail, item.thumbnail, ...(isLink ? [] : getThumbCandidates(item.url || ""))].filter(Boolean);
    return [...new Set(list)];
  }, [item.display_thumbnail, item.thumbnail, item.url, isLink]);
  const [index, setIndex] = useState(0);
  const thumb = candidates[index] ? proxiedMediaUrl(candidates[index]) : "";
  const progress = pct(state);
  const isImage = source.id === "image" || String(item.type || "").toLowerCase().includes("image");

  return (
    <article className="v2-card">
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
            <span>{isLink ? "Saved gallery link" : source.name}</span>
            {state.rating ? <><span className="v2-dot" /><span>★ {state.rating}</span></> : null}
            {item.folder || state.folder ? <><span className="v2-dot" /><span>{item.folder || state.folder}</span></> : null}
          </div>
          {progress > 0 ? <div className="v2-progress" aria-label={`${Math.round(progress)}% complete`}><span style={{ width: `${progress}%` }} /></div> : null}
        </div>
      </button>
    </article>
  );
}
