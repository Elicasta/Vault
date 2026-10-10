import { NextResponse } from "next/server";
import { requireProxyUser, securityV2Enabled } from "@/lib/server/proxy-auth";
import { OAUTH_COOKIE, createDriveOAuthState, driveOAuthUrl, requireDriveConfig } from "@/lib/server/drive-backup.mjs";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request) {
  try {
    if(!securityV2Enabled()) return NextResponse.json({error:"Vault sign-in is required for Drive backup"},{status:503});
    const {userId}=await requireProxyUser(request);
    const config=requireDriveConfig();
    if(new URL(config.redirectUri).origin !== new URL(request.url).origin ||
       new URL(config.redirectUri).pathname !== "/api/drive-backup/callback")
      return NextResponse.json({error:"Google OAuth redirect URL is not configured for this Vault domain"},{status:503});
    const challenge=createDriveOAuthState(userId);
    const response=NextResponse.redirect(driveOAuthUrl(challenge.state,challenge.verifier),303);
    response.cookies.set(OAUTH_COOKIE,challenge.cookie,{
      httpOnly:true,secure:true,sameSite:"lax",path:"/api/drive-backup",maxAge:600
    });
    response.headers.set("Cache-Control","no-store");
    return response;
  } catch (e) {
    return NextResponse.json({error:e?.message||"Google Drive connection unavailable"},
      {status:Number(e?.status)||503,headers:{"Cache-Control":"no-store"}});
  }
}
