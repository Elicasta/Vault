"use client";
import { useState, useEffect } from "react";
import Thumbnail from "./Thumbnail";
import Icon from "./Icons";
import { typeColor, typeLabel, isVRFormat } from "@/lib/utils";

export default function Card({
  item, onOpen, viewMode, userData, onToggleFavorite,
  folders, onAssignFolder, scraped, size = "lg"
}) {
  const [hov, setHov] = useState(false);
  const [folderMenu, setFolderMenu] = useState(false);
  const color = typeColor[item.type];
  const data = userData?.[item.key];
  const isFav = data?.favorite;
  const progress = data?.progress && data?.duration ? data.progress / data.duration : 0;
  const isVR = isVRFormat(item.format);
  const is3D = item.type === "model3d";

  const canEmbed = ["youtube", "vimeo", "gdrive", "image", "video", "model3d", "pdf", "torrent"].includes(item.type)
    || scraped?.video || scraped?.image || isVR;

  const handleClick = () => (canEmbed ? onOpen(item) : window.open(item.url, "_blank"));

  // ─── List view ───
  if (viewMode === "list") {
    return (
      <div
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => { setHov(false); setFolderMenu(false); }}
        onClick={handleClick}
        style={{
          display: "flex", alignItems: "center", gap: 12, padding: "11px 16px",
          background: hov ? "rgba(255,255,255,0.035)" : "transparent",
          borderBottom: "1px solid rgba(255,255,255,0.045)",
          cursor: "pointer", transition: "background 0.12s", position: "relative"
        }}
      >
        <div style={{ width: 72, height: 44, borderRadius: 6, overflow: "hidden", flexShrink: 0, background: "#1a1a1a", position: "relative" }}>
          <Thumbnail item={item} scraped={scraped} />
          {progress > 0.02 && (
            <div style={{ position: "absolute", bottom: 0, left: 0, height: 2, width: `${progress * 100}%`, background: "#34A853" }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#e8e8e8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 6 }}>
            {isFav && <Icon name="star" size={12} filled style={{ color: "#F59E0B" }} />}
            {scraped?.title || item.title}
            {isVR && <Badge color="#06B6D4">VR</Badge>}
            {is3D && <Badge color="#06B6D4">3D</Badge>}
          </div>
          <div style={{ fontSize: 10, color: "#555", marginTop: 3, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ background: color + "22", color, padding: "1px 6px", borderRadius: 4, fontWeight: 700, flexShrink: 0 }}>
              {typeLabel[item.type]}
            </span>
            {item.tags.map((t) => (
              <span key={t} style={{ color: "#444", fontSize: 9 }}>#{t}</span>
            ))}
          </div>
        </div>
        {hov && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(item.key, isFav); }}
            style={{ ...iconBtn, color: isFav ? "#F59E0B" : "#555" }}
          ><Icon name="star" size={14} filled={!!isFav} /></button>
        )}
      </div>
    );
  }

  // ─── Grid view ───
  const isSmall = size === "sm";

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => { setHov(false); setFolderMenu(false); }}
      onClick={handleClick}
      style={{
        background: "#141414", borderRadius: 10, overflow: "hidden",
        border: `1px solid ${hov ? "rgba(255,255,255,0.11)" : "rgba(255,255,255,0.05)"}`,
        transform: hov ? "translateY(-2px)" : "none",
        boxShadow: hov ? "0 10px 32px rgba(0,0,0,0.5)" : "0 1px 6px rgba(0,0,0,0.3)",
        cursor: "pointer", transition: "all 0.18s",
        display: "flex", flexDirection: "column", position: "relative"
      }}
    >
      <div style={{ position: "relative" }}>
        <Thumbnail item={item} scraped={scraped} />

        {/* Type badge */}
        <div style={{
          position: "absolute", top: 7, left: 7,
          background: color, color: "#fff",
          fontSize: 9, fontWeight: 800, padding: "2px 7px",
          borderRadius: 4, letterSpacing: 1, textTransform: "uppercase",
          display: "flex", gap: 4
        }}>
          {typeLabel[item.type]}
        </div>

        {/* VR/3D badges */}
        {(isVR || is3D) && (
          <div style={{
            position: "absolute", top: 7, left: 7, marginTop: 22,
            background: "#06B6D4", color: "#000",
            fontSize: 9, fontWeight: 800, padding: "2px 7px",
            borderRadius: 4, letterSpacing: 1
          }}>
            {is3D ? "3D MODEL" : item.format.toUpperCase()}
          </div>
        )}

        {/* Favorite + folder buttons on hover */}
        {hov && (
          <div style={{ position: "absolute", top: 7, right: 7, display: "flex", gap: 5 }}>
            {folders && folders.length > 0 && (
              <div style={{ position: "relative" }}>
                <button
                  onClick={(e) => { e.stopPropagation(); setFolderMenu(!folderMenu); }}
                  style={overlayBtn}
                  title="Add to folder"
                ><Icon name="folder" size={14} /></button>
                {folderMenu && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: "absolute", top: 32, right: 0,
                      background: "#1c1c1c", borderRadius: 8,
                      border: "1px solid rgba(255,255,255,0.1)",
                      minWidth: 140, zIndex: 50, overflow: "hidden",
                      boxShadow: "0 8px 30px rgba(0,0,0,0.6)"
                    }}
                  >
                    {folders.map((f) => (
                      <button
                        key={f.name}
                        onClick={(e) => { e.stopPropagation(); onAssignFolder(item.key, data?.folder === f.name ? null : f.name); setFolderMenu(false); }}
                        style={{
                          display: "block", width: "100%", textAlign: "left",
                          padding: "8px 12px", background: data?.folder === f.name ? "rgba(52,168,83,0.15)" : "transparent",
                          border: "none", color: data?.folder === f.name ? "#34A853" : "#aaa",
                          fontSize: 12, cursor: "pointer"
                        }}
                      >
                        {data?.folder === f.name ? "✓ " : ""}{f.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onToggleFavorite(item.key, isFav); }}
              style={{ ...overlayBtn, color: isFav ? "#F59E0B" : "#fff" }}
              title="Favorite"
            ><Icon name="star" size={14} filled={!!isFav} /></button>
          </div>
        )}

        {/* Always show fav star if favorited */}
        {!hov && isFav && (
          <div style={{
            position: "absolute", top: 7, right: 7,
            color: "#F59E0B", fontSize: 14,
            textShadow: "0 1px 4px rgba(0,0,0,0.8)"
          }}><Icon name="star" size={14} filled /></div>
        )}

        {/* Watch progress bar */}
        {progress > 0.02 && (
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: "rgba(0,0,0,0.5)" }}>
            <div style={{ height: "100%", width: `${progress * 100}%`, background: "#34A853" }} />
          </div>
        )}
      </div>

      {!isSmall && (
        <div style={{ padding: "10px 12px", flex: 1 }}>
          <div style={{
            fontSize: 12, fontWeight: 500, color: "#e0e0e0", lineHeight: 1.45,
            display: "-webkit-box", WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical", overflow: "hidden"
          }}>
            {scraped?.title || item.title || "Untitled"}
          </div>
          {item.note && (
            <div style={{ fontSize: 10, color: "#4a4a4a", marginTop: 5, fontStyle: "italic" }}>{item.note}</div>
          )}
          {item.tags.length > 0 && (
            <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
              {item.tags.map((t) => (
                <span key={t} style={{
                  fontSize: 9, color: "#666", background: "rgba(255,255,255,0.05)",
                  padding: "1px 7px", borderRadius: 10
                }}>#{t}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const Badge = ({ children, color }) => (
  <span style={{
    fontSize: 8, background: color, color: "#000",
    padding: "1px 5px", borderRadius: 3, fontWeight: 800
  }}>{children}</span>
);

const overlayBtn = {
  background: "rgba(0,0,0,0.65)", border: "none",
  color: "#fff", cursor: "pointer", borderRadius: 6,
  width: 28, height: 28, fontSize: 13,
  display: "flex", alignItems: "center", justifyContent: "center",
  backdropFilter: "blur(4px)"
};

const iconBtn = {
  background: "transparent", border: "none",
  cursor: "pointer", fontSize: 16, padding: "4px 8px"
};
