import { NextResponse } from "next/server";
import { requireProxyUser, securityV2Enabled } from "@/lib/server/proxy-auth";
import { driveConfig, serviceSupabase } from "@/lib/server/drive-backup.mjs";
export const runtime="nodejs";
export async function POST(request) {
  try {
    if(!securityV2Enabled())return NextResponse.json({error:"Vault authentication is required"},{status:503});
    const {userId}=await requireProxyUser(request);
    if(!driveConfig().configured)return NextResponse.json({error:"Drive backup is not configured"},{status:503});
    const {error}=await serviceSupabase().from("vault_drive_connections").delete().eq("user_id",userId);
    if(error)throw error;
    return NextResponse.json({disconnected:true,note:"Your existing Google Drive backup files were not deleted."},{headers:{"Cache-Control":"no-store"}});
  }catch(e){return NextResponse.json({error:e.message||"Unable to disconnect"},{status:Number(e.status)||503});}
}
