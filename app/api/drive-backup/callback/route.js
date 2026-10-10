import { NextResponse } from "next/server";
import { OAUTH_COOKIE, verifyDriveOAuthState, exchangeDriveCode, serviceSupabase,
  encryptDriveSecret, createDriveBackupFolder, getDriveEmail, DRIVE_SCOPE } from "@/lib/server/drive-backup.mjs";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request) {
  const url=new URL(request.url);
  const redirect=new URL("/settings",url.origin);
  const fail=(reason)=>{
    redirect.searchParams.set("drive",reason);
    const r=NextResponse.redirect(redirect,303);
    r.cookies.set(OAUTH_COOKIE,"",{httpOnly:true,secure:true,sameSite:"lax",path:"/api/drive-backup",maxAge:0});
    r.headers.set("Cache-Control","no-store");
    return r;
  };
  if(url.searchParams.get("error"))return fail("denied");
  const state=url.searchParams.get("state")||"",code=url.searchParams.get("code")||"";
  const cookie=request.cookies.get(OAUTH_COOKIE)?.value;
  const validated=verifyDriveOAuthState(cookie,state);
  if(!code || !validated) return fail("invalid-state");
  try {
    const result=await exchangeDriveCode(code,validated.verifier);
    if(!result.refresh_token || !result.access_token ||
      !String(result.scope||"").split(" ").includes(DRIVE_SCOPE)) return fail("missing-permission");
    const folderId=await createDriveBackupFolder(result.access_token);
    const email=await getDriveEmail(result.access_token);
    const admin=serviceSupabase();
    const {error}=await admin.from("vault_drive_connections").upsert({
      user_id:validated.userId,encrypted_refresh_token:encryptDriveSecret(result.refresh_token),
      root_folder_id:folderId,google_email:email,status:"connected",updated_at:new Date().toISOString()
    },{onConflict:"user_id"});
    if(error)throw error;
    redirect.searchParams.set("drive","connected");
    const r=NextResponse.redirect(redirect,303);
    r.cookies.set(OAUTH_COOKIE,"",{httpOnly:true,secure:true,sameSite:"lax",path:"/api/drive-backup",maxAge:0});
    r.headers.set("Cache-Control","no-store");
    return r;
  }catch {
    return fail("connection-failed");
  }
}
