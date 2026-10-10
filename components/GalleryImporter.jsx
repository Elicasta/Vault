"use client";
import { useEffect, useState } from "react";
import { ensureProxySession, SECURITY_V2_ENABLED } from "@/lib/security-session";
import { buildVaultMediaItem } from "@/lib/media-capture-import.mjs";
import { itemKey, sourceIdOf } from "@/lib/utils";
import GoogleDriveSave from "./GoogleDriveSave";

async function postLookup(pages, signal) {
  if (SECURITY_V2_ENABLED) await ensureProxySession();
  const request = () => fetch("/api/image-sources", {
    method: "POST", credentials: "same-origin", cache: "no-store", signal,
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pages }),
  });
  let response = await request();
  if (response.status === 401 && SECURITY_V2_ENABLED) {
    await ensureProxySession(null, { force: true }); response = await request();
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Image lookup failed");
  return data.results || [];
}
export { postLookup };

export function ImageDetailPanel({ page, folder, onSave, onSaved, saving }) {
  const [status, setStatus] = useState("loading");
  const [image, setImage] = useState(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading"); setImage(null); setError("");
    postLookup([page], controller.signal)
      .then((results) => {
        if (controller.signal.aborted) return;
        const found = results[0];
        setImage(found?.image || null);
        setError(found?.error || (!found?.image ? "No public full-resolution image was detected." : ""));
        setStatus("done");
      })
      .catch((err) => { if (!controller.signal.aborted) { setStatus("error"); setError(err.message || "Image lookup failed."); } });
    return () => controller.abort();
  }, [page.url, page.thumbnail]);

  const save = async () => {
    if (!image || saving || working) return;
    setWorking(true);
    try {
      await onSave(buildVaultMediaItem(image, folder, itemKey, sourceIdOf));
      onSaved?.(image.url);
      setStatus("saved");
    } catch (e) { setError(e.message || "Could not save image."); }
    finally { setWorking(false); }
  };
  return <section className="vv-image-detail" aria-label="Full-resolution image page">
    <img alt={page.title || "Gallery cover"} src={"/api/media?url=" + encodeURIComponent(image?.thumbnail || page.thumbnail || "")}/>
    <div>
      <span className="vv-media-eyebrow">IMAGE PAGE · FIND ORIGINAL</span>
      <h3>{page.title || "Image"}</h3>
      {status === "loading" && <p role="status">Inspecting the image detail page…</p>}
      {image && <>
        <p>Original image URL: <a href={image.url} target="_blank" rel="noopener noreferrer">{image.url}</a></p>
        <p>{image.resolution === "cover-only" ? "Only the cover was detected; review before saving." : "The image link was extracted separately from its gallery cover."}</p>
        <GoogleDriveSave url={image.url} type="image" title={page.title || image.title} compact />
        <button type="button" disabled={working || saving || status === "saved"} onClick={save}>{status === "saved" ? "Saved" : working ? "Saving…" : "Save image to " + (folder || "My Library")}</button>
      </>}
      {error && <p role="alert">{error}</p>}
    </div>
  </section>;
}

