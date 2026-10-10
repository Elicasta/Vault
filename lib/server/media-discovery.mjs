import { parsePublicHttpUrl } from "./safe-url-core.mjs";

const VIDEO_EXT = /\.(?:mp4|m4v|webm|mov|ogv|ogg|m3u8)(?:$|[?#])/i;
const IMAGE_EXT = /\.(?:jpe?g|png|webp|avif|gif|bmp)(?:$|[?#])/i;
const AD_HOST = /(?:^|\.)(?:doubleclick\.net|googlesyndication\.com|googleadservices\.com|adnxs\.com|taboola\.com|outbrain\.com|adsrvr\.org|criteo\.com|pubmatic\.com|rubiconproject\.com|spotx(?:change)?\.com|imasdk\.googleapis\.com)$/i;
const AD_PATH = /(?:^|\/)(?:ads?|adserver|advertising|sponsored|preroll|midroll|postroll|vast|vpaid)(?:\/|[-_.]|$)/i;
const AD_ATTR = /\b(?:ad-slot|ad-unit|advertisement|sponsored|promoted|preroll|midroll|postroll|vast|vpaid)\b/i;
const PAGE_VIDEO_PATH = /\/(?:watch|videos?|reels?|shorts|clips?|episodes?|player|embed|post|posts|p|view|scene|scenes|movie|movies|detail|item)\/|[?&]v=[a-zA-Z0-9_-]{7,}/i;
const NOT_DETAIL_PATH = /\/(?:login|logout|signin|signup|register|account|settings|search|tags?|categories?|channels?|users?|profiles?|privacy|terms|about|contact|advertise|subscribe|checkout|cart|help|faq|feed|trending|popular|latest)(?:\/|$)/i;
const DETAIL_SIGNAL = /(?:\bvideo\b|\bclip\b|\breel\b|\bwatch\b|\bpost\b|\bplayer\b|\bplay\b|\bposter\b|\bthumb(?:nail)?\b|\bscene\b|\bmovie\b)/i;
const MEDIA_CAP = 96;

function decode(value = "") {
  return String(value).replace(/&(?:amp|quot|apos|lt|gt|nbsp|#x[0-9a-f]+|#[0-9]+);/gi, (match) => {
    const key = match.slice(1, -1).toLowerCase();
    if (key[0] === "#") {
      const num = key[1] === "x" ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
      return Number.isInteger(num) && num > 0 && num <= 0x10ffff ? String.fromCodePoint(num) : "";
    }
    return ({ amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " })[key] || match;
  });
}

function attrs(tag) {
  const out = {};
  for (const match of String(tag).matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    out[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return out;
}

function plain(value) {
  return decode(String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")).trim().slice(0, 180);
}

function urlFor(raw, base) {
  try {
    const value = decode(raw).trim();
    if (!value || value.startsWith("#")) return "";
    const url = new URL(value, base);
    parsePublicHttpUrl(url.href);
    if (AD_HOST.test(url.hostname) || AD_PATH.test(url.pathname)) return "";
    url.hash = "";
    for (const param of Array.from(url.searchParams.keys())) {
      if (/^utm_|^(?:fbclid|gclid|dclid|mc_cid|mc_eid|igshid)$/i.test(param)) url.searchParams.delete(param);
    }
    return url.href;
  } catch { return ""; }
}

export function canonicalMediaUrl(raw, base) {
  const u = urlFor(raw, base);
  if (!u) return "";
  try {
    const url = new URL(u);
    const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    if (host === "youtu.be" || host === "youtube.com" || host === "youtube-nocookie.com") {
      const id = host === "youtu.be" ? url.pathname.split("/")[1] :
        url.searchParams.get("v") || url.pathname.match(/\/(?:shorts|embed|live|v)\/([\w-]{11})/)?.[1];
      if (id && /^[\w-]{11}$/.test(id)) return "https://www.youtube.com/watch?v=" + id;
    }
    if (host === "player.vimeo.com") {
      const id = url.pathname.match(/\/video\/(\d+)/)?.[1];
      if (id) return "https://vimeo.com/" + id;
    }
    return u;
  } catch { return ""; }
}

function mediaTypeFromUrl(url) {
  if (VIDEO_EXT.test(url)) return "video";
  if (IMAGE_EXT.test(url)) return "image";
  return "";
}

function fallbackTitle(url, kind) {
  try {
    const segment = new URL(url).pathname.split("/").filter(Boolean).pop() || kind;
    return plain(decodeURIComponent(segment).replace(/[-_]+/g, " ").replace(/\.[a-z0-9]{2,5}$/i, "")) || kind;
  } catch { return kind; }
}

function isMediaPage(url) {
  try {
    const { hostname, pathname, search } = new URL(url);
    const host = hostname.replace(/^www\./, "");
    if (/^(?:m\.)?(?:youtube\.com|youtu\.be|vimeo\.com|tiktok\.com|instagram\.com|streamable\.com)$/.test(host)) return true;
    return PAGE_VIDEO_PATH.test(pathname + search);
  } catch { return false; }
}

function chooseSrcset(raw, base) {
  const entries = String(raw || "").split(",").map((part) => {
    const m = part.trim().match(/^(\S+)(?:\s+(\d+)(w|x))?/);
    if (!m) return null;
    return { url: canonicalMediaUrl(m[1], base), size: Number(m[2] || 0), unit: m[3] || "" };
  }).filter((v) => v?.url && mediaTypeFromUrl(v.url) === "image");
  return entries.sort((a, b) => b.size - a.size)[0]?.url || "";
}

function imageFromAttrs(tagAttrs, base) {
  return chooseSrcset(tagAttrs.srcset || tagAttrs["data-srcset"], base) ||
    canonicalMediaUrl(tagAttrs["data-src"] || tagAttrs["data-lazy-src"] || tagAttrs.src, base);
}

function looksLikeAd(tag, url) {
  return AD_ATTR.test(tag) || !url || AD_HOST.test(new URL(url).hostname) || AD_PATH.test(new URL(url).pathname);
}

// Only navigate specifically marked embedded players, not arbitrary page links.
export function discoverEmbeddedPlayerUrls(html, pageUrl, { limit = 2 } = {}) {
  const found = new Set();
  for (const match of String(html || "").slice(0, 1_200_000).matchAll(/<iframe\b[^>]*>/gi)) {
    const at = attrs(match[0]);
    if (AD_ATTR.test(match[0])) continue;
    const url = canonicalMediaUrl(at["data-src"] || at.src, pageUrl);
    if (!url || url === pageUrl) continue;
    try {
      const target = new URL(url);
      if (!isMediaPage(url) && !/\/(?:embed|iframe|player)\//i.test(target.pathname)) continue;
      found.add(url);
    } catch {}
    if (found.size >= Math.min(3, Math.max(1, limit))) break;
  }
  return [...found];
}

export function discoverMedia(html, rawPageUrl, { limit = MEDIA_CAP } = {}) {
  const pageUrl = canonicalMediaUrl(rawPageUrl, rawPageUrl);
  if (!pageUrl) throw new Error("Invalid public page URL");
  const source = String(html || "").slice(0, 1_200_000);
  const map = new Map();
  const videoPages = new Map();
  const pageTitle = plain(source.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || new URL(pageUrl).hostname);
  const max = Math.max(1, Math.min(MEDIA_CAP, Number(limit) || MEDIA_CAP));
  let filteredAds = 0;
  let refused = 0;
  const add = ({ url: rawUrl, type, title, thumbnail, score = 0, sourceKind = "page", page = pageUrl }) => {
    if (!rawUrl || !["image", "video"].includes(type)) return;
    const url = canonicalMediaUrl(rawUrl, page);
    if (!url) { filteredAds += 1; return; }
    if (type === "image" && (/\.svg(?:$|[?#])/i.test(url) || /(?:favicon|sprite|icon-\d|logo)(?:[_.-]|$)/i.test(url))) return;
    const otherType = mediaTypeFromUrl(url);
    if (otherType && otherType !== type) return;
    const resolvedThumb = type === "image" ? url : canonicalMediaUrl(thumbnail, page) || "";
    const current = map.get(url);
    const candidate = {
      url, type, title: plain(title) || fallbackTitle(url, type === "video" ? "Video" : "Image"),
      thumbnail: resolvedThumb, sourcePage: pageUrl, sourceKind, confidence: score >= 80 ? "high" : "medium",
      score,
    };
    if (!current) {
      if (map.size >= max * 2) { refused += 1; return; }
      map.set(url, candidate);
    } else if (candidate.score > current.score) {
      map.set(url, { ...candidate, thumbnail: candidate.thumbnail || current.thumbnail });
    } else if (!current.thumbnail && candidate.thumbnail) {
      current.thumbnail = candidate.thumbnail;
    }
  };

  // Explicit player/video tags identify the actual requested clip, unlike ad banners.
  for (const match of source.matchAll(/<video\b[^>]*>([\s\S]*?)<\/video>|<video\b[^>]*\/?>/gi)) {
    const tag = match[0].match(/^<video\b[^>]*>/i)?.[0] || match[0].match(/^<video\b[^>]*\/?>/i)?.[0] || "";
    const at = attrs(tag);
    if (AD_ATTR.test(tag) || looksLikeAd(tag, canonicalMediaUrl(at.src || pageUrl, pageUrl))) continue;
    const poster = canonicalMediaUrl(at.poster, pageUrl);
    const label = at.title || at["aria-label"] || pageTitle;
    if (at.src) add({ url: at.src, type: "video", title: label, thumbnail: poster, score: 100, sourceKind: "video-element" });
    for (const child of (match[1] || "").matchAll(/<source\b[^>]*>/gi)) {
      const src = attrs(child[0]);
      if (src.src && !AD_ATTR.test(child[0]) && (mediaTypeFromUrl(src.src) === "video" || /^video\/|mpegurl/i.test(src.type || ""))) {
        add({ url: src.src, type: "video", title: label, thumbnail: poster, score: 100, sourceKind: "video-source" });
      }
    }
  }

  // Some players emit stand-alone <source> elements.
  for (const match of source.matchAll(/<source\b[^>]*>/gi)) {
    const at = attrs(match[0]);
    if (!AD_ATTR.test(match[0]) && (mediaTypeFromUrl(at.src || "") === "video" || /^video\/|mpegurl/i.test(at.type || ""))) {
      add({ url: at.src, type: "video", title: at.title || pageTitle, score: 88, sourceKind: "source" });
    }
  }

  const meta = new Map();
  for (const match of source.matchAll(/<meta\b[^>]*>/gi)) {
    const at = attrs(match[0]);
    const key = String(at.property || at.name || "").toLowerCase();
    if (key && at.content && !meta.has(key)) meta.set(key, at.content);
  }
  const heroImage = canonicalMediaUrl(meta.get("og:image:secure_url") || meta.get("og:image") || meta.get("twitter:image") || "", pageUrl);
  const headline = meta.get("og:title") || meta.get("twitter:title") || pageTitle;
  for (const key of ["og:video:secure_url", "og:video:url", "og:video", "twitter:player:stream"]) {
    if (meta.get(key)) add({ url: meta.get(key), type: "video", title: headline, thumbnail: heroImage, score: 98, sourceKind: "social-video" });
  }
  if (heroImage && !String(meta.get("og:type") || "").includes("video")) {
    add({ url: heroImage, type: "image", title: headline, score: 90, sourceKind: "social-image" });
  }
  if (/video/i.test(meta.get("og:type") || "") && isMediaPage(pageUrl)) {
    add({ url: pageUrl, type: "video", title: headline, thumbnail: heroImage, score: 110, sourceKind: "canonical-video-page" });
  }

  const jsonObjects = [];
  for (const match of source.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { jsonObjects.push(JSON.parse(match[1].trim())); } catch { /* third-party JSON-LD can be malformed */ }
  }
  const visited = new Set();
  function readStructured(object, depth = 0) {
    if (!object || typeof object !== "object" || depth > 5 || visited.has(object)) return;
    visited.add(object);
    if (Array.isArray(object)) { for (const item of object.slice(0, 80)) readStructured(item, depth + 1); return; }
    const kinds = [object["@type"]].flat().filter(Boolean).join(" ");
    const video = /\bVideoObject\b/i.test(kinds);
    const image = /\bImageObject\b/i.test(kinds);
    const thumb = typeof object.thumbnailUrl === "string" ? object.thumbnailUrl :
      Array.isArray(object.thumbnailUrl) ? object.thumbnailUrl[0] : "";
    if (video) {
      const permalink = object.url || object.mainEntityOfPage || object.embedUrl;
      const first = typeof permalink === "string" && isMediaPage(canonicalMediaUrl(permalink, pageUrl)) ? permalink : "";
      // An actual contentUrl is the saved video; URL/permalink identifies its page only.
      const media = object.contentUrl || object.embedUrl || first || object.url;
      if (typeof media === "string") add({ url: media, type: "video", title: object.name || headline, thumbnail: thumb || heroImage, score: first ? 112 : 95, sourceKind: "structured-video" });
    }
    if (image) {
      const media = object.contentUrl || object.url || object.thumbnailUrl;
      if (typeof media === "string") add({ url: media, type: "image", title: object.name || headline, score: 91, sourceKind: "structured-image" });
    }
    for (const key of ["@graph", "itemListElement", "item", "mainEntity", "hasPart", "associatedMedia", "video", "image"]) {
      if (object[key] && typeof object[key] === "object") readStructured(object[key], depth + 1);
    }
  }
  jsonObjects.forEach((entry) => readStructured(entry));

  // Embed player URLs are often the only stable per-video link in a gallery.
  for (const match of source.matchAll(/<iframe\b[^>]*>/gi)) {
    const at = attrs(match[0]);
    if (at.src && !AD_ATTR.test(match[0]) && isMediaPage(canonicalMediaUrl(at.src, pageUrl))) {
      add({ url: at.src, type: "video", title: at.title || headline, thumbnail: heroImage, score: 88, sourceKind: "embedded-video" });
    }
  }

  // A gallery card's post permalink is safer than short-lived signed CDN fragments.
  const videoCardImages = [];
  for (const match of source.matchAll(/<a\b[^>]*>([\s\S]{0,5000}?)<\/a>/gi)) {
    const opening = match[0].match(/^<a\b[^>]*>/i)?.[0] || "";
    const at = attrs(opening);
    const href = canonicalMediaUrl(at.href, pageUrl);
    if (!href || AD_ATTR.test(opening) || AD_ATTR.test(match[1])) continue;
    const link = new URL(href);
    const current = new URL(pageUrl);
    if (href === pageUrl || NOT_DETAIL_PATH.test(link.pathname) || IMAGE_EXT.test(href) || VIDEO_EXT.test(href) || /\.(?:pdf|zip|html?|css|js)(?:$|[?#])/i.test(href)) continue;
    const img = (match[1] || "").match(/<img\b[^>]*>/i);
    const imageAttrs = img ? attrs(img[0]) : {};
    const thumb = img ? imageFromAttrs(imageAttrs, pageUrl) : "";
    const label = at.title || at["aria-label"] || imageAttrs.alt || plain(match[1]).slice(0, 95) || fallbackTitle(href, "Video page");
    const hinted = isMediaPage(href) || DETAIL_SIGNAL.test(opening + (match[1] || "").slice(0, 500));
    const sameSite = link.hostname === current.hostname || link.hostname.endsWith("." + current.hostname);
    const isPossibleDetail = Boolean(
      (thumb && (hinted || (sameSite && link.pathname !== current.pathname && !/\/(?:index)?$/i.test(link.pathname)))) ||
      (hinted && (thumb || at.title || at["aria-label"]))
    );
    if (!isPossibleDetail) continue;
    if (img && (Number(imageAttrs.width) > 0 && Number(imageAttrs.width) <= 40 || Number(imageAttrs.height) > 0 && Number(imageAttrs.height) <= 40)) continue;
    if (!videoPages.has(href) && videoPages.size < 80) {
      videoPages.set(href, { url: href, title: label, thumbnail: thumb, sourcePage: pageUrl,
        confidence: hinted ? "likely-video" : "possible-detail", kind: "video-page" });
    }
    // Generic image-backed links belong to Browse/Explore, not Save Video.
    if (hinted && thumb) add({ url: href, type: "video", title: label, thumbnail: thumb, score: 107, sourceKind: "video-card" });
    if (img) videoCardImages.push([match.index + match[0].indexOf(img[0]), match.index + match[0].indexOf(img[0]) + img[0].length]);
  }

  for (const match of source.matchAll(/<img\b[^>]*>/gi)) {
    if (videoCardImages.some(([start, end]) => match.index >= start && match.index < end)) continue;
    const at = attrs(match[0]);
    if (AD_ATTR.test(match[0]) || Number(at.width) && Number(at.width) <= 32 || Number(at.height) && Number(at.height) <= 32) continue;
    const url = imageFromAttrs(at, pageUrl);
    if (!url || mediaTypeFromUrl(url) !== "image") continue;
    const title = at.alt || at.title || fallbackTitle(url, "Image");
    add({ url, type: "image", title, score: 70, sourceKind: "image-element" });
  }

  // Selected video detail pages can expose the stream in a JavaScript player
  // configuration instead of a native video element. Detect file-shaped URLs
  // only; never infer a playable stream from an image or poster field.
  let foundInline = 0;
  for (const match of source.matchAll(/["'](https?:\/\/[^"'<> \t\r\n]+?\.(?:mp4|m4v|webm|mov|m3u8)(?:\?[^"'<> \t\r\n]*)?)["']/gi)) {
    const raw = match[1];
    add({ url: raw, type: "video", title: pageTitle, thumbnail: "", score: 85, sourceKind: "inline-player-video" });
    if (++foundInline >= 12) break;
  }

  const media = [...map.values()].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, max).map(({ score, ...item }) => item);
  return { pageUrl, pageTitle, media,
    videoPages: [...videoPages.values()],
    counts: { videos: media.filter((x) => x.type === "video").length, images: media.filter((x) => x.type === "image").length, videoPages: videoPages.size },
    filteredAds, truncated: map.size > max || refused > 0 };
}
