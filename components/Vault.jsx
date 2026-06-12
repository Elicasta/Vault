"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Card from "./Card";
import Embed from "./Embed";
import ConfigModal from "./ConfigModal";
import Sidebar from "./Sidebar";
import DriveBrowser from "./DriveBrowser";
import Slideshow from "./Slideshow";
import ThreeViewer from "./ThreeViewer";
import VRViewer from "./VRViewer";
import { fetchAllTabs, fetchTabData, typeLabel, mediaCategory, isVRFormat } from "@/lib/utils";
import {
  supabase, isSupabaseConfigured, getUserData, toggleFavorite,
  setItemFolder, getFolders, createFolder, deleteFolder,
  getSettings, saveSettings
} from "@/lib/supabase";

const VIEW_MODES = [
  { id: "grid-lg", icon: "▦", label: "Large grid" },
  { id: "grid-sm", icon: "▩", label: "Small grid" },
  { id: "masonry", icon: "▤", label: "Masonry" },
  { id: "list", icon: "☰", label: "List" },
];

export default function Vault() {
  const [user, setUser] = useState(null);
  const [sheetId, setSheetId] = useState("");
  const [manualTabs, setManualTabs] = useState(null);
  const [tabs, setTabs] = useState([]);
  const [activeView, setActiveView] = useState("all");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [needsManualTabs, setNeedsManualTabs] = useState(false);
  const [viewMode, setViewMode] = useState("grid-lg");
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState(null);
  const [showConfig, setShowConfig] = useState(false);
  const [activeItem, setActiveItem] = useState(null);
  const [show3D, setShow3D] = useState(null);
  const [showVR, setShowVR] = useState(null);
  const [showSlideshow, setShowSlideshow] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Supabase state
  const [userData, setUserData] = useState({});
  const [folders, setFolders] = useState([]);

  // Scraped metadata: url -> {title, image, video}
  const [scrapedMap, setScrapedMap] = useState({});
  const scrapeQueue = useRef(new Set());

  // ─── Init: auth + settings ───
  useEffect(() => {
    const init = async () => {
      if (isSupabaseConfigured()) {
        const { data } = await supabase.auth.getSession();
        const u = data.session?.user;
        setUser(u || null);

        if (u) {
          const [ud, fl, settings] = await Promise.all([
            getUserData(u.id),
            getFolders(u.id),
            getSettings(u.id),
          ]);
          setUserData(ud);
          setFolders(fl);
          if (settings?.view_mode) setViewMode(settings.view_mode);
          if (settings?.sheet_id) {
            setSheetId(settings.sheet_id);
            setManualTabs(settings.manual_tabs || null);
            loadSheet(settings.sheet_id, settings.manual_tabs || null, true);
            return;
          }
        }
      }
      // Fall back to localStorage
      try {
        const saved = localStorage.getItem("mv_sheet_id");
        const savedTabs = localStorage.getItem("mv_manual_tabs");
        if (saved) {
          setSheetId(saved);
          const mt = savedTabs ? JSON.parse(savedTabs) : null;
          setManualTabs(mt);
          loadSheet(saved, mt, true);
        } else {
          setShowConfig(true);
        }
      } catch {
        setShowConfig(true);
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Sheet loading ───
  const loadSheet = async (id, manualTabNames = null, initial = false) => {
    if (!id) return;
    initial ? setLoading(true) : setSyncing(true);
    setError("");
    setNeedsManualTabs(false);

    try {
      let tabList;
      if (manualTabNames && manualTabNames.length > 0) {
        tabList = manualTabNames.map((name) => ({ name }));
      } else {
        const res = await fetch(`/api/tabs?id=${encodeURIComponent(id)}`);
        const json = await res.json();
        if (json.error === "NEEDS_MANUAL_TABS") {
          setNeedsManualTabs(true);
          setShowConfig(true);
          setLoading(false);
          setSyncing(false);
          return;
        }
        if (json.error) throw new Error(json.error);
        tabList = json.tabs.map((name) => ({ name }));
      }

      const results = await Promise.all(
        tabList.map(async (t) => ({
          name: t.name,
          items: await fetchTabData(id, t.name),
        }))
      );

      setTabs(results);
    } catch (e) {
      setError(e.message || "Failed to load sheet.");
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  const handleSaveConfig = async (id, newManualTabs) => {
    setSheetId(id);
    const mt = newManualTabs?.length > 0 ? newManualTabs : null;
    setManualTabs(mt);
    try {
      localStorage.setItem("mv_sheet_id", id);
      if (mt) localStorage.setItem("mv_manual_tabs", JSON.stringify(mt));
      else localStorage.removeItem("mv_manual_tabs");
    } catch {}
    if (user) {
      saveSettings(user.id, { sheet_id: id, manual_tabs: mt });
    }
    setShowConfig(false);
    setNeedsManualTabs(false);
    loadSheet(id, mt, true);
  };

  // ─── Scraping: queue link-type items for metadata ───
  const allItems = tabs.flatMap((t) => t.items);

  useEffect(() => {
    const linkItems = allItems.filter(
      (i) => ["link", "reddit", "twitter", "facebook", "instagram", "tiktok"].includes(i.type)
        && !scrapedMap[i.url] && !scrapeQueue.current.has(i.url)
    );
    linkItems.slice(0, 10).forEach(async (item) => {
      scrapeQueue.current.add(item.url);
      try {
        const res = await fetch(`/api/scrape?url=${encodeURIComponent(item.url)}`);
        const data = await res.json();
        setScrapedMap((prev) => ({ ...prev, [item.url]: data }));
      } catch {
        setScrapedMap((prev) => ({ ...prev, [item.url]: {} }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs]);

  // ─── User actions ───
  const handleToggleFavorite = async (key, current) => {
    setUserData((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), item_key: key, favorite: !current },
    }));
    if (user) await toggleFavorite(user.id, key, current);
  };

  const handleAssignFolder = async (key, folder) => {
    setUserData((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), item_key: key, folder },
    }));
    if (user) await setItemFolder(user.id, key, folder);
  };

  const handleCreateFolder = async (name) => {
    if (folders.some((f) => f.name === name)) return;
    setFolders((prev) => [...prev, { name }].sort((a, b) => a.name.localeCompare(b.name)));
    if (user) await createFolder(user.id, name);
  };

  const handleDeleteFolder = async (name) => {
    setFolders((prev) => prev.filter((f) => f.name !== name));
    setUserData((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (next[k].folder === name) next[k] = { ...next[k], folder: null };
      });
      return next;
    });
    if (activeView === `folder:${name}`) setActiveView("all");
    if (user) await deleteFolder(user.id, name);
  };

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    if (user) saveSettings(user.id, { view_mode: mode });
  };

  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut();
    window.location.reload();
  };

  // ─── Open item → route to correct viewer ───
  const openItem = (item) => {
    if (item.type === "model3d") { setShow3D(item); return; }
    if (isVRFormat(item.format)) { setShowVR(item); return; }
    setActiveItem(item);
  };

  // ─── Filtering ───
  const getViewItems = () => {
    let items = allItems;

    if (activeView === "favorites") {
      items = items.filter((i) => userData[i.key]?.favorite);
    } else if (activeView === "continue") {
      items = items
        .filter((i) => {
          const d = userData[i.key];
          return d?.progress > 5 && d?.duration > 0 && d.progress / d.duration < 0.95;
        })
        .sort((a, b) => new Date(userData[b.key]?.updated_at || 0) - new Date(userData[a.key]?.updated_at || 0));
    } else if (activeView.startsWith("tab:")) {
      const tabName = activeView.slice(4);
      items = tabs.find((t) => t.name === tabName)?.items || [];
    } else if (activeView.startsWith("type:")) {
      const cat = activeView.slice(5);
      items = items.filter((i) => mediaCategory(i.type) === cat);
    } else if (activeView.startsWith("folder:")) {
      const folderName = activeView.slice(7);
      items = items.filter((i) => userData[i.key]?.folder === folderName);
    }

    if (tagFilter) {
      items = items.filter((i) => i.tags.includes(tagFilter));
    }

    if (search) {
      const q = search.toLowerCase();
      items = items.filter((i) =>
        i.title?.toLowerCase().includes(q) ||
        i.url?.toLowerCase().includes(q) ||
        i.note?.toLowerCase().includes(q) ||
        i.tags.some((t) => t.includes(q))
      );
    }

    return items;
  };

  const viewItems = getViewItems();

  // All tags across current view's source items
  const allTags = [...new Set(allItems.flatMap((i) => i.tags))].sort();

  // Counts for sidebar
  const counts = {
    all: allItems.length,
    favorites: allItems.filter((i) => userData[i.key]?.favorite).length,
    continue: allItems.filter((i) => {
      const d = userData[i.key];
      return d?.progress > 5 && d?.duration > 0 && d.progress / d.duration < 0.95;
    }).length,
  };
  ["Videos", "Photos", "3D Models", "Links"].forEach((cat) => {
    counts[cat] = allItems.filter((i) => mediaCategory(i.type) === cat).length;
  });
  folders.forEach((f) => {
    counts[`folder:${f.name}`] = allItems.filter((i) => userData[i.key]?.folder === f.name).length;
  });

  const viewTitle =
    activeView === "all" ? "Everything" :
    activeView === "favorites" ? "★ Favorites" :
    activeView === "continue" ? "Continue Watching" :
    activeView.startsWith("tab:") ? activeView.slice(4) :
    activeView.startsWith("type:") ? activeView.slice(5) :
    activeView.startsWith("folder:") ? `📁 ${activeView.slice(7)}` :
    activeView === "drive" ? "" : "";

  const gridCols = viewMode === "grid-sm"
    ? "repeat(auto-fill, minmax(150px, 1fr))"
    : "repeat(auto-fill, minmax(230px, 1fr))";

  // ─── Render ───
  return (
    <div style={{
      display: "flex", minHeight: "100vh", background: "#0a0a0a",
      color: "#fff", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
    }}>
      <Sidebar
        tabs={tabs}
        activeView={activeView}
        onNavigate={(v) => {
          if (v === "settings") { setShowConfig(true); return; }
          setActiveView(v);
          setTagFilter(null);
          setSearch("");
        }}
        folders={folders}
        onCreateFolder={handleCreateFolder}
        onDeleteFolder={handleDeleteFolder}
        counts={counts}
        onSignOut={isSupabaseConfigured() ? handleSignOut : null}
        userEmail={user?.email}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        {activeView === "drive" ? (
          <DriveBrowser onOpenItem={openItem} />
        ) : (
          <>
            {/* Top bar */}
            <div style={{
              padding: "14px 24px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              position: "sticky", top: 0, background: "#0a0a0a", zIndex: 100,
              gap: 12, flexWrap: "wrap"
            }}>
              <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.3 }}>
                {viewTitle}
                <span style={{ fontSize: 11, color: "#3a3a3a", marginLeft: 10, fontWeight: 400 }}>
                  {viewItems.length} items
                </span>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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

                {/* View mode switcher */}
                <div style={{ display: "flex", background: "#141414", borderRadius: 7, padding: 2, border: "1px solid rgba(255,255,255,0.07)" }}>
                  {VIEW_MODES.map((m) => (
                    <button key={m.id} onClick={() => handleViewModeChange(m.id)} title={m.label} style={{
                      background: viewMode === m.id ? "rgba(255,255,255,0.1)" : "transparent",
                      border: "none", color: viewMode === m.id ? "#fff" : "#555",
                      cursor: "pointer", borderRadius: 5, padding: "5px 10px", fontSize: 13
                    }}>
                      {m.icon}
                    </button>
                  ))}
                </div>

                <button onClick={() => setShowSlideshow(true)} title="Slideshow" style={{
                  padding: "6px 12px", background: "#141414",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 7, color: "#777", cursor: "pointer", fontSize: 12
                }}>
                  ▶ Slideshow
                </button>

                {sheetId && (
                  <button onClick={() => loadSheet(sheetId, manualTabs)} disabled={syncing} style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "6px 12px", background: "#141414",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 7, color: syncing ? "#333" : "#777",
                    cursor: syncing ? "not-allowed" : "pointer", fontSize: 12
                  }}>
                    <span style={{ display: "inline-block", animation: syncing ? "spin 0.8s linear infinite" : "none" }}>↻</span>
                    {syncing ? "Syncing" : "Sync"}
                  </button>
                )}
              </div>
            </div>

            {/* Tag filter bar */}
            {allTags.length > 0 && (
              <div style={{
                display: "flex", gap: 5, padding: "10px 24px",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                overflowX: "auto", scrollbarWidth: "none"
              }}>
                <button onClick={() => setTagFilter(null)} style={tagPill(!tagFilter)}>All tags</button>
                {allTags.map((t) => (
                  <button key={t} onClick={() => setTagFilter(tagFilter === t ? null : t)} style={tagPill(tagFilter === t)}>
                    #{t}
                  </button>
                ))}
              </div>
            )}

            {/* Body */}
            <div style={{ padding: 24 }}>
              {!sheetId && !loading && (
                <EmptyState
                  emoji="📋" title="No sheet connected"
                  sub="Connect a Google Sheet. Each tab becomes a collection."
                  action={() => setShowConfig(true)} actionLabel="Connect Google Sheet"
                />
              )}

              {loading && (
                <div style={{ textAlign: "center", padding: "80px 20px" }}>
                  <div style={{
                    width: 32, height: 32, border: "2px solid rgba(255,255,255,0.1)",
                    borderTopColor: "#fff", borderRadius: "50%",
                    animation: "spin 0.8s linear infinite", margin: "0 auto 16px"
                  }} />
                  <div style={{ fontSize: 13, color: "#444" }}>Loading your vault...</div>
                </div>
              )}

              {error && !loading && (
                <div style={{
                  background: "rgba(255,60,60,0.07)", border: "1px solid rgba(255,60,60,0.18)",
                  borderRadius: 10, padding: "14px 18px", marginBottom: 20
                }}>
                  <div style={{ fontSize: 13, color: "#ff6b6b", fontWeight: 500 }}>{error}</div>
                </div>
              )}

              {!loading && sheetId && viewItems.length === 0 && !error && (
                <EmptyState emoji="📭" title="Nothing here" sub={
                  search ? `No results for "${search}"` :
                  activeView === "favorites" ? "Star items to see them here." :
                  activeView === "continue" ? "Videos you partially watch show up here." :
                  "Add URLs to your sheet and hit Sync."
                } />
              )}

              {/* Grid views */}
              {!loading && viewItems.length > 0 && (viewMode === "grid-lg" || viewMode === "grid-sm") && (
                <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: viewMode === "grid-sm" ? 8 : 12 }}>
                  {viewItems.map((item) => (
                    <Card
                      key={item.id} item={item} onOpen={openItem}
                      viewMode="grid" size={viewMode === "grid-sm" ? "sm" : "lg"}
                      userData={userData} onToggleFavorite={handleToggleFavorite}
                      folders={folders} onAssignFolder={handleAssignFolder}
                      scraped={scrapedMap[item.url]}
                    />
                  ))}
                </div>
              )}

              {/* Masonry */}
              {!loading && viewItems.length > 0 && viewMode === "masonry" && (
                <div style={{ columns: "4 220px", columnGap: 12 }}>
                  {viewItems.map((item) => (
                    <div key={item.id} style={{ breakInside: "avoid", marginBottom: 12 }}>
                      <Card
                        item={item} onOpen={openItem} viewMode="grid" size="lg"
                        userData={userData} onToggleFavorite={handleToggleFavorite}
                        folders={folders} onAssignFolder={handleAssignFolder}
                        scraped={scrapedMap[item.url]}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* List */}
              {!loading && viewItems.length > 0 && viewMode === "list" && (
                <div style={{ background: "#111", borderRadius: 10, border: "1px solid rgba(255,255,255,0.05)", overflow: "hidden" }}>
                  {viewItems.map((item) => (
                    <Card
                      key={item.id} item={item} onOpen={openItem} viewMode="list"
                      userData={userData} onToggleFavorite={handleToggleFavorite}
                      folders={folders} onAssignFolder={handleAssignFolder}
                      scraped={scrapedMap[item.url]}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modals & viewers */}
      {showConfig && (
        <ConfigModal
          onSave={handleSaveConfig}
          onClose={() => !needsManualTabs && setShowConfig(false)}
          savedId={sheetId}
          needsManualTabs={needsManualTabs}
        />
      )}
      {activeItem && (
        <Embed
          item={activeItem}
          onClose={() => setActiveItem(null)}
          userId={user?.id}
          resumeAt={userData[activeItem.key]?.progress || 0}
          scraped={scrapedMap[activeItem.url]}
        />
      )}
      {show3D && <ThreeViewer item={show3D} onClose={() => setShow3D(null)} />}
      {showVR && <VRViewer item={showVR} onClose={() => setShowVR(null)} />}
      {showSlideshow && (
        <Slideshow items={viewItems} onClose={() => setShowSlideshow(false)} scrapedMap={scrapedMap} />
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}

const tagPill = (active) => ({
  padding: "3px 11px",
  background: active ? "rgba(255,255,255,0.1)" : "transparent",
  border: `1px solid ${active ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)"}`,
  borderRadius: 20, color: active ? "#fff" : "#555",
  cursor: "pointer", fontSize: 11, fontWeight: active ? 600 : 400,
  whiteSpace: "nowrap"
});

const EmptyState = ({ emoji, title, sub, action, actionLabel }) => (
  <div style={{ textAlign: "center", padding: "90px 20px" }}>
    <div style={{ fontSize: 44, marginBottom: 16 }}>{emoji}</div>
    <div style={{ fontSize: 17, fontWeight: 600, color: "#555", marginBottom: 8 }}>{title}</div>
    <div style={{ fontSize: 13, color: "#333", marginBottom: 24 }}>{sub}</div>
    {action && (
      <button onClick={action} style={{
        padding: "11px 22px", background: "#34A853",
        border: "none", borderRadius: 8, color: "#fff",
        fontSize: 13, fontWeight: 600, cursor: "pointer"
      }}>{actionLabel}</button>
    )}
  </div>
);
