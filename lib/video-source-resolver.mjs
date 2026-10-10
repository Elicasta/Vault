// Pure URL and source validation used at every video-save boundary.
// Thumbnails are never promoted to playable media URLs.
const VIDEO_FILE = /\.(?:mp4|m4v|mov|webm|ogv|ogg|m3u8)(?:$|[?#])/i;
const IMAGE_FILE = /\.(?:jpe?g|png|webp|gif|avif|svg|bmp)(?:$|[?#])/i;
const VIDEO_MIME = /^(?:video\/(?:mp4|quicktime|webm|ogg|x-m4v)|application\/(?:vnd\.apple\.mpegurl|x-mpegurl))/i;
const AD_HOST = /(?:^|\.)(?:doubleclick\.net|googlesyndication\.com|googleadservices\.com|adnxs\.com|taboola\.com|outbrain\.com|criteo\.com|adsrvr\.org|pubmatic\.com)$/i;
const AD_PATH = /(?:^|\/)(?:ads?|adserver|sponsored|preroll|midroll|postroll|vast|vpaid)(?:\/|[-_.]|$)/i;

function validUrl(raw) {
  try {
    const u = new URL(String(raw || ""));
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password ||
      AD_HOST.test(u.hostname) || AD_PATH.test(u.pathname)) return "";
    u.hash = "";
    return u.href;
  } catch { return ""; }
}
export function isVideoFileUrl(raw) {
  const url = validUrl(raw);
  return Boolean(url && VIDEO_FILE.test(url) && !IMAGE_FILE.test(url));
}
export function isImageFileUrl(raw) {
  const url = validUrl(raw);
  return Boolean(url && IMAGE_FILE.test(url));
}
export function isPlayableVideoSource(source) {
  const url = validUrl(source?.url || source);
  if (!url || isImageFileUrl(url)) return false;
  if (isVideoFileUrl(url)) return true;
  // Extensionless media is accepted only if an actual media response supplied a
  // video/HLS content-type (not just a card inferred from HTML).
  return Boolean(source?.mimeType && VIDEO_MIME.test(source.mimeType) &&
    ["browser-network-capture", "direct-response"].includes(source?.sourceKind));
}

export function uniqueVideoSources(sources = [], options = {}) {
  const map = new Map();
  for (const source of (Array.isArray(sources) ? sources : []).slice(0, 100)) {
    if (!isPlayableVideoSource(source)) continue;
    const u = validUrl(source.url);
    if (map.has(u)) continue;
    map.set(u, {
      url: u,
      type: "video",
      mimeType: String(source.mimeType || source.type || ""),
      thumbnail: validUrl(source.thumbnail || options.thumbnail || ""),
      title: String(source.title || options.title || "Video").trim().slice(0, 180),
      sourcePage: validUrl(options.sourcePage || source.sourcePage || ""),
      sourceKind: source.sourceKind || "direct-file",
      confidence: "high",
    });
  }
  return [...map.values()];
}

export function prepareVideoToSave(media, chosenSource = null) {
  if (media?.type !== "video") return media;
  const source = chosenSource || media;
  if (!isPlayableVideoSource(source)) throw new Error("A playable video URL was not found. Preview the video and choose a stream before saving.");
  return {
    ...media,
    ...source,
    url: validUrl(source.url),
    type: "video",
    title: media.title || source.title || "Video",
    // The image is its cover, never the saved playable URL.
    thumbnail: validUrl(media.thumbnail || source.thumbnail || ""),
    sourcePage: validUrl(media.sourcePage || source.sourcePage || media.url || ""),
    sourceKind: source.sourceKind,
    mimeType: source.mimeType || media.mimeType || "",
  };
}
