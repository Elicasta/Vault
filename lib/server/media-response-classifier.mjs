// Handle public websites that send an inaccurate/missing Content-Type header.
// Never treat arbitrary JSON, HTML error pages or gallery thumbnails as file
// bytes. Caller reads at most a small prefix on unrecognized MIME responses.
const HTML_MIME = /(?:^|\/)(?:x?html|xml)(?:$|[;\s+])/i;
const IMAGE_MIME = /^image\/(?:jpeg|png|gif|webp|avif|bmp)(?:;|$)/i;
const VIDEO_MIME = /^video\/(?:mp4|webm|quicktime|x-m4v|ogg)(?:;|$)/i;

export function normalizedMime(raw) {
  return String(raw || "").split(";", 1)[0].trim().toLowerCase().slice(0,100);
}
export function sniffMediaSignature(input) {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input || []);
  const ascii = (start,end) => Array.from(b.subarray(start,end)).map(x=>String.fromCharCode(x)).join("");
  if (b.length >= 4 && b[0]===0x89 && ascii(1,4)==="PNG") return "image";
  if (b.length >= 3 && b[0]===0xff && b[1]===0xd8 && b[2]===0xff) return "image";
  if (b.length >= 6 && /^GIF8[79]a$/.test(ascii(0,6))) return "image";
  if (b.length >= 12 && ascii(0,4)==="RIFF" && ascii(8,12)==="WEBP") return "image";
  if (b.length >= 12 && ascii(4,8)==="ftyp" && /^(?:avif|avis|mif1)/.test(ascii(8,12))) return "image";
  if (b.length >= 2 && ascii(0,2)==="BM") return "image";
  if (b.length >= 12 && ascii(4,8)==="ftyp") return "video";
  if (b.length >= 4 && b[0]===0x1a&&b[1]===0x45&&b[2]===0xdf&&b[3]===0xa3) return "video";
  return "";
}
export function sniffHtmlPrefix(input) {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input || []);
  const sample = new TextDecoder().decode(b.subarray(0,4096)).replace(/^\uFEFF/,"").trimStart();
  return /^(?:<!doctype\s+html\b|<html(?:\s|>)|<head(?:\s|>)|<body(?:\s|>)|<\?xml\b)/i.test(sample) ||
    /^<!--[\s\S]{0,2000}?(?:<html(?:\s|>)|<!doctype\s+html\b)/i.test(sample);
}
export function classifyKnownMime(raw) {
  const mime = normalizedMime(raw);
  if (IMAGE_MIME.test(mime)) return "image";
  if (VIDEO_MIME.test(mime)) return "video";
  if (/^(?:text\/html|application\/(?:xhtml\+xml|xml)|text\/xml)$/.test(mime)) return "html";
  return "unknown";
}

export async function inspectAmbiguousBody(response, limit=1_200_000) {
  const reader=response.body?.getReader();
  if (!reader) return {kind:"unsupported"};
  const chunks=[];
  let sampled=0, finished=false;
  try {
    while(sampled<4096){
      const {value,done}=await reader.read();
      if(done){finished=true;break;}
      sampled+=value.byteLength;
      if(sampled>limit) return {kind:"unsupported"};
      chunks.push(value);
    }
    const prefix=new Uint8Array(sampled);let offset=0;
    for(const chunk of chunks){prefix.set(chunk,offset);offset+=chunk.byteLength;}
    const file=sniffMediaSignature(prefix);
    if(file) return {kind:file,verifiedBy:"signature"};
    if(!sniffHtmlPrefix(prefix)) return {kind:"unsupported"};
    let total=sampled;
    if(!finished){
      while(true){
        const {value,done}=await reader.read();
        if(done)break;
        total+=value.byteLength;
        if(total>limit)return {kind:"unsupported",reason:"too-large"};
        chunks.push(value);
      }
    }
    const data=new Uint8Array(total);offset=0;
    for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.byteLength;}
    return {kind:"html",html:new TextDecoder().decode(data),verifiedBy:"body-sniff"};
  } finally {
    try{await reader.cancel();}catch{}
    try{reader.releaseLock();}catch{}
  }
}
