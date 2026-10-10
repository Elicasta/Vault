import "server-only";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { outboundFetch } from "./outbound-fetch.js";
import { googleDriveFileName } from "../google-drive-save.mjs";
import { classifyBackupSource, VAULT_MEDIA_PREFIX } from "../drive-backup-rules.mjs";
export { classifyBackupSource };

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const OAUTH_COOKIE = "vv_drive_oauth_state";
const COOKIE_MAX_AGE = 600;
const GOOGLE_OAUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_FILES = "https://www.googleapis.com/drive/v3/files";
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const ALLOWED_IMAGES = /^image\/(?:jpeg|png|webp|gif|avif|bmp|heic|heif)$/i;
const LOCATOR = VAULT_MEDIA_PREFIX;

export function driveConfig() {
  const clientId = process.env.VAULT_GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.VAULT_GOOGLE_CLIENT_SECRET || "";
  const redirectUri = process.env.VAULT_GOOGLE_REDIRECT_URI || "";
  const encryptionKey = process.env.VAULT_DRIVE_TOKEN_KEY || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  return { clientId, clientSecret, redirectUri, encryptionKey, serviceKey, supabaseUrl,
    configured: Boolean(clientId && clientSecret && redirectUri && encryptionKey && serviceKey && supabaseUrl) };
}
export function requireDriveConfig() {
  const config = driveConfig();
  if (!config.configured) throw new Error("Google Drive backup needs Google OAuth credentials, token encryption key and Supabase service access.");
  return config;
}
export function serviceSupabase() {
  const { supabaseUrl, serviceKey } = requireDriveConfig();
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
function secretKey() {
  const input = requireDriveConfig().encryptionKey;
  const key = /^[a-f0-9]{64}$/i.test(input) ? Buffer.from(input, "hex") : Buffer.from(input, "base64");
  if (key.length !== 32) throw new Error("VAULT_DRIVE_TOKEN_KEY must be 32 random bytes encoded in base64 or hex.");
  return key;
}
export function encryptDriveSecret(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
  return ["v1",iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),encrypted.toString("base64url")].join(".");
}
export function decryptDriveSecret(value) {
  const [version,iv,tag,ciphertext] = String(value||"").split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("Invalid encrypted Google Drive connection.");
  const decipher = crypto.createDecipheriv("aes-256-gcm",secretKey(),Buffer.from(iv,"base64url"));
  decipher.setAuthTag(Buffer.from(tag,"base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext,"base64url")),decipher.final()]).toString("utf8");
}
function sign(value) {
  return crypto.createHmac("sha256",secretKey()).update(value).digest("base64url");
}
export function createDriveOAuthState(userId, now = Date.now()) {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const state = crypto.randomBytes(32).toString("base64url");
  const raw = Buffer.from(JSON.stringify({ userId, state, verifier, expires: now + COOKIE_MAX_AGE * 1000 })).toString("base64url");
  return { state, verifier, cookie: raw+"."+sign(raw) };
}
export function verifyDriveOAuthState(cookie, state, now = Date.now()) {
  const parts = String(cookie||"").split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const a = Buffer.from(parts[1]), b = Buffer.from(sign(parts[0]));
  if (a.length !== b.length || !crypto.timingSafeEqual(a,b)) return null;
  try {
    const data = JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8"));
    if (data.expires < now || data.expires > now + COOKIE_MAX_AGE*1000 || data.state !== state || !data.userId) return null;
    return data;
  } catch { return null; }
}
export function driveOAuthUrl(state, verifier) {
  const { clientId, redirectUri } = requireDriveConfig();
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const url = new URL(GOOGLE_OAUTH);
  for (const [key,value] of Object.entries({client_id:clientId,redirect_uri:redirectUri,
    response_type:"code",scope:DRIVE_SCOPE,access_type:"offline",prompt:"consent",
    include_granted_scopes:"true",code_challenge:challenge,code_challenge_method:"S256",state})) url.searchParams.set(key,value);
  return url.href;
}
async function postForm(url, params) {
  const res = await fetch(url,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams(params),cache:"no-store",signal:AbortSignal.timeout(12_000)});
  const json=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(json.error_description || json.error || "Google authorization failed.");
  return json;
}
export async function exchangeDriveCode(code, verifier) {
  const {clientId,clientSecret,redirectUri}=requireDriveConfig();
  return postForm(GOOGLE_TOKEN,{code,code_verifier:verifier,client_id:clientId,
    client_secret:clientSecret,redirect_uri:redirectUri,grant_type:"authorization_code"});
}
export async function refreshedGoogleToken(encryptedToken) {
  const {clientId,clientSecret}=requireDriveConfig();
  const refreshToken = decryptDriveSecret(encryptedToken);
  const token = await postForm(GOOGLE_TOKEN,{client_id:clientId,client_secret:clientSecret,
    refresh_token:refreshToken,grant_type:"refresh_token"});
  return token.access_token;
}
async function googleJSON(path, token, options={}) {
  const response=await fetch(path.startsWith("https:") ? path : GOOGLE_FILES+path,{
    method:options.method||"GET",
    headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
    body:options.data ? JSON.stringify(options.data) : undefined,signal:AbortSignal.timeout(15000),cache:"no-store",
  });
  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(json.error?.message || "Google Drive request failed ("+response.status+")");
  return json;
}
export async function createDriveBackupFolder(token) {
  const file=await googleJSON("",token,{method:"POST",data:{name:"Vault Backups",mimeType:"application/vnd.google-apps.folder"}});
  if(!file.id) throw new Error("Google did not return a backup folder ID.");
  return file.id;
}
export async function getDriveEmail(token) {
  try {
    const data=await fetch("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)",{
      headers:{Authorization:"Bearer "+token},signal:AbortSignal.timeout(9000),cache:"no-store",
    }).then(r=>r.json());
    return typeof data.user?.emailAddress==="string" ? data.user.emailAddress : null;
  } catch {return null;}
}
export async function downloadBackupImage(row, supabase) {
  const chosen=classifyBackupSource(row);
  if(chosen.kind==="link-only") return {kind:"link-only"};
  let body, mime, fileUrl=chosen.url;
  if(fileUrl.startsWith(LOCATOR)) {
    const storagePath=fileUrl.slice(LOCATOR.length);
    if(!storagePath || !storagePath.startsWith(row.user_id+"/")) throw new Error("Invalid private media path");
    const {data,error}=await supabase.storage.from("vault-media").download(storagePath);
    if(error || !data) throw new Error("Private uploaded image not available for backup");
    if(data.size>MAX_IMAGE_BYTES) throw new Error("Image exceeds backup limit");
    body=Buffer.from(await data.arrayBuffer());
    mime=data.type;
  } else {
    const response=await outboundFetch(fileUrl,{timeoutMs:10000,maxBytes:MAX_IMAGE_BYTES,
      headers:{Accept:"image/avif,image/webp,image/png,image/jpeg,image/gif,image/*;q=0.8"}});
    if(!response.ok) {await response.body?.cancel().catch(()=>{});throw new Error("Source image returned HTTP "+response.status);}
    mime=(response.headers.get("content-type")||"").split(";")[0].trim().toLowerCase();
    if(!ALLOWED_IMAGES.test(mime)) {await response.body?.cancel().catch(()=>{});throw new Error("Source did not return an image");}
    body=Buffer.from(await response.arrayBuffer());
  }
  if(!ALLOWED_IMAGES.test(mime)||body.length>MAX_IMAGE_BYTES||body.length===0)throw new Error("Invalid or oversized image");
  return {bytes:body,mime,kind:chosen.kind,url:fileUrl,sha256:crypto.createHash("sha256").update(body).digest("hex")};
}
export async function uploadDriveImage({token,folderId,image,row}) {
  // Multipart upload limited to small images; resumable for anything larger.
  const url=String(image.url||row.url);
  const suffix={ "image/jpeg":".jpg","image/png":".png","image/webp":".webp","image/gif":".gif","image/avif":".avif","image/bmp":".bmp","image/heic":".heic","image/heif":".heif" }[image.mime]||".jpg";
  let name=googleDriveFileName(url,row.title||"Vault image","image");
  if(!name.toLowerCase().endsWith(suffix)) name=name.replace(/\.[a-z0-9]{2,5}$/i,"")+suffix;
  const metadata={name,mimeType:image.mime,parents:[folderId],appProperties:{vaultItemKey:row.item_key,sourceKind:image.kind}};
  if(image.bytes.length<=5*1024*1024){
    const boundary="vault_"+crypto.randomBytes(10).toString("hex");
    const before=Buffer.from("--"+boundary+"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"+
      JSON.stringify(metadata)+"\r\n--"+boundary+"\r\nContent-Type: "+image.mime+"\r\n\r\n");
    const after=Buffer.from("\r\n--"+boundary+"--\r\n");
    const upload=await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,webViewLink",{
      method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"multipart/related; boundary="+boundary},
      body:Buffer.concat([before,image.bytes,after]),signal:AbortSignal.timeout(25000),
    });
    const result=await upload.json().catch(()=>({}));
    if(!upload.ok||!result.id)throw new Error(result.error?.message || "Google Drive image upload failed");
    return result;
  }
  const init=await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size,webViewLink",{
    method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json; charset=UTF-8",
      "X-Upload-Content-Type":image.mime,"X-Upload-Content-Length":String(image.bytes.length)},
    body:JSON.stringify(metadata),signal:AbortSignal.timeout(12000),
  });
  if(!init.ok)throw new Error("Google Drive resumable upload setup failed");
  const uploadUrl=init.headers.get("location");
  if(!uploadUrl||new URL(uploadUrl).origin!=="https://www.googleapis.com")throw new Error("Google returned an untrusted upload address");
  const upload=await fetch(uploadUrl,{method:"PUT",
    headers:{"Content-Type":image.mime,"Content-Length":String(image.bytes.length),Authorization:"Bearer "+token},
    body:image.bytes,signal:AbortSignal.timeout(45000)});
  const result=await upload.json().catch(()=>({}));
  if(!upload.ok||!result.id)throw new Error(result.error?.message || "Google Drive image upload failed");
  return result;
}
