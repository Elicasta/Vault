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
  return [...document.querySelectorAll("video,source,img,meta[property='og:video'],meta[property='og:image']")].slice(0, 300).map((node) => {
    let url, type, thumbnail = "";
    const tag = node.tagName.toLowerCase();
    if (tag === "video") { type = "video"; url = node.currentSrc || node.src; thumbnail = node.poster || ""; }
    else if (tag === "source") { type = "video"; url = node.src; }
    else if (tag === "img") { type = "image"; url = node.currentSrc || node.src; }
    else if (tag === "meta") { type = node.getAttribute("property") === "og:image" ? "image" : "video"; url = node.content; }
    return { url, type, thumbnail, title: node.alt || node.title || document.title || type, sourcePage: location.href };
  }).filter((item) => item.url && item.url.startsWith("http"));
}
async function fetchCaptured() {
  const response = await chrome.runtime.sendMessage({ type: "VAULT_CAPTURE_GET", tabId: currentTab.id });
  for (const item of response?.items || []) add(item);
}
async function scanPage() {
  if (!currentTab?.id) return;
  try {
    await fetchCaptured();
    const frames = await chrome.scripting.executeScript({ target: { tabId: currentTab.id, allFrames: false }, func: scanDOM });
    for (const item of frames?.[0]?.result || []) add(item);
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
    statusEl.textContent = "Copied " + items.length + " links. Open Vault → Search → Media → Import captured URLs.";
  } catch (error) { statusEl.textContent = "Copy failed: " + (error.message || "Clipboard unavailable"); }
});
start().catch((error) => { statusEl.textContent = "Cannot inspect tab: " + (error.message || "Unavailable"); });