export default function GalleryImporter({ result, folder, onSave, existingUrls = [], onSaved, onCreateFolder, onFolderChange, folders = [] }) {
  const [review, setReview] = useState(false);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");
  const [newFolder, setNewFolder] = useState("");
  const cancelRef = useState(() => ({ cancelled: false }))[0];
  const pages = result?.imagePages || [];
  const images = result?.media?.filter((x) => x.type === "image") || [];
  const detected = result?.galleryDetected;
  const count = pages.length + images.length;
  useEffect(() => { cancelRef.cancelled = false; setReview(false); setProgress(null); setError(""); }, [result?.pageUrl]);
  if (!detected || count < 2) return null;

  const importGallery = async () => {
    if (working) return;
    cancelRef.cancelled = false; setWorking(true); setError(""); setProgress({ stage: "Discovering originals", saved: 0, skipped: 0, unresolved: 0, processed: 0 });
    let saved = 0, skipped = 0, unresolved = 0, processed = 0;
    const seen = new Set(existingUrls);
    const entries = [...images];
    const galleries = new Set([result.pageUrl]);
    const pageCards = [...pages];
    let nextPage = result.nextPageUrl || "";
    // Bounded pagination of the same gallery. No site-wide crawling.
    for (let pageIndex = 1; pageIndex < 6 && nextPage && !cancelRef.cancelled; pageIndex++) {
      if (galleries.has(nextPage) || new URL(nextPage).hostname !== new URL(result.pageUrl).hostname) break;
      galleries.add(nextPage);
      try {
        if (SECURITY_V2_ENABLED) await ensureProxySession();
        const fetchPage = () => fetch("/api/media-discovery?url=" + encodeURIComponent(nextPage), { cache: "no-store", credentials: "same-origin" });
        let res = await fetchPage();
        if (res.status === 401 && SECURITY_V2_ENABLED) {
          await ensureProxySession(null, { force: true }); res = await fetchPage();
        }
        const another = await res.json();
        if (!res.ok) break;
        for (const media of another.media || []) if (media.type === "image") entries.push(media);
        for (const card of another.imagePages || []) if (!pageCards.some((p) => p.url === card.url)) pageCards.push(card);
        nextPage = another.nextPageUrl || "";
        setProgress({ stage: "Scanning gallery page " + (pageIndex + 1), saved, skipped, unresolved, processed });
        if (entries.length + pageCards.length >= 160) break;
      } catch { break; }
    }
    let lookupError = "";
    try {
      for (let index = 0; index < Math.min(pageCards.length,160) && !cancelRef.cancelled; index += 8) {
        const batch = pageCards.slice(index, index + 8);
        try {
          const resolutions = await postLookup(batch);
          for (const entry of resolutions) {
            if (entry.image) entries.push(entry.image);
            else unresolved++;
          }
        } catch (e) { unresolved += batch.length; lookupError = e.message || "One batch could not be inspected"; }
        setProgress({ stage: "Discovering originals", saved, skipped, unresolved, processed });
      }
      // Deduplicate originals by URL. A linked detail page is identified by
      // sourcePage, but direct image elements share a gallery sourcePage.
      const bestBySource = new Map();
      for (const entry of entries) {
        const key = entry.resolution ? (entry.sourcePage || entry.url) : entry.url;
        const old = bestBySource.get(key);
        if (!old || (entry.resolution === "high-confidence" && old.resolution !== "high-confidence")) bestBySource.set(key, entry);
      }
      const final = [...bestBySource.values()].slice(0, 160);
      for (const media of final) {
        if (cancelRef.cancelled) break;
        processed++;
        if (!media.url || seen.has(media.url)) { skipped++; continue; }
        try {
          await onSave(buildVaultMediaItem(media, folder, itemKey, sourceIdOf));
          seen.add(media.url); saved++; onSaved?.(media.url);
        } catch { unresolved++; }
        setProgress({ stage: "Saving into " + (folder || "My Library"), saved, skipped, unresolved, processed });
      }
      if (lookupError) setError(lookupError);
    } catch (e) { setError(e.message || "Gallery import stopped."); }
    finally {
      setWorking(false); setProgress({ stage: cancelRef.cancelled ? "Cancelled" : "Complete", saved, skipped, unresolved, processed });
    }
  };
  const makeFolder = async () => {
    const name = newFolder.trim();
    if (!name) return;
    try { await onCreateFolder(name); onFolderChange(name); setNewFolder(""); }
    catch (e) { setError(e.message || "Could not create folder."); }
  };
  return <section className="vv-gallery-import" aria-label="Import full image gallery">
    <div className="vv-gallery-top">
      <div><span className="vv-media-eyebrow">GALLERY DETECTED</span><h3>Import image gallery</h3>
        <p>{images.length} direct images · {pages.length} linked photo pages. Vault resolves originals where available.</p></div>
      <button type="button" onClick={() => setReview((x) => !x)} aria-expanded={review}>{review ? "Close import" : "Import gallery"}</button>
    </div>
    {review && <div className="vv-gallery-review">
      <label>Save all gallery images to
        <select value={folder} onChange={(e) => onFolderChange(e.target.value)}>
          <option value="">My Library</option>
          {folders.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
        </select>
      </label>
      <div className="vv-gallery-create">
        <input value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder="New folder name" aria-label="New gallery folder"/>
        <button type="button" onClick={makeFolder} disabled={!newFolder.trim() || working}>Create folder</button>
      </div>
      <p>Scans up to 6 linked gallery pages and 160 media candidates, preferring full-resolution image links. Existing URLs are skipped. Vault saves links, not downloaded copies.</p>
      <div className="vv-gallery-actions">
        <button type="button" onClick={importGallery} disabled={working}>{working ? "Importing gallery…" : "Save entire gallery (" + count + " candidates)"}</button>
        {working && <button type="button" onClick={() => { cancelRef.cancelled = true; }}>Cancel</button>}
      </div>
    </div>}
    {progress && <p role="status">{progress.stage}: {progress.saved} saved · {progress.skipped} skipped · {progress.unresolved} unresolved</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
