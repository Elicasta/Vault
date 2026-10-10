// This remembers only a hostname in sessionStorage, never the page path,
// cookies, or scraped content. A denied origin stays browser-first for this
// tab/session until the user explicitly asks to retry server inspection.
const KEY = "vault-browser-first-hosts-v1";
const MAX_HOSTS = 80;

export function hostnameForPage(raw) {
  try {
    const u = new URL(String(raw || ""));
    return ["https:", "http:"].includes(u.protocol) ? u.hostname.toLowerCase() : "";
  } catch { return ""; }
}

function read(storage) {
  try {
    const data = JSON.parse(storage?.getItem(KEY) || "{}");
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch { return {}; }
}

export function siteNeedsBrowser(raw, storage = globalThis.sessionStorage) {
  const host = hostnameForPage(raw);
  return Boolean(host && read(storage)[host] === true);
}

export function markSiteBrowserFirst(raw, storage = globalThis.sessionStorage) {
  const host = hostnameForPage(raw);
  if (!host || !storage) return false;
  try {
    const old = read(storage);
    const kept = Object.keys(old).filter(key => old[key] === true && key !== host).slice(-(MAX_HOSTS - 1));
    const entries = Object.fromEntries(kept.map(key => [key, true]));
    entries[host] = true;
    storage.setItem(KEY, JSON.stringify(entries));
    return true;
  } catch { return false; }
}

export function clearBrowserFirst(raw, storage = globalThis.sessionStorage) {
  const host = hostnameForPage(raw);
  if (!host || !storage) return;
  try {
    const entries = read(storage);
    delete entries[host];
    storage.setItem(KEY, JSON.stringify(entries));
  } catch { /* Storage is optional. */ }
}

export function isWebsiteAccessDenial(response, data) {
  return response?.status === 403 && (
    data?.code === "SITE_ACCESS_DENIED" ||
    /^Website returned HTTP 403$|^Image page returned HTTP 403$/i.test(String(data?.error || ""))
  );
}
