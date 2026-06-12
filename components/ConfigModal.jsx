"use client";
import { useState, useEffect, useRef } from "react";
import { extractSheetId } from "@/lib/utils";

const isPublishedExportUrl = (val) =>
  /\/spreadsheets\/d\/e\//.test(val) || val.includes("pubhtml") || val.includes("pub?");

export default function ConfigModal({ onSave, onClose, savedId }) {
  const [val, setVal] = useState(savedId || "");
  const [warning, setWarning] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    ref.current?.focus();
    const h = (e) => { if (e.key === "Escape" && savedId) onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, savedId]);

  const handleChange = (v) => {
    setVal(v);
    if (isPublishedExportUrl(v)) {
      setWarning("That's the published export URL — it won't work. Open your sheet and copy the URL from the address bar instead.");
    } else {
      setWarning("");
    }
  };

  const handleSave = () => {
    if (!val.trim() || isPublishedExportUrl(val)) return;
    onSave(extractSheetId(val));
  };

  const canSave = val.trim() && !isPublishedExportUrl(val);

  return (
    <div
      onClick={() => savedId && onClose()}
      style={{
        position: "fixed", inset: 0, zIndex: 900,
        background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center"
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#181818", borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.1)",
          padding: 28, width: 520, maxWidth: "94vw",
          boxShadow: "0 20px 70px rgba(0,0,0,0.8)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="18" height="18" rx="2" fill="#34A853"/>
            <line x1="3" y1="9" x2="21" y2="9" stroke="white" strokeWidth="1.5"/>
            <line x1="3" y1="15" x2="21" y2="15" stroke="white" strokeWidth="1.5"/>
            <line x1="9" y1="3" x2="9" y2="21" stroke="white" strokeWidth="1.5"/>
          </svg>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "#fff" }}>
            Connect Google Sheet
          </h2>
        </div>
        <p style={{ margin: "0 0 20px", color: "#555", fontSize: 13, lineHeight: 1.6 }}>
          Each tab = one collection. Tab name is the collection name.
        </p>

        {/* Setup steps */}
        <div style={{
          background: "#0f0f0f", borderRadius: 10, padding: 16,
          marginBottom: 20, border: "1px solid rgba(255,255,255,0.06)"
        }}>
          <div style={{ fontSize: 10, color: "#34A853", fontWeight: 800, letterSpacing: 1.2, marginBottom: 10 }}>
            SHEET SETUP
          </div>
          <div style={{ fontSize: 12, color: "#666", lineHeight: 2 }}>
            1. Row 1 of every tab:{" "}
            {["url", "title", "note"].map((h) => (
              <span key={h} style={{
                fontFamily: "monospace", color: "#aaa", background: "#1a1a1a",
                padding: "1px 7px", borderRadius: 4, marginRight: 4
              }}>{h}</span>
            ))}<br />
            2. Share → <b style={{ color: "#ccc" }}>Anyone with the link can view</b>
          </div>
        </div>

        {/* URL example */}
        <div style={{
          background: "#0a1a0a", borderRadius: 8, padding: "10px 14px",
          marginBottom: 16, border: "1px solid rgba(52,168,83,0.2)"
        }}>
          <div style={{ fontSize: 10, color: "#34A853", fontWeight: 700, letterSpacing: 1, marginBottom: 5 }}>
            COPY THIS TYPE OF URL
          </div>
          <div style={{ fontFamily: "monospace", fontSize: 11, color: "#4a9a5a" }}>
            docs.google.com/spreadsheets/d/<b style={{ color: "#6abf7a" }}>YOUR_SHEET_ID</b>/edit
          </div>
        </div>

        <label style={{
          display: "block", fontSize: 10, color: "#555",
          fontWeight: 700, letterSpacing: 1, marginBottom: 7
        }}>
          PASTE YOUR SHEET URL
        </label>
        <input
          ref={ref}
          value={val}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && canSave) handleSave(); }}
          placeholder="https://docs.google.com/spreadsheets/d/..."
          style={{
            width: "100%", padding: "12px 14px",
            background: "#0f0f0f",
            border: `1px solid ${warning ? "rgba(255,150,0,0.4)" : "rgba(255,255,255,0.1)"}`,
            borderRadius: 8, color: "#fff", fontSize: 13,
            outline: "none", boxSizing: "border-box",
            fontFamily: "monospace", marginBottom: warning ? 8 : 20
          }}
        />

        {warning && (
          <div style={{
            fontSize: 12, color: "#f59e0b", marginBottom: 16,
            background: "rgba(245,158,11,0.08)", borderRadius: 6,
            padding: "8px 12px", border: "1px solid rgba(245,158,11,0.2)"
          }}>
            {warning}
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={handleSave}
            disabled={!canSave}
            style={{
              flex: 1, padding: 12,
              background: canSave ? "#34A853" : "#1a1a1a",
              color: canSave ? "#fff" : "#444",
              border: "none", borderRadius: 8,
              fontSize: 13, fontWeight: 600,
              cursor: canSave ? "pointer" : "not-allowed"
            }}
          >
            Load Collections
          </button>
          {savedId && (
            <button
              onClick={onClose}
              style={{
                padding: "12px 18px", background: "transparent",
                color: "#555", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8, fontSize: 13, cursor: "pointer"
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
