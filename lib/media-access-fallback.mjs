// Public media URL and access-denial handling. A 403 on a single CDN file
// is not evidence that all other pages on that hostname are inaccessible.
const IMAGE_PATH=/\.(?:jpe?g|png|webp|avif|gif|bmp)(?:$|[?#])/i;
const FILE_MIME=/^image\/(?:jpeg|png|webp|avif|gif|bmp)(?:;|$)/i;
export function isDirectImageUrl(raw){
  try {
    const url=new URL(String(raw||""));
    if(!["https:","http:"].includes(url.protocol)||url.username||url.password)return false;
    const filename=url.pathname+url.search;
    return IMAGE_PATH.test(filename) ||
      FILE_MIME.test(url.searchParams.get("mime")||url.searchParams.get("content_type")||"");
  }catch{return false;}
}
export function isDirectMediaUrl(raw){
  return isDirectImageUrl(raw) || (()=>{
    try {
      const u=new URL(String(raw||""));
      return ["https:","http:"].includes(u.protocol) &&
        /\.(?:mp4|m4v|mov|webm|m3u8|ogv)(?:$|[?#])/i.test(u.pathname+u.search);
    }catch{return false;}
  })();
}
export function shouldRememberSiteDenied(url){
  return !isDirectMediaUrl(url);
}
export function isSourceImageDenied(response,data,url){
  return isDirectImageUrl(url) &&
    (response?.status===403 || data?.code==="SOURCE_MEDIA_ACCESS_DENIED");
}
