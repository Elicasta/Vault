"use client";

import { useEffect, useRef, useState } from "react";
import { ensureProxySession, SECURITY_V2_ENABLED } from "@/lib/security-session";
import GalleryImporter, { ImageDetailPanel } from "./GalleryImporter";
import { siteNeedsBrowser, markSiteBrowserFirst, clearBrowserFirst, isWebsiteAccessDenial, isUnsupportedDiscoveryResponse } from "@/lib/browser-first-fallback.mjs";

export default function ImportGallerySection({
  pageUrl = "", folder = "", folders = [], existingUrls = [],
  onSave, onCreateFolder, onFolderChange,
}) {
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [gallery, setGallery] = useState(null);
  const [selectedPage, setSelectedPage] = useState(null);
  const [newlySaved, setNewlySaved] = useState([]);
  const abort = useRef(null);
  const target = String(pageUrl || "").trim();
  const pageCount = (gallery?.imagePages || []).length;
  const imageCount = (gallery?.media || []).filter(x => x.type === "image").length;

  useEffect(() => {
    abort.current?.abort();
    setGallery(null);
    setError("");
    setStatus("idle");
    setSelectedPage(null);
    setNewlySaved([]);
    return () => abort.current?.abort();
  }, [target]);

  const scan = async (force = false) => {
    if (!/^https?:\/\//i.test(target)) {
      setError("Enter the URL of an image gallery or collection page first.");
      return;
    }
    if (!force && siteNeedsBrowser(target)) {
      setStatus("browser");
      setError("This site previously rejected automated scanning. Use browser capture below, or retry if your access has changed.");
      return;
    }
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setStatus("loading"); setError(""); setGallery(null); setSelectedPage(null);
    try {
      if (SECURITY_V2_ENABLED) await ensureProxySession();
      const fetchGallery = () => fetch("/api/media-discovery?url=" + encodeURIComponent(target), {
        method: "GET", credentials: "same-origin", signal: controller.signal, cache: "no-store",
      });
      let response = await fetchGallery();
      if (response.status === 401 && SECURITY_V2_ENABLED) {
        await ensureProxySession(null, { force: true });
        response = await fetchGallery();
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (isWebsiteAccessDenial(response,data)) {
          markSiteBrowserFirst(target);
          setStatus("browser");
          setError(data.error || "Website blocks automated scanning.");
          return;
        }
        if (isUnsupportedDiscoveryResponse(response,data)) {
          setStatus("browser");
          setError(data.error || "The selected URL is not a readable HTML gallery.");
          return;
        }
        throw new Error(data.error || "Gallery scan failed.");
      }
      if (!controller.signal.aborted) { setGallery(data); setStatus("done"); }
    } catch (e) {
      if (!controller.signal.aborted) {
        setStatus("error");
        setError(e.message || "Could not read the gallery.");
      }
    }
  };

  const savedUrls = [...existingUrls, ...newlySaved];
  return <section className="vv-import-gallery-section" aria-label="Detect and import image galleries">
    <div className="vv-import-gallery-heading">
      <div>
        <span className="v2-eyebrow">GALLERIES · DEEP IMAGE SEARCH</span>
        <h3>2. Import an image gallery</h3>
        <p>Scan a gallery, inspect its individual photo pages, find original image URLs, and save the collection in bulk.</p>
      </div>
      <button type="button" onClick={() => {clearBrowserFirst(target);scan(true);}} disabled={status === "loading" || !target}>
        {status === "loading" ? "Scanning…" : status === "browser" ? "Retry scan" : "Scan gallery"}
      </button>
    </div>
    <p className="vv-import-gallery-hint">Uses the URL entered above. Finds public images and linked photo detail pages, not just preview thumbnails.</p>
    {error && <div role="alert" className="vv-generator-error">
      <p>{error}</p>
      {status==="browser" && <p>Use the browser-captured import section below, or download permitted original files and upload them in Vault. Other pages on this website can still be scanned normally.</p>}
      {/^https?:\/\//i.test(target) && <p><a href={target} target="_blank" rel="noopener noreferrer">Open original gallery in your browser</a>. If the site blocks Vault scanning, save the page URL above or import captured images with the Chrome companion.</p>}
    </div>}
    {status === "loading" && <p role="status">Looking for image cards, original links and gallery pages…</p>}
    {gallery && <>
      <p role="status" className="vv-import-gallery-counts">
        {imageCount} image URLs · {pageCount} linked photo pages{gallery.siteAdapter === "elitebabes" ? " · EliteBabes gallery support" : ""}
        {gallery.nextPageUrl ? " · additional gallery page detected" : ""}
      </p>
      <GalleryImporter result={gallery} folder={folder} folders={folders}
        onSave={onSave} onCreateFolder={onCreateFolder} onFolderChange={onFolderChange}
        existingUrls={savedUrls} onSaved={url => setNewlySaved(prev => prev.includes(url) ? prev : [...prev, url])}/>
      {imageCount > 0 && <details className="vv-import-gallery-list">
        <summary>View {imageCount} detected image links</summary>
        <div className="vv-import-gallery-items">
          {gallery.media.filter(x => x.type === "image").slice(0,60).map(item =>
            <a key={item.url} href={item.url} target="_blank" rel="noopener noreferrer"
              title={item.url}>
              <img src={"/api/media?url=" + encodeURIComponent(item.thumbnail || item.url)}
                alt={item.title || "Gallery image"} loading="lazy"/>
              <span>{item.title || "Image"}</span>
            </a>)}
        </div>
      </details>}
      {pageCount > 0 && <details className="vv-import-gallery-list" open>
        <summary>Explore {pageCount} photo pages for originals</summary>
        <div className="vv-import-gallery-items">
          {gallery.imagePages.map(page => <button type="button" key={page.url}
            aria-pressed={selectedPage?.url === page.url} onClick={() => setSelectedPage(page)}>
            {page.thumbnail && <img src={"/api/media?url=" + encodeURIComponent(page.thumbnail)}
              alt={page.title || "Photo page"} loading="lazy"/>}
            <span>{page.title || page.url}</span>
          </button>)}
        </div>
      </details>}
      {selectedPage && <ImageDetailPanel page={selectedPage} folder={folder} onSave={onSave}
        onSaved={url => setNewlySaved(prev => prev.includes(url) ? prev : [...prev,url])}/>}
      {!gallery.galleryDetected && <p className="vv-import-gallery-hint">
        No multi-image gallery was confidently detected on this page. You can still open individual images above,
        use Find Source, or browse deeper from Vault Search.
      </p>}
    </>}
    <p className="vv-import-gallery-hint">Bulk import follows up to six detected gallery pages with a cap of 160 candidates.
      It saves source links, not downloaded binaries. Use permanent file upload when original links expire or require login.</p>
  </section>;
}
