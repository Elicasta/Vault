/* eslint-disable react-hooks/static-components */
"use client";
import { useState } from "react";

export default function Sidebar({
  tabs, activeView, onNavigate, folders, onCreateFolder, onDeleteFolder,
  counts, onSignOut, userEmail, collapsed, onToggleCollapse
}) {
  const [newFolder, setNewFolder] = useState("");
  const [adding, setAdding] = useState(false);

  const NavItem = ({ id, icon, label, count, indent }) => {
    const active = activeView === id;
    return (
      <button
        onClick={() => onNavigate(id)}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          width: "100%", padding: collapsed ? "10px 0" : `8px 14px 8px ${indent ? 28 : 14}px`,
          justifyContent: collapsed ? "center" : "flex-start",
          background: active ? "rgba(255,255,255,0.08)" : "transparent",
          border: "none", borderRadius: 8,
          color: active ? "#fff" : "#777",
          cursor: "pointer", fontSize: 13,
          fontWeight: active ? 600 : 400,
          textAlign: "left", transition: "all 0.12s",
          marginBottom: 1
        }}
      >
        <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
        {!collapsed && (
          <>
            <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {label}
            </span>
            {count !== undefined && (
              <span style={{ fontSize: 10, color: "#444" }}>{count}</span>
            )}
          </>
        )}
      </button>
    );
  };

  const SectionLabel = ({ children }) =>
    collapsed ? <div style={{ height: 12 }} /> : (
      <div style={{
        fontSize: 9, fontWeight: 800, letterSpacing: 1.5,
        color: "#3a3a3a", padding: "16px 14px 6px", textTransform: "uppercase"
      }}>
        {children}
      </div>
    );

  return (
    <div style={{
      width: collapsed ? 56 : 230, flexShrink: 0,
      background: "#0e0e0e",
      borderRight: "1px solid rgba(255,255,255,0.06)",
      display: "flex", flexDirection: "column",
      height: "100vh", position: "sticky", top: 0,
      transition: "width 0.2s"
    }}>
      {/* Logo */}
      <div style={{
        padding: collapsed ? "18px 0" : "18px 16px",
        display: "flex", alignItems: "center",
        justifyContent: collapsed ? "center" : "space-between",
        borderBottom: "1px solid rgba(255,255,255,0.05)"
      }}>
        {!collapsed && (
          <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", letterSpacing: -0.3 }}>
            🗄️ Vault
          </div>
        )}
        <button onClick={onToggleCollapse} style={{
          background: "none", border: "none", color: "#444",
          cursor: "pointer", fontSize: 14, padding: 4
        }}>
          {collapsed ? "→" : "←"}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 8px" }}>
        {/* Library */}
        <SectionLabel>Library</SectionLabel>
        <NavItem id="all" icon="🏠" label="Everything" count={counts.all} />
        <NavItem id="favorites" icon="★" label="Favorites" count={counts.favorites} />
        <NavItem id="continue" icon="⏯" label="Continue Watching" count={counts.continue} />

        {/* Media types */}
        <SectionLabel>Media Types</SectionLabel>
        <NavItem id="type:Videos" icon="🎬" label="Videos" count={counts.Videos} />
        <NavItem id="type:Photos" icon="🖼" label="Photos" count={counts.Photos} />
        <NavItem id="type:3D Models" icon="🧊" label="3D Models" count={counts["3D Models"]} />
        <NavItem id="type:Links" icon="🔗" label="Links" count={counts.Links} />

        {/* Sheet collections */}
        <SectionLabel>Collections</SectionLabel>
        {tabs.map((t) => (
          <NavItem key={t.name} id={`tab:${t.name}`} icon="▸" label={t.name} count={t.items.length} />
        ))}

        {/* Custom vault folders */}
        <SectionLabel>My Folders</SectionLabel>
        {folders.map((f) => (
          <div key={f.name} style={{ position: "relative" }} className="folder-row">
            <NavItem id={`folder:${f.name}`} icon="📁" label={f.name} count={counts[`folder:${f.name}`]} />
            {!collapsed && (
              <button
                onClick={() => onDeleteFolder(f.name)}
                title="Delete folder"
                style={{
                  position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", color: "#333",
                  cursor: "pointer", fontSize: 11, padding: 4
                }}
              >✕</button>
            )}
          </div>
        ))}
        {!collapsed && (
          adding ? (
            <div style={{ display: "flex", gap: 4, padding: "4px 8px" }}>
              <input
                autoFocus
                value={newFolder}
                onChange={(e) => setNewFolder(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newFolder.trim()) {
                    onCreateFolder(newFolder.trim());
                    setNewFolder("");
                    setAdding(false);
                  }
                  if (e.key === "Escape") setAdding(false);
                }}
                placeholder="Folder name"
                style={{
                  flex: 1, padding: "6px 10px", background: "#141414",
                  border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6,
                  color: "#fff", fontSize: 12, outline: "none", minWidth: 0
                }}
              />
            </div>
          ) : (
            <button onClick={() => setAdding(true)} style={{
              display: "flex", alignItems: "center", gap: 8,
              width: "100%", padding: "8px 14px",
              background: "transparent", border: "none",
              color: "#3a3a3a", cursor: "pointer", fontSize: 12, textAlign: "left"
            }}>
              <span>＋</span> New folder
            </button>
          )
        )}

        {/* Drive */}
        <SectionLabel>Google Drive</SectionLabel>
        <NavItem id="drive" icon="🟢" label="Browse Drive" />

        <SectionLabel>Setup</SectionLabel>
        <NavItem id="settings" icon="⚙️" label="Sheet Settings" />
      </div>

      {/* User footer */}
      <div style={{
        padding: collapsed ? "12px 0" : "12px 14px",
        borderTop: "1px solid rgba(255,255,255,0.05)",
        display: "flex", alignItems: "center",
        justifyContent: collapsed ? "center" : "space-between"
      }}>
        {!collapsed && (
          <div style={{ fontSize: 10, color: "#444", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {userEmail || "Local mode"}
          </div>
        )}
        {onSignOut && (
          <button onClick={onSignOut} title="Sign out" style={{
            background: "none", border: "none", color: "#444",
            cursor: "pointer", fontSize: 13, padding: 4
          }}>⏻</button>
        )}
      </div>
    </div>
  );
}
