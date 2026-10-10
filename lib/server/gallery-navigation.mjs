// Browsable gallery cards are *pages*, not image binaries.
// Restrict to HTTP(S) and same-host links; the downstream scanner separately
// DNS-checks every URL and never bypasses the remote site's access controls.
const BAD_PATH=/(?:^|[/_.-])(?:login|logout|signup|signin|register|privacy|terms|account|checkout|cart|advertis(?:e|ing)|favicon|logo|sprite|icon|subscribe)(?:[/_.-]|$)/i;
const MEDIA_EXT=/\.(?:jpe?g|png|gif|webp|avif|bmp|mp4|webm|mov|m4v|m3u8|pdf|zip)(?:$|[?#])/i;
const PAGE_EXT=/\.(?:js|css|json|xml|txt|svg|woff2?|ttf)(?:$|[?#])/i;
const CATEGORY=/\/(?:categor(?:y|ies)|tags?|topics?|models?|collections?|sections?|genres?|series|themes?)(?:\/|$)/i;
const GALLERY=/\/(?:galleries|gallery|albums?|sets?|photosets?|photo-shoots?|photoshoots?|portfolios?)(?:\/|$)/i;
function attr(raw){
 const found={};
 for(const m of String(raw).matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)){
  found[m[1].toLowerCase()]=(m[2]??m[3]??m[4]??"").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"');
 }
 return found;
}
function url(raw,base){
 try {
  if(!raw||/^(?:javascript|data|blob|mailto|tel):/i.test(raw))return "";
  const current=new URL(base),next=new URL(raw,current);
  if(!["http:","https:"].includes(next.protocol)||next.username||next.password)return "";
  // Any actual cross-domain media asset goes through normal scanner instead.
  if(next.hostname!==current.hostname)return "";
  if(next.href===current.href||BAD_PATH.test(next.pathname)||MEDIA_EXT.test(next.href)||PAGE_EXT.test(next.href))return "";
  next.hash="";
  return next.href;
 }catch{return "";}
}
function preview(raw,base){
 try{
  const u=new URL(String(raw||""),base);
  return ["http:","https:"].includes(u.protocol)&&!u.username&&!u.password?u.href:"";
 }catch{return "";}
}
function label(raw,fallback="Page"){
 return String(raw||fallback).replace(/<[^>]*>/g," ").replace(/&(?:amp|quot|#39|nbsp);/gi," ").replace(/\s+/g," ").trim().slice(0,180)||fallback;
}
export function classifyLinkedPage(link,title="",classText=""){
 const target=String(link||"");
 const hints=(title+" "+classText).toLowerCase();
 if(CATEGORY.test(target)||/\b(?:category|browse categories|models|topics|genre)\b/i.test(hints))return "category";
 if(GALLERY.test(target)||/\b(?:gallery|photoset|photo set|album|collection|shoot|set)\b/i.test(hints))return "gallery";
 if(/\/(?:photos?|pictures?|images?|media|posts?|p|items?|details?)\//i.test(target))return "photo-page";
 return "page";
}
export function discoverLinkedGalleryPages(html,pageUrl,{limit=80}={}){
 const source=String(html||"").slice(0,1_200_000);
 const found=new Map();
 const cap=Math.max(1,Math.min(80,Number(limit)||80));
 for(const match of source.matchAll(/<a\b[^>]*>([\s\S]{0,7000}?)<\/a>/gi)){
  const opening=match[0].match(/^<a\b[^>]*>/i)?.[0]||"";
  const a=attr(opening),inner=match[1];
  const href=url(a.href||a["data-href"],pageUrl);
  if(!href||found.has(href))continue;
  const imgTag=inner.match(/<img\b[^>]*>/i)?.[0]||"";
  const img=attr(imgTag);
  const image=preview(img["data-src"]||img["data-original"]||img.src||a["data-thumbnail"]||"",pageUrl);
  const text=label(a.title||a["aria-label"]||img.alt||inner.replace(/<[^>]+>/g," "),"Browse page");
  if(!imgTag&&!a["data-thumbnail"])continue;
  if((img.width&&Number(img.width)<=40)||(img.height&&Number(img.height)<=40))continue;
  const kind=classifyLinkedPage(href,text,[a.class,a.rel,a["data-gallery"],a["data-category"]].join(" "));
  found.set(href,{url:href,title:text,thumbnail:image,kind,sourcePage:pageUrl});
  if(found.size>=cap)break;
 }
 return [...found.values()];
}
export function galleryPageLevel(data){
 const pages=Array.isArray(data?.browsePages)?data.browsePages:[];
 const direct=(data?.media||[]).filter(x=>x.type==="image"&&
   /^(?:gallery-full-image|site-gallery-candidate|image-element|image-srcset|picture-source|direct-media|structured-image)$/i.test(x.sourceKind||"")).length;
 if(data?.directFile===true)return "image";
 if(pages.some(x=>x.kind==="category")&&direct<3)return "categories";
 const detail=(data?.imagePages||[]).length;
 if(pages.length>=2&&direct<2&&pages.length>=detail*0.5)return "gallery-list";
 if(direct>=2||detail>=2)return "gallery";
 if(pages.length)return "gallery-list";
 if((data?.media||[]).some(x=>x.type==="image"))return "image";
 return "empty";
}
export function shouldOfferGalleryBulkImport(data){
 return galleryPageLevel(data)==="gallery" && !!data?.galleryDetected;
}
