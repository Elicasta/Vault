// MV3 Network observer. The browser extension can see actual media fetches,
// unlike a third-party iframe. It never fetches media, bypasses access control,
// modifies requests, or transmits URLs to another service.
importScripts("source-aware.js");
const sourceAware = globalThis.VaultSourceAware;
const MAX_ITEMS = 300;
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


// Chrome-only capture handoff into Elicasta/Vault. Saving happens inside
// the existing signed-in Vault application, never in this service worker.
const VAULT_DEFAULT_URL = "https://vault-preview-temp-git-polish-vault-p-5026a8-elicastas-projects.vercel.app";
function isOldVaultPreview(origin) {
  try {
    const host = new URL(origin).hostname;
    return host.startsWith("vault-preview-temp-git-feat-extension-") && host.endsWith("-elicastas-projects.vercel.app");
  } catch { return false; }
}
const PENDING_PREFIX = "vault_folder_job_";
const activeJobs = new Set();
const MAX_BATCH = 300;
const RETRY_ALARM = "vault-folder-capture-resume";

function safeVaultOrigin(raw) {
  try {
    const url = new URL(String(raw || "").trim());
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname) return "";
    return url.origin;
  } catch { return ""; }
}
async function getVaultOrigin(requested) {
  const stored = await chrome.storage.local.get("vault_import_origin").catch(() => ({}));
  const requestedOrigin = safeVaultOrigin(requested);
  const savedOrigin = safeVaultOrigin(stored.vault_import_origin);
  if (isOldVaultPreview(requestedOrigin) || isOldVaultPreview(savedOrigin)) {
    await chrome.storage.local.set({vault_import_origin: VAULT_DEFAULT_URL}).catch(() => {});
    return VAULT_DEFAULT_URL;
  }
  return requestedOrigin || savedOrigin || VAULT_DEFAULT_URL;
}
function cleanSelection(incoming) {
  const saved = [], seen = new Set();
  for (const item of (Array.isArray(incoming) ? incoming : [])) {
    const url = normalize(item?.url);
    if (!url || seen.has(url) || !["image", "video", "link", "audio"].includes(item?.type)) continue;
    seen.add(url);
    const analyzed=sourceAware.enrich({...item,url});
    if (!analyzed) continue;
    saved.push({
      url:analyzed.url,type:analyzed.type,source:analyzed.source,sourceName:analyzed.sourceName,
      title:String(item.title || analyzed.title || "").slice(0,180),
      thumbnail:normalize(item.thumbnail) || analyzed.thumbnail,
      sourcePage:normalize(item.sourcePage) || url,
      sourceKind:/^browser-/.test(item.sourceKind || "") ? item.sourceKind : "browser-shared-link",
    });
    if (saved.length >= MAX_BATCH) break;
  }
  return saved;
}
function insertIntoVaultPicker(payload) {
  // Invoked only on user-configured HTTPS Vault origin + /capture.
  try { return window.__vaultCaptureImport?.(payload) === true; }
  catch { return false; }
}
async function deliverJob(tabId) {
  if (activeJobs.has(tabId)) return;
  activeJobs.add(tabId);
  try {
    const key=PENDING_PREFIX+tabId;
    const value=await chrome.storage.session.get(key).catch(()=>({}));
    const job=value[key];
    if (!job) return;
    if (job.expires < Date.now()) {
      await chrome.storage.session.remove(key).catch(()=>{});
      return;
    }
    for (let tries=0; tries<12; tries++) {
      const tab=await chrome.tabs.get(tabId).catch(()=>null);
      if (!tab) break;
      try {
        const current=new URL(tab.url || "");
        if (current.origin !== job.origin || current.pathname !== "/capture") break;
        const response=await chrome.scripting.executeScript({
          target:{tabId}, world:"MAIN",
          func:insertIntoVaultPicker, args:[job.payload],
        });
        if (response?.[0]?.result === true) {
          await chrome.storage.session.remove(key);
          break;
        }
      } catch { /* AuthGate or Vercel authentication can still be loading. */ }
      await new Promise(resolve=>setTimeout(resolve, 900));
    }
  } finally { activeJobs.delete(tabId); }
}
async function resumeCaptureJobs() {
  const data=await chrome.storage.session.get(null).catch(()=>({}));
  await Promise.all(Object.entries(data)
    .filter(([key])=>key.startsWith(PENDING_PREFIX))
    .map(async ([key,job])=>{
      if (job?.expires < Date.now()) await chrome.storage.session.remove(key);
      else {
        const tabId=Number(key.slice(PENDING_PREFIX.length));
        if (Number.isInteger(tabId)) await deliverJob(tabId);
      }
    }));
}
async function launchFolderPicker(items, requestedOrigin) {
  const cleaned=cleanSelection(items);
  if (!cleaned.length) throw new Error("Choose a media file or link before saving.");
  const origin=await getVaultOrigin(requestedOrigin);
  const popup=await chrome.windows.create({
    url:origin+"/capture", type:"popup", focused:true, width:740, height:800,
  });
  const tabId=popup.tabs?.[0]?.id;
  if (!Number.isInteger(tabId)) throw new Error("Could not open Vault's folder picker.");
  const payload={
    format:"vault-extension-capture-v2",
    jobId:Date.now().toString(36)+"-"+tabId,
    items:cleaned,
  };
  await chrome.storage.session.set({
    [PENDING_PREFIX+tabId]:{
      origin,payload,expires:Date.now()+20*60*1000,
    },
  });
  void deliverJob(tabId);
  return {ok:true,count:cleaned.length,tabId};
}

