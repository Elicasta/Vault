export const DRIVE_BACKUP_FOLDER = "Vault Backups";
export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
export const DRIVE_UPLOAD_ENDPOINT = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,size";
export const DRIVE_MAX_BACKUP_BYTES = 50 * 1024 * 1024;

const ALLOWED_EXTENSIONS = /\.(?:png|jpg|jpeg|webp|gif|avif|bmp|mp4|mov|webm|m4v|ogg|ogv|mp3|wav|m4a|aac)$/i;
const MIME_EXT = { "image/jpeg":".jpg","image/png":".png","image/webp":".webp","image/avif":".avif","image/gif":".gif",
  "video/mp4":".mp4","video/webm":".webm","video/quicktime":".mov","audio/mpeg":".mp3","audio/mp4":".m4a","audio/wav":".wav" };

export function vaultBackupCandidates(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item && ["image","video","audio"].includes(item.type) &&
      typeof (item.canonical_url || item.url) === "string" &&
      (item.canonical_url || item.url).startsWith("vault-media://vault-media/") &&
      typeof item.storage_path === "string" && item.storage_path.length > 0)
    .filter((item, i, arr) => arr.findIndex((x) => x.storage_path === item.storage_path) === i);
}

export function driveBackupFileName(item, mimeType = "") {
  const origin = String(item?.title || item?.storage_path?.split("/").pop() || "Vault media");
  const safe = origin.normalize("NFKC").replace(/[\u0000-\u001f\\/:*?"<>|]/g,"-").trim().slice(0,135) || "Vault media";
  const extension = safe.match(ALLOWED_EXTENSIONS)?.[0] ||
    String(item?.storage_path || "").match(ALLOWED_EXTENSIONS)?.[0] ||
    MIME_EXT[String(mimeType).split(";")[0].toLowerCase()] || (item?.type === "video" ? ".mp4" : ".png");
  return ALLOWED_EXTENSIONS.test(safe) ? safe : safe + extension;
}

export function googleDriveEscapedQuery(value) {
  return String(value).replaceAll("\\","\\\\").replaceAll("'","\\'");
}

export function driveBackupMetadata(item, folderId, hash, mimeType = "") {
  return {
    name: driveBackupFileName(item,mimeType), parents:[folderId],
    description: "Private copy of Vault media. Original collection: " + String(item.folder || "My Library").slice(0,120),
    appProperties:{ vaultBackupHash:hash, vaultBackupSource:"supabase-storage" },
  };
}
