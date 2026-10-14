"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase, getFolders, createFolder, upsertVaultItem } from "@/lib/supabase";
import { parseCapturedMedia, buildVaultMediaItem } from "@/lib/media-capture-import.mjs";
import { itemKey, sourceIdOf } from "@/lib/utils";
import { getThumbCandidates } from "@/lib/sources";

const PENDING_KEY = "vault-chrome-folder-picker";
const MAX_ITEMS = 300;
const MAX_PARALLEL_WRITES = 8;

function pathFor(folder, allFolders) {
  const parts = [folder.name], seen = new Set([folder.name.toLowerCase()]);
  let parent = folder.parent_folder;
  for (let n = 0; n < 10 && parent; n++) {
    const found = allFolders.find(f => f.name.toLowerCase() === parent.toLowerCase());
    if (!found || seen.has(found.name.toLowerCase())) break;
    parts.unshift(found.name);
    seen.add(found.name.toLowerCase());
    parent = found.parent_folder;
  }
  return parts.join(" / ");
}

function normalizedMedia(payload) {
  if (payload?.format !== "vault-extension-capture-v2") return [];
  return parseCapturedMedia(JSON.stringify({
    format: "vault-media-capture-v1",
    items: Array.isArray(payload.items) ? payload.items.slice(0, MAX_ITEMS) : [],
  })).slice(0, MAX_ITEMS);
}

const inputStyle = { width: "100%", boxSizing: "border-box", background: "#191919", border: "1px solid #363636", borderRadius: 10, color: "#f9f9f9", fontSize: 13, padding: 12 };
const panelStyle = { padding: 16, background: "#111", border: "1px solid #282828", borderRadius: 15, marginTop: 15 };
const buttonStyle = { padding: "11px 14px", borderRadius: 10, border: 0, background: "#fff", color: "#111", fontSize: 12, fontWeight: 700, cursor: "pointer" };

