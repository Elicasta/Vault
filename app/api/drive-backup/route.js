import { NextResponse } from "next/server";
import { requireProxyUser, securityV2Enabled } from "@/lib/server/proxy-auth";
import { driveConfig, serviceSupabase, refreshedGoogleToken, downloadBackupImage,
  classifyBackupSource, uploadDriveImage } from "@/lib/server/drive-backup.mjs";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const response=(data,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"no-store"}});
async function authorized(request) {
  if(!securityV2Enabled())throw Object.assign(new Error("Vault authentication must be enabled"),{status:503});
  return requireProxyUser(request);
}
export async function GET(request) {
  try {
    const {userId}=await authorized(request);
    if(!driveConfig().configured)return response({configured:false,connected:false,reason:"Google OAuth and secure Drive storage are not configured"});
    const admin=serviceSupabase();
    const [{data:connection,error:connError},{data:files,error:filesError},{count:total,error:itemsError}]=await Promise.all([
      admin.from("vault_drive_connections").select("google_email,root_folder_id,status,last_backup_at").eq("user_id",userId).maybeSingle(),
      admin.from("vault_drive_backups").select("status,source_kind,drive_file_id,error").eq("user_id",userId).limit(1000),
      admin.from("vault_items").select("*",{count:"exact",head:true}).eq("user_id",userId).eq("type","image")
    ]);
    if(connError||filesError||itemsError)throw connError||filesError||itemsError;
    const backups=files||[];
    return response({configured:true,connected:!!connection,connection:connection ? {
      email:connection.google_email,folderUrl:"https://drive.google.com/drive/folders/"+connection.root_folder_id,
      status:connection.status,lastBackupAt:connection.last_backup_at
    }:null,
    totals:{images:total||0,backedUp:backups.filter(x=>x.status==="backed_up").length,
      originals:backups.filter(x=>x.status==="backed_up"&&x.source_kind!=="cover-only").length,
      covers:backups.filter(x=>x.status==="backed_up"&&x.source_kind==="cover-only").length,
      linkOnly:backups.filter(x=>x.status==="link_only").length,
      failed:backups.filter(x=>x.status==="failed").length}});
  }catch(e){return response({error:e.message||"Drive backup unavailable"},Number(e.status)||503);}
}
export async function POST(request) {
  try {
    const {userId}=await authorized(request);
    if(!driveConfig().configured)return response({error:"Drive backup connection is not configured"},503);
    const admin=serviceSupabase();
    const {data:connection,error:connError}=await admin.from("vault_drive_connections")
      .select("*").eq("user_id",userId).maybeSingle();
    if(connError)throw connError;
    if(!connection)return response({error:"Connect your Google Drive before backing up images"},409);
    if(connection.status!=="connected")return response({error:"Reconnect Google Drive before backup"},409);
    const {data:items,error:itemsError}=await admin.from("vault_items").select("*")
      .eq("user_id",userId).eq("type","image").order("created_at",{ascending:false}).limit(250);
    if(itemsError)throw itemsError;
    const {data:previous,error:prevError}=await admin.from("vault_drive_backups")
      .select("item_key,source_url,status").eq("user_id",userId).limit(500);
    if(prevError)throw prevError;
    const done=new Map((previous||[]).map(x=>[x.item_key,x]));
    const candidates=(items||[]).filter(x=>{
      const earlier=done.get(x.item_key);
      return !earlier || earlier.status!=="backed_up" || earlier.source_url!==classifyBackupSource(x).url;
    });
    if(!candidates.length)return response({remaining:0,processed:0,saved:0,originals:0,covers:0,linkOnly:0,failed:0});
    let token;
    try{token=await refreshedGoogleToken(connection.encrypted_refresh_token);}
    catch{
      await admin.from("vault_drive_connections").update({status:"reconnect_required",updated_at:new Date().toISOString()}).eq("user_id",userId);
      return response({error:"Google Drive authorization expired. Please reconnect."},401);
    }
    let saved=0,originals=0,covers=0,linkOnly=0,failed=0;
    const selected=candidates.slice(0,3);
    for(const item of selected) {
      let source=classifyBackupSource(item);
      try {
        const image=await downloadBackupImage(item,admin);
        if(image.kind==="link-only") {
          linkOnly++;
          await admin.from("vault_drive_backups").upsert({user_id:userId,item_key:item.item_key,
            source_url:source.url,source_kind:"link-only",status:"link_only",error:"No accessible image file URL; only a link was saved.",
            updated_at:new Date().toISOString()},{onConflict:"user_id,item_key"});
          continue;
        }
        const uploaded=await uploadDriveImage({token,folderId:connection.root_folder_id,image,row:item});
        const kind=image.kind;
        const {error:saveError}=await admin.from("vault_drive_backups").upsert({
          user_id:userId,item_key:item.item_key,source_url:source.url,source_kind:kind,
          status:"backed_up",drive_file_id:uploaded.id,bytes:image.bytes.length,sha256:image.sha256,
          error:null,backed_up_at:new Date().toISOString(),updated_at:new Date().toISOString()
        },{onConflict:"user_id,item_key"});
        if(saveError)throw saveError;
        saved++;if(kind==="cover-only")covers++;else originals++;
      }catch(e){
        failed++;
        await admin.from("vault_drive_backups").upsert({user_id:userId,item_key:item.item_key,
          source_url:source.url,source_kind:source.kind,status:"failed",
          error:String(e.message||"Media not available").slice(0,250),updated_at:new Date().toISOString()
        },{onConflict:"user_id,item_key"});
      }
    }
    await admin.from("vault_drive_connections").update({last_backup_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("user_id",userId);
    return response({processed:selected.length,saved,originals,covers,linkOnly,failed,
      remaining:Math.max(0,candidates.length-selected.length),
      note:"Only verified uploaded image bytes count as backed up. Thumbnails are identified separately."});
  }catch(e){return response({error:e.message||"Backup failed"},Number(e.status)||503);}
}
