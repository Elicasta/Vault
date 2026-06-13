"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import Icon from "./Icons";
import { T } from "@/lib/theme";
import { getYouTubeId, getVimeoId, getGDriveId, proxiedMediaUrl } from "@/lib/utils";
import { saveProgress } from "@/lib/supabase";

// Singleton: load the YT IFrame API script once per page
let ytApiLoaded = false;
let ytApiCallbacks = [];
function loadYTApi(cb) {
  if (window.YT && window.YT.Player) { cb(); return; }
  ytApiCallbacks.push(cb);
  if (!ytApiLoaded) {
    ytApiLoaded = true;
    window.onYouTubeIframeAPIReady = () => { ytApiCallbacks.forEach((f) => f()); ytApiCallbacks = []; };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.body.appendChild(s);
  }
}

export default function Embed({ item, items = [], currentIdx = 0, onNavigate, onClose, userId, resumeAt = 0, scraped }) {
  const { type, url } = item;
  const ytId  = type === "youtube" ? getYouTubeId(url) : null;
  const vimId = type === "vimeo"   ? getVimeoId(url)   : null;
  const gdId  = type === "gdrive"  ? getGDriveId(url)  : null;

  const videoRef  = useRef(null);
  const ytPlayer  = useRef(null);
  const ytDiv     = useRef(null);
  const lastSave  = useRef(0);
  const touchStart= useRef(null);

  const [muted, setMuted]         = useState(false);
  const [audioMode, setAudioMode] = useState(false);

  const directVideo =
    type === "video"        ? url :
    scraped?.video          ? scraped.video : null;

  const hasNext = currentIdx < items.length - 1;
  const hasPrev = currentIdx > 0;

  // Keyboard + scroll lock
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") handleClose();
      if (e.key === "ArrowRight" && hasNext) onNavigate?.(currentIdx + 1);
      if (e.key === "ArrowLeft"  && hasPrev) onNavigate?.(currentIdx - 1);
    };
    window.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", h); document.body.style.overflow = ""; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasNext, hasPrev, currentIdx]);

  // Resume direct video
  useEffect(() => {
    if (videoRef.current && resumeAt > 2) videoRef.current.currentTime = resumeAt;
  }, [resumeAt]);

  // YouTube IFrame API — proper time tracking
  useEffect(() => {
    if (!ytId) return;
    const playerId = `yt-${ytId}-${Date.now()}`;
    if (ytDiv.current) ytDiv.current.id = playerId;

    loadYTApi(() => {
      if (!ytDiv.current) return;
      ytDiv.current.id = playerId; // re-set in case of delay
      ytPlayer.current = new window.YT.Player(playerId, {
        videoId: ytId,
        playerVars: {
          autoplay: 1,
          mute: muted ? 1 : 0,
          start: resumeAt > 2 ? Math.floor(resumeAt) : 0,
          rel: 0,
        },
        events: {
          onReady: (e) => { ytPlayer.current = e.target; },
        },
      });
    });

    return () => {
      // Save YouTube progress on unmount
      try {
        const p = ytPlayer.current;
        if (p && userId) {
          const t = p.getCurrentTime?.();
          const d = p.getDuration?.();
          if (t > 2) saveProgress(userId, item.key, t, d || 0);
        }
        p?.destroy?.();
      } catch {}
      ytPlayer.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytId]);

  const handleClose = useCallback(() => {
    const v = videoRef.current;
    if (v && userId) saveProgress(userId, item.key, v.currentTime, v.duration || 0);
    onClose();
  }, [userId, item.key, onClose]);

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || !userId) return;
    const now = Date.now();
    if (now - lastSave.current > 5000) {
      lastSave.current = now;
      saveProgress(userId, item.key, v.currentTime, v.duration || 0);
    }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (v) { v.muted = !v.muted; setMuted(v.muted); }
    else setMuted((m) => !m);
  };

  // Swipe to navigate
  const onTouchStart = (e) => { touchStart.current = e.touches[0].clientX; };
  const onTouchEnd   = (e) => {
    if (touchStart.current === null) return;
    const delta = touchStart.current - e.changedTouches[0].clientX;
    touchStart.current = null;
    if (Math.abs(delta) < 60) return;
    if (delta > 0 && hasNext) onNavigate?.(currentIdx + 1);
    if (delta < 0 && hasPrev) onNavigate?.(currentIdx - 1);
  };

  const renderContent = () => {
    // YouTube — use div that YT API upgrades into an iframe
    if (type === "youtube" && ytId) {
      return (
        <div style={isWide ? { width: "78vw", aspectRatio: "16/9" } : {}}>
          <div ref={ytDiv} style={{ width: "100%", height: "100%", minHeight: 200 }} />
        </div>
      );
    }

    if (type === "vimeo" && vimId) {
      return (
        <div style={{ width: "78vw", aspectRatio: "16/9" }}>
          <iframe
            src={`https://player.vimeo.com/video/${vimId}?autoplay=1${muted ? "&muted=1" : ""}`}
            allow="autoplay; fullscreen"
            style={{ width: "100%", height: "100%", border: "none" }}
          />
        </div>
      );
    }

    if (type === "image") {
      return (
        <img
          src={proxiedMediaUrl(url)} alt={item.title}
          style={{ maxWidth: "90vw", maxHeight: "88vh", objectFit: "contain", borderRadius: 8, display: "block" }}
        />
      );
    }

    if (type === "pdf") {
      return (
        <iframe
          src={url}
          title={item.title || "PDF"}
          style={{ width: "min(94vw,1100px)", height: "86vh", border: "none", borderRadius: 8, background: "#fff" }}
        />
      );
    }

    if (type === "gdrive" && gdId) {
      return (
        <div style={{ width: "80vw", aspectRatio: "16/9" }}>
          <iframe
            src={`https://drive.google.com/file/d/${gdId}/preview`}
            style={{ width: "100%", height: "100%", border: "none", borderRadius: 8 }}
            allow="autoplay"
          />
        </div>
      );
    }

    if (directVideo) {
      return (
        <div style={{ position: "relative" }}>
          <video
            ref={videoRef}
            src={directVideo}
            controls autoPlay playsInline
            muted={muted}
            onTimeUpdate={handleTimeUpdate}
            style={{
              maxWidth: "90vw", maxHeight: "86vh",
              borderRadius: 8, display: "block",
              // In audio mode, collapse video visually
              ...(audioMode ? { height: 0, maxHeight: 0 } : {})
            }}
          />
          {audioMode && (
            <div style={{
              padding: "32px 24px", textAlign: "center",
              background: "rgba(255,255,255,0.03)", borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.06)", minWidth: 280
            }}>
              <Icon name="audioLines" size={48} style={{ color: "rgba(235,235,245,0.4)", marginBottom: 16 }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 11, color: "#555" }}>Audio only mode</div>
            </div>
          )}
        </div>
      );
    }

    if (scraped?.image) {
      return (
        <div style={{ textAlign: "center" }}>
          <img
            src={proxiedMediaUrl(scraped.image)} alt={item.title}
            style={{ maxWidth: "80vw", maxHeight: "70vh", objectFit: "contain", borderRadius: 8 }}
          />
          <div style={{ marginTop: 16 }}>
            <a href={url} target="_blank" rel="noreferrer" style={{
              color: "rgba(235,235,245,0.55)", fontSize: 13,
              display: "inline-flex", alignItems: "center", gap: 5
            }}>
              Open original page <Icon name="external" size={13} />
            </a>
          </div>
        </div>
      );
    }

    window.open(url, "_blank");
    onClose();
    return null;
  };

  const isWide = ["youtube","vimeo","gdrive","pdf"].includes(type);
  const showMute = !!directVideo || type === "youtube" || type === "vimeo";
  const canAudioMode = !!directVideo;

  return (
    <div
      onClick={handleClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{
        position: "fixed", inset: 0, zIndex: 999,
        background: "rgba(0,0,0,0.95)",
        display: "flex", alignItems: "center", justifyContent: "center",
        backdropFilter: "blur(12px)"
      }}
    >
      {/* Top controls */}
      <div style={{ position: "absolute", top: 16, right: 16, zIndex: 1001, display: "flex", gap: 8 }}>
        {canAudioMode && (
          <button onClick={(e) => { e.stopPropagation(); setAudioMode((m) => !m); }} style={{ ...ctrlBtn, background: audioMode ? "rgba(236,72,153,0.25)" : "rgba(255,255,255,0.08)" }} title="Audio only">
            <Icon name="headphones" size={15} />
          </button>
        )}
        {showMute && (
          <button onClick={(e) => { e.stopPropagation(); toggleMute(); }} style={ctrlBtn} title={muted ? "Unmute" : "Mute"}>
            <Icon name={muted ? "volumeOff" : "volume"} size={15} />
          </button>
        )}
        <button onClick={handleClose} style={ctrlBtn}><Icon name="x" size={15} /></button>
      </div>

      {/* Swipe nav arrows — visible when multiple items */}
      {hasPrev && (
        <button onClick={(e) => { e.stopPropagation(); onNavigate?.(currentIdx - 1); }} style={{ ...arrowBtn, left: 12 }}>
          <Icon name="chevronLeft" size={22} />
        </button>
      )}
      {hasNext && (
        <button onClick={(e) => { e.stopPropagation(); onNavigate?.(currentIdx + 1); }} style={{ ...arrowBtn, right: 12 }}>
          <Icon name="chevronRight" size={22} />
        </button>
      )}

      <div onClick={(e) => e.stopPropagation()}>
        {renderContent()}
      </div>
    </div>
  );
}

const ctrlBtn = {
  background: "rgba(255,255,255,0.07)", border: "none",
  color: "#f5f5f7", cursor: "pointer", borderRadius: "50%",
  width: 38, height: 38, display: "flex",
  alignItems: "center", justifyContent: "center",
  backdropFilter: "blur(12px)"
};

const arrowBtn = {
  position: "absolute", top: "50%", transform: "translateY(-50%)",
  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)",
  color: "#f5f5f7", cursor: "pointer", borderRadius: "50%",
  width: 44, height: 44, display: "flex",
  alignItems: "center", justifyContent: "center",
  zIndex: 1001, backdropFilter: "blur(16px)"
};
