"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import Icon from "@/components/Icons";
import Player from "@/components/Player";
import SyncStatus from "@/components/SyncStatus";
import MediaCard from "./MediaCard";
import AddMediaSheet from "./AddMediaSheet";
import DetailDrawer from "./DetailDrawer";
import InAppBrowser from "@/components/InAppBrowser";
import ImportMediaWorkspace from "@/components/ImportMediaWorkspace";
import GoogleDriveBackup from "@/components/GoogleDriveBackup";
import { isHiddenLibraryItem, withLibraryVisibility } from "@/lib/library-visibility.mjs";

import {
  supabase, getVaultItems, getUserData, getFolders, getCoverLibrary,
  upsertVaultItem, removeVaultItem, deleteVaultMedia,
  toggleFavorite, setItemFolder, setItemRating,
  createFolder, recordItemView, recordItemOil, addMomentMark,
} from "@/lib/supabase";
import { mergeRemoteItemsWithOutbox } from "@/lib/sync-outbox";
import { ensureProxySession, SECURITY_V2_ENABLED } from "@/lib/security-session";
import { getSourceMeta, SOURCE_OPTIONS } from "@/lib/sources";
import { resolveMediaPreviews } from "@/lib/media-preview";
import { proxiedMediaUrl } from "@/lib/utils";

const NAV = [
  ["home", "/", "home", "Home"],
  ["library", "/library", "grid", "Library"],
  ["inbox", "/inbox", "inbox", "Inbox"],
  ["collections", "/collections", "folder", "Collections"],
  ["search", "/search", "search", "Search"],
  ["import", "/import", "download", "Import Media"],
  ["settings", "/settings", "settings", "Settings"],
];

const MOBILE_NAV = [
  ["home", "/", "home", "Home"],
  ["library", "/library", "grid", "Browse"],
  ["search", "/search", "search", "Discover"],
  ["collections", "/collections", "folder", "Collections"],
  ["add", "#add", "plus", "Add"],
];

const ROUTE_TITLES = {
  home: "Home", library: "Library", inbox: "Inbox",
  collections: "Collections", search: "Search", settings: "Settings",
  import: "Import Media",
};

function folderFor(item, state) {
  return item?.folder || state?.folder || "";
}

function mediaType(item) {
  const source = getSourceMeta(item?.url || "").id;
  const raw = String(item?.type || "").toLowerCase();
  if (raw === "image" || source === "image") return "image";
  if (raw === "pdf" || source === "pdf") return "pdf";
  if (raw === "video" || ["youtube","vimeo","drive","tiktok","facebook","instagram","twitch","twitch-vod","twitch-clip","dailymotion","streamable","wistia","dropbox","hls","file"].includes(source)) return "video";
  if (raw === "audio" || source === "audio") return "audio";
  return "link";
}

function matchesQuery(item, state, query) {
  if (!query.trim()) return true;
  const source = getSourceMeta(item.url || "").name;
  const text = [
    item.title, item.url, item.note, folderFor(item, state), source,
    ...(Array.isArray(item.tags) ? item.tags : []),
  ].filter(Boolean).join(" ").toLowerCase();
  return text.includes(query.trim().toLowerCase());
}

function EmptyState({ icon="inbox", title, text, action, actionLabel }) {
  return (
    <div className="v2-empty">
      <div>
        <Icon name={icon} size={30}/>
        <h2>{title}</h2>
        <p>{text}</p>
        {action ? <button type="button" className="v2-btn v2-btn-primary" onClick={action}>{actionLabel}</button> : null}
      </div>
    </div>
  );
}

function LoadingGrid() {
  return <div className="v2-grid" aria-label="Loading library">{Array.from({length:10}).map((_,i)=><div className="v2-skeleton" key={i}/>)}</div>;
}

function MediaRow({ title, subtitle, items, userData, onOpen, onSeeAll }) {
  if (!items.length) return null;
  return (
    <section className="v2-section">
      <div className="v2-section-head">
        <div><h2 className="v2-section-title">{title}</h2>{subtitle ? <div className="v2-section-sub">{subtitle}</div> : null}</div>
        {onSeeAll ? <button className="v2-linkbtn" type="button" onClick={onSeeAll}>See all</button> : null}
      </div>
      <div className="v2-row">
        {items.map((item)=><MediaCard key={item.key} item={item} state={userData[item.key] || {}} onOpen={onOpen}/>)}
      </div>
    </section>
  );
}

function FeaturedStage({ item, state, onWatch, onDetails, onBrowse }) {
  if (!item) return null;
  const cover = item.display_thumbnail || item.thumbnail || (mediaType(item) === "image" ? item.url : "");
  const type = mediaType(item);
  const progress = Number(state?.progress || 0);
  const duration = Number(state?.duration || 0);
  const inProgress = duration > 0 && progress > 5 && progress / duration < .95;
  return <section className="v2-featured" aria-label="Featured from your Vault">
    <div className="v2-featured-art" aria-hidden="true">
      {cover ? <img src={proxiedMediaUrl(cover)} alt="" decoding="async" onError={e=>{e.currentTarget.style.opacity="0"}}/> : null}
    </div>
    <div className="v2-featured-copy">
      <div className="v2-featured-kicker"><span className="v2-live-dot"/> {inProgress?"CONTINUE WATCHING":"FROM YOUR VAULT"}</div>
      <h1>{item.title || "Ready when you are"}</h1>
      <p>{[getSourceMeta(item.url || "").name, type==="video"?"Video":type==="image"?"Image":type==="audio"?"Audio":"Saved media",item.folder].filter(Boolean).join(" · ")}</p>
      <div className="v2-featured-actions">
        <button type="button" className="v2-btn v2-btn-primary" onClick={()=>onWatch(item)}><Icon name={type==="image"?"zoomIn":"play"} size={18}/> {inProgress?"Resume":type==="image"?"View image":"Watch now"}</button>
        <button type="button" className="v2-btn v2-btn-secondary" onClick={()=>onDetails(item)}><Icon name="info" size={17}/> Details</button>
      </div>
    </div>
    <button type="button" className="v2-featured-browse" onClick={onBrowse}>Browse your library <Icon name="chevronRight" size={16}/></button>
  </section>;
}

