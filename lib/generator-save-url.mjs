// URL is always the first-class Vault save. Never mistake blob: links,
// data: URLs, or temporary preview object URLs for durable media.
const IMAGE_EXT = /\.(?:jpe?g|png|webp|gif|avif|bmp)(?:$|[?#])/i;
const VIDEO_EXT = /\.(?:mp4|m4v|mov|webm|ogv|m3u8)(?:$|[?#])/i;

export function normalizeGeneratorPublicUrl(value) {
  const input = String(value || "").trim();
  if (!input || /[\u0000-\u001f\u007f]/.test(input)) return "";
  try {
    const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : "https://" + input;
    const url = new URL(candidate);
    if (!["http:","https:"].includes(url.protocol) || !url.hostname || url.username || url.password) return "";
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/,"");
    if (host === "localhost" || /\.(?:localhost|local|lan|internal)$/.test(host) ||
      /^(?:127\.|10\.|192\.168\.|169\.254\.|0\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host) ||
      /^(?:::1|::|fc[0-9a-f]{2}:|fd[0-9a-f]{2}:|fe80:)/i.test(host)) return "";
    return url.href;
  } catch { return ""; }
}

export function inferGeneratorUrlType(url) {
  if (IMAGE_EXT.test(url)) return "image";
  if (VIDEO_EXT.test(url)) return "video";
  return "link";
}

export function buildGeneratorUrlItem(url, { site, siteName, folder, title, keyOf, now = new Date() }) {
  const normalized = normalizeGeneratorPublicUrl(url);
  if (!normalized) throw new Error("Enter a public website or media URL. Blob, data and local URLs require Save Permanent Copy instead.");
  if (typeof keyOf !== "function") throw new Error("Vault item key generation unavailable.");
  const kind = inferGeneratorUrlType(normalized);
  const key = keyOf(normalized);
  const hostname = new URL(normalized).hostname;
  return {
    key, url:normalized, type:kind, title:String(title || "").trim().slice(0,180) || (kind === "link" ? hostname : kind === "image" ? "Saved image" : "Saved video"),
    note:"Saved as URL from " + String(siteName || site || "website") + ". If this link expires or depends on browser history, use Save Permanent Copy to preserve the media file.",
    tags:["saved-url",site].filter(Boolean),
    folder:folder || null, isVaultItem:true, sourcePage:normalized,
    addedAt:now.toISOString(),
  };
}
