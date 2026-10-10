"use client";
import { useEffect, useState } from "react";
import { ensureProxySession, SECURITY_V2_ENABLED } from "@/lib/security-session";

async function driveRequest(path, options) {
  if(SECURITY_V2_ENABLED) await ensureProxySession();
  const request=()=>fetch(path,{credentials:"same-origin",cache:"no-store",...options});
  let response=await request();
  if(response.status===401 && SECURITY_V2_ENABLED){
    await ensureProxySession(null,{force:true});
    response=await request();
  }
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||"Google Drive backup request failed");
  return data;
}
function formatTime(time) {
  if(!time)return "Never";
  try {return new Date(time).toLocaleString();}
  catch {return "Unavailable";}
}
export default function DriveBackupSettings({ userId }) {
  const [status,setStatus]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [progress,setProgress]=useState(null);

  async function reload() {
    try {setStatus(await driveRequest("/api/drive-backup"));}
    catch(e){setError(e.message||"Unable to read Google Drive connection");}
  }
  useEffect(()=>{
    if(!userId)return;
    let valid=true;
    (async()=>{
      try {
        const data=await driveRequest("/api/drive-backup");
        if(valid)setStatus(data);
      } catch(e) {if(valid)setError(e.message);}
    })();
    return ()=>{valid=false;};
  },[userId]);

  const connect=async()=>{
    setError("");
    setBusy(true);
    try {
      if(SECURITY_V2_ENABLED)await ensureProxySession();
      window.location.assign("/api/drive-backup/connect");
    }catch(e){setError(e.message||"Unable to start Google sign-in");setBusy(false);}
  };
  const backUpNow=async()=>{
    setBusy(true);setError("");setMessage("");setProgress({processed:0,saved:0,covers:0,failed:0,linkOnly:0,remaining:0});
    try {
      let total={processed:0,saved:0,covers:0,failed:0,linkOnly:0,remaining:0};
      // Work is foreground/user-initiated; stop after ten small bounded batches
      // and make a continuation button available, rather than claiming a background sync.
      for(let n=0;n<10;n++){
        const r=await driveRequest("/api/drive-backup",{method:"POST"});
        total={processed:total.processed+(r.processed||0),saved:total.saved+(r.saved||0),
          covers:total.covers+(r.covers||0),failed:total.failed+(r.failed||0),
          linkOnly:total.linkOnly+(r.linkOnly||0),remaining:r.remaining||0};
        setProgress(total);
        if(!r.processed||!r.remaining)break;
      }
      setMessage(total.remaining ? "First batch complete; select Continue backup for remaining items." : "Backup pass completed. Only accessible image bytes count as backed up.");
      await reload();
    }catch(e){setError(e.message||"Backup failed");}
    finally{setBusy(false);}
  };
  const disconnect=async()=>{
    if(!window.confirm("Disconnect Google Drive from Vault? Existing backup files in Google Drive will stay there."))return;
    setBusy(true);setError("");
    try {
      await driveRequest("/api/drive-backup/disconnect",{method:"POST"});
      setMessage("Drive disconnected. Existing backup files remain in Google Drive.");
      await reload();
    }catch(e){setError(e.message||"Could not disconnect");}
    finally{setBusy(false);}
  };

  const connected=Boolean(status?.connected);
  const totals=status?.totals;
  return <div className="v2-settings-card vv-backup-settings">
    <h3>Google Drive backup</h3>
    <p>Vault saves URLs first. Google Drive is an optional second copy of accessible image files, never a replacement for your URL, cover, or folder in Vault.</p>
    {!status ? <p role="status">{error||"Checking Google Drive connection…"}</p>
      : !status.configured ? <>
        <p><strong>Not configured yet.</strong> Vault needs a Google Cloud OAuth client, secure encryption key and database migration before it can connect to your Drive.</p>
        <p>We won't claim your images are backed up until Google confirms the files.</p>
      </> : !connected ? <>
        <p>Connect Google Drive with Google's official consent screen. Vault requests permission to create and manage files it saves, not access to your entire Drive.</p>
        <button className="v2-btn v2-btn-primary" type="button" onClick={connect} disabled={busy}>Connect Google Drive</button>
      </> : <>
        <div className="vv-backup-status" role="status">
          <span>Connected{status.connection.email ? " · "+status.connection.email : ""}</span>
          <span>Last backup: {formatTime(status.connection.lastBackupAt)}</span>
        </div>
        {totals && <div className="vv-backup-metrics">
          <div><strong>{totals.images}</strong><span>Images in Vault</span></div>
          <div><strong>{totals.originals}</strong><span>Originals backed up</span></div>
          <div><strong>{totals.covers}</strong><span>Covers only</span></div>
          <div><strong>{totals.failed}</strong><span>Failed</span></div>
          <div><strong>{totals.linkOnly}</strong><span>Link only</span></div>
        </div>}
        <div className="vv-backup-buttons">
          <button type="button" className="v2-btn v2-btn-primary" onClick={backUpNow} disabled={busy||status.connection.status!=="connected"}>{busy?"Backing up…":progress?.remaining?"Continue backup":"Back up images now"}</button>
          <a className="v2-btn" href={status.connection.folderUrl} target="_blank" rel="noopener noreferrer">Open Drive backups</a>
          <button type="button" className="v2-btn" onClick={connect} disabled={busy}>Reconnect</button>
          <button type="button" className="v2-btn" onClick={disconnect} disabled={busy}>Disconnect</button>
        </div>
      </>}
    {progress && <p role="status">This session: {progress.saved} files saved ({progress.covers} covers), {progress.linkOnly} links only, {progress.failed} failed, {progress.remaining} remaining.</p>}
    {message && <p role="status">{message}</p>}
    {error && <p role="alert" className="v2-error">{error}</p>}
    <p className="vv-backup-footnote">Backups run when you select the button; automatic scheduling is not enabled yet. Google may require you to approve the connection first. A saved website URL is not proof an image was backed up.</p>
  </div>;
}
