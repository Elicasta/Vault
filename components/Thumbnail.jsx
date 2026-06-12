"use client";
import { getYouTubeId, getGDriveId, typeColor, typeLabel } from "@/lib/utils";

export default function Thumbnail({ item }) {
  const { type, url, title } = item;
  const ytId = type === "youtube" ? getYouTubeId(url) : null;
  const gdId = type === "gdrive" ? getGDriveId(url) : null;
  const color = typeColor[type] || "#374151";

  if (type === "youtube" && ytId) {
    return (
      <div style={{ position: "relative", width: "100%", paddingTop: "56.25%", background: "#000" }}>
        <img
          src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`}
          alt={title}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.12)"
        }}>
          <div style={{
            width: 46, height: 46, borderRadius: "50%",
            background: "rgba(255,0,0,0.9)",
            display: "flex", alignItems: "center", justifyContent: "center"
          }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="white">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>
        </div>
      </div>
    );
  }

  if (type === "image") {
    return (
      <div style={{ width: "100%", paddingTop: "62%", position: "relative", overflow: "hidden", background: "#111" }}>
        <img
          src={url}
          alt={title}
          onError={(e) => { e.currentTarget.style.opacity = "0"; }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transition: "opacity 0.3s" }}
        />
      </div>
    );
  }

  if (type === "gdrive" && gdId) {
    return (
      <div style={{ width: "100%", paddingTop: "62%", position: "relative", overflow: "hidden", background: "#111" }}>
        <img
          src={`https://drive.google.com/thumbnail?id=${gdId}&sz=w400`}
          alt={title}
          onError={(e) => { e.currentTarget.style.opacity = "0"; }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
    );
  }

  const emoji = {
    facebook: "📘", instagram: "📸", tiktok: "🎵",
    twitter: "🐦", vimeo: "🎬", video: "🎥", link: "🔗", unknown: "🔗"
  };

  return (
    <div style={{
      width: "100%", paddingTop: "56.25%", position: "relative",
      background: `linear-gradient(135deg, ${color}18, ${color}30)`
    }}>
      <div style={{
        position: "absolute", inset: 0, display: "flex",
        flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8
      }}>
        <div style={{ fontSize: 28 }}>{emoji[type] || "🔗"}</div>
        <span style={{ fontSize: 9, color, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase" }}>
          {typeLabel[type]}
        </span>
      </div>
    </div>
  );
}
