"use client";
import { getYouTubeId, getGDriveId, proxiedMediaUrl, typeColor, typeLabel } from "@/lib/utils";
import Icon from "./Icons";
import { T } from "@/lib/theme";

export default function Thumbnail({ item, scraped }) {
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
        <PlayOverlay color="rgba(255,0,0,0.85)" />
      </div>
    );
  }

  if (type === "image") {
    return (
      <div style={{ width: "100%", paddingTop: "62%", position: "relative", overflow: "hidden", background: T.bgCard }}>
        <img
          src={proxiedMediaUrl(url)} alt={title}
          onError={(e) => { e.currentTarget.style.opacity = "0"; }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
    );
  }

  if (type === "gdrive" && gdId) {
    return (
      <div style={{ width: "100%", paddingTop: "62%", position: "relative", overflow: "hidden", background: T.bgCard }}>
        <img
          src={`https://drive.google.com/thumbnail?id=${gdId}&sz=w400`}
          alt={title}
          onError={(e) => { e.currentTarget.style.opacity = "0"; }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
    );
  }

  if (scraped?.image) {
    return (
      <div style={{ position: "relative", width: "100%", paddingTop: "56.25%", background: T.bgCard }}>
        <img
          src={proxiedMediaUrl(scraped.image)} alt={title}
          onError={(e) => { e.currentTarget.style.opacity = "0"; }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
        {scraped.video && <PlayOverlay color="rgba(0,0,0,0.7)" />}
      </div>
    );
  }

  // Type-specific icon placeholders
  const iconMap = {
    facebook:"link", instagram:"image", tiktok:"video", twitter:"link",
    reddit:"link", vimeo:"video", video:"video",
    audio:"headphones", music:"music",
    pdf:"file", epub:"bookOpen", doc:"fileText",
    "gdrive-folder":"folder", link:"link", unknown:"link"
  };

  // Reading types get a paper-white background
  const isReading = ["pdf","epub","doc"].includes(type);
  const isMusic   = ["audio","music"].includes(type);
  const bgGradient = isReading
    ? `linear-gradient(135deg, #1a1a2e, #16213e)`
    : isMusic
      ? `linear-gradient(135deg, #2a0a1f, #4a0a35)`
      : T.bgRaised;

  return (
    <div style={{ width: "100%", paddingTop: "56.25%", position: "relative", background: bgGradient }}>
      <div style={centerStyle}>
        <Icon name={iconMap[type] || "link"} size={30} style={{ color: T.text3 }} />
        <span style={{ fontSize: 9, color: T.text3, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase" }}>
          {typeLabel[type]}
        </span>
      </div>
    </div>
  );
}

const PlayOverlay = ({ color }) => (
  <div style={{
    position: "absolute", inset: 0, display: "flex",
    alignItems: "center", justifyContent: "center",
    background: "rgba(0,0,0,0.12)"
  }}>
    <div style={{
      width: 46, height: 46, borderRadius: "50%", background: color,
      display: "flex", alignItems: "center", justifyContent: "center"
    }}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="white">
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
    </div>
  </div>
);

const centerStyle = {
  position: "absolute", inset: 0, display: "flex",
  flexDirection: "column", alignItems: "center",
  justifyContent: "center", gap: 8
};
