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


// A 415 with SITE_NON_HTML applies to this particular URL, not the entire
// hostname; never poison the host-wide 403 cache for other gallery pages.
export function isUnsupportedDiscoveryResponse(response,data) {
  return response?.status === 415 && data?.code === "SITE_NON_HTML";
}


// Page-scoped variant used by gallery browsing. Hash the address before
// sessionStorage so sensitive source paths/query strings are not retained.
// A denied gallery must not disable unrelated pages under the same hostname.
const PAGE_KEY = "vault-browser-first-pages-v1";
function pageId(raw) {
  try {
    const u=new URL(String(raw||""));
    if(!["https:","http:"].includes(u.protocol)||u.username||u.password)return "";
    u.hash="";
    let h=2166136261;
    for(const c of u.href){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}
    return (h>>>0).toString(36);
  }catch{return "";}
}
function readPages(storage) {
  try {
    const data=JSON.parse(storage?.getItem(PAGE_KEY)||"{}");
    return data&&typeof data==="object"&&!Array.isArray(data)?data:{};
  }catch{return {};}
}
export function pageNeedsBrowser(raw,storage=globalThis.sessionStorage){
  const id=pageId(raw);return Boolean(id&&readPages(storage)[id]===true);
}
export function markPageBrowserFirst(raw,storage=globalThis.sessionStorage){
  const id=pageId(raw);if(!id||!storage)return false;
  try{
    const old=readPages(storage);
    const kept=Object.keys(old).filter(k=>old[k]===true&&k!==id).slice(-79);
    storage.setItem(PAGE_KEY,JSON.stringify({...Object.fromEntries(kept.map(k=>[k,true])),[id]:true}));
    return true;
  }catch{return false;}
}
export function clearPageBrowserFirst(raw,storage=globalThis.sessionStorage){
  const id=pageId(raw);if(!id||!storage)return;
  try{const p=readPages(storage);delete p[id];storage.setItem(PAGE_KEY,JSON.stringify(p));}catch{}
}