// Capture context for links/pages without downloading content or reading cookies.
function inspectPageForVault(absoluteLink) {
  function safe(raw) {
    try {const u=new URL(raw,location.href);return ["http:","https:"].includes(u.protocol)?u.href:"";} catch {return "";}
  }
  const meta=(key)=>document.querySelector('meta[property="'+key+'"]')?.content ||
    document.querySelector('meta[name="'+key+'"]')?.content || "";
  let image=safe(meta("og:image") || meta("twitter:image"));
  let title=meta("og:title") || document.title || "Saved page";
  if (absoluteLink) {
    const target=safe(absoluteLink);
    for(const a of [...document.querySelectorAll("a[href]")].slice(0,800)) {
      if(safe(a.href)!==target)continue;
      const thumb=a.querySelector("img");
      image=safe(thumb?.currentSrc || thumb?.src || "") || image;
      title=thumb?.alt || a.getAttribute("aria-label") || a.title || title;
      break;
    }
  }
  return {title,thumbnail:image};
}
async function captureContext(tabId,targetUrl) {
  try {
    const result=await chrome.scripting.executeScript({
      target:{tabId},func:inspectPageForVault,args:[targetUrl || ""],
    });
    return result?.[0]?.result || {};
  } catch {return {};}
}
chrome.runtime.onInstalled.addListener(()=>{
  chrome.contextMenus.create({id:"vault_save_image",title:"Save image to Vault",contexts:["image"]},()=>{void chrome.runtime.lastError;});
  chrome.contextMenus.create({id:"vault_queue_image",title:"Add image to Vault capture queue",contexts:["image"]},()=>{void chrome.runtime.lastError;});
  chrome.contextMenus.create({id:"vault_save_link",title:"Save link to Vault",contexts:["link"]},()=>{void chrome.runtime.lastError;});
  chrome.contextMenus.create({id:"vault_save_page",title:"Save this page to Vault",contexts:["page"]},()=>{void chrome.runtime.lastError;});
  chrome.alarms.create(RETRY_ALARM,{periodInMinutes:1});
});
chrome.runtime.onStartup.addListener(()=>{
  chrome.alarms.create(RETRY_ALARM,{periodInMinutes:1});
  void resumeCaptureJobs();
});
chrome.alarms.onAlarm.addListener(info=>{
  if (info.name === RETRY_ALARM) void resumeCaptureJobs();
});
chrome.contextMenus.onClicked.addListener((info,tab)=>{
  if (!Number.isInteger(tab?.id)) return;
  const kind=info.menuItemId;
  if (!["vault_save_image","vault_queue_image","vault_save_link","vault_save_page"].includes(kind)) return;
  void (async()=>{
    const context=kind==="vault_save_image"||kind==="vault_queue_image"?"image":kind==="vault_save_link"?"link":"page";
    const clicked=normalize(context==="image"?info.srcUrl:context==="link"?info.linkUrl:tab.url);
    if (!clicked) return;
    let extra={};
    if(context!=="image") extra=await captureContext(tab.id,context==="link"?clicked:"");
    const link=context==="image"?normalize(info.linkUrl || ""):"";
    const full=context==="image" && /\\.(?:jpe?g|png|webp|avif|gif|bmp)(?:$|[?#])/i.test(link)?link:clicked;
    const item=sourceAware.enrich({
      url:full,title:extra.title || tab.title || "Saved media",
      thumbnail:context==="image"?clicked:extra.thumbnail,
      sourcePage:normalize(tab.url)||full,
      sourceKind:context==="image"?"browser-linked-full-image":"browser-shared-link",
    });
    if (!item) return;
    const map=state.get(tab.id)||new Map();
    map.set(item.url,item);
    state.set(tab.id,map);
    schedulePersist(tab.id);
    if(kind!=="vault_queue_image") await launchFolderPicker([item]);
  })().catch(e=>console.warn("[Vault capture]",e.message));
});
chrome.tabs.onUpdated.addListener((tabId,change)=>{
  if (change.status === "complete") void deliverJob(tabId);
});
chrome.tabs.onRemoved.addListener(tabId=>{
  activeJobs.delete(tabId);
  chrome.storage.session.remove(PENDING_PREFIX+tabId).catch(()=>{});
});
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  if (message?.type !== "VAULT_OPEN_PICKER") return;
  launchFolderPicker(message.items,message.origin).then(sendResponse)
    .catch(e=>sendResponse({ok:false,error:e.message || "Could not open Vault."}));
  return true;
});
