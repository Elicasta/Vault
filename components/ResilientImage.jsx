"use client";
import { useEffect, useState } from "react";

// A browser is permitted to try a public image directly after Vault's
// server image proxy fails. Neither attempt bypasses a 403 or external login.
export default function ResilientImage({
  url="",alt="",className="",loading="lazy",style,showFallbackLink=false,
}) {
  const [mode,setMode]=useState("proxy");
  const source=String(url||"").trim();
  useEffect(()=>setMode("proxy"),[source]);
  if(!/^https?:\/\//i.test(source)){
    return <div className={"vv-image-unavailable "+className} role="img"
      aria-label={alt||"Image preview unavailable"}>Preview unavailable</div>;
  }
  if(mode==="unavailable")return <div className={"vv-image-unavailable "+className}
    role="img" aria-label={alt||"Image preview unavailable"}>
    <span>Preview unavailable</span>
    {showFallbackLink&&<a href={source} target="_blank" rel="noopener noreferrer">Open original</a>}
  </div>;
  return <img className={className} style={style} loading={loading} alt={alt}
    referrerPolicy="no-referrer"
    src={mode==="proxy"?"/api/media?url="+encodeURIComponent(source):source}
    onError={()=>setMode(old=>old==="proxy"?"direct":"unavailable")}/>;
}
