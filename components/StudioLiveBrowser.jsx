"use client";
import { useEffect, useRef, useState } from "react";

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
  const [frameKey, setFrameKey] = useState(0);
  const [frameState, setFrameState] = useState("loading");
  const [bridgeStatus, setBridgeStatus] = useState("");
  const [expanded, setExpanded] = useState(false);
  const frame = useRef(null);
  const bridgePending = useRef(false);

  useEffect(() => {
    setFrameState("loading"); setBridgeStatus("");
    const receive = (event) => {
      if (event.source !== window || event.origin !== window.location.origin || event.data?.type !== BRIDGE_REPLY) return;
      if (event.data.available) setExtension(true);
      if (event.data.opened) { setBridgeStatus("Chrome Studio opened with the real site and Vault controls."); bridgePending.current = false; }
      if (event.data.error) { setBridgeStatus(event.data.error); bridgePending.current = false; }
    };
    window.addEventListener("message", receive);
    window.postMessage({ type: BRIDGE_REQ }, window.location.origin);
    return () => window.removeEventListener("message", receive);
  }, [site]);

  const openNativeStudio = () => {
    setBridgeStatus(extension ? "Opening Chrome Studio…" : "Chrome companion not detected. Using the original website.");
    if (!extension) { window.open(src, "_blank", "noopener,noreferrer"); return; }
    bridgePending.current = true;
    window.postMessage({ type: BRIDGE_OPEN, site }, window.location.origin);
    // Chrome may deny panel opening if a user gesture is not available.
    // Do not silently claim a working embedded session when it cannot open.
    setTimeout(() => {
      if (bridgePending.current) {
        bridgePending.current = false;
        setBridgeStatus("Chrome Studio could not be opened here. Open the original site or launch it from the extension.");
      }
    }, 2500);
  };

  const reload = () => { setFrameKey((n) => n + 1); setFrameState("loading"); };
  return (
    <section className={"vv-studio-live" + (expanded ? " vv-studio-live-expanded" : "")}
      aria-label={name + " interactive studio"}>
      <div className="vv-studio-live-toolbar">
        <div className="vv-studio-live-identity">
          <span className="vv-studio-live-dot" aria-hidden="true" />
          <div><strong>Live {name}</strong><small>Work in the original generator interface</small></div>
        </div>
        <div className="vv-studio-live-actions">
          <button type="button" onClick={reload} title="Reload embedded page">Reload</button>
          <button type="button" onClick={() => onSaveCurrentUrl?.(src)} title="Use website address for Vault save">Save URL</button>
          <button type="button" onClick={() => setExpanded((x)=>!x)}>{expanded ? "Exit large view" : "Expand"}</button>
          <button type="button" className="vv-studio-native" onClick={openNativeStudio}>
            {extension ? "Full Chrome Studio" : "Full browser mode"} <span aria-hidden="true">↗</span>
          </button>
        </div>
      </div>
      <div className="vv-studio-live-content">
        <iframe key={site + "-" + frameKey} ref={frame}
          src={src}
          title={name + " interactive website"}
          loading="eager"
          allow="clipboard-read; clipboard-write; fullscreen; camera; microphone; display-capture; identity-credentials-get"
          sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => setFrameState("loaded")}
        />
        {frameState === "loading" && <div className="vv-studio-live-loading" role="status">Opening {name}…</div>}
      </div>
      <div className="vv-studio-live-bottom">
        <span>Interactive website preview. Sign-in, browser storage, downloads, or some controls may be restricted by the site's embedding policy.</span>
        <button type="button" onClick={openNativeStudio}>Need working login or generator controls? Use Chrome Studio</button>
      </div>
      {bridgeStatus && <p className="vv-studio-bridge-status" role="status">{bridgeStatus}</p>}
    </section>
  );
}
