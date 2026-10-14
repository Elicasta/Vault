// Shared source identification for the Chrome popup + service worker.
// Pure URL metadata, never authentication or private file retrieval.
(function (scope) {
  const IMAGE = /\.(?:jpe?g|png|webp|gif|avif|bmp)(?:$|[?#])/i;
  const VIDEO = /\.(?:mp4|m4v|webm|mov|ogv|m3u8)(?:$|[?#])/i;
  const AUDIO = /\.(?:mp3|m4a|aac|wav|ogg)(?:$|[?#])/i;
  function url(raw) {
    try {
      const parsed = new URL(String(raw || "").trim());
      if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) return "";
      parsed.hash = "";
      for (const key of [...parsed.searchParams.keys()]) {
        if (/^(utm_.+|fbclid|gclid|dclid|igshid)$/i.test(key)) parsed.searchParams.delete(key);
      }
      return parsed.href;
    } catch { return ""; }
  }
  function identify(raw) {
    const link = url(raw);
    if (!link) return null;
    const u = new URL(link), h = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = u.pathname;
    const youtube = /(?:^|\.)youtube\.com$/.test(h) || h === "youtu.be" || h === "youtube-nocookie.com";
    if (youtube) {
      const id = h === "youtu.be" ? path.split("/")[1] : path.match(/^\/(?:shorts|embed|live|v)\/([\w-]+)/)?.[1] || u.searchParams.get("v");
      return { source:"youtube", name:"YouTube", type:"video", url:link,
        thumbnail:/^[\w-]{11}$/.test(id || "") ? "https://img.youtube.com/vi/" + id + "/hqdefault.jpg" : "" };
    }
    if (h === "drive.google.com" || h === "docs.google.com") {
      const id = path.match(/\/(?:file\/d|document\/d|spreadsheets\/d|presentation\/d)\/([\w-]{12,})/)?.[1] || u.searchParams.get("id");
      const mime = /\/spreadsheets\/|\/document\/|\/presentation\//.test(path) ? "link" : "video";
      return { source:"drive", name:"Google Drive", type:mime, url:link,
        thumbnail: id && /^[\w-]{12,}$/.test(id) ? "https://drive.google.com/thumbnail?id=" + encodeURIComponent(id) + "&sz=w640" : "" };
    }
    if (/(^|\.)pinterest\.(?:com|ca|co\.uk|fr|de|es|it|com\.au)$/.test(h) || h === "pin.it") {
      return { source:"pinterest", name:"Pinterest", type:"link", url:link, thumbnail:"" };
    }
    if (h === "vimeo.com" || h === "player.vimeo.com") {
      const id=path.match(/(?:\/video)?\/(\d+)/)?.[1];
      return { source:"vimeo", name:"Vimeo", type:"video", url:link, thumbnail:id?"https://vumbnail.com/"+id+".jpg":"" };
    }
    if (/(^|\.)instagram\.com$/.test(h)) return {source:"instagram",name:"Instagram",type:"link",url:link,thumbnail:""};
    if (/(^|\.)tiktok\.com$/.test(h)) return {source:"tiktok",name:"TikTok",type:"video",url:link,thumbnail:""};
    if (/(^|\.)reddit\.com$/.test(h)) return {source:"reddit",name:"Reddit",type:"link",url:link,thumbnail:""};
    if (h==="x.com" || h==="twitter.com") return {source:"twitter",name:"X",type:"link",url:link,thumbnail:""};
    if (/(^|\.)dropbox\.com$/.test(h)) return {source:"dropbox",name:"Dropbox",type:"link",url:link,thumbnail:""};
    if (IMAGE.test(link)) return {source:"image",name:"Direct image",type:"image",url:link,thumbnail:link};
    if (VIDEO.test(link)) return {source:"video-file",name:"Video file",type:"video",url:link,thumbnail:""};
    if (AUDIO.test(link)) return {source:"audio-file",name:"Audio file",type:"audio",url:link,thumbnail:""};
    return {source:"website",name:h,type:"link",url:link,thumbnail:""};
  }
  function enrich(entry) {
    const base = identify(entry && entry.url);
    if (!base) return null;
    const cover=url(entry.thumbnail) || base.thumbnail;
    const rawType=String(entry.type || "");
    const type=base.source === "website" && ["image","video","audio"].includes(rawType) ? rawType : base.type;
    return { ...entry, url:base.url, type, source:base.source, sourceName:base.name,
      title:String(entry.title || "").trim().slice(0,180) || base.name + " item",
      thumbnail:cover, sourcePage:url(entry.sourcePage) || base.url,
      sourceKind:entry.sourceKind || "browser-shared-link" };
  }
  const API = { identify, enrich, cleanUrl:url };
  if (typeof module !== "undefined" && module.exports) module.exports=API;
  scope.VaultSourceAware=API;
})(globalThis);
