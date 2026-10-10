"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { googleDriveFileName, vaultDriveSource, SAVE_TO_DRIVE_EXTENSION_URL } from "@/lib/google-drive-save.mjs";

const GOOGLE_SAVE_SCRIPT = "https://apis.google.com/js/platform.js";
const OFFICIAL_EXTENSION = SAVE_TO_DRIVE_EXTENSION_URL;
let libraryPromise = null;

function getLibrary() {
  if (typeof window === "undefined") return Promise.reject(new Error("Google Drive is available only in a browser."));
  if (window.gapi?.savetodrive?.render) return Promise.resolve(window.gapi.savetodrive);
  if (libraryPromise) return libraryPromise;
  libraryPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-vault-google-save="true"]');
    const script = existing || document.createElement("script");
    window.___gcfg = { ...window.___gcfg, parsetags: "explicit" };
    if (!existing) {
      script.src = GOOGLE_SAVE_SCRIPT;
      script.async = true;
      script.defer = true;
      script.dataset.vaultGoogleSave = "true";
    }
    let finished = false;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
      if (error) reject(error);
      else resolve(window.gapi.savetodrive);
    };
    const onLoad = () => {
      // Google may initialize gapi asynchronously after the script loads.
      let trials = 0;
      const retry = () => {
        if (finished) return;
        if (window.gapi?.savetodrive?.render) return finish();
        if (++trials > 32) return finish(new Error("Google Drive's save button did not initialize."));
        setTimeout(retry, 120);
      };
      retry();
    };
    const onError = () => finish(new Error("Google's Save to Drive service could not be loaded."));
    const timeout = setTimeout(() => finish(new Error("Google Drive is unavailable in this browser.")), 8500);
    script.addEventListener("load", onLoad);
    script.addEventListener("error", onError);
    if (!existing) document.head.appendChild(script);
    else if (window.gapi?.savetodrive?.render) finish();
  }).catch((err) => { libraryPromise = null; throw err; });
  return libraryPromise;
}

export default function GoogleDriveSave({ url, type = "image", title = "", onOpenOriginal, compact = false }) {
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const mount = useRef(null);
  const source = useMemo(() => vaultDriveSource(url, type), [url, type]);
  const fileName = useMemo(() => googleDriveFileName(url, title, type), [url, title, type]);

  useEffect(() => {
    if (!enabled || !source) return;
    let stale = false;
    setStatus("loading"); setError("");
    getLibrary().then((drive) => {
      if (stale || !mount.current) return;
      mount.current.replaceChildren();
      drive.render(mount.current, {
        src: new URL(source, window.location.origin).href,
        filename: fileName,
        sitename: "Vault Media Library",
      });
      setStatus("ready");
    }).catch((e) => {
      if (!stale) { setStatus("error"); setError(e.message || "Google Drive button unavailable."); }
    });
    return () => { stale = true; };
  }, [enabled, source, fileName]);

  if (!source) return <div className="vv-drive-fallback">
    <p>Vault needs an accessible image or video file before it can send the media to Drive. A thumbnail or video post alone is not the file.</p>
    {onOpenOriginal && <button type="button" onClick={onOpenOriginal}>Open original website</button>}
    <a href={OFFICIAL_EXTENSION} target="_blank" rel="noopener noreferrer">Save to Google Drive extension (desktop Chrome)</a>
  </div>;

  return <div className={"vv-drive-fallback" + (compact ? " compact" : "")}>
    {!enabled && <button type="button" onClick={() => setEnabled(true)}>Save file to Google Drive</button>}
    {enabled && <>
      {status === "loading" && <p role="status">Loading Google's Save to Drive button…</p>}
      <div ref={mount} className="vv-drive-google-button" aria-label="Google Save to Drive widget" />
      {status === "ready" && <p className="vv-drive-note">Use Google's button above to sign into Drive and save this {type}. The file is copied from the source, not just bookmarked.</p>}
      {status === "error" && <p role="alert">{error} <a href={OFFICIAL_EXTENSION} target="_blank" rel="noopener noreferrer">Try Google's Chrome extension</a></p>}
    </>}
  </div>;
}
