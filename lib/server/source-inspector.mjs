// Source Inspector only returns HTTP(S) candidates. Browser-local blob: and
// data: media are files/content, not durable addresses and must be uploaded.
const IMAGE_FILE=/\.(?:jpe?g|png|webp|avif|gif|bmp)(?:$|[?#])/i;
const VIDEO_FILE=/\.(?:mp4|webm|mov|m4v|ogv|m3u8)(?:$|[?#])/i;
const BAD=/\b(?:logo|favicon|sprite|icon|pixel|tracker|adserver)\b/i;
function normalize(raw,base) {
  if (!raw) return "";
  try {
    const u=new URL(String(raw).trim().replaceAll("&amp;","&"),base);
    if (!["http:","https:"].includes(u.protocol)||!u.hostname||u.username||u.password) return "";
    return u.href;
  }catch{return "";}
}
function attrs(markup){
  const m={};
  for(const item of String(markup).matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) m[item[1].toLowerCase()]=item[2]??item[3];
  return m;
}
function mimeKind(mime){
  if(/^image\/(?:jpeg|png|webp|avif|gif|bmp)/i.test(mime||""))return "image";
  if(/^(?:video\/|application\/(?:x-mpegurl|vnd\.apple\.mpegurl))/i.test(mime||""))return "video";
  return "";
}
function filenameKind(url){
  if(IMAGE_FILE.test(url))return "image";
  if(VIDEO_FILE.test(url))return "video";
  return "";
}
export function collectSiteSourceCandidates(html,pageUrl,found={}) {
  const media=found.media||[];
  const map=new Map();
  const add=(raw,type,sourceKind,poster="",title="")=>{
    const url=normalize(raw,pageUrl);
    if(!url || BAD.test(new URL(url).pathname))return;
    const predicted=filenameKind(url);
    if(predicted && predicted!==type)return;
    const key=type+"|"+url;
    const entry={url,type,sourcePage:pageUrl,sourceKind,
      thumbnail:normalize(poster,pageUrl)||"",title:String(title||found.pageTitle||"Media source").slice(0,180),
      verified:false,confidence:predicted?"candidate":"needs-verification"};
    const prior=map.get(key);
    if(!prior||(!prior.thumbnail&&entry.thumbnail))map.set(key,entry);
  };
  for (const mediaItem of media) {
    if (mediaItem.type==="video"&&!VIDEO_FILE.test(mediaItem.url))continue;
    if (["canonical-video-page","video-card","embedded-video"].includes(mediaItem.sourceKind))continue;
    add(mediaItem.url,mediaItem.type,mediaItem.sourceKind,mediaItem.thumbnail,mediaItem.title);
  }
  const markup=String(html||"").slice(0,1_200_000);
  const social=[];
  for(const match of markup.matchAll(/<meta\b[^>]*>/gi)){
    const m=attrs(match[0]);
    const key=(m.property||m.name||"").toLowerCase();
    if(/^(?:og:image|og:image:secure_url|twitter:image|twitter:image:src)$/.test(key))social.push([m.content,"image","social-image"]);
    if(/^(?:og:video|og:video:url|og:video:secure_url|twitter:player:stream)$/.test(key))social.push([m.content,"video","social-video"]);
  }
  for(const item of social)add(...item);
  for(const match of markup.matchAll(/<(?:img|video|source|a)\b[^>]*>/gi)){
    const a=attrs(match[0]);
    const tag=match[0].match(/^<([a-z]+)/i)?.[1]?.toLowerCase();
    if(tag==="img"){
      for(const key of ["data-original","data-full","data-full-src","data-image","data-zoom-image","data-src","src"]){
        if(a[key])add(a[key],"image",key==="src"?"image-element":"original-image",a.src,a.alt);
      }
      for(const source of String(a.srcset||a["data-srcset"]||"").split(",")){
        const v=source.trim().split(/\s+/)[0];
        if(v)add(v,"image","image-srcset",a.src,a.alt);
      }
    }
    if(tag==="video"&&a.src)add(a.src,"video","video-element",a.poster,a.title);
    if(tag==="source"&&a.src){
      if(/video|mpegurl/i.test(a.type||"")||VIDEO_FILE.test(a.src))add(a.src,"video","video-source");
      if(/image/i.test(a.type||"")||IMAGE_FILE.test(a.src))add(a.src,"image","picture-source");
    }
    if(tag==="a"&&(a.download!==undefined || /\.(?:jpe?g|png|webp|avif|gif|mp4|webm|mov|m4v)(?:$|[?#])/i.test(a.href||""))){
      const href=normalize(a.href,pageUrl);
      const type=filenameKind(href);
      if(type)add(href,type,"download-link");
    }
  }
  return [...map.values()].slice(0,60);
}
export function publicSourceKind(mime){return mimeKind(mime)}
export function sourceIsFileUrl(url){return !!filenameKind(url)}
export function sourceRank(item){
  const weights={"direct-response":120,"download-link":110,"original-image":105,"video-source":100,"social-video":95,"structured-image":95,"social-image":80,"image-srcset":70,"image-element":55};
  return (item.verified?1000:0)+(weights[item.sourceKind]||60);
}
