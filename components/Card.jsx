"use client";
import { useState } from "react";
import Thumbnail from "./Thumbnail";
import { typeColor, typeLabel } from "@/lib/utils";

export default function Card({ item, onOpen, viewMode }) {
  const [hov, setHov] = useState(false);
  const color = typeColor[item.type];
  const canEmbed = ["youtube", "vimeo", "gdrive", "image", "video"].includes(item.type);
  const handleClick = () => (canEmbed ? onOpen(item) : window.open(item.url, "_blank"));

  if (viewMode === "list") {
    return (
      <div
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        onClick={handleClick}
        style={{
          display: "flex", alignItems: "center", gap: 12, padding: "11px 16px",
          background: hov ? "rgba(255,255,255,0.035)" : "transparent",
          borderBottom: "1px solid rgba(255,255,255,0.045)",
          cursor: "pointer", transition: "background 0.12s"
        }}
      >
        <div style={{ width: 72, height: 44, borderRadius: 6, overflow: "hidden", flexShrink: 0, background: "#1a1a1a" }}>
          <Thumbnail item={item} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 500, color: "#e8e8e8",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
          }}>
            {item.title || item.url}
          </div>
          <div style={{ fontSize: 10, color: "#555", marginTop: 3, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              background: color + "22", color, padding: "1px 6px",
              borderRadius: 4, fontWeight: 700, letterSpacing: 0.5, flexShrink: 0
            }}>
              {typeLabel[item.type]}
            </span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.url}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={handleClick}
      style={{
        background: "#141414", borderRadius: 10, overflow: "hidden",
        border: `1px solid ${hov ? "rgba(255,255,255,0.11)" : "rgba(255,255,255,0.05)"}`,
        transform: hov ? "translateY(-2px)" : "none",
        boxShadow: hov ? "0 10px 32px rgba(0,0,0,0.5)" : "0 1px 6px rgba(0,0,0,0.3)",
        cursor: "pointer", transition: "all 0.18s",
        display: "flex", flexDirection: "column"
      }}
    >
      <div style={{ position: "relative" }}>
        <Thumbnail item={item} />
        <div style={{
          position: "absolute", top: 7, left: 7,
          background: color, color: "#fff",
          fontSize: 9, fontWeight: 800, padding: "2px 7px",
          borderRadius: 4, letterSpacing: 1, textTransform: "uppercase"
        }}>
          {typeLabel[item.type]}
        </div>
      </div>
      <div style={{ padding: "10px 12px", flex: 1 }}>
        <div style={{
          fontSize: 12, fontWeight: 500, color: "#e0e0e0", lineHeight: 1.45,
          display: "-webkit-box", WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical", overflow: "hidden"
        }}>
          {item.title || "Untitled"}
        </div>
        {item.note && (
          <div style={{ fontSize: 10, color: "#4a4a4a", marginTop: 5, fontStyle: "italic" }}>
            {item.note}
          </div>
        )}
      </div>
    </div>
  );
}