function CollectionCard({ folder, items, onOpen }) {
  const covers = items.map((item) => item.display_thumbnail || item.thumbnail).filter(Boolean).slice(0, 3);
  const tone = [...folder.name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 5;
  return (
    <button type="button" className="v2-collection v2-collection-preview" onClick={onOpen}
      aria-label={`Open collection ${folder.name}, ${items.length} saved items`}>
      <div className={`v2-collection-covers v2-tone-${tone}`} data-count={covers.length} aria-hidden="true">
        <div className="v2-collection-artwork"><span className="v2-collection-artwork-overline">VAULT COLLECTION</span><strong>{folder.name}</strong><span className="v2-collection-artwork-symbol"><Icon name="folder" size={28}/></span></div>
        {covers.length ? covers.map((url, index) => (
          <div className="v2-collection-cover" key={url + index}>
            <img src={proxiedMediaUrl(url)} alt="" loading="lazy" decoding="async"
              onError={(event) => { event.currentTarget.style.opacity = "0"; }} />
          </div>
        )) : null}
      </div>
      <div className="v2-collection-footer">
        <div className="v2-collection-labels">
          <div className="v2-collection-name" title={folder.name}>{folder.name}</div>
          <div className="v2-collection-count">{items.length} item{items.length === 1 ? "" : "s"}{folder.parent_folder ? ` · in ${folder.parent_folder}` : ""}</div>
        </div>
        <Icon name="chevronRight" size={17}/>
      </div>
    </button>
  );
}

function FilterFields({ filters, setFilters, folders }) {
  return (
    <>
      <select className="v2-filter" aria-label="Filter by type" value={filters.type} onChange={(e)=>setFilters((x)=>({...x,type:e.target.value}))}>
        <option value="all">All types</option><option value="video">Video</option><option value="image">Images</option><option value="audio">Audio</option><option value="pdf">PDFs</option><option value="link">Links</option>
      </select>
      <select className="v2-filter" aria-label="Filter by collection" value={filters.collection} onChange={(e)=>setFilters((x)=>({...x,collection:e.target.value}))}>
        <option value="all">All collections</option><option value="inbox">Inbox</option>
        {folders.map((f)=><option key={f.name} value={f.name}>{f.name}</option>)}
      </select>
      <select className="v2-filter" aria-label="Filter by source" value={filters.source} onChange={(e)=>setFilters((x)=>({...x,source:e.target.value}))}>
        <option value="all">All sources</option>
        {SOURCE_OPTIONS.map((s)=><option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <select className="v2-filter" aria-label="Filter by favorite" value={filters.favorite} onChange={(e)=>setFilters((x)=>({...x,favorite:e.target.value}))}>
        <option value="all">Any favorite</option><option value="yes">Favorites</option><option value="no">Not favorited</option>
      </select>
      <select className="v2-filter" aria-label="Filter by rating" value={filters.rating} onChange={(e)=>setFilters((x)=>({...x,rating:e.target.value}))}>
        <option value="all">Any rating</option><option value="5">5 stars</option><option value="4">4+ stars</option><option value="3">3+ stars</option>
      </select>
      <select className="v2-filter" aria-label="Filter by watch status" value={filters.status} onChange={(e)=>setFilters((x)=>({...x,status:e.target.value}))}>
        <option value="all">Any status</option><option value="continue">In progress</option><option value="unwatched">Not started</option><option value="complete">Completed</option>
      </select>
    </>
  );
}

function MobileControlSheet({ kind, filters, setFilters, sort, setSort, folders, onClose, onReset }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!kind || !ref.current) return;
    const root = ref.current;
    const before = document.activeElement;
    root.querySelector("select,button")?.focus();
    const handler = (event) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const nodes = [...root.querySelectorAll('button:not([disabled]),select:not([disabled]),input:not([disabled]),textarea:not([disabled]),[href]')];
      if (!nodes.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handler);
    return () => { document.removeEventListener("keydown", handler); before?.focus?.(); };
  }, [kind, onClose]);
  if (!kind) return null;
  return (
    <>
      <div className="v2-backdrop" onMouseDown={onClose} aria-hidden="true"/>
      <section ref={ref} className="v2-sheet" role="dialog" aria-modal="true" aria-label={kind==="sort"?"Sort library":"Filter library"}>
        <div className="v2-sheet-head">
          <div className="v2-modal-title">{kind==="sort"?"Sort":"Filters"}</div>
          <button type="button" className="v2-iconbtn" onClick={onClose} aria-label="Close"><Icon name="x" size={18}/></button>
        </div>
        <div className="v2-sheet-body" style={{display:"grid",gap:12}}>
          {kind==="sort" ? (
            <select className="v2-select" value={sort} onChange={(e)=>setSort(e.target.value)} aria-label="Sort results">
              <option value="added">Recently added</option><option value="viewed">Recently viewed</option><option value="alpha">A–Z</option><option value="rating">Rating</option>
            </select>
          ) : <FilterFields filters={filters} setFilters={setFilters} folders={folders}/>}
        </div>
        <div className="v2-sheet-foot">
          {kind === "filters" ? <button type="button" className="v2-btn" onClick={() => { onReset?.(); onClose(); }}>Clear filters</button> : null}
          <button type="button" className="v2-btn v2-btn-primary" onClick={onClose}>Done</button>
        </div>
      </section>
    </>
  );
}

