"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icons";
import { isVRFormat } from "@/lib/utils";

const resolverBase = () => {
  const raw = process.env.NEXT_PUBLIC_TORRENT_RESOLVER_URL || "";
  return raw.replace(/\/$/, "");
};

const mediaTypeLabel = {
  video: "Video",
  image: "Image",
  pdf: "PDF",
  model3d: "3D Model",
  unsupported: "Unsupported",
};

export default function TorrentViewer({ item, onClose, onOpenResolved }) {
  const [state, setState] = useState("idle");
  const [message, setMessage] = useState("Preparing torrent resolver...");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(null);
  const autoOpened = useRef(false);

  const base = useMemo(() => resolverBase(), []);

  const selectedFile = useMemo(() => {
    if (!result?.files?.length) return null;
    if (selectedIndex == null) return result.selectedFile || result.files[0];
    return result.files.find((f) => f.index === selectedIndex) || result.selectedFile || result.files[0];
  }, [result, selectedIndex]);

  const makeResolvedItem = useCallback((file) => {
    if (!file) return null;
    const mediaType = file.mediaType || "unsupported";
    const resolvedType = mediaType === "model" ? "model3d" : mediaType;
    const url = file.streamUrl || file.fileUrl;
    return {
      ...item,
      key: `${item.key || item.url}:${file.index}`,
      title: file.name || item.title,
      url,
      sourceUrl: item.url,
      type: resolvedType,
      format: item.format || "flat",
      format3d: file.extension?.replace(/^\./, "") || item.format3d,
      torrent: result,
    };
  }, [item, result]);

  const resolveTorrent = useCallback(async () => {
    if (!base) {
      setState("error");
      setError("Torrent resolver URL is missing. Add NEXT_PUBLIC_TORRENT_RESOLVER_URL in Vercel.");
      return;
    }

    setState("resolving");
    setMessage("Resolving torrent metadata...");
    setError("");

    try {
      const res = await fetch(`${base}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: item.url, preferredView: item.format || "flat" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Resolver failed with ${res.status}`);

      setResult(data);
      setSelectedIndex(data.selectedFile?.index ?? data.files?.[0]?.index ?? null);
      setState("ready");
      setMessage("Torrent is ready.");
    } catch (err) {
      setState("error");
      setError(err.message || "Failed to resolve torrent.");
    }
  }, [base, item.url, item.format]);

  useEffect(() => { resolveTorrent(); }, [resolveTorrent]);

  useEffect(() => {
    if (state !== "ready" || autoOpened.current || !selectedFile) return;
    const mediaType = selectedFile.mediaType;
    if (!["video", "image", "pdf", "model"].includes(mediaType)) return;
    autoOpened.current = true;
    const resolved = makeResolvedItem(selectedFile);
    if (!resolved?.url) return;

    const timer = setTimeout(() => {
      onClose();
      onOpenResolved(resolved);
    }, 350);

    return () => clearTimeout(timer);
  }, [state, selectedFile, makeResolvedItem, onClose, onOpenResolved]);

  const openSelected = () => {
    const resolved = makeResolvedItem(selectedFile);
    if (!resolved?.url) return;
    onClose();
    onOpenResolved(resolved);
  };

  const copyUrl = async () => {
    const url = selectedFile?.streamUrl || selectedFile?.fileUrl;
    if (!url) return;
    await navigator.clipboard?.writeText(url);
    setMessage("Stream URL copied.");
  };

  const canOpen = selectedFile && ["video", "image", "pdf", "model"].includes(selectedFile.mediaType);
  const externalUrl = selectedFile?.streamUrl || selectedFile?.fileUrl;

  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={panel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: "#777", fontSize: 11, textTransform: "uppercase", letterSpacing: 1.4, marginBottom: 6 }}>Torrent Source</div>
            <div style={{ color: "#fff", fontSize: 18, fontWeight: 700, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title || "Torrent"}</div>
          </div>
          <button onClick={onClose} style={iconBtn} aria-label="Close"><Icon name="x" size={16} /></button>
        </div>

        {state === "resolving" && (
          <div style={statusBox}>
            <div style={spinner} />
            <div>
              <div style={{ color: "#e8e8e8", fontSize: 14, fontWeight: 650 }}>{message}</div>
              <div style={{ color: "#777", fontSize: 12, marginTop: 5 }}>This can take a moment if the magnet link has not exposed metadata yet.</div>
            </div>
          </div>
        )}

        {state === "error" && (
          <div style={{ ...statusBox, borderColor: "rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.08)" }}>
            <Icon name="alert" size={22} />
            <div>
              <div style={{ color: "#fca5a5", fontSize: 14, fontWeight: 650 }}>Torrent could not be opened.</div>
              <div style={{ color: "#c7a2a2", fontSize: 12, marginTop: 5 }}>{error}</div>
            </div>
          </div>
        )}

        {state === "ready" && selectedFile && (
          <>
            <div style={statusBox}>
              <Icon name="file" size={22} />
              <div style={{ minWidth: 0 }}>
                <div style={{ color: "#e8e8e8", fontSize: 14, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedFile.name}</div>
                <div style={{ color: "#777", fontSize: 12, marginTop: 5 }}>
                  {mediaTypeLabel[selectedFile.mediaType] || selectedFile.mediaType} · {formatBytes(selectedFile.size)}
                  {isVRFormat(item.format) ? ` · ${item.format}` : ""}
                </div>
              </div>
            </div>

            {result.files?.length > 1 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11, color: "#777", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8 }}>Files in torrent</div>
                <div style={{ display: "grid", gap: 7, maxHeight: 210, overflow: "auto" }}>
                  {result.files.map((file) => (
                    <button key={file.index} onClick={() => { autoOpened.current = true; setSelectedIndex(file.index); }} style={fileRow(selectedFile.index === file.index)}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
                      <span style={{ color: "#666", flexShrink: 0 }}>{mediaTypeLabel[file.mediaType] || file.mediaType} · {formatBytes(file.size)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!canOpen && (
              <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.22)", color: "#d6b16c", fontSize: 12, lineHeight: 1.5 }}>
                This file type is not browser-playable yet. You can still copy the stream URL or open it externally.
              </div>
            )}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 18 }}>
              {canOpen && <button onClick={openSelected} style={primaryBtn}>Open in Vault</button>}
              {externalUrl && <a href={externalUrl} target="_blank" rel="noreferrer" style={secondaryBtn}>Open externally</a>}
              {externalUrl && <button onClick={copyUrl} style={secondaryBtn}>Copy stream URL</button>}
            </div>
          </>
        )}

        {message && state !== "resolving" && (
          <div style={{ color: "#666", fontSize: 11, marginTop: 14 }}>{message}</div>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes = 0) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

const overlay = {
  position: "fixed", inset: 0, zIndex: 1000,
  background: "rgba(0,0,0,0.88)", display: "flex",
  alignItems: "center", justifyContent: "center",
  padding: 16, backdropFilter: "blur(10px)"
};

const panel = {
  width: "min(620px, 100%)", maxHeight: "calc(100dvh - 32px)", overflow: "auto",
  background: "#111", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 18, padding: 20, boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif"
};

const statusBox = {
  display: "flex", alignItems: "center", gap: 12,
  padding: 14, borderRadius: 12,
  background: "rgba(255,255,255,0.045)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const spinner = {
  width: 24, height: 24, borderRadius: "50%",
  border: "2px solid rgba(255,255,255,0.12)",
  borderTopColor: "#fff", animation: "spin 0.8s linear infinite", flexShrink: 0
};

const iconBtn = {
  width: 38, height: 38, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.05)", color: "#fff", cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center"
};

const primaryBtn = {
  border: "none", background: "#fff", color: "#000", borderRadius: 9,
  padding: "10px 14px", fontSize: 12, fontWeight: 750, cursor: "pointer",
  textDecoration: "none", display: "inline-flex", alignItems: "center"
};

const secondaryBtn = {
  border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.045)", color: "#ddd", borderRadius: 9,
  padding: "10px 14px", fontSize: 12, fontWeight: 650, cursor: "pointer",
  textDecoration: "none", display: "inline-flex", alignItems: "center"
};

const fileRow = (active) => ({
  width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
  textAlign: "left", border: `1px solid ${active ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.07)"}`,
  background: active ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.035)",
  color: active ? "#fff" : "#c8c8c8", borderRadius: 9, padding: "9px 10px",
  cursor: "pointer", fontSize: 12
});
