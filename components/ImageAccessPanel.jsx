"use client";
import { useState } from "react";
import ResilientImage from "./ResilientImage";

// Keeps the page-navigation trail usable even if the original image CDN
// rejects Vault's image proxy and direct browser embedding.
export default function ImageAccessPanel({
  imageUrl="",title="Image",denied=false,sourcePage="",
}) {
  const [copied,setCopied]=useState("");
  const direct=String(imageUrl||"").trim();
  if(!/^https?:\/\//i.test(direct))return null;
  const importLink="/import?url="+encodeURIComponent(sourcePage||direct);
  const copy=async()=>{
    try {await navigator.clipboard.writeText(direct);setCopied("Image URL copied.");}
    catch{setCopied("Clipboard unavailable. Open the original image to copy its URL.");}
  };
  return <section className="vv-image-access-panel" aria-label="View original image">
    <div>
      <span className="vv-media-eyebrow">IMAGE VIEWER · ORIGINAL LINK</span>
      <h3>{title||"Image"}</h3>
      {denied&&<p role="status">The image host denied Vault's request (HTTP 403). Vault can try a direct browser image preview, but the website may also block that.</p>}
      {!denied&&<p>Vault will try its image proxy and then the original URL directly. Some websites disallow image embedding.</p>}
    </div>
    <ResilientImage key={direct} url={direct} alt={title||"Original image"}
      loading="eager" className="vv-image-access-preview" showFallbackLink/>
    <div className="vv-image-access-actions">
      <a href={direct} target="_blank" rel="noopener noreferrer">Open original image</a>
      <button type="button" onClick={copy}>Copy image URL</button>
      <a href={importLink}>Import Media</a>
    </div>
    {copied&&<p role="status">{copied}</p>}
    <p className="vv-image-access-guidance">If the image opens on the original website, use its permitted download or save option, then upload that file in Vault's Import Media area. A link alone cannot guarantee continued access.</p>
  </section>;
}
