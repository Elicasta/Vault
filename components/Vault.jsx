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
import TorrentViewer from "./TorrentViewer";
import Icon from "./Icons";
import { fetchAllTabs, fetchTabData, typeLabel, mediaCategory, isVRFormat } from "@/lib/utils";
import {
  supabase, isSupabaseConfigured, getUserData, toggleFavorite,
  setItemFolder, getFolders, createFolder, deleteFolder,
  getSettings, saveSettings
} from "@/lib/supabase";

const VIEW_MODES = [
  { id: "grid-lg", icon: "gridLarge", label: "Large grid" },
  { id: "grid-sm", icon: "gridSmall", label: "Small grid" },
  { id: "masonry", icon: "masonry", label: "Masonry" },
  { id: "list", icon: "list", label: "List" },
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
  const [showTorrent, setShowTorrent] = useState(null);
  const [showSlideshow, setShowSlideshow] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const syncViewport = () => setIsMobile(window.innerWidth < 820);
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  // Supabase state
  const [userData, setUserData] = useState({});
  const [folders, setFolders] = useState([]);

  // Scraped metadata: url -> {title, image, video}
  const [scrapedMap, setScrapedMap] = useState({});
  const scrapeQueue = useRef(new Set());

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
    if (item.type === "torrent") { setShowTorrent(item); return; }
    if (item.type === "model3d") { setShow3D(item); return; }
    if (isVRFormat(item.format)) { setShowVR(item); return; }
    setActiveItem(item);
  };

  const openResolvedTorrentItem = (item) => {
    if (item.type === "model3d") { setShow3D(item); return; }
    if (item.type === "video" && isVRFormat(item.format)) { setShowVR(item); return; }
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
  ["Videos", "Photos", "3D Models", "Torrents", "Links"].forEach((cat) => {
    counts[cat] = allItems.filter((i) => mediaCategory(i.type) === cat).length;
  });
  folders.forEach((f) => {
    counts[`folder:${f.name}`] = allItems.filter((i) => userData[i.key]?.folder === f.name).length;
  });

  const viewTitle =
    activeView === "all" ? "Everything" :
    activeView === "favorites" ? "Favorites" :
    activeView === "continue" ? "Continue Watching" :
    activeView.startsWith("tab:") ? activeView.slice(4) :
    activeView.startsWith("type:") ? activeView.slice(5) :
    activeView.startsWith("folder:") ? activeView.slice(7) :
    activeView === "drive" ? "" : "";

  const gridCols = isMobile
    ? "repeat(2, minmax(0, 1fr))"
    : viewMode === "grid-sm"
      ? "repeat(auto-fill, minmax(150px, 1fr))"
      : "repeat(auto-fill, minmax(230px, 1fr))";

  // ─── Render ───
  return (
    <div style={{
      display: "flex", minHeight: "100dvh", background: "#0a0a0a",
      color: "#fff", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      overflowX: "hidden"
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
        collapsed={isMobile ? false : sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobile={isMobile}
        open={!isMobile || mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />

      <div style={{ flex: 1, minWidth: 0, width: "100%" }}>
        {activeView === "drive" ? (
          <DriveBrowser onOpenItem={openItem} mobile={isMobile} onOpenMenu={() => setMobileNavOpen(true)} />
        ) : (
          <>
            {/* Top bar */}
            <div style={{
              padding: isMobile ? "10px 12px" : "14px 24px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              position: "sticky", top: 0, background: "#0a0a0a", zIndex: 100,
              gap: isMobile ? 10 : 12, flexWrap: "wrap"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                {isMobile && (
                  <button
                    onClick={() => setMobileNavOpen(true)}
                    aria-label="Open navigation"
                    style={{
                      width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                      background: "#141414", color: "#fff",
                      border: "1px solid rgba(255,255,255,0.08)",
                      fontSize: 18, cursor: "pointer"
                    }}
                  ><Icon name="menu" size={18} /></button>
                )}
                <div style={{ fontSize: isMobile ? 15 : 16, fontWeight: 700, letterSpacing: -0.3, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {viewTitle}
                <span style={{ fontSize: 11, color: "#3a3a3a", marginLeft: 10, fontWeight: 400 }}>
                  {viewItems.length} items
                </span>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", width: isMobile ? "100%" : "auto" }}>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search..."
                  style={{
                    padding: "6px 11px", background: "#141414",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 7, color: "#fff", fontSize: 12,
                    outline: "none", width: isMobile ? "100%" : 150, flex: isMobile ? "1 0 100%" : "0 0 auto", minHeight: isMobile ? 38 : "auto"
                  }}
                />

                {/* View mode switcher */}
                <div style={{ display: "flex", background: "#141414", borderRadius: 7, padding: 2, border: "1px solid rgba(255,255,255,0.07)", flex: isMobile ? 1 : "0 0 auto" }}>
                  {VIEW_MODES.map((m) => (
                    <button key={m.id} onClick={() => handleViewModeChange(m.id)} title={m.label} style={{
                      background: viewMode === m.id ? "rgba(255,255,255,0.1)" : "transparent",
                      border: "none", color: viewMode === m.id ? "#fff" : "#555",
                      cursor: "pointer", borderRadius: 5, padding: isMobile ? "7px 10px" : "5px 10px", fontSize: 13, flex: isMobile ? 1 : "0 0 auto"
                    }}>
                      <Icon name={m.icon} size={15} />
                    </button>
                  ))}
                </div>

                <button onClick={() => setShowSlideshow(true)} title="Slideshow" style={{
                  padding: isMobile ? "8px 10px" : "6px 12px", background: "#141414",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 7, color: "#777", cursor: "pointer", fontSize: 12
                }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="play" size={13} /> Slideshow</span>
                </button>

                {sheetId && (
                  <button onClick={() => loadSheet(sheetId, manualTabs)} disabled={syncing} style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: isMobile ? "8px 10px" : "6px 12px", background: "#141414",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 7, color: syncing ? "#333" : "#777",
                    cursor: syncing ? "not-allowed" : "pointer", fontSize: 12
                  }}>
                    <Icon name="sync" size={13} style={{ animation: syncing ? "spin 0.8s linear infinite" : "none" }} />
                    {syncing ? "Syncing" : "Sync"}
                  </button>
                )}
              </div>
            </div>

            {/* Collection tabs */}
            {tabs.length > 0 && (
              <div style={{
                display: "flex", gap: 7, padding: isMobile ? "8px 12px" : "10px 24px",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                overflowX: "auto", scrollbarWidth: "none"
              }}>
                <button onClick={() => setActiveView("all")} style={collectionPill(activeView === "all")}>
                  All
                </button>
                {tabs.map((t) => (
                  <button
                    key={t.name}
                    onClick={() => setActiveView(`tab:${t.name}`)}
                    style={collectionPill(activeView === `tab:${t.name}`)}
                    title={t.name}
                  >
                    {t.name}
                    <span style={{ color: activeView === `tab:${t.name}` ? "#bbb" : "#555", marginLeft: 6 }}>{t.items.length}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Tag filter bar */}
            {allTags.length > 0 && (
              <div style={{
                display: "flex", gap: 5, padding: isMobile ? "8px 12px" : "10px 24px",
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
            <div style={{ padding: isMobile ? 12 : 24 }}>
              {!sheetId && !loading && (
                <EmptyState
                  icon="table" title="No sheet connected"
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
                <EmptyState icon="inbox" title="Nothing here" sub={
                  search ? `No results for "${search}"` :
                  activeView === "favorites" ? "Star items to see them here." :
                  activeView === "continue" ? "Videos you partially watch show up here." :
                  "Add URLs to your sheet and hit Sync."
                } />
              )}

              {/* Grid views */}
              {!loading && viewItems.length > 0 && (viewMode === "grid-lg" || viewMode === "grid-sm") && (
                <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: isMobile ? 10 : viewMode === "grid-sm" ? 8 : 12 }}>
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
                <div style={{ columns: isMobile ? "2 150px" : "4 220px", columnGap: isMobile ? 10 : 12 }}>
                  {viewItems.map((item) => (
                    <div key={item.id} style={{ breakInside: "avoid", marginBottom: isMobile ? 10 : 12 }}>
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
      {showTorrent && (
        <TorrentViewer
          item={showTorrent}
          onClose={() => setShowTorrent(null)}
          onOpenResolved={openResolvedTorrentItem}
        />
      )}
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

const collectionPill = (active) => ({
  display: "inline-flex", alignItems: "center", gap: 2,
  maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  padding: "6px 11px",
  background: active ? "rgba(255,255,255,0.1)" : "#111",
  border: `1px solid ${active ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.06)"}`,
  borderRadius: 8, color: active ? "#fff" : "#8a8a8a",
  cursor: "pointer", fontSize: 12, fontWeight: active ? 700 : 500,
  flexShrink: 0
});

const EmptyState = ({ icon, title, sub, action, actionLabel }) => (
  <div style={{ textAlign: "center", padding: "90px 20px" }}>
    <div style={{ marginBottom: 16, color: "#3f3f3f", display: "flex", justifyContent: "center" }}>
      <Icon name={icon || "inbox"} size={42} />
    </div>
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
