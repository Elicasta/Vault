"use client";
import { useEffect } from "react";
import { getYouTubeId, getVimeoId, getGDriveId } from "@/lib/utils";

export default function Embed({ item, onClose }) {
  const { type, url } = item;
  const ytId = type === "youtube" ? getYouTubeId(url) : null;
  const vimId = type === "vimeo" ? getVimeoId(url) : null;
  const gdId = type === "gdrive" ? getGDriveId(url) : null;

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const renderContent = () => {
    if (type === "youtube" && ytId) return (
      <iframe
        src={`https://www.youtube.com/embed/${ytId}?autoplay=1`}
        allow="autoplay; encrypted-media; fullscreen"
        style={{ width: "100%", height: "100%", border: "none" }}
      />
    );
    if (type === "vimeo" && vimId) return (
      <iframe
        src={`https://player.vimeo.com/video/${vimId}?autoplay=1`}
        allow="autoplay; fullscreen"
        style={{ width: "100%", height: "100%", border: "none" }}
      />
    );
    if (type === "image") return (
      <img
        src={url}
        alt={item.title}
        style={{ maxWidth: "88vw", maxHeight: "84vh", objectFit: "contain", borderRadius: 8, display: "block" }}
      />
    );
    if (type === "gdrive" && gdId) return (
      <iframe
        src={`https://drive.google.com/file/d/${gdId}/preview`}
        style={{ width: "80vw", height: "80vh", border: "none", borderRadius: 8 }}
        allow="autoplay"
      />
    );
    if (type === "video") return (
      <video
        src={url}
        controls
        autoPlay
        style={{ maxWidth: "88vw", maxHeight: "84vh", borderRadius: 8, display: "block" }}
      />
    );
    window.open(url, "_blank");
    onClose();
    return null;
  };

  const isWide = ["youtube", "vimeo", "gdrive"].includes(type);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 999,
        background: "rgba(0,0,0,0.93)",
        display: "flex", alignItems: "center", justifyContent: "center",
        backdropFilter: "blur(10px)"
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: "absolute", top: 18, right: 18,
          background: "rgba(255,255,255,0.08)", border: "none",
          color: "#fff", cursor: "pointer", borderRadius: "50%",
          width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18
        }}
      >
        ✕
      </button>
      <div
        onClick={(e) => e.stopPropagation()}
        style={isWide ? { width: "78vw", aspectRatio: "16/9" } : {}}
      >
        {renderContent()}
      </div>
    </div>
  );
}
