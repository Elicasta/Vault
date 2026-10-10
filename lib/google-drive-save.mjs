// Pure file naming and source gating used by the browser-side Save to Drive integration.
export const SAVE_TO_DRIVE_EXTENSION_URL = "https://chromewebstore.google.com/detail/save-to-google-drive/gmbmikajjgmnabiglmofipeabaddhgne";

export function googleDriveFileName(url, title, type) {
  const kind = type === "video" ? "video" : "image";
  const extension = kind === "video" ? ".mp4" : ".jpg";
  let path = "";
  try { path = decodeURIComponent(new URL(url).pathname).split("/").pop() || ""; }
  catch {}
  const fromPath = /\.(?:jpe?g|png|webp|gif|avif|bmp|mp4|mov|m4v|webm|ogv)$/i.exec(path)?.[0] || "";
  const stem = String(title || path.replace(/\.[^.]+$/, "") || "Vault " + kind)
    .normalize("NFKC").replace(/[\\/:*?"<>|\x00-\x1f]/g, "-").trim().slice(0, 110) || "Vault " + kind;
  return /\.[a-z0-9]{2,5}$/i.test(stem) ? stem : stem + (fromPath || extension);
}

export function vaultDriveSource(url, type) {
  try {
    const u = new URL(String(url || ""));
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password ||
        !u.hostname || !["image", "video"].includes(type)) return "";
    return (type === "video" ? "/api/stream" : "/api/media") + "?url=" + encodeURIComponent(u.href);
  } catch { return ""; }
}
