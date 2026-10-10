const itemsEl = document.querySelector("#items");
const statusEl = document.querySelector("#state");
const copyBtn = document.querySelector("#copy");
const selectedEl = document.querySelector("#selected");
const selected = new Set();
const saved = new Map();
let currentTab;
let activeFilter = "all";

function normalize(raw) {
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol) || /(?:^|\.)(?:doubleclick\.net|googlesyndication\.com|googleadservices\.com|adnxs\.com|taboola\.com|outbrain\.com)$/.test(url.hostname) || /(?:^|\/)(?:ads?|preroll|midroll|postroll|vast|sponsored)(?:\/|[-_.]|$)/i.test(url.pathname)) return "";
    url.hash = "";
    return url.href;
  } catch { return ""; }
}
function add(item) {
  const url = normalize(item?.url);
  if (!url || !["image", "video"].includes(item?.type)) return;
  const previous = saved.get(url);
  saved.set(url, { ...previous, ...item, url, title: item.title || previous?.title || (item.type === "image" ? "Image" : "Video"), sourcePage: item.sourcePage || previous?.sourcePage || currentTab?.url || "" });
}
function render() {
  const entries = [...saved.values()].filter((item) => activeFilter === "all" || item.type === activeFilter);
  itemsEl.replaceChildren();
  for (const item of entries) {
    const label = document.createElement("label");
    label.className = "row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox"; checkbox.checked = selected.has(item.url);
    checkbox.addEventListener("change", () => { if (checkbox.checked) selected.add(item.url); else selected.delete(item.url); updateStatus(); });
    const details = document.createElement("div");
    const title = document.createElement("strong"); title.textContent = item.title;
    const url = document.createElement("span"); url.textContent = item.url; url.title = item.url;
    details.append(title, url); label.append(checkbox, details); itemsEl.append(label);
  }
  statusEl.textContent = saved.size + " media link" + (saved.size === 1 ? "" : "s") + " detected in this tab";
  updateStatus();
}
function updateStatus() {
  selectedEl.textContent = selected.size + " selected";
  copyBtn.disabled = selected.size === 0;
}
function scanDOM() {
  const map = new Map();
  const IMAGE = /\.(?:jpe?g|png|webp|avif|gif|bmp)(?:$|[?#])/i;
  function absolute(raw) {
    try {
      if (!raw || /^(?:blob|data|javascript):/i.test(raw)) return "";
      const u=new URL(raw, location.href);
      return ["http:","https:"].includes(u.protocol) && !u.username && !u.password ? u.href : "";
    } catch { return ""; }
  }
  function bestSrcset(raw) {
    const list=String(raw||"").split(",").map(v=>{
      const m=v.trim().match(/^(\S+)(?:\s+(\d+)(?:w|x))?/);
      return m?{url:absolute(m[1]),size:Number(m[2]||0)}:null;
    }).filter(x=>x?.url);
    return list.sort((a,b)=>b.size-a.size)[0]?.url||"";
  }
  function add(url,type,title,thumbnail,sourceKind) {
    const resolved=absolute(url);
    if(!resolved||map.has(resolved)||map.size>=300)return;
    map.set(resolved,{url:resolved,type,title:String(title||"Image").slice(0,180),
      thumbnail:absolute(thumbnail)||resolved,sourceKind,sourcePage:location.href});
  }
  for(const img of [...document.querySelectorAll("img")].slice(0,500)){
    if(img.naturalWidth && img.naturalWidth<56 || img.naturalHeight && img.naturalHeight<56)continue;
    const thumb=absolute(img.currentSrc||bestSrcset(img.getAttribute("srcset"))||img.getAttribute("data-src")||img.src);
    const title=img.alt||img.title||document.title||"Image";
    const parent=img.closest("a[href]");
    const full=absolute(parent?.getAttribute("data-full")||parent?.getAttribute("data-original")||
      img.getAttribute("data-full")||img.getAttribute("data-original")||img.getAttribute("data-zoom"));
    const linked=absolute(parent?.href);
    if(full)add(full,"image",title,thumb,"browser-original-candidate");
    if(linked&&IMAGE.test(linked))add(linked,"image",title,thumb,"browser-linked-full-image");
    const bigger=bestSrcset(img.getAttribute("data-srcset")||img.getAttribute("srcset"));
    if(bigger&&bigger!==thumb)add(bigger,"image",title,thumb,"browser-srcset");
    if(thumb)add(thumb,"image",title,thumb,"browser-visible-image");
  }
  for(const node of [...document.querySelectorAll("video,source,meta[property='og:video'],meta[property='og:image']")].slice(0,120)){
    const tag=node.tagName.toLowerCase();
    const type=tag==="video"||tag==="source"&&node.parentElement?.tagName.toLowerCase()==="video"||
      node.getAttribute("property")==="og:video"?"video":"image";
    const media=node.currentSrc||node.src||node.getAttribute("content")||"";
    if(media)add(media,type,node.alt||node.title||document.title,
      type==="video"?(node.poster||""):"","browser-page-media");
  }
  for(const node of [...document.querySelectorAll("[data-original],[data-full],[style*='background-image']")].slice(0,220)){
    const direct=absolute(node.getAttribute("data-original")||node.getAttribute("data-full"));
    if(direct)add(direct,"image",node.title||document.title,"","browser-original-candidate");
    const m=String(node.getAttribute("style")||"").match(/background-image\s*:\s*url\(['"]?([^'")]+)/i);
    if(m)add(m[1],"image",node.title||document.title,"","browser-background-image");
  }
  return [...map.values()];
}
async function fetchCaptured() {
  const response = await chrome.runtime.sendMessage({ type: "VAULT_CAPTURE_GET", tabId: currentTab.id });
  for (const item of response?.items || []) add(item);
}
async function scanPage() {
  if (!currentTab?.id) return;
  try {
    await fetchCaptured();
    const frames = await chrome.scripting.executeScript({ target: { tabId: currentTab.id, allFrames: true }, func: scanDOM });
    for(const frame of frames || [])for(const item of frame.result || [])add(item);
    render();
  } catch (error) {
    render();
    statusEl.textContent = "Network requests captured. Page inspection not permitted: " + (error.message || "Restricted tab");
  }
}
async function start() {
  [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!currentTab?.id) { statusEl.textContent = "Open a website to capture media."; return; }
  await scanPage();
}
document.querySelector("#scan").addEventListener("click", scanPage);
document.querySelector("#all").addEventListener("click", () => {
  for (const item of saved.values()) if (activeFilter === "all" || item.type === activeFilter) selected.add(item.url);
  render();
});
document.querySelector("#clear").addEventListener("click", () => { selected.clear(); render(); });
document.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => {
  activeFilter = button.dataset.filter;
  document.querySelectorAll("[data-filter]").forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
  render();
}));
copyBtn.addEventListener("click", async () => {
  const items = [...saved.values()].filter((item) => selected.has(item.url));
  try {
    await navigator.clipboard.writeText(JSON.stringify({ format: "vault-media-capture-v1", sourcePage: currentTab?.url || "", items }, null, 2));
    statusEl.textContent = "Copied " + items.length + " links. Open Vault → Import Media → Import from your browser.";
  } catch (error) { statusEl.textContent = "Copy failed: " + (error.message || "Clipboard unavailable"); }
});
start().catch((error) => { statusEl.textContent = "Cannot inspect tab: " + (error.message || "Unavailable"); });
