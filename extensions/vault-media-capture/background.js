// MV3 Network observer. The browser extension can see actual media fetches,
// unlike a third-party iframe. It never fetches media, bypasses access control,
// modifies requests, or transmits URLs to another service.
const MAX_ITEMS = 200;
const TTL_MS = 60 * 60 * 1000;
const state = new Map();
const flushTimers = new Map();
const MEDIA_URL = /\.(?:mp4|m4v|mov|webm|m3u8|mp3|m4a|aac|ogg|ogv|jpe?g|png|webp|avif|gif)(?:$|[?#])/i;
const VIDEO_CONTENT = /^(?:video\/|application\/(?:vnd\.apple\.mpegurl|x-mpegurl|mpegurl))/i;
const IMAGE_CONTENT = /^image\/(?!svg)/i;
const AD_HOST = /(?:^|\.)(?:doubleclick\.net|googlesyndication\.com|googleadservices\.com|adnxs\.com|taboola\.com|outbrain\.com|criteo\.com|adsrvr\.org|pubmatic\.com|rubiconproject\.com|spotxchange\.com)$/i;
const AD_PATH = /(?:^|\/)(?:ads?|adserver|preroll|midroll|postroll|sponsored|vast|vpaid)(?:\/|[-_.]|$)/i;

function normalize(raw) {
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol) || AD_HOST.test(url.hostname) || AD_PATH.test(url.pathname)) return "";
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (/^utm_|^(?:gclid|fbclid|dclid|igshid)$/i.test(key)) url.searchParams.delete(key);
    }
    return url.href;
  } catch { return ""; }
}
function inferType(url, headers = []) {
  const type = headers.find((header) => header.name?.toLowerCase() === "content-type")?.value || "";
  if (VIDEO_CONTENT.test(type)) return "video";
  if (IMAGE_CONTENT.test(type)) return "image";
  if (/\.(?:mp4|m4v|mov|webm|m3u8|ogg|ogv)(?:$|[?#])/i.test(url)) return "video";
  if (/\.(?:jpe?g|png|webp|avif|gif)(?:$|[?#])/i.test(url)) return "image";
  return "";
}
function record(detail, headers) {
  if (detail.tabId < 0 || !detail.url || !["media", "xmlhttprequest", "image", "other"].includes(detail.type)) return;
  const url = normalize(detail.url);
  if (!url) return;
  const type = inferType(url, headers);
  if (!type) return;
  const map = state.get(detail.tabId) || new Map();
  if (!map.has(url) && map.size >= MAX_ITEMS) map.delete(map.keys().next().value);
  const old = map.get(url);
  const item = {
    url, type, title: old?.title || (type === "video" ? "Captured video" : "Captured image"),
    sourcePage: old?.sourcePage || normalize(detail.initiator || detail.documentUrl || ""),
    sourceKind: "browser-network-capture", capturedAt: Date.now(),
  };
  map.set(url, item);
  state.set(detail.tabId, map);
  schedulePersist(detail.tabId);
}
function schedulePersist(tabId) {
  if (flushTimers.has(tabId)) return;
  flushTimers.set(tabId, setTimeout(async () => {
    flushTimers.delete(tabId);
    const map = state.get(tabId);
    if (!map) return;
    try { await chrome.storage.session.set({ ["vault_media_" + tabId]: Array.from(map.values()) }); } catch {}
  }, 450));
}

chrome.webRequest.onBeforeRequest.addListener((details) => {
  if (MEDIA_URL.test(details.url)) record(details);
}, { urls: ["<all_urls>"] });
chrome.webRequest.onHeadersReceived.addListener((details) => {
  if (details.statusCode < 200 || details.statusCode >= 400) return;
  record(details, details.responseHeaders || []);
}, { urls: ["<all_urls>"] }, ["responseHeaders"]);

chrome.tabs.onRemoved.addListener((tabId) => {
  state.delete(tabId);
  chrome.storage.session.remove("vault_media_" + tabId).catch(() => {});
});
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status !== "loading" || !change.url) return;
  state.delete(tabId);
  chrome.storage.session.remove("vault_media_" + tabId).catch(() => {});
});



chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "VAULT_SMART_PICK") {
    const tabId=sender.tab?.id;
    const rect=message.rect;
    if(!Number.isInteger(tabId)||!rect || ![rect.left,rect.top,rect.width,rect.height].every(Number.isFinite)) {
      sendResponse({ok:false});return;
    }
    chrome.storage.session.set({["vault_smart_selected_"+tabId]:{
      url:message.url,rect,viewportW:message.viewportW,viewportH:message.viewportH,at:Date.now(),
    }}).then(()=>sendResponse({ok:true})).catch(()=>sendResponse({ok:false}));
    return true;
  }
  if (message?.type !== "VAULT_CAPTURE_GET" || !Number.isInteger(message.tabId)) return;
  (async () => {
    let entries = Array.from(state.get(message.tabId)?.values() || []);
    if (!entries.length) {
      const stored = await chrome.storage.session.get("vault_media_" + message.tabId).catch(() => ({}));
      entries = stored["vault_media_" + message.tabId] || [];
    }
    const now = Date.now();
    entries = entries.filter((item) => now - Number(item.capturedAt || now) <= TTL_MS);
    sendResponse({ items: entries });
  })().catch(() => sendResponse({ items: [] }));
  return true;
});
