"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  supabase, VAULT_MEDIA_BUCKET,
} from "@/lib/supabase";
import { vaultBackupCandidates, DRIVE_FILE_SCOPE } from "@/lib/drive-backup.mjs";
import {
  loadGoogleIdentityServices,createDriveTokenClient,getOrCreateVaultBackupFolder,
  listVaultDriveBackupHashes,hashVaultStoragePath,uploadSupabaseBlobToDrive,
} from "@/lib/google-drive-backup-client";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID || "";
const LINK_DRIVE = "https://drive.google.com/drive/my-drive";

export default function GoogleDriveBackup({ userId, items = [] }) {
  const files = useMemo(()=>vaultBackupCandidates(items),[items]);
  const [ready,setReady] = useState(false);
  const [error,setError] = useState("");
  const [message,setMessage] = useState("");
  const [stats,setStats] = useState(null);
  const [busy,setBusy] = useState(false);
  const [connected,setConnected] = useState(false);
  const [folderId,setFolderId] = useState("");
  const [links,setLinks] = useState([]);
  const token = useRef(null);
  const client = useRef(null);
  const busyRef = useRef(false);

  useEffect(()=>{
    if (!GOOGLE_CLIENT_ID) return;
    let stale = false;
    loadGoogleIdentityServices().then(()=>{if(!stale)setReady(true);})
      .catch((e)=>{if(!stale)setError(e.message||"Google authentication unavailable.");});
    return ()=>{stale=true;};
  },[]);

  const doBackup = async (accessToken) => {
    if (busyRef.current) return;
    if (!userId) { setError("Sign into Vault to back up your files."); return; }
    if (!files.length) {setMessage("No private Supabase media files found. Save a downloaded image or video to Vault storage first.");return;}
    busyRef.current=true;setBusy(true);setError("");setLinks([]);
    let uploaded=0,skipped=0,failed=0;
    setStats({total:files.length,uploaded,skipped,failed,processed:0});
    try {
      const {data:identity,error:authError} = await supabase.auth.getUser();
      if (authError || identity?.user?.id!==userId) throw new Error("Vault session expired. Sign into Vault again before backing up files.");
      setMessage("Finding your Vault Backups folder in Google Drive…");
      const id = await getOrCreateVaultBackupFolder(accessToken);
      setFolderId(id);
      const known = await listVaultDriveBackupHashes(accessToken,id);
      for(let index=0;index<files.length;index++){
        const item=files[index];
        setMessage("Backing up "+(index+1)+" of "+files.length+": "+(item.title || "Vault media"));
        try {
          const hash=await hashVaultStoragePath(item);
          if(known.has(hash)){skipped++;continue;}
          const {data:blob,error:downloadError}=await supabase.storage.from(VAULT_MEDIA_BUCKET).download(item.storage_path);
          if(downloadError||!blob)throw downloadError||new Error("Supabase file unavailable.");
          const saved=await uploadSupabaseBlobToDrive(accessToken,item,id,blob,hash);
          known.add(hash);
          uploaded++;
          setLinks((old)=>[{id:saved.id,name:saved.name||item.title||"Backed-up media",url:saved.webViewLink||"https://drive.google.com/file/d/"+encodeURIComponent(saved.id)+"/view"},...old].slice(0,8));
        }catch(e){
          failed++;
          if(e?.status===401||e?.status===403) {
            setError("Google authorization expired or permissions were denied. Reconnect to resume; completed files will be skipped.");
            break;
          }
          setError((old)=>old||("One file could not be copied: "+(e?.message||"Unknown error")));
        }finally {
          setStats({total:files.length,uploaded,skipped,failed,processed:index+1});
        }
      }
      setMessage("Backup completed: "+uploaded+" uploaded · "+skipped+" already backed up · "+failed+" failed.");
    }catch(e){
      setError(e.message||"Google Drive backup failed.");
      setMessage("Backup was not completed.");
    }finally{
      setBusy(false);busyRef.current=false;
    }
  };

  const authorizeAndBackup = () => {
    if(busyRef.current)return;
    setError("");setMessage("");
    if(!ready||!GOOGLE_CLIENT_ID){setError("Google Drive OAuth needs a configured Google Web Client ID.");return;}
    if(token.current?.accessToken&&Date.now()<token.current.expiresAt-60_000){
      doBackup(token.current.accessToken);return;
    }
    try{
      if(!client.current) client.current=createDriveTokenClient(GOOGLE_CLIENT_ID,(response)=>{
        if(response.error||!response.access_token){
          setError("Google sign-in was cancelled or access was not granted. "+(response.error||""));
          return;
        }
        if(!String(response.scope||"").split(/\s+/).includes(DRIVE_FILE_SCOPE)){
          setError("Google Drive file permission was not granted.");
          return;
        }
        const seconds=Number(response.expires_in)||3600;
        token.current={accessToken:response.access_token,expiresAt:Date.now()+seconds*1000};
        setConnected(true);
        doBackup(response.access_token);
      });
      client.current.requestAccessToken({prompt:"consent"});
    }catch(e){setError(e.message||"Unable to open Google account chooser.");}
  };
  const disconnect=()=>{
    const value=token.current?.accessToken;
    token.current=null;setConnected(false);setMessage("");setLinks([]);
    if(value&&typeof window!=="undefined")window.google?.accounts?.oauth2?.revoke?.(value,()=>{});
  };

  return <section className="vv-drive-backup" aria-label="Back up private Vault media to Google Drive">
    <div className="vv-drive-backup-head">
      <div>
        <span className="v2-eyebrow">Cloud backup</span>
        <h3>Google Drive Backup</h3>
        <p>Copies your actual privately stored Vault images and videos to Google Drive. It does not back up temporary links or expose your Supabase bucket publicly.</p>
      </div>
      <span className="vv-drive-backup-status">{connected?"Connected for this session":"Not connected"}</span>
    </div>
    <p><strong>{files.length} eligible media file{files.length===1?"":"s"}</strong> in Supabase Storage. Existing backups are checked first to avoid duplicates.</p>
    {!GOOGLE_CLIENT_ID && <div className="vv-drive-backup-setup" role="status">
      Google Drive OAuth needs a Google Cloud Web Client ID configured as <code>NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID</code>. Vault will not request Google credentials or attempt uploads until that configuration is provided.
    </div>}
    <div className="vv-drive-backup-actions">
      <button type="button" onClick={authorizeAndBackup} disabled={!ready||!GOOGLE_CLIENT_ID||busy||!files.length}>
        {busy?"Backing up…":connected?"Back up new media":"Connect Google & back up"}
      </button>
      {connected && <button type="button" onClick={disconnect} disabled={busy}>Disconnect</button>}
      {folderId && <a href={"https://drive.google.com/drive/folders/"+encodeURIComponent(folderId)} target="_blank" rel="noopener noreferrer">Open backup folder</a>}
      {!folderId && <a href={LINK_DRIVE} target="_blank" rel="noopener noreferrer">Open Google Drive</a>}
    </div>
    {message&&<p role="status">{message}</p>}
    {stats&&<p role="status">{stats.processed}/{stats.total} checked · {stats.uploaded} uploaded · {stats.skipped} skipped · {stats.failed} failed</p>}
    {error&&<p role="alert" className="vv-generator-error">{error}</p>}
    {links.length>0&&<div className="vv-drive-backup-links">
      <strong>Recently backed up</strong>
      {links.map((item)=><a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer">{item.name}</a>)}
    </div>}
    <p className="vv-drive-backup-note">Backup runs when you click the button and authorize Google. Google access tokens remain in this tab's memory; nothing is stored on Vault's server. Automatic unattended backups will require a separate server-side authorization and scheduling setup.</p>
  </section>;
}
