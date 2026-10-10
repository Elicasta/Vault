// Native Chrome Studio: Venice and Perchance run as real top-level Chrome
// websites with their normal login, storage and generation UI. This panel is
// Vault's side-by-side companion. No cookies or passwords are requested.
const SITES = {
  venice: { url: "https://venice.ai/", host: "venice.ai", label: "Venice AI" },
  perchance: { url: "https://perchance.org/ai-text-to-image-generator", host: "perchance.org", label: "Perchance AI" },
};
const $ = id => document.getElementById(id);
const status = message => { $("status").textContent = message; };
let latest = { site: "", tabId: null, url: "", title: "" };
function siteFor(url) {
  try {
    const host = new URL(url).hostname;
    return Object.entries(SITES).find(([, site]) => host === site.host || host.endsWith("." + site.host))?.[0] || "";
  } catch { return ""; }
}
async function getSiteTab() {
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (active?.id && siteFor(active.url)) return active;
  const tabs = await chrome.tabs.query({});
  const studios = tabs.filter(tab => tab?.id && siteFor(tab.url));
  return studios.sort((a,b) => Number(b.active)-Number(a.active))[0] || null;
}
async function refresh() {
  const tab = await getSiteTab();
  if (!tab) {
    latest = { site: "", tabId: null, url: "", title: "" };
    $("current-site").textContent = "Open Venice or Perchance to begin";
    $("current-url").textContent = "Select a site above";
  } else {
    latest = { site: siteFor(tab.url), tabId: tab.id, url: tab.url, title: tab.title || "" };
    $("current-site").textContent = SITES[latest.site]?.label || "Website";
    $("current-url").textContent = latest.url;
  }
  document.querySelectorAll("[data-studio]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.studio === latest.site)));
  $("save-page").disabled = !latest.tabId;
  $("scan-page").disabled = !latest.tabId;
  $("smart-crop").disabled = !latest.tabId;
  $("pick-image").disabled = !latest.tabId;
}
async function vaultLocation() {
  const saved = await chrome.storage.local.get("vault_studio_origin");
  const candidate = String(saved.vault_studio_origin || "");
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    if (!["https:","http:"].includes(url.protocol) || !url.hostname) return "";
    if (url.protocol === "http:" && url.hostname !== "localhost") return "";
    if (url.hostname !== "localhost" && !url.hostname.includes("vault")) return "";
    return url.origin;
  } catch { return ""; }
}
async function saveUrl(url, title = "") {
  const site = latest.site || siteFor(url) || "venice";
  const base = await vaultLocation();
  if (!base) {
    status("Open this studio from Vault once to connect it, then return and save the URL.");
    return;
  }
  try {
    const u = new URL(url);
    if (!["http:","https:"].includes(u.protocol)) throw new Error("This temporary address isn't a durable URL. Capture the image instead.");
    const target = base + "/studios/" + site + "?url=" + encodeURIComponent(u.href) + (title ? "&title=" + encodeURIComponent(title.slice(0,120)) : "");
    const existing = await chrome.tabs.query({});
    const vaultTab = existing.find(tab => {
      try {const u = new URL(tab.url);return u.origin === base && u.pathname.startsWith("/studios/");}
      catch {return false;}
    });
    if (vaultTab?.id) {
      await chrome.tabs.update(vaultTab.id, {url:target,active:false});
    } else {
      await chrome.tabs.create({url:target,active:false});
    }
    status("Vault opened with the URL and collection ready. Select its tab and press Save URL to Vault to confirm.");
  } catch (error) {status("Could not prepare the save: "+(error.message||"Unknown error"));}
}
async function scanDomInPage() {
  const nodes = [...document.querySelectorAll("img,video,source,meta[property='og:image'],meta[property='og:video']")].slice(0,200);
  return nodes.map(node => {
    const tag = node.tagName.toLowerCase();
    const type = tag === "video" || tag === "source" || node.getAttribute("property") === "og:video" ? "video" : "image";
    const url = node.currentSrc || node.src || node.content || "";
    return { url, type, title: node.alt || node.title || document.title, sourcePage: location.href };
  }).filter(x => /^(?:https?:|blob:|data:)/i.test(x.url));
}
function formatUrl(url) { return String(url || "").length > 165 ? url.slice(0,165) + "…" : url; }
async function scan() {
  $("media-list").replaceChildren();
  const tab = await getSiteTab();
  if (!tab) {status("Open Venice or Perchance first."); return;}
  latest = {site:siteFor(tab.url),url:tab.url,title:tab.title||"",tabId:tab.id};
  status("Inspecting visible media and browser network requests…");
  const map = new Map();
  try {
    const data = await chrome.runtime.sendMessage({type:"VAULT_CAPTURE_GET",tabId:tab.id});
    for (const item of data?.items || []) {
      if (item?.url && /^https?:/i.test(item.url)) map.set(item.url,item);
    }
    const frames = await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},func:scanDomInPage});
    for (const frame of frames) for (const item of frame.result || []) {
      if (!map.has(item.url)) map.set(item.url,item);
    }
  } catch (error) {
    status("Some embedded frames restrict inspection. Showing any available media.");
  }
  const entries = [...map.values()].slice(0,80);
  if (!entries.length) {
    status("No ordinary media URLs found. Generated images may use blob: or canvas pixels; use Smart Image Capture below.");
    return;
  }
  status(entries.length + " media candidate" + (entries.length===1?"":"s") + " found.");
  for (const item of entries) {
    const container = document.createElement("div");container.className="media-item";
    const kind = document.createElement("span");kind.className="media-type";kind.textContent=item.type||"media";
    const title = document.createElement("strong");title.textContent=String(item.title||"Generated media").slice(0,100);
    const summary = document.createElement("small");summary.textContent=formatUrl(item.url);
    const button = document.createElement("button");
    button.textContent = /^https?:\/\//.test(item.url) ? "Save media URL to Vault" : "Capture this media";
    button.addEventListener("click",()=>{
      if (/^https?:\/\//.test(item.url)) saveUrl(item.url,item.title);
      else status("This uses a browser-local URL. Choose Capture main image or Pick exact image below for a permanent file.");
    });
    container.append(kind,title,summary,button);
    $("media-list").append(container);
  }
}

document.querySelectorAll("[data-studio]").forEach(button => button.addEventListener("click",async()=>{
  status("Opening "+SITES[button.dataset.studio].label+"…");
  const response = await chrome.runtime.sendMessage({type:"VAULT_STUDIO_OPEN",site:button.dataset.studio}).catch(e=>({error:e.message}));
  if(response?.error)status(response.error);
  else status("Website opened in Chrome with your existing browser login and history.");
  await refresh();
}));
$("scan-page").addEventListener("click",scan);
$("save-page").addEventListener("click",async()=>{
  const tab = await getSiteTab();
  if (tab) {latest={site:siteFor(tab.url),url:tab.url,title:tab.title||"",tabId:tab.id};await saveUrl(tab.url,tab.title||"");}
  else status("Choose a site first.");
});
$("open-vault").addEventListener("click",async()=>{
  const base=await vaultLocation();
  if(!base){status("Open Chrome Studio from your Vault app once to connect its address.");return;}
  await chrome.tabs.create({url:base+"/library",active:true});
});
chrome.tabs.onActivated.addListener(()=>refresh().catch(()=>{}));
chrome.tabs.onUpdated.addListener((tabId,change)=>{if(change.url||change.status==="complete")refresh().catch(()=>{});});
refresh().catch(e=>status(e.message||"Studio controls unavailable"));
