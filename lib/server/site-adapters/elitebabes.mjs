// Optional site adapter for public EliteBabes gallery markup.
// Only operates on HTML actually received from the site; never changes
// authentication, sends cookies, bypasses a 403, or crawls other pages.
const FILE_IMAGE = /\.(?:jpe?g|png|webp|gif|avif)(?:$|[?#])/i;
const BLOCKED_ART = /(?:^|[/_.-])(?:favicon|logo|sprite|icon|pixel|tracker|avatar)(?:[/_.-]|$)/i;
const MAX_RESULTS = 96;

export function isEliteBabesUrl(raw) {
  try {
    const u = new URL(String(raw || ""));
    return (u.protocol === "https:" || u.protocol === "http:") &&
      (u.hostname === "elitebabes.com" || u.hostname.endsWith(".elitebabes.com"));
  } catch { return false; }
}

function attributes(tag) {
  const result = {};
  for (const match of String(tag).matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    result[match[1].toLowerCase()] = (match[2] ?? match[3] ?? match[4] ?? "")
      .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/g, "'");
  }
  return result;
}

function publicImageUrl(raw, base, allowUnverified = false) {
  try {
    if (!raw || /^(?:data|blob|javascript):/i.test(String(raw))) return "";
    const u = new URL(String(raw), base);
    if (!["https:", "http:"].includes(u.protocol) || u.username || u.password ||
      BLOCKED_ART.test(u.pathname) || (!FILE_IMAGE.test(u.href) && !allowUnverified)) return "";
    // Never hand out internal addresses, even as candidates.
    if (/^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|::1$)/i.test(u.hostname)) return "";
    return u.href;
  } catch { return ""; }
}

function bestSrcset(value, base) {
  const options = String(value || "").split(",").map((part) => {
    const m = part.trim().match(/^(\S+)(?:\s+(\d+)(?:w|x))?/);
    return m ? { url: publicImageUrl(m[1], base), size: Number(m[2] || 0) } : null;
  }).filter((option) => option?.url);
  options.sort((a, b) => b.size - a.size);
  return options[0]?.url || "";
}

function inlineTitle(html, fallback) {
  const image = html.match(/<img\b[^>]*>/i);
  const imgAttr = image ? attributes(image[0]) : {};
  return String(imgAttr.alt || imgAttr.title || fallback || "Gallery image")
    .replace(/<[^>]*>/g, "").trim().slice(0, 180);
}

// Anchor-based image galleries frequently link full images through href,
// data-full or data-original while the nested img is a resized thumbnail.
// The general collector already parses <img>; this supplements originals.
export function collectEliteBabesImages(html, pageUrl, limit = MAX_RESULTS) {
  if (!isEliteBabesUrl(pageUrl)) return [];
  const source = String(html || "").slice(0, 1_200_000);
  const found = new Map();
  const count = Math.max(1, Math.min(MAX_RESULTS, Number(limit) || MAX_RESULTS));
  for (const m of source.matchAll(/<a\b[^>]*>([\s\S]{0,5000}?)<\/a>/gi)) {
    const opening = m[0].match(/^<a\b[^>]*>/i)?.[0] || "";
    const a = attributes(opening);
    const inner = m[1] || "";
    const img = inner.match(/<img\b[^>]*>/i);
    const i = img ? attributes(img[0]) : {};
    const galleryMarker = /(?:fancybox|lightbox|gallery|photo|full|original)/i.test(
      [a.class, a.rel, a["data-fancybox"], a["data-gallery"], opening].join(" ")
    );
    const thumb = bestSrcset(i.srcset || i["data-srcset"], pageUrl) ||
      publicImageUrl(i["data-src"] || i.src, pageUrl);
    const rawFull = a["data-full"] || a["data-original"] || a["data-image"] ||
      a["data-src"] || a.href;
    const full = publicImageUrl(rawFull, pageUrl, galleryMarker && Boolean(img));
    if (!full || (!img && !galleryMarker) || found.has(full)) continue;
    // A thumbnail-only anchor is not an original. Mark it as a candidate.
    const isFile = FILE_IMAGE.test(full);
    found.set(full, {
      url: full, type: "image", title: inlineTitle(inner, a.title || "Gallery image"),
      thumbnail: thumb || full, sourcePage: pageUrl,
      sourceKind: "site-gallery-candidate",
      confidence: isFile && galleryMarker ? "high" : "medium",
    });
    if (found.size >= count) break;
  }
  return [...found.values()];
}

export function enrichEliteBabesDiscovery(result, html, pageUrl) {
  if (!isEliteBabesUrl(pageUrl)) return result;
  const candidates = collectEliteBabesImages(html, pageUrl);
  const current = Array.isArray(result?.media) ? result.media : [];
  const map = new Map(current.map((item) => [item.url, item]));
  for (const item of candidates) {
    const previous = map.get(item.url);
    if (!previous) map.set(item.url, item);
    else if (item.thumbnail && !previous.thumbnail) map.set(item.url, { ...previous, thumbnail: item.thumbnail });
  }
  const media = [...map.values()].slice(0, MAX_RESULTS);
  const imageCount = media.filter((item) => item.type === "image").length;
  return {
    ...result, media,
    galleryDetected: Boolean(result?.galleryDetected || imageCount > 3),
    counts: { ...result?.counts, images: imageCount },
    siteAdapter: "elitebabes", browserCaptureSupported: true,
  };
}
