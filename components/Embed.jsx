"use client";
import { useEffect, useRef, useState } from "react";
import { getYouTubeId, getVimeoId, getGDriveId, proxiedMediaUrl } from "@/lib/utils";
import { saveProgress } from "@/lib/supabase";

export default function Embed({ item, onClose, userId, resumeAt = 0, scraped }) {
  const { type, url } = item;
  const ytId = type === "youtube" ? getYouTubeId(url) : null;
  const vimId = type === "vimeo" ? getVimeoId(url) : null;
  const gdId = type === "gdrive" ? getGDriveId(url) : null;
  const videoRef = useRef(null);
  const lastSave = useRef(0);
  const [muted, setMuted] = useState(false);

  const directVideo =
    type === "video" ? url :
    scraped?.video ? scraped.video : null;

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  useEffect(() => {
    if (videoRef.current && resumeAt > 2) {
      videoRef.current.currentTime = resumeAt;
    }
  }, [resumeAt]);

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || !userId) return;
    const now = Date.now();
    if (now - lastSave.current > 5000) {
      lastSave.current = now;
      saveProgress(userId, item.key, v.currentTime, v.duration || 0);
    }
  };

  const handleClose = () => {
    const v = videoRef.current;
    if (v && userId) {
      saveProgress(userId, item.key, v.currentTime, v.duration || 0);
    }
    onClose();
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (v) {
      v.muted = !v.muted;
      setMuted(v.muted);
    } else {
      setMuted(!muted);
    }
  };

  const renderContent = () => {
    if (type === "youtube" && ytId) {
      return (
        <iframe
          src={`https://www.youtube.com/embed/${ytId}?autoplay=1${muted ? "&mute=1" : ""}${resumeAt > 2 ? `&start=${Math.floor(resumeAt)}` : ""}`}
          allow="autoplay; encrypted-media; fullscreen"
          style={{ width: "100%", height: "100%", border: "none" }}
        />
      );
    }
    if (type === "vimeo" && vimId) {
      return (
        <iframe
          src={`https://player.vimeo.com/video/${vimId}?autoplay=1${muted ? "&muted=1" : ""}`}
          allow="autoplay; fullscreen"
          style={{ width: "100%", height: "100%", border: "none" }}
        />
      );
    }
    if (type === "image") {
      return (
        <img
          src={proxiedMediaUrl(url)}
          alt={item.title}
          style={{ maxWidth: "88vw", maxHeight: "84vh", objectFit: "contain", borderRadius: 8, display: "block" }}
        />
      );
    }
    if (type === "gdrive" && gdId) {
      return (
        <iframe
          src={`https://drive.google.com/file/d/${gdId}/preview`}
          style={{ width: "80vw", height: "80vh", border: "none", borderRadius: 8 }}
          allow="autoplay"
        />
      );
    }
    if (directVideo) {
      return (
        <video
          ref={videoRef}
          src={directVideo}
          controls
          autoPlay
          muted={muted}
          onTimeUpdate={handleTimeUpdate}
          style={{ maxWidth: "88vw", maxHeight: "84vh", borderRadius: 8, display: "block" }}
        />
      );
    }
    if (scraped?.image) {
      return (
        <div style={{ textAlign: "center" }}>
          <img
            src={proxiedMediaUrl(scraped.image)}
            alt={item.title}
            style={{ maxWidth: "80vw", maxHeight: "70vh", objectFit: "contain", borderRadius: 8 }}
          />
          <div style={{ marginTop: 16 }}>
            <a href={url} target="_blank" rel="noreferrer" style={{
              color: "#34A853", fontSize: 13, fontFamily: "Inter, sans-serif"
            }}>
              Open original page ↗
            </a>
          </div>
        </div>
      );
    }
    window.open(url, "_blank");
    onClose();
    return null;
  };

  const isWide = ["youtube", "vimeo", "gdrive"].includes(type);
  const showMute = !!directVideo || type === "youtube" || type === "vimeo";

  return (
    <div
      onClick={handleClose}
      style={{
        position: "fixed", inset: 0, zIndex: 999,
        background: "rgba(0,0,0,0.94)",
        display: "flex", alignItems: "center", justifyContent: "center",
        backdropFilter: "blur(10px)"
      }}
    >
      <div style={{
        position: "absolute", top: 18, right: 18, zIndex: 1001,
        display: "flex", gap: 8
      }}>
        {showMute && (
          <button
            onClick={(e) => { e.stopPropagation(); toggleMute(); }}
            style={ctrlBtn}
            title={muted ? "Unmute" : "Mute"}
          >
            {muted ? "🔇" : "🔊"}
          </button>
        )}
        <button onClick={handleClose} style={ctrlBtn}>✕</button>
      </div>

      <div
        onClick={(e) => e.stopPropagation()}
        style={isWide ? { width: "78vw", aspectRatio: "16/9" } : {}}
      >
        {renderContent()}
      </div>
    </div>
  );
}

const ctrlBtn = {
  background: "rgba(255,255,255,0.08)", border: "none",
  color: "#fff", cursor: "pointer", borderRadius: "50%",
  width: 40, height: 40, display: "flex",
  alignItems: "center", justifyContent: "center", fontSize: 16
};
