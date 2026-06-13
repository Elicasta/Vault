"use client";
import { useState } from "react";
import { getGDriveFolderId, detectType, itemKey } from "@/lib/utils";
import Icon from "./Icons";

export default function DriveBrowser({ onOpenItem, mobile = false, onOpenMenu }) {
  const [folderInput, setFolderInput] = useState("");
  const [breadcrumbs, setBreadcrumbs] = useState([]); // [{id, name}]
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadFolder = async (folderId, name = "Drive") => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/drive?id=${encodeURIComponent(folderId)}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setFiles(json.files || []);

      // Update breadcrumbs
      const existing = breadcrumbs.findIndex((b) => b.id === folderId);
      if (existing >= 0) {
        setBreadcrumbs(breadcrumbs.slice(0, existing + 1));
      } else {
        setBreadcrumbs([...breadcrumbs, { id: folderId, name }]);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLoad = () => {
    const id = getGDriveFolderId(folderInput) || folderInput.trim();
    if (!id) return;
    setBreadcrumbs([]);
    loadFolder(id, "Drive");
  };

  const guessFileType = (name) => {
    const n = name.toLowerCase();
    if (/\.(jpg|jpeg|png|gif|webp|heic)$/.test(n)) return "image";
    if (/\.(mp4|mov|webm|m4v|avi)$/.test(n)) return "video";
    if (/\.(obj|glb|gltf|stl)$/.test(n)) return "model3d";
    return "file";
  };

  const fileIcon = { image: "image", video: "video", model3d: "box", file: "document" };

  const handleFileClick = (f) => {
    if (f.isFolder) {
      loadFolder(f.id, f.name);
      return;
    }
    const fileType = guessFileType(f.name);
    // Build a vault-compatible item and open it
    const url = `https://drive.google.com/file/d/${f.id}/view`;
    const lowerName = f.name.toLowerCase();
    const inferredFormat =
      fileType === "video" && lowerName.includes("sbs360") ? "sbs360" :
      fileType === "video" && lowerName.includes("sbs180") ? "sbs180" :
      fileType === "video" && lowerName.includes("360") ? "360" :
      fileType === "video" && lowerName.includes("180") ? "180" :
      "flat";

    onOpenItem({
      id: `drive-${f.id}`,
      key: itemKey(url),
      url,
      title: f.name,
      note: "",
      tags: [],
      format: inferredFormat,
      type: fileType === "model3d" ? "model3d" : "gdrive",
      tab: "Drive",
    });
  };

  return (
    <div style={{ padding: mobile ? 12 : 24 }}>
      {mobile && (
        <button
          onClick={onOpenMenu}
          aria-label="Open navigation"
          style={{
            width: 36, height: 36, borderRadius: 9, marginBottom: 12,
            background: "#141414", color: "#fff",
            border: "1px solid rgba(255,255,255,0.08)",
            fontSize: 18, cursor: "pointer"
          }}
        ><Icon name="menu" size={18} /></button>
      )}
      <h2 style={{ margin: "0 0 6px", fontSize: mobile ? 17 : 18, fontWeight: 700, color: "#fff" }}>
        Google Drive Browser
      </h2>
      <p style={{ margin: "0 0 20px", fontSize: 12, color: "#555" }}>
        Paste a public Drive folder link. The folder must be shared as “Anyone with the link can view.”
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, maxWidth: 600, flexDirection: mobile ? "column" : "row" }}>
        <input
          value={folderInput}
          onChange={(e) => setFolderInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleLoad(); }}
          placeholder="https://drive.google.com/drive/folders/..."
          style={{
            flex: 1, padding: "10px 14px", background: "#141414",
            border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8,
            color: "#fff", fontSize: mobile ? 16 : 13, outline: "none", fontFamily: "monospace"
          }}
        />
        <button onClick={handleLoad} style={{
          padding: mobile ? "12px 20px" : "10px 20px", background: "#34A853",
          border: "none", borderRadius: 8, color: "#fff",
          fontSize: 13, fontWeight: 600, cursor: "pointer"
        }}>
          Browse
        </button>
      </div>

      {/* Breadcrumbs */}
      {breadcrumbs.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16, fontSize: 12, alignItems: "center", flexWrap: "wrap" }}>
          {breadcrumbs.map((b, i) => (
            <span key={b.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {i > 0 && <span style={{ color: "#333" }}>/</span>}
              <button
                onClick={() => loadFolder(b.id, b.name)}
                style={{
                  background: "none", border: "none",
                  color: i === breadcrumbs.length - 1 ? "#fff" : "#34A853",
                  cursor: "pointer", fontSize: 12, padding: 0,
                  fontWeight: i === breadcrumbs.length - 1 ? 600 : 400
                }}
              >
                {b.name}
              </button>
            </span>
          ))}
        </div>
      )}

      {loading && <div style={{ color: "#444", fontSize: 13, padding: 40, textAlign: "center" }}>Reading folder...</div>}

      {error && (
        <div style={{
          background: "rgba(255,60,60,0.07)", border: "1px solid rgba(255,60,60,0.18)",
          borderRadius: 10, padding: "14px 18px", fontSize: 13, color: "#ff6b6b"
        }}>
          {error}
        </div>
      )}

      {!loading && files.length > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: mobile ? "repeat(2, minmax(0, 1fr))" : "repeat(auto-fill, minmax(180px, 1fr))",
          gap: mobile ? 10 : 10
        }}>
          {files.map((f) => {
            const ft = f.isFolder ? "folder" : guessFileType(f.name);
            return (
              <button
                key={f.id}
                onClick={() => handleFileClick(f)}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  gap: 8, padding: mobile ? "14px 10px" : "20px 12px",
                  background: "#141414", borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.05)",
                  cursor: "pointer", transition: "all 0.15s"
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)"}
              >
                {/* Thumbnail for images/videos via Drive thumbnail API */}
                {!f.isFolder && (ft === "image" || ft === "video") ? (
                  <div style={{ width: "100%", height: mobile ? 92 : 80, borderRadius: 6, overflow: "hidden", background: "#0a0a0a" }}>
                    <img
                      src={`https://drive.google.com/thumbnail?id=${f.id}&sz=w300`}
                      alt={f.name}
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </div>
                ) : (
                  <div style={{ color: "#777", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name={f.isFolder ? "folder" : fileIcon[ft]} size={34} /></div>
                )}
                <div style={{
                  fontSize: 11, color: "#bbb", textAlign: "center",
                  overflow: "hidden", textOverflow: "ellipsis",
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                  width: "100%"
                }}>
                  {f.name}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {!loading && breadcrumbs.length > 0 && files.length === 0 && !error && (
        <div style={{ color: "#444", fontSize: 13, padding: 40, textAlign: "center" }}>
          Folder is empty or files are not publicly visible.
        </div>
      )}
    </div>
  );
}
