const IMAGE_FILE = /\.(?:jpe?g|png|webp|gif|avif|bmp)(?:$|[?#])/i;
const BAD_ART = /(?:^|[\/_.-])(?:favicon|sprite|logo|icon|avatar|badge|pixel|tracker)(?:[\/_.-]|$)/i;
const LOW_RES = /(?:^|[\/_.-])(?:thumb|thumbnail|preview|small|tiny|icon)(?:[\/_.-]|$)|[?&](?:w|width)=(?:[1-9]\d?|[12]\d\d)(?:&|$)/i;
const FULL_RES = /(?:^|[\/_.-])(?:original|orig|full|large|hires|download)(?:[\/_.-]|$)/i;
const SCORES = { "gallery-full-image": 145, "structured-image": 125, "social-image": 110, "image-element": 85, "direct-media": 150, "browser-network-capture": 120 };

export function isImageFileUrl(value) {
  try {
    const u = new URL(String(value || ""));
    return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password && IMAGE_FILE.test(u.href);
  } catch { return false; }
}

// An image detail page may show both a resized cover and a full-resolution
// file. Prefer high-confidence canonical media, not the first <img>.
export function chooseBestImage(media, { coverUrl = "", pageUrl = "", title = "" } = {}) {
  const ranked = (Array.isArray(media) ? media : []).filter((item) => item?.type === "image" && isImageFileUrl(item.url) && !BAD_ART.test(new URL(item.url).pathname)).map((item) => {
    const u = new URL(item.url);
    let score = SCORES[item.sourceKind] || 65;
    if (FULL_RES.test(u.pathname)) score += 24;
    if (LOW_RES.test(u.pathname + u.search)) score -= 30;
    if (item.url === coverUrl) score -= 20;
    return { ...item, score };
  }).sort((a, b) => b.score - a.score);
  const selected = ranked[0];
  if (!selected) return null;
  return {
    url: selected.url, type: "image",
    title: title || selected.title || "Image",
    thumbnail: coverUrl || selected.thumbnail || selected.url,
    sourcePage: pageUrl || selected.sourcePage || selected.url,
    sourceKind: selected.sourceKind,
    resolution: selected.url === coverUrl ? "cover-only" : selected.score >= 105 ? "high-confidence" : "candidate",
  };
}
