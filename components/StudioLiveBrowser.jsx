"use client";
import { useEffect, useState } from "react";

const STUDIO_URLS = {
  venice: "https://venice.ai/",
  perchance: "https://perchance.org/ai-text-to-image-generator",
};
const BRIDGE_REQ = "VAULT_STUDIO_BRIDGE_REQUEST";
const BRIDGE_OPEN = "VAULT_STUDIO_OPEN";
const BRIDGE_REPLY = "VAULT_STUDIO_BRIDGE_REPLY";

export default function StudioLiveBrowser({ site, name, onSaveCurrentUrl }) {
  const src = STUDIO_URLS[site] || STUDIO_URLS.venice;
  const [extension, setExtension] = useState(false);
  const [tryEmbedded, setTryEmbedded] = useState(false);
  const [frameKey, setFrameKey] = useState(0);
  const [frameState, setFrameState] = useState("loading");
  const [bridgeStatus, setBridgeStatus] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    setMobile(isMobile);
    // Real-site login and generator storage cannot be promised in iframes.
    // Do not default to a giant blank iframe, especially on iOS.
    setTryEmbedded(false);
    setFrameState("loading");
    setBridgeStatus("");
    setExtension(false);
    const receive = (event) => {
      if (event.source !== window || event.origin !== window.location.origin || event.data?.type !== BRIDGE_REPLY) return;
      if (event.data.available) setExtension(true);
      if (event.data.opened) setBridgeStatus("Chrome Studio opened. Your site session stays in its normal Chrome tab.");
      if (event.data.error) setBridgeStatus(event.data.error);
    };
    window.addEventListener("message", receive);
    window.postMessage({ type: BRIDGE_REQ }, window.location.origin);
    return () => window.removeEventListener("message", receive);
  }, [site]);

  const native = () => {
    if (!extension) { window.open(src, "_blank", "noopener,noreferrer"); return; }
    setBridgeStatus("Opening Chrome Studio…");
    window.postMessage({ type: BRIDGE_OPEN, site }, window.location.origin);
  };

  return <section className={"vv-studio-live" + (expanded ? " vv-studio-live-expanded" : "")}
    aria-label={name + " website and capture controls"}>
    <div className="vv-studio-live-toolbar">
      <div className="vv-studio-live-identity">
        <span className="vv-studio-live-dot" aria-hidden="true" />
        <div><strong>{name}</strong><small>Original generator · Vault saving tools</small></div>
      </div>
      <div className="vv-studio-live-actions">
        <button type="button" onClick={() => onSaveCurrentUrl?.(src)}>Save website URL</button>
        {tryEmbedded && <button type="button" onClick={() => {setFrameKey(n=>n+1);setFrameState("loading");}}>Reload preview</button>}
        {!mobile && <button type="button" onClick={() => setExpanded(x=>!x)}>{expanded ? "Collapse" : "Expand"}</button>}
        {!mobile && extension && <button className="vv-studio-native" type="button" onClick={native}>Full Chrome Studio</button>}
      </div>
    </div>
    {!tryEmbedded ? <div className="vv-studio-site-options">
      <span className="vv-studio-site-icon" aria-hidden="true">↗</span>
      <h3>Use {name} with its real browser controls</h3>
      <p>{mobile
        ? "Your phone cannot run the desktop Chrome Studio companion. The site cannot be guaranteed to work inside Vault's embedded frame. Open it in Safari, generate normally, then return to Vault to save the link or upload the finished file."
        : "Some websites block being embedded, especially for sign-in, generation and saved history. Full Chrome Studio uses the actual Chrome website beside Vault's controls."}</p>
      <div className="vv-studio-site-options-actions">
        <a href={src} target="_blank" rel="noopener noreferrer" className="vv-studio-original-link">Open {name} website <span aria-hidden="true">↗</span></a>
        {!mobile && extension && <button type="button" onClick={native}>Open in Chrome Studio</button>}
        <button type="button" onClick={() => {setTryEmbedded(true);setFrameState("loading");}}>Try embedded website</button>
      </div>
      <p className="vv-studio-site-note">Vault cannot read a website's private session, bypass its embed policy, or extract `blob:` and `data:` media from another origin. Save the original URL first; use a file upload for generated media without a durable link.</p>
    </div> : <>
      <div className="vv-studio-live-content">
        {frameState === "loading" && <div className="vv-studio-live-loading" role="status">Trying embedded website…</div>}
        <iframe key={site + "-" + frameKey} src={src} title={name + " experimental embedded website"}
          loading="eager"
          allow="clipboard-read; clipboard-write; fullscreen; camera; microphone"
          sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => setFrameState("loaded")}
        />
      </div>
      <div className="vv-studio-live-bottom">
        <span>A white or unresponsive frame means the site is not functioning here. An iframe loading event cannot prove the generator works.</span>
        <button type="button" onClick={()=>setTryEmbedded(false)}>Stop preview · use working website</button>
      </div>
    </>}
    {bridgeStatus && <p className="vv-studio-bridge-status" role="status">{bridgeStatus}</p>}
  </section>;
}
