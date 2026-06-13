"use client";
import { useState } from "react";
import Thumbnail from "./Thumbnail";
import Icon from "./Icons";
import { typeLabel } from "@/lib/utils";
import { T } from "@/lib/theme";

export default function Card({
  item, onOpen, viewMode = "grid", userData, onToggleFavorite,
  folders, onAssignFolder, scraped, onPlayMusic
}) {
  const [hov, setHov] = useState(false);
  const [folderMenu, setFolderMenu] = useState(false);
  const data    = userData?.[item.key];
  const isFav   = data?.favorite;
  const progress= data?.progress && data?.duration ? data.progress / data.duration : 0;
  const isMusic = ["audio","music"].includes(item.type);
  const canEmbed= ["youtube","vimeo","gdrive","image","video","pdf","epub","doc","audio","music"].includes(item.type) || scraped?.video || scraped?.image;

  const handleClick = () => {
    if (isMusic && onPlayMusic) { onPlayMusic(item); return; }
    canEmbed ? onOpen(item) : window.open(item.url, "_blank");
  };

  // ─── Showcase — cinematic, Apple TV style ─────────────────────────────────
  if (viewMode === "showcase") {
    return (
      <div
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => { setHov(false); setFolderMenu(false); }}
        onClick={handleClick}
        style={{
          position: "relative", borderRadius: T.r12, overflow: "hidden",
          aspectRatio: "16/9", cursor: "pointer",
          border: `1px solid ${hov ? T.borderHov : T.border}`,
          boxShadow: hov ? "0 12px 40px rgba(0,0,0,0.6)" : "0 2px 12px rgba(0,0,0,0.4)",
          transition: "border-color 0.2s, box-shadow 0.2s",
          background: T.bgCard
        }}
      >
        {/* Full-bleed thumbnail */}
        <div style={{ position: "absolute", inset: 0 }}>
          <Thumbnail item={item} scraped={scraped} />
        </div>

        {/* Gradient overlay */}
        <div style={{
          position: "absolute", inset: 0,
          background: hov
            ? "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.05) 80%)"
            : "linear-gradient(to top, rgba(0,0,0,0.74) 0%, rgba(0,0,0,0.1) 55%, transparent 80%)",
          transition: "background 0.2s"
        }} />

        {/* Type label — top left, minimal */}
        <div style={{
          position: "absolute", top: 10, left: 10,
          background: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)",
          color: T.text2, fontSize: 9, fontWeight: 600, padding: "2px 8px",
          borderRadius: T.r4, letterSpacing: 0.6, textTransform: "uppercase"
        }}>
          {typeLabel[item.type]}
        </div>

        {/* Fav — top right when not hovering */}
        {isFav && !hov && (
          <div style={{ position: "absolute", top: 10, right: 10, color: T.amber }}>
            <Icon name="star" size={14} filled />
          </div>
        )}

        {/* Actions on hover */}
        {hov && (
          <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 5 }}>
            <FolderBtn item={item} data={data} folders={folders} onAssignFolder={onAssignFolder} folderMenu={folderMenu} setFolderMenu={setFolderMenu} />
            <button onClick={(e) => { e.stopPropagation(); onToggleFavorite(item.key, isFav); }} style={ovlBtn} title="Favorite">
              <Icon name="star" size={13} filled={!!isFav} style={{ color: isFav ? T.amber : T.text1 }} />
            </button>
          </div>
        )}

        {/* Bottom overlay */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "14px 14px 12px" }}>
          {item.tags?.length > 0 && hov && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
              {item.tags.slice(0, 3).map((t) => (
                <span key={t} style={{ fontSize: 9, color: T.text3, letterSpacing: 0.3 }}>#{t}</span>
              ))}
            </div>
          )}
          <div style={{ fontSize: 13, fontWeight: 500, color: T.text1, lineHeight: 1.35, letterSpacing: -0.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {scraped?.title || item.title}
          </div>
          {item.note && hov && (
            <div style={{ fontSize: 11, color: T.text3, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.note}
            </div>
          )}
        </div>

        {/* Progress */}
        {progress > 0.02 && (
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: "rgba(0,0,0,0.4)" }}>
            <div style={{ height: "100%", width: `${progress * 100}%`, background: T.green, opacity: 0.7 }} />
          </div>
        )}
      </div>
    );
  }

  // ─── List ─────────────────────────────────────────────────────────────────
  if (viewMode === "list") {
    return (
      <div
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => { setHov(false); setFolderMenu(false); }}
        onClick={handleClick}
        style={{
          display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
          background: hov ? "rgba(255,255,255,0.03)" : "transparent",
          borderBottom: `1px solid ${T.borderSub}`,
          cursor: "pointer", transition: "background 0.12s"
        }}
      >
        <div style={{ width: 72, height: 44, borderRadius: T.r6, overflow: "hidden", flexShrink: 0, background: T.bgCard, position: "relative" }}>
          <Thumbnail item={item} scraped={scraped} />
          {progress > 0.02 && (
            <div style={{ position: "absolute", bottom: 0, left: 0, height: 2, width: `${progress * 100}%`, background: T.green, opacity: 0.6 }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 450, color: T.text1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 6 }}>
            {isFav && <Icon name="star" size={11} filled style={{ color: T.amber, flexShrink: 0 }} />}
            {scraped?.title || item.title}
          </div>
          <div style={{ fontSize: 10, color: T.text3, marginTop: 3, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ letterSpacing: 0.4, textTransform: "uppercase", fontSize: 9 }}>{typeLabel[item.type]}</span>
            {item.tags?.slice(0, 2).map((t) => <span key={t} style={{ color: T.text4 }}>#{t}</span>)}
          </div>
        </div>
        {hov && (
          <button onClick={(e) => { e.stopPropagation(); onToggleFavorite(item.key, isFav); }}
            style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 8px", color: isFav ? T.amber : T.text4, flexShrink: 0 }}>
            <Icon name="star" size={14} filled={!!isFav} />
          </button>
        )}
      </div>
    );
  }

  // ─── Compact ──────────────────────────────────────────────────────────────
  if (viewMode === "compact") {
    return (
      <div
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        onClick={handleClick}
        title={scraped?.title || item.title}
        style={{
          borderRadius: T.r6, overflow: "hidden", cursor: "pointer",
          border: `1px solid ${hov ? T.borderHov : T.borderSub}`,
          transition: "border-color 0.15s", position: "relative", background: T.bgCard
        }}
      >
        <Thumbnail item={item} scraped={scraped} />
        {progress > 0.02 && (
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2 }}>
            <div style={{ height: "100%", width: `${progress * 100}%`, background: T.green, opacity: 0.65 }} />
          </div>
        )}
      </div>
    );
  }

  // ─── Grid (default) ───────────────────────────────────────────────────────
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => { setHov(false); setFolderMenu(false); }}
      onClick={handleClick}
      style={{
        background: T.bgCard, borderRadius: T.r10, overflow: "hidden",
        border: `1px solid ${hov ? T.borderHov : T.border}`,
        boxShadow: hov ? "0 6px 24px rgba(0,0,0,0.4)" : "none",
        cursor: "pointer", transition: "border-color 0.15s, box-shadow 0.15s",
        display: "flex", flexDirection: "column", position: "relative"
      }}
    >
      <div style={{ position: "relative" }}>
        <Thumbnail item={item} scraped={scraped} />

        {/* Type label — muted, no color */}
        <div style={{
          position: "absolute", top: 7, left: 7,
          background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)",
          color: T.text3, fontSize: 9, fontWeight: 600, padding: "2px 7px",
          borderRadius: T.r4, letterSpacing: 0.5, textTransform: "uppercase"
        }}>
          {typeLabel[item.type]}
        </div>

        {hov && (
          <div style={{ position: "absolute", top: 7, right: 7, display: "flex", gap: 4 }}>
            <FolderBtn item={item} data={data} folders={folders} onAssignFolder={onAssignFolder} folderMenu={folderMenu} setFolderMenu={setFolderMenu} />
            <button onClick={(e) => { e.stopPropagation(); onToggleFavorite(item.key, isFav); }} style={ovlBtn} title="Favorite">
              <Icon name="star" size={13} filled={!!isFav} style={{ color: isFav ? T.amber : T.text1 }} />
            </button>
          </div>
        )}
        {!hov && isFav && <div style={{ position: "absolute", top: 7, right: 7, color: T.amber }}><Icon name="star" size={13} filled /></div>}
        {progress > 0.02 && (
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: "rgba(0,0,0,0.3)" }}>
            <div style={{ height: "100%", width: `${progress * 100}%`, background: T.green, opacity: 0.7 }} />
          </div>
        )}
      </div>

      <div style={{ padding: "10px 12px", flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 450, color: T.text1, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {scraped?.title || item.title || "Untitled"}
        </div>
        {item.note && <div style={{ fontSize: 10, color: T.text4, marginTop: 4 }}>{item.note}</div>}
        {item.tags?.length > 0 && (
          <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
            {item.tags.slice(0, 3).map((t) => (
              <span key={t} style={{ fontSize: 9, color: T.text4, letterSpacing: 0.2 }}>#{t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FolderBtn({ item, data, folders, onAssignFolder, folderMenu, setFolderMenu }) {
  if (!folders?.length) return null;
  return (
    <div style={{ position: "relative" }}>
      <button onClick={(e) => { e.stopPropagation(); setFolderMenu(!folderMenu); }} style={ovlBtn} title="Add to list">
        <Icon name="folder" size={13} />
      </button>
      {folderMenu && (
        <div onClick={(e) => e.stopPropagation()} style={{
          position: "absolute", top: 34, right: 0,
          background: T.bgMenu, borderRadius: T.r10,
          border: `1px solid ${T.border}`,
          minWidth: 150, zIndex: 50, overflow: "hidden",
          boxShadow: "0 16px 48px rgba(0,0,0,0.7)"
        }}>
          {folders.map((f) => (
            <button key={f.name} onClick={(e) => { e.stopPropagation(); onAssignFolder(item.key, data?.folder === f.name ? null : f.name); setFolderMenu(false); }} style={{
              display: "flex", alignItems: "center", gap: 7,
              width: "100%", textAlign: "left", padding: "9px 12px",
              background: "transparent", border: "none",
              color: data?.folder === f.name ? T.text1 : T.text2,
              fontSize: 12, cursor: "pointer",
              borderBottom: `1px solid ${T.borderSub}`
            }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >
              {data?.folder === f.name && <Icon name="star" size={10} filled style={{ color: T.green }} />}
              {f.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const ovlBtn = {
  background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)",
  border: "none", color: "#fff", cursor: "pointer", borderRadius: 6,
  width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center"
};
