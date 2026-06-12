"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { getYouTubeId, getGDriveId } from "@/lib/utils";

export default function Slideshow({ items, onClose, scrapedMap }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [fade, setFade] = useState(true);
  const timerRef = useRef(null);

  const visualItems = items.filter((i) =>
    ["image", "gdrive", "youtube"].includes(i.type) || scrapedMap?.[i.url]?.image
  );

  const next = useCallback(() => {
    setFade(false);
    setTimeout(() => {
      setIndex((i) => (i + 1) % visualItems.length);
      setFade(true);
    }, 300);
  }, [visualItems.length]);

  const prev = useCallback(() => {
    setFade(false);
    setTimeout(() => {
      setIndex((i) => (i - 1 + visualItems.length) % visualItems.length);
      setFade(true);
    }, 300);
  }, [visualItems.length]);

  useEffect(() => {
    if (playing && visualItems.length > 1) {
      timerRef.current = setInterval(next, 5000);
      return () => clearInterval(timerRef.current);
    }
  }, [playing, next, visualItems.length]);

  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
      if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [next, prev, onClose]);

  if (visualItems.length === 0) {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={{ color: "#666", fontSize: 14, fontFamily: "Inter, sans-serif" }}>
          No visual items in this collection for slideshow.
        </div>
      </div>
    );
  }

  const item = visualItems[index];
  const ytId = item.type === "youtube" ? getYouTubeId(item.url) : null;
  const gdId = item.type === "gdrive" ? getGDriveId(item.url) : null;

  const imgSrc =
    item.type === "image" ? item.url :
    ytId ? `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg` :
    gdId ? `https://drive.google.com/thumbnail?id=${gdId}&sz=w1920` :
    scrapedMap?.[item.url]?.image;

  return (
    <div style={overlayStyle}>
      {/* Image */}
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        opacity: fade ? 1 : 0, transition: "opacity 0.3s ease"
      }}>
        <img
          src={imgSrc}
          alt={item.title}
          style={{ maxWidth: "92vw", maxHeight: "86vh", objectFit: "contain", borderRadius: 4 }}
        />
      </div>

      {/* Caption */}
      <div style={{
        position: "absolute", bottom: 32, left: "50%", transform: "translateX(-50%)",
        textAlign: "center", fontFamily: "Inter, sans-serif",
        opacity: fade ? 1 : 0, transition: "opacity 0.3s"
      }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#fff", textShadow: "0 2px 12px rgba(0,0,0,0.8)" }}>
          {item.title}
        </div>
        {item.note && (
          <div style={{ fontSize: 12, color: "#999", marginTop: 4, textShadow: "0 1px 8px rgba(0,0,0,0.8)" }}>
            {item.note}
          </div>
        )}
        <div style={{ fontSize: 11, color: "#555", marginTop: 8 }}>
          {index + 1} / {visualItems.length}
        </div>
      </div>

      {/* Controls */}
      <button onClick={prev} style={{ ...navBtn, left: 20 }}>‹</button>
      <button onClick={next} style={{ ...navBtn, right: 20 }}>›</button>

      <div style={{ position: "absolute", top: 18, right: 18, display: "flex", gap: 8 }}>
        <button onClick={() => setPlaying(!playing)} style={topBtn}>
          {playing ? "⏸" : "▶"}
        </button>
        <button onClick={onClose} style={topBtn}>✕</button>
      </div>

      {/* Progress dots */}
      {visualItems.length <= 20 && (
        <div style={{
          position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)",
          display: "flex", gap: 5
        }}>
          {visualItems.map((_, i) => (
            <div key={i} style={{
              width: 5, height: 5, borderRadius: "50%",
              background: i === index ? "#fff" : "rgba(255,255,255,0.25)",
              transition: "background 0.3s"
            }} />
          ))}
        </div>
      )}
    </div>
  );
}

const overlayStyle = {
  position: "fixed", inset: 0, zIndex: 999,
  background: "#000",
  display: "flex", alignItems: "center", justifyContent: "center"
};

const navBtn = {
  position: "absolute", top: "50%", transform: "translateY(-50%)",
  background: "rgba(255,255,255,0.06)", border: "none",
  color: "#fff", cursor: "pointer", borderRadius: "50%",
  width: 48, height: 48, fontSize: 26,
  display: "flex", alignItems: "center", justifyContent: "center"
};

const topBtn = {
  background: "rgba(255,255,255,0.08)", border: "none",
  color: "#fff", cursor: "pointer", borderRadius: "50%",
  width: 40, height: 40, fontSize: 15,
  display: "flex", alignItems: "center", justifyContent: "center"
};