export default function VaultV2({ route = "home" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchRef = useRef(null);
  const newCollectionRef = useRef(null);
  const reactingKeys = useRef(new Set());

  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [userData, setUserData] = useState({});
  const [folders, setFolders] = useState([]);
  const [coverLibrary, setCoverLibrary] = useState([]);
  const [activityRevision, setActivityRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [online, setOnline] = useState(true);
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [debouncedQuery, setDebouncedQuery] = useState(searchParams.get("q") || "");
  const routeStatus = searchParams.get("status") === "continue" ? "continue" : "all";
  const routeType = ["video","image","audio","pdf","link"].includes(searchParams.get("type")) ? searchParams.get("type") : "all";
  const routeFavorite = searchParams.get("favorite")==="yes" ? "yes" : "all";
  const [filters, setFilters] = useState({ type:routeType, collection:"all", source:"all", favorite:routeFavorite, rating:"all", status:routeStatus });
  const [sort, setSort] = useState("added");
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [detailItem, setDetailItem] = useState(null);
  const [playerItem, setPlayerItem] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [mobileControl, setMobileControl] = useState(null);
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [mobileBrowser, setMobileBrowser] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [collectionBusy, setCollectionBusy] = useState(false);
  const [collectionError, setCollectionError] = useState("");
  const collectionBusyRef = useRef(false);
  useEffect(() => { collectionBusyRef.current = collectionBusy; }, [collectionBusy]);
  useEffect(() => { if (newCollectionOpen) setCollectionError(""); }, [newCollectionOpen]);
  const [visibleLimit, setVisibleLimit] = useState(60);
  const [visibilityError, setVisibilityError] = useState("");

  const selectedCollection = searchParams.get("folder") || "";
  useEffect(() => {
    setFilters((previous) => previous.status === routeStatus && previous.type === routeType && previous.favorite === routeFavorite
      ? previous : { ...previous, status:routeStatus, type:routeType, favorite:routeFavorite });
  }, [routeStatus,routeType,routeFavorite]);

  const dialogOpen = !!(detailItem || playerItem || addOpen || editItem || mobileControl || newCollectionOpen || browserOpen);
  useEffect(() => {
    if (!dialogOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [dialogOpen]);


  const refresh = useCallback(async (userId) => {
    const id = userId || user?.id;
    if (!id) return;
    const [remoteItems, data, remoteFolders, remoteCovers] = await Promise.all([
      getVaultItems(id), getUserData(id), getFolders(id), getCoverLibrary(id),
    ]);
    setItems(mergeRemoteItemsWithOutbox(remoteItems));
    setUserData(data || {});
    setFolders(remoteFolders || []);
    setCoverLibrary(remoteCovers || []);
  }, [user?.id]);

  useEffect(() => {
    let active = true;
    const boot = async () => {
      setLoading(true); setLoadError("");
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        const session = data.session;
        const u = session?.user || null;
        if (!active) return;
        setUser(u);
        if (u && SECURITY_V2_ENABLED && session) {
          try { await ensureProxySession(session); } catch {}
        }
        if (u) await refresh(u.id);
      } catch (e) {
        if (active) setLoadError(e?.message || "Could not load your Vault.");
      } finally {
        if (active) setLoading(false);
      }
    };
    boot();
    return () => { active = false; };
  }, [refresh]);

  const routeQuery = searchParams.get("q") || "";
  useEffect(() => {
    setQuery(routeQuery);
  }, [routeQuery]);

  useEffect(() => {
    if (!SECURITY_V2_ENABLED || !user?.id) return;
    const renew = () => { if (!document.hidden) ensureProxySession().catch(() => {}); };
    const interval = window.setInterval(renew, 10 * 60 * 1000);
    document.addEventListener("visibilitychange", renew);
    window.addEventListener("focus", renew);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", renew);
      window.removeEventListener("focus", renew);
    };
  }, [user?.id]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setVisibleLimit(60);
  }, [route, debouncedQuery, filters, sort, selectedCollection]);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    const syncMobile = () => setMobileBrowser(window.matchMedia("(max-width: 899px)").matches);
    sync(); syncMobile();
    window.addEventListener("online",sync); window.addEventListener("offline",sync);
    window.addEventListener("resize", syncMobile);
    return () => {
      window.removeEventListener("online",sync);
      window.removeEventListener("offline",sync);
      window.removeEventListener("resize", syncMobile);
    };
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase()==="k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown",handler);
    return () => window.removeEventListener("keydown",handler);
  }, []);

  useEffect(() => {
    if (!newCollectionOpen || !newCollectionRef.current) return;
    const root = newCollectionRef.current;
    const before = document.activeElement;
    root.querySelector("input,button")?.focus();
    const handler = (event) => {
      if (event.key === "Escape") { event.preventDefault(); if (!collectionBusyRef.current) setNewCollectionOpen(false); return; }
      if (event.key !== "Tab") return;
      const nodes = [...root.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[href]')];
      if (!nodes.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handler);
    return () => { document.removeEventListener("keydown", handler); before?.focus?.(); };
  }, [newCollectionOpen]);

  const saveItem = async (item) => {
    if (!user) throw new Error("Sign in before saving media.");
    // Do not show a successful save until Supabase (or the sync outbox) accepts it.
    // On failure, the caller keeps its draft open for retry.
    await upsertVaultItem(user.id, item);
    if (item.previousKey && item.previousKey !== item.key) await removeVaultItem(user.id, item.previousKey);
    setItems((prev) => [item, ...prev.filter((x) => x.key !== item.key && x.key !== item.previousKey)]);
    fetch("/api/sheets-sync", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"upsert",...item})}).catch(()=>{});
    setDetailItem((current) => current?.key === item.previousKey || current?.key === item.key ? item : current);
  };

  const setItemVisibility = async (item, hidden) => {
    if (!user) throw new Error("Sign in to change library visibility.");
    const next = withLibraryVisibility(item, hidden);
    setVisibilityError("");
    try {
      await upsertVaultItem(user.id, next);
      setItems((prev) => prev.map((x) => x.key === item.key ? next : x));
      if (hidden) { setDetailItem(null); setPlayerItem(null); }
    } catch (error) {
      setVisibilityError(error.message || "Could not change library visibility.");
      throw error;
    }
  };

  const deleteItem = async (item) => {
    if (user && item?.isUploadedMedia && item?.canonical_url) {
      await deleteVaultMedia(user.id,item.canonical_url);
    }
    if (user) await removeVaultItem(user.id,item.key);
    setItems((prev)=>prev.filter((x)=>x.key!==item.key));
    setDetailItem(null);
    fetch("/api/sheets-sync",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"delete",key:item.key})}).catch(()=>{});
  };

  const createCollection = async (name) => {
    const clean=String(name||"").trim();
    if(!clean) return null;
    const existing=folders.find((f)=>f.name.toLowerCase()===clean.toLowerCase());
    if(existing) return existing.name;
    if(!user) throw new Error("Sign in before creating a collection.");
    await createFolder(user.id,clean,{kind:"folder",display_mode:"grid"});
    setFolders((prev)=>prev.some((f)=>f.name.toLowerCase()===clean.toLowerCase())?prev:[...prev,{name:clean,kind:"folder",display_mode:"grid",parent_folder:null}].sort((a,b)=>a.name.localeCompare(b.name)));
    return clean;
  };

  const toggleFav = async (key,current) => {
    if(user) await toggleFavorite(user.id,key,current);
    setUserData((prev)=>({...prev,[key]:{...(prev[key]||{}),item_key:key,favorite:!current}}));
  };

  const assignFolder = async (item, folder) => {
    if (!user) throw new Error("Sign in before organizing media.");
    const value = folder || null;
    // Keep the selected collection consistent with the durable row. On a write
    // failure the drawer stays open with the previous selection for retry.
    await upsertVaultItem(user.id, { ...item, folder: value });
    await setItemFolder(user.id, item.key, value);
    setItems((prev) => prev.map((x) => x.key === item.key ? { ...x, folder: value } : x));
    setUserData((prev) => ({ ...prev, [item.key]: { ...(prev[item.key] || {}), item_key: item.key, folder: value } }));
    setDetailItem((cur) => cur?.key === item.key ? { ...cur, folder: value } : cur);
  };

  const rateItem = async (key,rating) => {
    if(user) await setItemRating(user.id,key,rating||null);
    setUserData((prev)=>({...prev,[key]:{...(prev[key]||{}),item_key:key,rating:rating||null,rated_at:rating?new Date().toISOString():null}}));
  };

  const reactToItem = async (item) => {
    if (!user || !item?.key || reactingKeys.current.has(item.key)) return;
    reactingKeys.current.add(item.key);
    try {
      const result = await recordItemOil(user.id, item.key);
      if (result) setUserData((prev) => ({ ...prev, [item.key]: {
        ...(prev[item.key] || {}), item_key: item.key,
        oil_count: result.oil_count, last_oiled_at: result.last_oiled_at,
      } }));
    } finally {
      reactingKeys.current.delete(item.key);
    }
  };

  const play = async (item) => {
    setPlayerItem(item);
    if(user){
      setUserData((prev)=>({...prev,[item.key]:{...(prev[item.key]||{}),item_key:item.key,view_count:Number(prev[item.key]?.view_count||0)+1,last_viewed_at:new Date().toISOString()}}));
      recordItemView(user.id,item.key).catch(()=>{});
    }
  };

  const displayItems = useMemo(
    () => resolveMediaPreviews(items, coverLibrary).filter((item) => !isHiddenLibraryItem(item)),
    [items, coverLibrary]
  );
  const hiddenItems = useMemo(() => items.filter(isHiddenLibraryItem), [items]);

  const allFiltered = useMemo(() => {
    let result = displayItems.filter((item)=>{
      const state=userData[item.key]||{};
      if(!matchesQuery(item,state,debouncedQuery)) return false;
      if(filters.type!=="all" && mediaType(item)!==filters.type) return false;
      const folder=folderFor(item,state);
      if(filters.collection==="inbox" && folder) return false;
      if(filters.collection!=="all" && filters.collection!=="inbox" && folder!==filters.collection) return false;
      const source=getSourceMeta(item.url||"").id;
      if(filters.source!=="all" && source!==filters.source) return false;
      if(filters.favorite==="yes" && !state.favorite) return false;
      if(filters.favorite==="no" && state.favorite) return false;
      if(filters.rating!=="all" && Number(state.rating||0)<Number(filters.rating)) return false;
      const p=Number(state.progress||0),d=Number(state.duration||0),ratio=d>0?p/d:0;
      if(filters.status==="continue" && !(p>5&&d>0&&ratio<.95)) return false;
      if(filters.status==="unwatched" && p>5) return false;
      if(filters.status==="complete" && !(d>0&&ratio>=.95)) return false;
      return true;
    });
    result=[...result].sort((a,b)=>{
      const ad=userData[a.key]||{},bd=userData[b.key]||{};
      if(sort==="alpha") return String(a.title||"").localeCompare(String(b.title||""));
      if(sort==="rating") return Number(bd.rating||0)-Number(ad.rating||0);
      if(sort==="viewed") return new Date(bd.last_viewed_at||bd.updated_at||0)-new Date(ad.last_viewed_at||ad.updated_at||0);
      return new Date(b.addedAt||0)-new Date(a.addedAt||0);
    });
    return result;
  },[displayItems,userData,debouncedQuery,filters,sort]);

  const inboxItems = useMemo(()=>displayItems.filter((i)=>!folderFor(i,userData[i.key]||{})),[displayItems,userData]);
  const continueItems = useMemo(()=>displayItems.filter((i)=>{const d=userData[i.key]||{};return d.progress>5&&d.duration>0&&d.progress/d.duration<.95}).sort((a,b)=>new Date(userData[b.key]?.updated_at||0)-new Date(userData[a.key]?.updated_at||0)).slice(0,8),[displayItems,userData]);
  const recentItems = useMemo(()=>[...displayItems].sort((a,b)=>new Date(b.addedAt||0)-new Date(a.addedAt||0)).slice(0,12),[displayItems]);
  const videoItems = useMemo(()=>[...displayItems].filter((i)=>mediaType(i)==="video").sort((a,b)=>new Date(b.addedAt||0)-new Date(a.addedAt||0)).slice(0,12),[displayItems]);
  const imageItems = useMemo(()=>[...displayItems].filter((i)=>mediaType(i)==="image").sort((a,b)=>new Date(b.addedAt||0)-new Date(a.addedAt||0)).slice(0,12),[displayItems]);
  const favoriteItems = useMemo(()=>[...displayItems].filter((i)=>userData[i.key]?.favorite).sort((a,b)=>new Date(b.addedAt||0)-new Date(a.addedAt||0)).slice(0,12),[displayItems,userData]);
  const featuredItem = continueItems[0] || videoItems[0] || recentItems[0] || null;
  const topRated = useMemo(()=>displayItems.filter((i)=>userData[i.key]?.rating).sort((a,b)=>Number(userData[b.key]?.rating||0)-Number(userData[a.key]?.rating||0)).slice(0,8),[displayItems,userData]);
  const recentFolders = useMemo(()=>[...folders].sort((a,b)=>new Date(b.last_viewed_at||b.updated_at||0)-new Date(a.last_viewed_at||a.updated_at||0)).slice(0,6),[folders]);

  const collectionItems = useMemo(()=>selectedCollection ? displayItems.filter((i)=>folderFor(i,userData[i.key]||{})===selectedCollection) : [],[displayItems,userData,selectedCollection]);

  const detailContextItems = useMemo(() => {
    if (route === "inbox") return inboxItems;
    if (route === "collections" && selectedCollection) return collectionItems;
    if (route === "library" || route === "search") return allFiltered;
    return displayItems;
  }, [route, selectedCollection, inboxItems, collectionItems, allFiltered, displayItems]);

  const detailIndex = detailItem ? detailContextItems.findIndex((item) => item.key === detailItem.key) : -1;

  const globalSearchSubmit=(e)=>{
    e.preventDefault();
    router.push(query.trim()?"/search?q="+encodeURIComponent(query.trim()):"/search");
  };

  const resetFilters=()=>{
    setFilters({type:"all",collection:"all",source:"all",favorite:"all",rating:"all",status:"all"});
    if (route === "library" && (routeStatus !== "all" || routeType !== "all" || routeFavorite !== "all")) router.replace("/library");
  };
  const activeFilterCount = Object.values(filters).filter((value) => value !== "all").length;

  const renderGrid=(list,emptyTitle="Nothing here yet",emptyText="Items matching this view will appear here.",emptyOptions={})=>{
    if(loading) return <LoadingGrid/>;
    if(loadError) return <div className="v2-error" role="status">Library data could not be loaded. Retry before adding or deleting media.</div>;
    if(!list.length) return <EmptyState title={emptyTitle} text={emptyText} action={emptyOptions.action || (()=>setAddOpen(true))} actionLabel={emptyOptions.label || "Add media"}/>;
    const visible = list.slice(0, visibleLimit);
    return <>
      <div className="v2-grid">{visible.map((item)=><MediaCard key={item.key} item={item} state={userData[item.key]||{}} onOpen={setDetailItem}/>)}</div>
      {visibleLimit < list.length ? <div style={{display:"flex",justifyContent:"center",marginTop:28}}><button type="button" className="v2-btn" onClick={()=>setVisibleLimit((n)=>n+60)}>Load 60 more</button></div> : null}
    </>;
  };

  const filtersBar=(
    <>
      <div className="v2-toolbar v2-toolbar-desktop v2-browse-toolbar">
        <div className="v2-browse-types" role="group" aria-label="Media type">
          {[["all","All"],["video","Videos"],["image","Images"],["audio","Audio"],["link","Links"]].map(([type,label]) =>
            <button type="button" key={type} aria-pressed={filters.type===type} onClick={()=>setFilters(previous=>({...previous,type}))}>{label}</button>)}
        </div>
        <div className="v2-browse-utility">
          <span className="v2-result-count">{allFiltered.length} title{allFiltered.length===1?"":"s"}</span>
          <select className="v2-filter" aria-label="Sort library" value={sort} onChange={(e)=>setSort(e.target.value)}>
            <option value="added">Recently added</option><option value="viewed">Recently viewed</option><option value="alpha">A–Z</option><option value="rating">Rating</option>
          </select>
          <button type="button" className="v2-btn v2-advanced-toggle" aria-expanded={advancedFiltersOpen} onClick={()=>setAdvancedFiltersOpen(v=>!v)}><Icon name="sort" size={16}/> Filters{activeFilterCount ? ` · ${activeFilterCount}` : ""}</button>
        </div>
      </div>
      {advancedFiltersOpen && <div className="v2-advanced-filters" aria-label="Advanced library filters"><FilterFields filters={filters} setFilters={setFilters} folders={folders}/><button type="button" className="v2-btn" onClick={resetFilters}>Clear all</button></div>}
      <div className="v2-mobile-controls">
        <button type="button" className="v2-btn" onClick={()=>setMobileControl("filters")}><Icon name="sort" size={15}/> Filters{activeFilterCount ? ` · ${activeFilterCount}` : ""}</button>
        <button type="button" className="v2-btn" onClick={()=>setMobileControl("sort")}><Icon name="list" size={15}/> Sort</button>
      </div>
    </>
  );

  let page;
  if(route==="home") {
    page = (
      <div className="v2-watch-home">
        {!loading && !loadError && featuredItem ? <FeaturedStage item={featuredItem} state={userData[featuredItem.key]||{}} onWatch={play} onDetails={setDetailItem} onBrowse={()=>router.push("/library")}/> : null}
        {loading ? <LoadingGrid/> : null}
        {!loading && !loadError && !displayItems.length ? <section className="v2-newcomer"><span className="v2-eyebrow">WELCOME TO VAULT</span><h1>Your own private streaming library.</h1><p>Save a video, photo, or gallery. Your home screen will fill with the things you want to return to.</p><button type="button" className="v2-btn v2-btn-primary" onClick={()=>setAddOpen(true)}>Add your first title</button></section> : null}
        <MediaRow title="Continue Watching" subtitle="Start right where you left off" items={continueItems} userData={userData} onOpen={setDetailItem} onSeeAll={()=>router.push("/library?status=continue")}/>
        <MediaRow title="Recently Added" subtitle="The latest in your library" items={recentItems} userData={userData} onOpen={setDetailItem} onSeeAll={()=>router.push("/library")}/>
        <MediaRow title="Your Videos" subtitle="Ready to play" items={videoItems} userData={userData} onOpen={setDetailItem} onSeeAll={()=>router.push("/library?type=video")}/>
        {recentFolders.length ? <section className="v2-section v2-home-collections"><div className="v2-section-head"><div><h2 className="v2-section-title">Your Collections</h2><div className="v2-section-sub">Pick a collection and keep exploring</div></div><button className="v2-linkbtn" onClick={()=>router.push("/collections")}>See all</button></div><div className="v2-collection-grid">{recentFolders.map((f)=><CollectionCard key={f.name} folder={f} items={displayItems.filter((i)=>folderFor(i,userData[i.key]||{})===f.name)} onOpen={()=>router.push("/collections?folder="+encodeURIComponent(f.name))}/>)}</div></section> : null}
        <MediaRow title="Your Favorites" items={favoriteItems} userData={userData} onOpen={setDetailItem} onSeeAll={()=>router.push("/library?favorite=yes")}/>
        <MediaRow title="Photos & Artwork" items={imageItems} userData={userData} onOpen={setDetailItem} onSeeAll={()=>router.push("/library?type=image")}/>
      </div>
    );
  } else if(route==="library") {
    page = <><div className="v2-hero"><div className="v2-eyebrow">Everything you saved</div><h1 className="v2-h1">Library</h1><p className="v2-lead">One clean view of your entire Vault.</p></div>{filtersBar}{renderGrid(allFiltered,"No matching media","Try clearing filters or add something new.", activeFilterCount ? {action:resetFilters,label:"Clear filters"} : {})}</>;
  } else if(route==="inbox") {
    page = <><div className="v2-hero"><div className="v2-eyebrow">{inboxItems.length} waiting</div><h1 className="v2-h1">Inbox</h1><p className="v2-lead">Anything saved without a Collection lands here. Assign a Collection from item detail when you are ready.</p></div>{renderGrid(inboxItems,"Inbox cleared","Every saved item is organized into a Collection.")}</>;
  } else if(route==="search") {
    page = <>
      <div className="v2-hero">
        <div className="v2-eyebrow">Find anything</div>
        <h1 className="v2-h1">{query ? "Results for “"+query+"”" : "Search"}</h1>
        <p className="v2-lead">Search your Vault first, or safely search the web and save a result directly into your library.</p>
      </div>
      <div className="v2-web-search-card">
        <div>
          <div className="v2-section-title">Search outside Vault</div>
          <div className="v2-section-sub">Server-side search results only. Preview when allowed, then save the source URL into Vault.</div>
        </div>
        <button type="button" className="v2-btn v2-btn-primary" onClick={()=>setBrowserOpen(true)}>
          <Icon name="search" size={15}/> Search the web
        </button>
      </div>
      {filtersBar}
      {query.trim()?renderGrid(allFiltered,"No Vault results","Try web search for this phrase, or clear a filter.", {action:()=>setBrowserOpen(true),label:"Search the web"}):<EmptyState icon="search" title="Search your Vault" text="Use the search field above, or search the web for something new to save." action={()=>setBrowserOpen(true)} actionLabel="Search the web"/>}
    </>;
  } else if(route==="import") {
    page = <ImportMediaWorkspace userId={user?.id} folders={folders} items={displayItems}
      onSave={saveItem} onCreateFolder={createCollection} />;
  } else if(route==="collections") {
    page = selectedCollection ? <><div className="v2-hero"><button className="v2-linkbtn" onClick={()=>router.push("/collections")}>← All Collections</button><div className="v2-eyebrow">Collection</div><h1 className="v2-h1">{selectedCollection}</h1><p className="v2-lead">{collectionItems.length} item{collectionItems.length===1?"":"s"}</p></div>{renderGrid(collectionItems,"Collection is empty","Add media and choose this Collection as its destination.")}</> : <><div className="v2-hero"><div className="v2-eyebrow">Organize without clutter</div><h1 className="v2-h1">Collections</h1><p className="v2-lead">Folders and galleries share one simple product concept: Collections.</p></div><div style={{display:"flex",justifyContent:"flex-end",marginBottom:16}}><button className="v2-btn v2-btn-primary" onClick={()=>setNewCollectionOpen(true)}><Icon name="plus" size={15}/> New Collection</button></div>{folders.length?<div className="v2-collection-grid">{folders.map((f)=><CollectionCard key={f.name} folder={f} items={displayItems.filter((i)=>folderFor(i,userData[i.key]||{})===f.name)} onOpen={()=>router.push("/collections?folder="+encodeURIComponent(f.name))}/>)}</div>:<EmptyState icon="folder" title="No Collections yet" text="Create a Collection to organize related media." action={()=>setNewCollectionOpen(true)} actionLabel="New Collection"/>}</>;
  } else {
    page = <><div className="v2-hero"><div className="v2-eyebrow">Vault preferences</div><h1 className="v2-h1">Settings</h1><p className="v2-lead">Account, data, sync, and security status in one quiet place.</p></div><div className="v2-settings-grid"><div className="v2-settings-card"><h3>Library</h3><p>{displayItems.length} visible items · {hiddenItems.length} hidden items · {folders.length} Collections · {inboxItems.length} in Inbox.</p>
      <div style={{ marginTop: 12 }}>
        <h4 style={{ fontSize: 13, marginBottom: 8 }}>Hidden links</h4>
        <p style={{ fontSize: 12 }}>Removed from the visible library without deleting the URL, cover, or collection.</p>
        {hiddenItems.length === 0 ? <p style={{ fontSize: 12 }}>Nothing hidden.</p> : hiddenItems.map((item) => (
          <div key={item.key} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
            <a href={item.url} target="_blank" rel="noreferrer noopener" style={{ minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", flex: 1, color: "var(--v2-text)", fontSize: 12 }}>{item.title || item.url}</a>
            <button className="v2-btn" type="button" onClick={() => setItemVisibility(item, false).catch(() => {})}>Restore</button>
          </div>
        ))}
      </div><GoogleDriveBackup userId={user?.id} items={displayItems} /></div><div className="v2-settings-card"><h3>Cloud sync</h3><p>Supabase is the durable source of truth. Unsynced changes stay visibly marked until confirmed.</p><div style={{marginTop:12}}><span className="v2-state-pill" data-state={online?"ok":"warn"}>{online?"Online":"Offline"}</span></div></div><div className="v2-settings-card"><h3>Security</h3><p>Authenticated data access, RLS ownership checks, and protected media proxies are active in this preview.</p></div><div className="v2-settings-card"><h3>Import & tools</h3><p>Bring media into your Vault from files, links, Google Sheets, or your browser.</p><button className="v2-btn" type="button" onClick={()=>router.push("/import")} style={{marginTop:14}}><Icon name="download" size={15}/> Open Import Media</button></div><div className="v2-settings-card"><h3>Account</h3><p>{user?.email || "Signed in"}</p><button type="button" className="v2-btn" style={{marginTop:14}} onClick={async()=>{await supabase.auth.signOut();window.location.reload();}}><Icon name="logout" size={15}/> Sign out</button></div></div></>;
  }

  return (
    <div className="v2-root">
      {!online ? <div className="v2-offline" role="status">Offline · changes will stay pending</div> : null}
      <SyncStatus userId={user?.id} onSynced={()=>refresh(user?.id)}/>
      <div className="v2-shell">
        <aside className="v2-sidebar" aria-label="Primary navigation">
          <div className="v2-brand"><span className="v2-brandmark"><Icon name="vault" size={17}/></span><span>Vault</span></div>
          <nav className="v2-nav">
            {NAV.map(([id,href,icon,label])=><Link key={id} href={href} title={label} className="v2-nav-link" aria-current={route===id?"page":undefined}><Icon name={icon} size={17}/><span>{label}</span></Link>)}
            <div className="v2-nav-spacer"/>
            <button type="button" className="v2-btn v2-btn-primary" onClick={()=>setAddOpen(true)}><Icon name="plus" size={15}/> Add media</button>
          </nav>
          <div className="v2-sidebar-foot"><div className="v2-status-card"><strong style={{color:"var(--v2-text)"}}>{items.length} items</strong><br/>{inboxItems.length?inboxItems.length+" waiting in Inbox":"Inbox clear"}</div></div>
        </aside>

        <main className="v2-main">
          <header className="v2-topbar">
            <Link href="/" className="v2-desktop-brand"><span className="v2-brandmark"><Icon name="vault" size={17}/></span><strong>VAULT</strong></Link>
            <nav className="v2-desktop-nav" aria-label="Browse Vault">
              {[["home","/","Home"],["library","/library","Browse"],["search","/search","Discover"],["collections","/collections","Collections"]].map(([id,href,label])=><Link key={id} href={href} aria-current={route===id?"page":undefined}>{label}</Link>)}
            </nav>
            <div className="v2-mobile-title">{ROUTE_TITLES[route]}</div>
            <form className="v2-searchbox" role="search" onSubmit={globalSearchSubmit}>
              <Icon name="search" size={16}/>
              <input ref={searchRef} value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search Vault" aria-label="Search Vault"/>
              <span className="v2-hint v2-keyboard-hint" aria-hidden="true">⌘K</span>
            </form>
            <button type="button" className="v2-btn v2-desktop-add v2-desktop-import" onClick={()=>router.push("/import")}><Icon name="download" size={15}/> Import</button>
            <button type="button" className="v2-btn v2-btn-primary v2-desktop-add" onClick={()=>setAddOpen(true)}><Icon name="plus" size={15}/> Add</button>
            <button type="button" className="v2-iconbtn" onClick={()=>router.push("/settings")} aria-label="Settings"><Icon name="settings" size={17}/></button>
          </header>
          <div className="v2-content">
            {loadError ? <div className="v2-error" role="alert"><span>{loadError}</span><button type="button" className="v2-btn" onClick={()=>refresh(user?.id).then(()=>setLoadError("")).catch((error)=>setLoadError(error?.message || "Could not reload the library."))}>Retry</button></div> : null}
            {page}
          </div>
        </main>
      </div>

      <nav className="v2-mobile-nav" aria-label="Mobile navigation">
        {MOBILE_NAV.map(([id,href,icon,label])=>id==="add"?
          <button key={id} type="button" className="v2-mobile-add" onClick={()=>setAddOpen(true)} aria-label="Add media"><Icon name="plus" size={21}/></button>
          :<Link key={id} href={href} aria-current={route===id?"page":undefined}><Icon name={icon} size={18}/><span>{label}</span></Link>
        )}
      </nav>

      {visibilityError ? <div role="alert" className="v2-error">{visibilityError}<button className="v2-btn" onClick={() => setVisibilityError("")}>Dismiss</button></div> : null}
      <AddMediaSheet open={addOpen||!!editItem} initialItem={editItem} initialFolder={route === "collections" ? selectedCollection : ""} userId={user?.id} onClose={()=>{setAddOpen(false);setEditItem(null)}} onSave={saveItem} folders={folders} onCreateCollection={createCollection}/>
      <DetailDrawer
        key={detailItem?.key || "closed"}
        item={detailItem}
        state={detailItem?userData[detailItem.key]||{}:{}}
        folders={folders}
        userId={user?.id}
        activityRevision={activityRevision}
        currentIndex={detailIndex}
        totalItems={detailContextItems.length}
        onNavigate={(idx)=>{ const next=detailContextItems[idx]; if(next) setDetailItem(next); }}
        onClose={()=>setDetailItem(null)}
        onPlay={play}
        onFavorite={toggleFav}
        onFolder={assignFolder}
        onRating={rateItem}
        onEdit={(item)=>{setEditItem(item);setDetailItem(null)}}
        onDelete={deleteItem}
        onRemoveFromLibrary={(item) => setItemVisibility(item, true)}
      />

      <MobileControlSheet kind={mobileControl} filters={filters} setFilters={setFilters} sort={sort} setSort={setSort} folders={folders} onReset={resetFilters} onClose={()=>setMobileControl(null)}/>

      {browserOpen ? (
        <InAppBrowser
          onClose={()=>setBrowserOpen(false)}
          onSave={saveItem}
          folders={folders}
          existingItems={displayItems}
          isMobile={mobileBrowser}
          onCreateFolder={createCollection}
          initialQuery={query}
        />
      ) : null}

      {newCollectionOpen ? <>
        <div className="v2-backdrop" onMouseDown={()=>{if(!collectionBusy)setNewCollectionOpen(false)}} aria-hidden="true"/>
        <section ref={newCollectionRef} className="v2-sheet" role="dialog" aria-modal="true" aria-labelledby="v2-new-collection-title" style={{maxWidth:460}}>
          <div className="v2-sheet-head"><div className="v2-modal-title" id="v2-new-collection-title">New Collection</div><button type="button" disabled={collectionBusy} className="v2-iconbtn" onClick={()=>setNewCollectionOpen(false)} aria-label="Close"><Icon name="x" size={18}/></button></div>
          <div className="v2-sheet-body">{collectionError ? <div className="v2-error" role="alert">{collectionError}</div> : null}<div className="v2-field"><label htmlFor="v2-collection-name">Name</label><input id="v2-collection-name" autoFocus className="v2-input" value={newCollectionName} onChange={(e)=>setNewCollectionName(e.target.value)} onKeyDown={(e)=>{if(e.key==="Enter")document.getElementById("v2-create-collection")?.click()}} placeholder="Ideas, Lighting, Family…"/></div></div>
          <div className="v2-sheet-foot"><button type="button" className="v2-btn" disabled={collectionBusy} onClick={()=>setNewCollectionOpen(false)}>Cancel</button><button id="v2-create-collection" className="v2-btn v2-btn-primary" disabled={!newCollectionName.trim()||collectionBusy} onClick={async()=>{setCollectionBusy(true);setCollectionError("");try{await createCollection(newCollectionName);setNewCollectionName("");setNewCollectionOpen(false)}catch(error){setCollectionError(error?.message || "Could not create collection. Try again.")}finally{setCollectionBusy(false)}}}>{collectionBusy?"Creating…":"Create"}</button></div>
        </section>
      </> : null}

      {playerItem ? <Player
        item={playerItem}
        items={displayItems}
        currentIdx={Math.max(0,displayItems.findIndex((x)=>x.key===playerItem.key))}
        onNavigate={(idx)=>setPlayerItem(displayItems[idx])}
        onClose={()=>setPlayerItem(null)}
        onRemoveFromLibrary={(item) => setItemVisibility(item, true)}
        userId={user?.id}
        resumeAt={userData[playerItem.key]?.progress||0}
        rating={userData[playerItem.key]?.rating||0}
        onRate={(rating)=>rateItem(playerItem.key,rating)}
        onAddMoment={async (mark)=>{
          if(!user) return null;
          const saved = await addMomentMark(user.id,playerItem.key,mark);
          setActivityRevision((n)=>n+1);
          return saved;
        }}
        variant="integrated"
        oilCount={Number(userData[playerItem.key]?.oil_count||0)}
        onOil={()=>reactToItem(playerItem)}
      /> : null}
    </div>
  );
}
