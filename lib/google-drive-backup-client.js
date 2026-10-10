import {
  DRIVE_BACKUP_FOLDER, DRIVE_FILE_SCOPE, DRIVE_FOLDER_MIME, DRIVE_UPLOAD_ENDPOINT,
  DRIVE_MAX_BACKUP_BYTES, googleDriveEscapedQuery, driveBackupMetadata,
} from "./drive-backup.mjs";

const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
let gisLoading;

export function loadGoogleIdentityServices() {
  if (typeof window === "undefined") return Promise.reject(new Error("Google sign-in requires a browser."));
  if (window.google?.accounts?.oauth2?.initTokenClient) return Promise.resolve(window.google.accounts.oauth2);
  if (gisLoading) return gisLoading;
  gisLoading = new Promise((resolve,reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => window.google?.accounts?.oauth2?.initTokenClient
      ? resolve(window.google.accounts.oauth2)
      : reject(new Error("Google Identity Services did not initialize."));
    script.onerror = () => reject(new Error("Google sign-in is blocked in this browser."));
    document.head.append(script);
  }).catch((error) => { gisLoading = null; throw error; });
  return gisLoading;
}

export function createDriveTokenClient(clientId, onResult) {
  if (!clientId || !window.google?.accounts?.oauth2?.initTokenClient) throw new Error("Google Drive OAuth isn't configured.");
  return window.google.accounts.oauth2.initTokenClient({
    client_id: clientId, scope: DRIVE_FILE_SCOPE,
    callback: onResult,
    error_callback: (error) => onResult({ error: error?.type || "popup_closed" }),
  });
}

async function driveRequest(token, url, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", "Bearer " + token);
  const response = await fetch(url, {...init,headers,cache:"no-store"});
  let value;
  try {value = await response.json();} catch {value = null;}
  if (!response.ok) {
    const message = value?.error?.message || "Google Drive request failed (" + response.status + ")";
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return value || {};
}

async function findDriveFiles(token, query, fields = "nextPageToken,files(id,name,appProperties,webViewLink)", limit = 1000) {
  let tokenPage = "", all = [];
  do {
    const params = new URLSearchParams({
      q:query, fields, pageSize:"1000", spaces:"drive",
    });
    if (tokenPage) params.set("pageToken",tokenPage);
    const data = await driveRequest(token, DRIVE_API+"?"+params.toString());
    all = all.concat(data.files || []);
    tokenPage = data.nextPageToken || "";
    if (all.length > limit) throw new Error("Too many Drive files for a safe duplicate check.");
  } while (tokenPage);
  return all;
}

export async function getOrCreateVaultBackupFolder(token) {
  const q = "name = '" + googleDriveEscapedQuery(DRIVE_BACKUP_FOLDER) + "' and mimeType = '" + DRIVE_FOLDER_MIME + "' and trashed = false";
  const found = await findDriveFiles(token,q,"nextPageToken,files(id,name,appProperties,webViewLink)");
  const existing = found.find(x => x?.appProperties?.vaultBackupSource === "supabase-storage");
  if (existing?.id) return existing.id;
  const folder = await driveRequest(token,DRIVE_API+"?fields=id,name",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({name:DRIVE_BACKUP_FOLDER,mimeType:DRIVE_FOLDER_MIME,
      appProperties:{vaultBackupSource:"supabase-storage"}}),
  });
  if (!folder.id) throw new Error("Drive did not confirm the backup folder.");
  return folder.id;
}

export async function listVaultDriveBackupHashes(token, folderId) {
  const query = "'" + googleDriveEscapedQuery(folderId) + "' in parents and trashed = false";
  const entries = await findDriveFiles(token,query,"nextPageToken,files(id,name,appProperties,webViewLink)",10000);
  return new Set(entries.map((x) => x.appProperties?.vaultBackupHash).filter(Boolean));
}

export async function hashVaultStoragePath(item) {
  if (!globalThis.crypto?.subtle?.digest) throw new Error("A secure browser context is required for backup verification.");
  const source = String(item.canonical_url || item.url || item.storage_path);
  const hash = await globalThis.crypto.subtle.digest("SHA-256",new TextEncoder().encode(source));
  return Array.from(new Uint8Array(hash)).map(n => n.toString(16).padStart(2,"0")).join("");
}

export async function uploadSupabaseBlobToDrive(token, item, folderId, blob, hash) {
  if (!(blob instanceof Blob) || blob.size < 1 || blob.size > DRIVE_MAX_BACKUP_BYTES) {
    throw new Error("This file isn't supported by the current Google Drive backup uploader (50 MB maximum).");
  }
  const contentType = blob.type || (item.type === "image" ? "image/png" : item.type === "video" ? "video/mp4" : "audio/mpeg");
  const boundary = "vault_backup_" + crypto.randomUUID().replaceAll("-","");
  const metadata = driveBackupMetadata(item,folderId,hash,contentType);
  const body = new Blob([
    "--"+boundary+"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n",
    JSON.stringify(metadata),
    "\r\n--"+boundary+"\r\nContent-Type: "+contentType+"\r\n\r\n",
    blob,
    "\r\n--"+boundary+"--\r\n"
  ],{type:"multipart/related"});
  const response = await driveRequest(token,DRIVE_UPLOAD_ENDPOINT,{
    method:"POST",headers:{"Content-Type":"multipart/related; boundary="+boundary},
    body,
  });
  if (!response.id) throw new Error("Google Drive did not confirm the uploaded media.");
  return response;
}