export default function ExtensionSavePicker() {
  const [items, setItems] = useState([]);
  const [folders, setFolders] = useState([]);
  const [folder, setFolder] = useState("");
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [userId, setUserId] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const metadataChecked = useRef(new Set());
  const [metadataBusy, setMetadataBusy] = useState(0);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [completed, setCompleted] = useState(0);

  // Called by Chrome only after it has opened this exact /capture page. No
  // passwords, tokens, cookies or Supabase credentials cross the boundary.
  const receive = useCallback(payload => {
    const incoming = normalizedMedia(payload);
    if (!incoming.length) return false;
    metadataChecked.current.clear();
    setItems(incoming);
    setCompleted(0);
    setError("");
    setSuccess("");
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({
        payload, expires: Date.now() + 20 * 60 * 1000,
      }));
    } catch {}
    return true;
  }, []);

  useEffect(() => {
    window.__vaultCaptureImport = receive;
    try {
      const saved = JSON.parse(sessionStorage.getItem(PENDING_KEY) || "null");
      if (saved?.expires > Date.now()) queueMicrotask(() => receive(saved.payload));
      else sessionStorage.removeItem(PENDING_KEY);
    } catch { sessionStorage.removeItem(PENDING_KEY); }
    return () => {
      if (window.__vaultCaptureImport === receive) delete window.__vaultCaptureImport;
    };
  }, [receive]);

  const refreshFolders = useCallback(async id => {
    const data = await getFolders(id);
    setFolders(data || []);
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase) {
        setError("Vault's storage is not configured in this preview.");
        setLoading(false);
        return;
      }
      const { data, error: authError } = await supabase.auth.getUser();
      if (!active) return;
      if (authError || !data?.user) {
        setError("Sign in to your Vault account to save images.");
        setLoading(false);
        return;
      }
      setUserId(data.user.id);
      setAccountEmail(data.user.email || "");
      try { await refreshFolders(data.user.id); }
      catch (err) { if (active) setError(err.message || "Could not load collections."); }
      if (active) setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [refreshFolders]);

  const choices = useMemo(() => folders
    .map(item => ({ ...item, path: pathFor(item, folders) }))
    .filter(item => item.path.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.path.localeCompare(b.path)), [folders, query]);

  const updateEntry = (url, patch) => setItems(current => current.map(item =>
    item.url === url ? {...item, ...patch} : item
  ));

  // Covers are mandatory for the clean-slate Vault. Prefer source-specific
  // thumbnails, then ordinary page metadata. Never use a fake generic cover.
  const refreshMetadata = useCallback(async entry => {
    if (!entry?.url) return;
    try {
      const response=await fetch("/api/metadata?url="+encodeURIComponent(entry.url),{
        credentials:"same-origin",cache:"no-store",
      });
      if(!response.ok) return;
      const info=await response.json();
      if(!info || typeof info!=="object")return;
      setItems(current=>current.map(item=>{
        if(item.url!==entry.url)return item;
        const autoCover=(getThumbCandidates(item.url)||[]).find(v=>/^https?:\/\//.test(v))||"";
        const thumb=String(info.thumbnail||"").startsWith("https://")?info.thumbnail:autoCover;
        const genericTitle=/^(?:Saved link|Google Drive|Pinterest|YouTube|website|Captured (?:image|video))\b/i.test(item.title||"");
        return {
          ...item,
          thumbnail:item.thumbnail||thumb,
          title:genericTitle&&info.title?String(info.title).slice(0,180):item.title,
        };
      }));
    } catch {}
  },[]);

  useEffect(()=>{
    if(!userId || !items.length || metadataBusy>0)return;
    // Limit metadata lookups to 48 page requests per capture and 4 concurrent.
    const next=items.slice(0,48).filter(item=>!item.thumbnail && !metadataChecked.current.has(item.url)).slice(0,4);
    if(!next.length)return;
    for(const item of next)metadataChecked.current.add(item.url);
    setMetadataBusy(count=>count+next.length);
    Promise.allSettled(next.map(entry=>refreshMetadata(entry))).finally(()=>{
      setMetadataBusy(count=>Math.max(0,count-next.length));
    });
  },[userId,items,refreshMetadata,metadataBusy]);


  async function createNewFolder() {
    const name = newName.trim().slice(0, 100);
    if (!name || creating || saving || !userId) return;
    if (folders.some(existing => existing.name.toLowerCase() === name.toLowerCase())) {
      setError("A collection with that name already exists. Select it below.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      await createFolder(userId, name, { kind: "gallery", parent_folder: folder || null });
      await refreshFolders(userId);
      setFolder(name);
      setQuery("");
      setNewName("");
    } catch (err) { setError(err.message || "Collection could not be created."); }
    finally { setCreating(false); }
  }

  async function save() {
    if (!userId || loading || saving || !items.length) return;
    if (folder && !folders.some(f => f.name === folder)) {
      setError("This collection is no longer available. Choose a different one.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    const current = [...items];
    const failures = [];
    const successful = new Set();
    try {
      // Repeated imports must not wipe edited titles, notes, covers or tags.
      // Read only the matching item keys, not the entire Vault library.
      const oldItems = new Map();
      for (let i = 0; i < current.length; i += 50) {
        const keys = current.slice(i, i + 50).map(entry => itemKey(entry.url));
        const { data, error: readError } = await supabase.from("vault_items")
          .select("*").eq("user_id", userId).in("item_key", keys);
        if (readError) throw readError;
        for (const value of data || []) oldItems.set(value.item_key, value);
      }
      for (let i = 0; i < current.length; i += MAX_PARALLEL_WRITES) {
        const group = current.slice(i, i + MAX_PARALLEL_WRITES);
        const results = await Promise.allSettled(group.map(async entry => {
          const item = buildVaultMediaItem(entry, folder, itemKey, sourceIdOf);
          const old = oldItems.get(item.key);
          if (old) {
            item.title = old.title || item.title;
            item.note = old.note || item.note;
            item.tags = old.tags || item.tags;
            item.thumbnail = old.thumbnail || item.thumbnail;
            item.thumbnail_source = old.thumbnail_source || item.thumbnail_source;
            item.cover_mode = old.cover_mode || item.cover_mode;
            item.cover_fit = old.cover_fit || item.cover_fit;
            item.cover_position_x = old.cover_position_x ?? 50;
            item.cover_position_y = old.cover_position_y ?? 50;
            item.source = old.source || item.source;
            item.type = old.type && old.type !== "link" ? old.type : item.type;
          }
          await upsertVaultItem(userId, item);
          return item.url;
        }));
        results.forEach((result, index) => {
          if (result.status === "fulfilled") successful.add(result.value);
          else failures.push({ url: group[index].url, message: result.reason?.message || "Save failed" });
        });
        setCompleted(successful.size);
      }
      if (failures.length === 0) {
        sessionStorage.removeItem(PENDING_KEY);
        setItems([]);
        setSuccess("Saved " + successful.size + " item" + (successful.size === 1 ? "" : "s") + " to " + (folder || "Inbox") + ".");
      } else {
        setItems(current.filter(entry => !successful.has(entry.url)));
        // Only unsaved links remain on retry, so duplicates aren't created.
        setError("Saved " + successful.size + " of " + current.length + ". " + failures.length + " failed. Retry the remaining selection.");
        try {
          sessionStorage.setItem(PENDING_KEY, JSON.stringify({
            payload: { format: "vault-extension-capture-v2", items: current.filter(entry => !successful.has(entry.url)) },
            expires: Date.now() + 20 * 60 * 1000,
          }));
        } catch {}
      }
    } catch (err) {
      setError(err.message || "Cannot save this batch. Your selection is retained.");
    } finally { setSaving(false); }
  }

  return <main style={{ minHeight: "100dvh", background: "#050505", color: "#f7f7f7",
    padding: "24px 18px 60px", fontFamily: "Inter, -apple-system, sans-serif" }}>
    <div style={{ maxWidth: 700, margin: "0 auto" }}>
      <div style={{ fontSize: 11, color: "#9b9b9b", letterSpacing: 1.6, fontWeight: 700 }}>VAULT · SAVE FROM CHROME</div>
      <h1 style={{ fontSize: 30, margin: "10px 0 6px", letterSpacing: -0.7 }}>Save to Vault</h1>
      {userId&&<div data-testid="extension-connected-account" style={{margin:"12px 0",padding:"11px 13px",background:"#10251e",border:"1px solid #275441",borderRadius:9,fontSize:12,color:"#b8f7d5"}}>
        Connected to {accountEmail || "your signed-in Vault account"} · All saves use this account
      </div>}
      <p style={{ fontSize: 13, color: "#aaa", lineHeight: 1.6 }}>
        Choose a destination and confirm once. Images, videos, Pinterest pins, Drive shares and regular links use your existing signed-in account.
      </p>
      <section style={panelStyle}>
        <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>Save to collection</h2>
        <button type="button" onClick={() => setFolder("")} aria-pressed={!folder}
          style={{ ...buttonStyle, width: "100%", textAlign: "left", marginBottom: 12,
            background: !folder ? "#fff" : "#222", color: !folder ? "#111" : "#fff" }}>
          Inbox <span style={{ float: "right", fontSize: 11, opacity: 0.65 }}>Without a folder</span>
        </button>
        <input aria-label="Search Vault collections" placeholder="Search folders and galleries"
          value={query} onChange={event => setQuery(event.target.value)} style={inputStyle} />
        <div style={{ maxHeight: 210, overflowY: "auto", margin: "10px 0 13px" }}>
          {choices.map(choice => <button type="button" key={choice.name}
            aria-pressed={folder === choice.name} onClick={() => setFolder(choice.name)}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14,
              padding: "10px 12px", width: "100%", textAlign: "left", borderRadius: 9, cursor: "pointer",
              border: folder === choice.name ? "1px solid #fff" : "1px solid #303030",
              background: folder === choice.name ? "#f5f5f5" : "#1b1b1b",
              color: folder === choice.name ? "#111" : "#eee", marginBottom: 5 }}>
            <span style={{ fontSize: 12, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{choice.path}</span>
            <span style={{ fontSize: 10, opacity: .65 }}>{choice.kind === "gallery" ? "Gallery" : "Folder"}</span>
          </button>)}
          {!loading && !choices.length && <p style={{ color: "#aaa", fontSize: 12 }}>No matching folders.</p>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input aria-label="New collection name" value={newName}
            onChange={event => setNewName(event.target.value)}
            onKeyDown={event => { if (event.key === "Enter") void createNewFolder(); }}
            placeholder={folder ? "New gallery inside selection" : "New collection"} style={inputStyle}/>
          <button type="button" style={buttonStyle} disabled={creating || saving || !userId || !newName.trim()}
            onClick={createNewFolder}>{creating ? "Creating…" : "Create"}</button>
        </div>
      </section>
      <section style={panelStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
          <h2 style={{ fontSize: 15, margin: "0 0 10px" }}>Links and media to save</h2>
          <span style={{ fontSize: 12, color: "#999" }}>{items.length} / {MAX_ITEMS}</span>
        </div>
        {!items.length && <p style={{ fontSize: 13, color: "#999", lineHeight: 1.6 }}>
          Right-click a page, link or image—or paste a URL in the Chrome extension. Your selection appears here.
        </p>}
        <div style={{ maxHeight: 280, overflowY: "auto" }}>
          {items.map(entry => <div key={entry.url}
            style={{ display: "flex", gap: 12, alignItems: "center",
              padding: "9px 0", borderBottom: "1px solid #282828" }}>
            <div style={{ width: 48, height: 48, borderRadius: 8, background: "#252525", overflow: "hidden", flexShrink: 0 }}>
              {entry.thumbnail && <img src={entry.thumbnail} alt="" referrerPolicy="no-referrer"
                style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{fontSize:10,color:"#a1b3c6",textTransform:"uppercase",fontWeight:700}}>{entry.source || entry.type}</div>
              <input aria-label={"Title for "+entry.url} value={entry.title||""}
                onChange={event=>updateEntry(entry.url,{title:event.target.value})}
                disabled={saving} style={{...inputStyle,margin:"5px 0",padding:"8px 9px",fontSize:12}}/>
              <div title={entry.url} style={{fontSize:10,color:"#999",marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{entry.url}</div>
              <input type="url" aria-label={"Cover URL for "+entry.url} value={entry.thumbnail||""}
                onChange={event=>updateEntry(entry.url,{thumbnail:event.target.value})}
                placeholder="Required cover URL (automatic or paste your own)"
                disabled={saving} style={{...inputStyle,margin:"7px 0 0",padding:"8px 9px",fontSize:11}} />
              {!entry.thumbnail && <div style={{fontSize:11,color:"#eabb8f",marginTop:5}}>
                {metadataBusy ? "Looking for a cover…" : "Cover unavailable—paste one before saving."}
              </div>}
            </div>
            <button type="button" disabled={saving} onClick={() => setItems(old => old.filter(x => x.url !== entry.url))}
              aria-label={"Remove " + entry.title} style={{ border: 0, background: "none", color: "#aaa", cursor: "pointer", fontSize: 20 }}>×</button>
          </div>)}
        </div>
      </section>
      {error && <p role="alert" style={{ fontSize: 12, color: "#ffbbbb", background: "#311719", padding: 13, borderRadius: 10 }}>{error}</p>}
      {success && <p role="status" style={{ fontSize: 12, color: "#b9f6bd", background: "#19301c", padding: 13, borderRadius: 10 }}>{success}</p>}
      <button type="button" disabled={!items.length || !userId || saving || loading} onClick={save}
        style={{ ...buttonStyle, width: "100%", padding: 17, fontSize: 14, marginTop: 15,
          opacity: !items.length || !userId || saving || loading ? .5 : 1 }}>
        {saving ? "Saving " + completed + " of " + items.length + "…" :
          "Save " + items.length + " item" + (items.length === 1 ? "" : "s") + " to " + (folder || "Inbox")}
      </button>
      <p style={{ marginTop: 14, color: "#888", fontSize: 11, lineHeight: 1.7 }}>
        Vault saves the link. If the source requires sign-in, expires, or returns HTTP 403, this does not make a permanent copy of its image bytes.
      </p>
      <Link href="/" style={{ fontSize: 12, color: "#e3e3e3" }}>Open Vault library</Link>
    </div>
  </main>;
}
