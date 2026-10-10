const BAD_HOST = /(?:^|\.)(?:doubleclick\.net|googlesyndication\.com|googleadservices\.com|adnxs\.com|taboola\.com|outbrain\.com|adsrvr\.org|criteo\.com|pubmatic\.com|rubiconproject\.com)$/i;
const BAD_PATH = /(?:^|\/)(?:ads?|adserver|preroll|midroll|postroll|sponsored|vast|vpaid)(?:\/|[-_.]|$)/i;

export function cleanCapturedUrl(raw) {
  try {
    const url = new URL(String(raw || "").trim());
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || BAD_HOST.test(url.hostname) || BAD_PATH.test(url.pathname)) return "";
    url.hash = "";
    for (const p of Array.from(url.searchParams.keys())) {
      if (/^(utm_.+|fbclid|gclid|dclid|igshid|mc_cid|mc_eid)$/i.test(p)) url.searchParams.delete(p);
    }
    return url.href;
  } catch { return ""; }
}

export function parseCapturedMedia(raw, pageUrl = "") {
  const value = String(raw || "").trim();
  if (!value) return [];
  let parsed;
  try { parsed = JSON.parse(value); } catch { parsed = value.split(/\r?\n/).map((url) => ({ url })); }
  const rows = Array.isArray(parsed) ? parsed : parsed?.format === "vault-media-capture-v1" && Array.isArray(parsed.items) ? parsed.items : [];
  const seen = new Set();
  const results = [];
  for (const entry of rows.slice(0, 300)) {
    const item = typeof entry === "string" ? { url: entry } : entry;
    if (!item || typeof item !== "object") continue;
    const url = cleanCapturedUrl(item.url);
    if (!url || seen.has(url)) continue;
    const explicitType = item.type === "image" || item.type === "video" ? item.type : "";
    const inferred = /\.(?:mp4|mov|m4v|m3u8|webm|ogv)(?:$|[?#])/i.test(url) ? "video" : /\.(?:jpe?g|png|webp|gif|avif)(?:$|[?#])/i.test(url) ? "image" : "";
    const type = explicitType || inferred;
    if (!type) continue;
    seen.add(url);
    const title = String(item.title || "").trim().slice(0, 180) || (type === "image" ? "Captured image" : "Captured video");
    results.push({
      url, type, title,
      thumbnail: cleanCapturedUrl(item.thumbnail) || (type === "image" ? url : ""),
      sourcePage: cleanCapturedUrl(item.sourcePage) || cleanCapturedUrl(pageUrl) || url,
      confidence: "high", sourceKind: "browser-network-capture",
    });
  }
  return results;
}

export function buildVaultMediaItem(media, folder, itemKey, sourceIdOf, now = new Date()) {
  const url = cleanCapturedUrl(media?.url);
  // The card image is only its cover; do not silently store it as a video.
  if (media?.type === "video" && /\.(?:png|jpe?g|webp|gif|avif|bmp|svg)(?:$|[?#])/i.test(url)) {
    throw new Error("Cannot save a cover image as a playable video.");
  }
  if (!url || (media.type !== "video" && media.type !== "image")) throw new Error("Invalid captured media");
  const title = String(media.title || (media.type === "image" ? "Image" : "Video")).trim().slice(0, 180);
  const sourcePage = cleanCapturedUrl(media.sourcePage);
  const thumbnail = cleanCapturedUrl(media.thumbnail) || (media.type === "image" ? url : "");
  const id = itemKey(url);
  return {
    id: "media-" + id, key: id, url, title,
    note: sourcePage && sourcePage !== url ? "Source page: " + sourcePage : "",
    tags: [], source: sourceIdOf(url), folder: folder || null, tab: folder || "Vault Library",
    thumbnail, type: media.type, isVaultItem: true, addedAt: now.toISOString(),
  };
}
