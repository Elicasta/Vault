// Runs locally in an ordinary page the user can open (Safari bookmarklet or
// explicitly invoked browser console). It never fetches protected URLs,
// reads cookies/storage or sends data to Vault or any third party.
export function captureBrowserGallery({ mode = "run", documentRoot, pageLocation } = {}) {
  const doc = documentRoot || document;
  const loc = pageLocation || location;
  const pageUrl = String(loc.href || "");
  const items = new Map();
  const isImage = /\.(?:jpe?g|png|webp|avif|gif|bmp)(?:$|[?#])/i;
  const isVideo = /\.(?:mp4|mov|m4v|webm|ogv|m3u8)(?:$|[?#])/i;
  const bad = /(?:^|\.)(?:doubleclick\.net|googlesyndication\.com|googleadservices\.com|adnxs\.com|taboola\.com|outbrain\.com)$/i;
  function resolve(raw) {
    try {
      if (!String(raw || "").trim() || String(raw).trim().startsWith("#")) return "";
      const u = new URL(String(raw).trim(), pageUrl);
      if (!["https:", "http:"].includes(u.protocol) || u.username || u.password || bad.test(u.hostname)) return "";
      if (/^(?:localhost|127\.|0\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname) ||
        /\.(?:local|localhost|internal)$/.test(u.hostname)) return "";
      u.hash = "";
      return u.href;
    } catch { return ""; }
  }
  function attr(node, name) { return node?.getAttribute?.(name) || ""; }
  function srcset(raw) {
    const entries = String(raw || "").split(",").map(s => {
      const m = s.trim().match(/^(\S+)(?:\s+([\d.]+)([wx]))?/);
      return m ? { url: resolve(m[1]), size: Number(m[2] || 0), unit: m[3] || "" } : null;
    }).filter(x => x?.url);
    return entries.sort((a, b) => b.size - a.size)[0]?.url || "";
  }
  function add(url, title, kind = "image", thumbnail = "", sourceKind = "browser-visible-image") {
    const u = resolve(url);
    if (!u || items.has(u) || items.size >= 240) return;
    const path = new URL(u).pathname;
    if (/\.(?:svg|css|js|json|woff2?)(?:$|[?#])/i.test(path) ||
      /(?:^|[/_.-])(?:favicon|sprite|pixel|tracker|logo)(?:[/_.-]|$)/i.test(path)) return;
    const label = String(title || (kind === "video" ? "Video" : "Image")).replace(/\s+/g, " ").trim().slice(0, 180);
    items.set(u, { url: u, type: kind, title: label, thumbnail: resolve(thumbnail) || (kind === "image" ? u : ""),
      sourcePage: pageUrl, sourceKind });
  }
  const nodes = [...doc.querySelectorAll('img,picture source,video,video source,meta[property="og:image"],meta[property="og:video"],meta[name="twitter:image"]')].slice(0, 850);
  for (const n of nodes) {
    const tag = String(n.tagName || "").toLowerCase();
    if (tag === "img") {
      const w = Number(n.naturalWidth || attr(n, "width") || n.width || 0);
      const h = Number(n.naturalHeight || attr(n, "height") || n.height || 0);
      if ((w && w < 56) || (h && h < 56)) continue;
      const cover = resolve(n.currentSrc || srcset(attr(n, "srcset")) || attr(n, "data-src") ||
        attr(n, "data-lazy-src") || attr(n, "src"));
      const label = attr(n, "alt") || attr(n, "title") || String(doc.title || "Gallery image");
      const a = n.closest?.("a[href]") || n.parentElement?.closest?.("a[href]");
      const full = [
        attr(a, "data-original"), attr(a, "data-full"), attr(a, "data-image"),
        attr(n, "data-original"), attr(n, "data-full"), attr(n, "data-zoom"),
        srcset(attr(n, "data-srcset")), srcset(attr(n, "srcset")),
      ].map(resolve).find(Boolean);
      const linked = resolve(attr(a, "href"));
      if (full && full !== cover) add(full, label, "image", cover, "browser-original-candidate");
      if (linked && (isImage.test(linked) || attr(a, "download"))) {
        add(linked, label, "image", cover, "browser-linked-full-image");
      }
      if (cover) add(cover, label, "image", cover, "browser-visible-image");
    } else if (tag === "video") {
      const clip = resolve(n.currentSrc || attr(n, "src"));
      const poster = resolve(attr(n, "poster"));
      if (clip) add(clip, attr(n, "title") || String(doc.title || "Video"), "video", poster, "browser-visible-video");
    } else if (tag === "source") {
      const media = resolve(attr(n, "src") || srcset(attr(n, "srcset")));
      const parent = String(n.parentElement?.tagName || "").toLowerCase();
      const type = parent === "video" || isVideo.test(media) ? "video" : "image";
      if (media) add(media, String(doc.title || "Gallery media"), type, "", "browser-source");
    } else {
      const media = resolve(attr(n, "content"));
      if (media) add(media, String(doc.title || "Gallery preview"),
        /video/.test(attr(n, "property")) ? "video" : "image", "", "browser-social-media");
    }
  }
  // CSS backgrounds and lazy-loading URLs sometimes hold the only image.
  for (const node of [...doc.querySelectorAll("[data-original],[data-full],[style*='background-image']")].slice(0, 320)) {
    const explicit = resolve(attr(node, "data-original") || attr(node, "data-full"));
    if (explicit) add(explicit, attr(node, "aria-label") || attr(node, "title") || String(doc.title || "Image"), "image", "", "browser-original-candidate");
    const style = attr(node, "style");
    const bg = style.match(/background-image\s*:\s*url\(\s*['"]?([^'")]+)/i)?.[1];
    if (bg) add(bg, attr(node, "aria-label") || String(doc.title || "Image"), "image", "", "browser-background-image");
  }
  const payload = JSON.stringify({ format: "vault-media-capture-v1", sourcePage: pageUrl, items: [...items.values()] });
  if (mode === "collect") return { format: "vault-media-capture-v1", sourcePage: pageUrl, items: [...items.values()] };
  if (!items.size) {
    alert("Vault: no visible image links found. Open an actual gallery, scroll so its images load, then try Capture Gallery again.");
    return;
  }
  function showCopyDialog(copied) {
    const wrap = doc.createElement("div");
    wrap.style.cssText = "position:fixed;z-index:2147483647;inset:0;background:#0b0e14ee;display:flex;align-items:center;justify-content:center;padding:18px;";
    const body = doc.createElement("div");
    body.style.cssText = "background:#181e2a;color:white;padding:18px;border-radius:14px;width:min(550px,100%);font:14px/1.5 system-ui;display:grid;gap:12px;";
    const heading = doc.createElement("strong");
    heading.textContent = "Vault — " + items.size + " media links captured";
    const description = doc.createElement("p");
    description.textContent = copied
      ? "Copied to clipboard. Return to Vault → Import Media → Import from your browser, paste, and review the files."
      : "Select and copy the text below, then paste it into Vault → Import Media → Import from your browser.";
    const input = doc.createElement("textarea");
    input.value = payload;
    input.readOnly = true;
    input.style.cssText = "height:108px;width:100%;font-size:12px;background:#0b111c;color:#fff;border:1px solid #697488;border-radius:8px;padding:8px;box-sizing:border-box;";
    const copy = doc.createElement("button");
    copy.textContent = "Select all / copy";
    copy.style.cssText = "background:#eef1f7;color:#111827;border:0;border-radius:8px;padding:12px;font-weight:bold;";
    copy.onclick = async () => {
      input.focus(); input.select();
      try {
        if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(payload); copy.textContent = "Copied to clipboard"; }
        else { doc.execCommand?.("copy"); copy.textContent = "Selected — use Copy"; }
      } catch { copy.textContent = "Selected — tap Copy"; }
    };
    const close = doc.createElement("button");
    close.textContent = "Close";
    close.style.cssText = "color:#dce4f4;background:none;border:1px solid #697488;border-radius:8px;padding:9px;";
    close.onclick = () => wrap.remove();
    body.append(heading, description, input, copy, close);
    wrap.append(body); doc.body.append(wrap);
    if (!copied) { input.focus(); input.select(); }
  }
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(payload).then(() => showCopyDialog(true)).catch(() => showCopyDialog(false));
  } else showCopyDialog(false);
}

// The action is copied by a user's explicit click. On the source website the
// bookmarklet runs locally; no injected remote script or background request.
export function browserGalleryBookmarklet() {
  return "javascript:(" + captureBrowserGallery.toString() + ")()";
}
