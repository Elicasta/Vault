"use client";
import { useState, useEffect } from "react";
import Card from "./Card";
import Embed from "./Embed";
import ConfigModal from "./ConfigModal";
import { fetchAllTabs, fetchTabData, typeLabel } from "@/lib/utils";

const GridIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
    <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
  </svg>
);

const ListIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
    <line x1="8" y1="18" x2="21" y2="18"/>
    <circle cx="3" cy="6" r="1" fill="currentColor"/>
    <circle cx="3" cy="12" r="1" fill="currentColor"/>
    <circle cx="3" cy="18" r="1" fill="currentColor"/>
  </svg>
);

const SheetsIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="3" width="18" height="18" rx="2" fill="#34A853"/>
    <line x1="3" y1="9" x2="21" y2="9" stroke="white" strokeWidth="1.5"/>
    <line x1="3" y1="15" x2="21" y2="15" stroke="white" strokeWidth="1.5"/>
    <line x1="9" y1="3" x2="9" y2="21" stroke="white" strokeWidth="1.5"/>
  </svg>
);

export default function Vault() {
  const [sheetId, setSheetId] = useState("");
  const [tabs, setTabs] = useState([]);
  const [activeTab, setActiveTab] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState("grid");
  const [search, setSearch] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const [activeItem, setActiveItem] = useState(null);
  const [typeFilter, setTypeFilter] = useState("All");

  // Load persisted sheet id on mount
  useEffect(() => {
    const saved = localStorage.getItem("mv_sheet_id");
    if (saved) {
      setSheetId(saved);
      loadSheet(saved, true);
    } else {
      setShowConfig(true);
    }
  }, []);

  const loadSheet = async (id, initial = false) => {
    if (!id) return;
    initial ? setLoading(true) : setSyncing(true);
    setError("");
    try {
      const tabMeta = await fetchAllTabs(id);
      if (!tabMeta.length) throw new Error("No tabs found.");
      const results = await Promise.all(
        tabMeta.map(async (t) => {
          const items = await fetchTabData(id, t.name);
          return { name: t.name, items };
        })
      );
      setTabs(results);
      if (initial || !activeTab) setActiveTab(results[0]?.name || "");
      setTypeFilter("All");
    } catch (e) {
      setError(e.message || "Failed to load sheet.");
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  const handleSaveConfig = (id) => {
    setSheetId(id);
    localStorage.setItem("mv_sheet_id", id);
    setShowConfig(false);
    setActiveTab("");
    loadSheet(id, true);
  };

  const currentItems = tabs.find((t) => t.name === activeTab)?.items || [];

  const filtered = currentItems.filter((item) => {
    const matchType = typeFilter === "All" || typeLabel[item.type] === typeFilter;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      item.title?.toLowerCase().includes(q) ||
      item.url?.toLowerCase().includes(q) ||
      item.note?.toLowerCase().includes(q);
    return matchType && matchSearch;
  });

  const typeCounts = {};
  currentItems.forEach((i) => {
    const l = typeLabel[i.type];
    typeCounts[l] = (typeCounts[l] || 0) + 1;
  });
  const availableTypes = ["All", ...Object.keys(typeCounts)];
  const totalItems = tabs.reduce((s, t) => s + t.items.length, 0);

  return (
    <div style={{
      minHeight: "100vh", background: "#0a0a0a",
      color: "#fff", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
    }}>
      {/* ── Top bar ── */}
      <div style={{
        padding: "15px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        position: "sticky", top: 0, background: "#0a0a0a", zIndex: 100
      }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.3 }}>Media Vault</div>
          {tabs.length > 0 && (
            <div style={{ fontSize: 10, color: "#333", marginTop: 1 }}>
              {tabs.length} collections · {totalItems} items
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {tabs.length > 0 && (
            <>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                style={{
                  padding: "6px 11px", background: "#141414",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 7, color: "#fff", fontSize: 12,
                  outline: "none", width: 150
                }}
              />
              <div style={{
                display: "flex", background: "#141414", borderRadius: 7,
                padding: 2, border: "1px solid rgba(255,255,255,0.07)"
              }}>
                {[["grid", <GridIcon key="g" />], ["list", <ListIcon key="l" />]].map(([m, icon]) => (
                  <button
                    key={m}
                    onClick={() => setViewMode(m)}
                    style={{
                      background: viewMode === m ? "rgba(255,255,255,0.1)" : "transparent",
                      border: "none", color: viewMode === m ? "#fff" : "#555",
                      cursor: "pointer", borderRadius: 5, padding: "5px 9px",
                      display: "flex", alignItems: "center"
                    }}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </>
          )}

          {sheetId && (
            <button
              onClick={() => loadSheet(sheetId)}
              disabled={syncing || loading}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "6px 12px", background: "#141414",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 7, color: syncing ? "#333" : "#777",
                cursor: syncing ? "not-allowed" : "pointer", fontSize: 12
              }}
            >
              <span style={{
                display: "inline-block",
                animation: syncing ? "spin 0.8s linear infinite" : "none"
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                  <path d="M3 3v5h5"/>
                </svg>
              </span>
              {syncing ? "Syncing..." : "Sync"}
            </button>
          )}

          <button
            onClick={() => setShowConfig(true)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 14px", background: "#34A853",
              border: "none", borderRadius: 7,
              color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer"
            }}
          >
            <SheetsIcon />
            {sheetId ? "Change Sheet" : "Connect Sheet"}
          </button>
        </div>
      </div>

      {/* ── Collection tabs ── */}
      {tabs.length > 0 && (
        <div style={{
          display: "flex", overflowX: "auto", scrollbarWidth: "none",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          padding: "0 24px"
        }}>
          {tabs.map((t) => (
            <button
              key={t.name}
              onClick={() => { setActiveTab(t.name); setTypeFilter("All"); setSearch(""); }}
              style={{
                padding: "10px 16px",
                background: "transparent", border: "none",
                borderBottom: activeTab === t.name ? "2px solid #fff" : "2px solid transparent",
                color: activeTab === t.name ? "#fff" : "#555",
                cursor: "pointer", fontSize: 13,
                fontWeight: activeTab === t.name ? 600 : 400,
                whiteSpace: "nowrap", marginBottom: -1,
                transition: "color 0.15s"
              }}
            >
              {t.name}
              <span style={{
                marginLeft: 6, fontSize: 10,
                background: "rgba(255,255,255,0.06)",
                color: "#444", padding: "1px 5px", borderRadius: 10
              }}>
                {t.items.length}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── Type filter ── */}
      {currentItems.length > 0 && (
        <div style={{
          display: "flex", gap: 5, padding: "10px 24px",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          overflowX: "auto", scrollbarWidth: "none"
        }}>
          {availableTypes.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              style={{
                padding: "3px 11px",
                background: typeFilter === t ? "rgba(255,255,255,0.1)" : "transparent",
                border: `1px solid ${typeFilter === t ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)"}`,
                borderRadius: 20, color: typeFilter === t ? "#fff" : "#555",
                cursor: "pointer", fontSize: 11, fontWeight: typeFilter === t ? 600 : 400,
                whiteSpace: "nowrap", transition: "all 0.12s"
              }}
            >
              {t}
              {t !== "All" && typeCounts[t] && (
                <span style={{ marginLeft: 4, opacity: 0.5 }}>{typeCounts[t]}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Body ── */}
      <div style={{ padding: 24 }}>
        {/* No sheet */}
        {!sheetId && !loading && (
          <div style={{ textAlign: "center", padding: "100px 20px" }}>
            <div style={{ fontSize: 44, marginBottom: 16 }}>📋</div>
            <div style={{ fontSize: 17, fontWeight: 600, color: "#555", marginBottom: 8 }}>
              No sheet connected
            </div>
            <div style={{ fontSize: 13, color: "#333", marginBottom: 24 }}>
              Connect a Google Sheet. Each tab becomes a media collection.
            </div>
            <button
              onClick={() => setShowConfig(true)}
              style={{
                padding: "11px 22px", background: "#34A853",
                border: "none", borderRadius: 8, color: "#fff",
                fontSize: 13, fontWeight: 600, cursor: "pointer"
              }}
            >
              Connect Google Sheet
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: "80px 20px" }}>
            <div style={{
              width: 32, height: 32, border: "2px solid rgba(255,255,255,0.1)",
              borderTopColor: "#fff", borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
              margin: "0 auto 16px"
            }} />
            <div style={{ fontSize: 13, color: "#444" }}>Reading your collections...</div>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div style={{
            background: "rgba(255,60,60,0.07)",
            border: "1px solid rgba(255,60,60,0.18)",
            borderRadius: 10, padding: "14px 18px", marginBottom: 20
          }}>
            <div style={{ fontSize: 13, color: "#ff6b6b", fontWeight: 500 }}>{error}</div>
            <div style={{ fontSize: 11, color: "#555", marginTop: 6, lineHeight: 1.7 }}>
              Two steps required: (1) Share as Anyone with link can view. (2) File → Publish to web → Entire Document.
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && tabs.length > 0 && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ fontSize: 30, marginBottom: 10 }}>📭</div>
            <div style={{ fontSize: 13, color: "#444" }}>
              {search ? `No results for "${search}"` : "No items here. Add URLs to this sheet tab."}
            </div>
          </div>
        )}

        {/* Grid */}
        {!loading && filtered.length > 0 && viewMode === "grid" && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
            gap: 12
          }}>
            {filtered.map((item) => (
              <Card key={item.id} item={item} onOpen={setActiveItem} viewMode="grid" />
            ))}
          </div>
        )}

        {/* List */}
        {!loading && filtered.length > 0 && viewMode === "list" && (
          <div style={{
            background: "#111", borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.05)", overflow: "hidden"
          }}>
            {filtered.map((item) => (
              <Card key={item.id} item={item} onOpen={setActiveItem} viewMode="list" />
            ))}
          </div>
        )}
      </div>

      {showConfig && (
        <ConfigModal
          onSave={handleSaveConfig}
          onClose={() => tabs.length > 0 && setShowConfig(false)}
          savedId={sheetId}
        />
      )}
      {activeItem && <Embed item={activeItem} onClose={() => setActiveItem(null)} />}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { display: none; }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}
