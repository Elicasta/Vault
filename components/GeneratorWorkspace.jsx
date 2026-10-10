"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { uploadVaultMedia, deleteVaultMedia } from "@/lib/supabase";
import { itemKey } from "@/lib/utils";
import { buildGeneratorUrlItem, normalizeGeneratorPublicUrl } from "@/lib/generator-save-url.mjs";

export const GENERATOR_SITES = Object.freeze({
  venice: {
    name: "Venice AI",
    url: "https://venice.ai/",
    folder: "Venice AI",
    about: "Keep generations and exported files separate from Venice's browser-local history.",
    backup: "For conversations, use Venice's own export or encrypted backup option when available. A Vault file does not restore a Venice login or conversation automatically.",
  },
  perchance: {
    name: "Perchance AI",
    url: "https://perchance.org/ai-text-to-image-generator",
    folder: "Perchance AI",
    about: "Preserve generated images and videos as files, even when the page uses temporary blob: URLs.",
    backup: "Download generated files or use the Chrome companion's Smart Image Capture. Saving to Vault does not automatically restore another site's browser storage.",
  },
});

export function normalizeGeneratorUploadName(name) {
  const trimmed = String(name || "").normalize("NFKC").replace(/[\\/:*?"<>|\x00-\x1f]/g,"-").slice(0,100);
  return trimmed.trim() || "Generated media";
}

export default function GeneratorWorkspace({ site = "venice", userId, folders = [], items = [], onSave, onCreateFolder, onBrowse }) {
  const config = GENERATOR_SITES[site] || GENERATOR_SITES.venice;
  const [selectedFolder, setSelectedFolder] = useState(config.folder);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [savingUrl, setSavingUrl] = useState(false);
  const inputRef = useRef(null);
  const siteItems = items.filter((x) => x.folder === config.folder || x.folder === selectedFolder).slice(0,18);

  useEffect(() => {
    setSelectedFolder(config.folder); setSourceUrl(""); setSourceTitle("");
    setError(""); setStatus("");
  }, [site, config.folder]);

  const saveUrl = async () => {
    if (savingUrl || busy) return;
    setSavingUrl(true); setError(""); setStatus("");
    try {
      if (!userId) throw new Error("Sign in to Vault to save this URL.");
      const actual = normalizeGeneratorPublicUrl(sourceUrl);
      if (!actual) throw new Error("Paste a public image, video, or page URL. For blob: or private browser media, use Permanent Copy.");
      const folder = selectedFolder || config.folder;
      if (!folders.some((f) => f.name === folder)) await onCreateFolder(folder);
      const item = buildGeneratorUrlItem(actual, {site,siteName:config.name,folder,title:sourceTitle,keyOf:itemKey});
      await onSave(item);
      setStatus("URL saved to " + folder + ". A permanent file copy is optional.");
    }catch(error){setError(error.message||"Could not save URL.");}
    finally{setSavingUrl(false);}
  };

  const persistFiles = useCallback(async (incoming) => {
    const files = [...(incoming || [])].filter(Boolean);
    if (!files.length) return;
    setBusy(true); setError("");
    let saved = 0, failed = 0;
    try {
      if (!userId) throw new Error("Sign in to Vault before preserving generated files.");
      const folder = selectedFolder || config.folder;
      if (!folders.some((f) => f.name === folder)) await onCreateFolder(folder);
      for (const file of files.slice(0, 20)) {
        let upload = null;
        try {
          if (!/^(image|video|audio)\//.test(file.type || "")) throw new Error("Select an image or video file.");
          upload = await uploadVaultMedia(userId, file);
          const title = normalizeGeneratorUploadName(file.name);
          const key = itemKey(upload.locator);
          const next = {
            id: "generated-" + key, key,
            url: upload.locator, thumbnail: upload.type === "image" ? upload.locator : "",
            type: upload.type, title, note: "Original captured from " + config.name + (sourceUrl.trim() ? "\nSource: " + sourceUrl.trim().slice(0,400) : ""),
            tags: ["generated", site, "vault-file"], folder, tab: folder, isVaultItem: true,
            isUploadedMedia: true, storagePath: upload.path, addedAt: new Date().toISOString(),
          };
          try { await onSave(next); saved++; }
          catch (error) { await deleteVaultMedia(userId, upload.locator).catch(() => {}); throw error; }
        } catch (error) { failed++; setError(error.message || "File could not be preserved."); }
        setStatus(saved + " preserved in " + folder + (failed ? " · " + failed + " failed" : ""));
      }
    } catch (error) { setError(error.message || "Could not save file."); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  }, [userId, selectedFolder, config.name, config.folder, onSave, onCreateFolder, folders, site, sourceUrl]);

  useEffect(() => {
    const onPaste = (event) => {
      const target = event.target;
      if (target?.matches?.("input,textarea,[contenteditable]")) return;
      if (document.activeElement && !document.activeElement.closest?.(".vv-generator-workspace")) return;
      const images = [...(event.clipboardData?.files || [])].filter((file) => file.type.startsWith("image/"));
      if (!images.length) return;
      event.preventDefault();
      const stamped = images.map((file) => new File([file], site + "-captured-" + Date.now() + ".png", { type: file.type }));
      persistFiles(stamped);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [persistFiles, site]);

  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false);
    if (e.dataTransfer?.files?.length) persistFiles(e.dataTransfer.files);
  };

  return <section className="vv-generator-workspace" aria-label={config.name + " Vault workspace"}>
    <div className="vv-generator-header">
      <div>
        <div className="v2-eyebrow">Connected creative workspace</div>
        <h2>{config.name}</h2>
        <p>{config.about}</p>
      </div>
      <a className="vv-generator-open" target="_blank" rel="noreferrer noopener" href={config.url}>Open {config.name} <span aria-hidden="true">↗</span></a>
    </div>
    <section className="vv-generator-url-primary" aria-label="Primary save: URL to Vault">
      <div className="v2-eyebrow">PRIMARY · SAVE THE LINK</div>
      <h3>1. Save URL to Vault</h3>
      <p>Paste an image, video, generation, or page URL. This is the quickest way to save. Direct image or video file URLs are identified automatically.</p>
      <div className="vv-generator-link-fields">
        <label>URL to save
          <input type="url" value={sourceUrl} onChange={(e)=>setSourceUrl(e.target.value)}
            placeholder={config.url} autoComplete="url" aria-label="URL to save to Vault"/>
        </label>
        <label>Title (optional)
          <input type="text" value={sourceTitle} onChange={(e)=>setSourceTitle(e.target.value)}
            placeholder="Name this generation" aria-label="Title for saved URL" maxLength={180}/>
        </label>
        <label>Save to collection
          <select value={selectedFolder} onChange={(e)=>setSelectedFolder(e.target.value)}>
            <option value={config.folder}>{config.folder}</option>
            {folders.filter((f)=>f.name!==config.folder).map((f)=><option key={f.name} value={f.name}>{f.name}</option>)}
          </select>
        </label>
      </div>
      <div className="vv-generator-primary-actions">
        <button className="vv-generator-save-url" type="button" disabled={savingUrl||busy||!sourceUrl.trim()}
          onClick={saveUrl}>{savingUrl?"Saving URL…":"Save URL to Vault"}</button>
        <button type="button" onClick={()=>{setSourceUrl(config.url);setSourceTitle(config.name);}}>Use website address</button>
      </div>
      <p className="vv-generator-caution">URL saving does not download a file. If the generator uses a temporary blob: URL or deleting browser data could erase the result, use Permanent Copy below.</p>
    </section>
    <div className="vv-generator-grid">
      <div className="vv-generator-section">
        <h3>2. Create in the original website</h3>
        <p>Open {config.name} in your browser to use its login, generation tools and history. Copy a share link or media URL here to save it.</p>
        <p>Google verification and site cookies remain in that browser; they cannot be reliably shared with an embedded website.</p>
        <button type="button" onClick={() => onBrowse?.(config.url)}>Find public media in Vault</button>
      </div>
      <div className="vv-generator-section">
        <h3>3. Save Permanent Copy</h3>
        <p>Only when a saved URL is temporary or not a real file address: keep an actual image, video, or clean screenshot in private Supabase storage.</p>
        <div className={"vv-generator-drop" + (dragging ? " dragging" : "")}
          onDragOver={(e)=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={handleDrop}>
          <strong>Drop a downloaded file or cropped screenshot</strong>
          <span>Or choose a file · images, videos, audio · up to 50 MB each</span>
          <input ref={inputRef} type="file" accept="image/*,video/*,audio/*" multiple
            aria-label="Choose generated media for permanent storage" onChange={(e)=>persistFiles(e.target.files)} disabled={busy}/>
          <small>Desktop Chrome: use Vault's Smart Capture for an image-only PNG, or paste a clipboard image while this workspace is focused.</small>
        </div>
        {busy && <p role="status">Uploading the permanent file to private Vault storage…</p>}
      </div>
    </div>
    {status && <p role="status" className="vv-generator-status">{status}</p>}
    {error && <p role="alert" className="vv-generator-error">{error}</p>}
    <div className="vv-generator-backup">
      <h3>4. Back up permanent files</h3>
      <p>{config.backup}</p>
      <p>Your saved Vault files persist independently of this website's browser history and are accessible from the Library and selected Collection. Back up eligible private files to Google Drive from Vault Settings. Never paste passwords, cookies, tokens, or raw browser profiles into Vault.</p>
    </div>
    {siteItems.length > 0 && <div className="vv-generator-recent">
      <h3>Saved to {selectedFolder || config.folder}</h3>
      <div>{siteItems.map((item) => <div key={item.key}><span>{item.title}</span><small>{item.type === "image" ? "Image" : item.type === "video" ? "Video" : "Media"}</small></div>)}</div>
    </div>}
  </section>;
}
