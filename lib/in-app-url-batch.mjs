import { normalizeGeneratorPublicUrl, inferGeneratorUrlType } from "./generator-save-url.mjs";

const HEADERS={
  url:["url","link","image url","media url","file url","file","file link","src","source url","original url","gallery url","gallery link"],
  title:["title","name","caption","label","gallery name","album","file name"],
  folder:["folder","collection","gallery","category","section"],
  type:["type","media type","kind"],
  thumbnail:["thumbnail","thumb","cover","preview","thumbnail url","cover url","poster"],
  sourcePage:["source page","page url","page link","origin"],
  note:["note","description","notes"],
};
const cleanHeader=x=>String(x||"").trim().toLowerCase().replace(/[_-]/g," ").replace(/\s+/g," ");
const col=(heads,name)=>heads.findIndex(h=>HEADERS[name].includes(cleanHeader(h)));
export function parseSeparatedRows(raw,separator=",",max=1200){
 const rows=[];let row=[],cell="",quoted=false;
 const source=String(raw||"").slice(0,1_000_000);
 for(let i=0;i<source.length;i++){
  const c=source[i];
  if(c==='"'){if(quoted&&source[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(c===separator&&!quoted){row.push(cell);cell="";}
  else if((c==="\n"||c==="\r")&&!quoted){
   if(c==="\r"&&source[i+1]==="\n")i++;
   row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
   row=[];cell="";if(rows.length>=max)break;
  } else cell+=c;
 }
 if(rows.length<max&&(row.length||cell)){row.push(cell);if(row.some(x=>x.trim()))rows.push(row);}
 return rows;
}
function safeHttp(raw){
 const candidate=String(raw||"").trim();
 if(!/^https?:\/\//i.test(candidate))return "";
 const url=normalizeGeneratorPublicUrl(candidate);
 return url || "";
}
export function parseInAppUrlBatch(raw,{folder="",unknownAs="link"}={}){
 const source=String(raw||"").trim().slice(0,1_000_000);
 if(!source)return {items:[],invalid:0,duplicates:0,total:0,truncated:false};
 const sep=source.includes("\t")?"\t":",";
 const rows=parseSeparatedRows(source,sep,1200);
 const heads=rows[0]||[];
 const hasHeader=col(heads,"url")>=0;
 const indexes=Object.fromEntries(Object.keys(HEADERS).map(k=>[k,hasHeader?col(heads,k):-1]));
 const seen=new Set(),items=[];
 let invalid=0,duplicates=0,total=0;
 for(const row of rows.slice(hasHeader?1:0)){
  total++;
  const rawUrl=hasHeader?row[indexes.url]:row.find(x=>/^https?:\/\//i.test(String(x||"").trim()));
  const url=safeHttp(rawUrl);
  if(!url){invalid++;continue;}
  if(seen.has(url)){duplicates++;continue;}
  const field=name=>indexes[name]>=0?String(row[indexes[name]]||"").trim():"";
  const kind=field("type").toLowerCase();
  const type=["image","video","link"].includes(kind)?kind:
   (unknownAs==="image"?"image":inferGeneratorUrlType(url));
  const urlPath=new URL(url).pathname.split("/").filter(Boolean).pop()||new URL(url).hostname;
  let guessed=urlPath.replace(/[-_]+/g," ");
  try{guessed=decodeURIComponent(guessed);}catch{}
  guessed=guessed.slice(0,160);
  const title=field("title").slice(0,180)||guessed||"Saved gallery";
  const media={
   url,title,type,folder:field("folder").slice(0,90)||folder||"",
   thumbnail:safeHttp(field("thumbnail")),
   sourcePage:safeHttp(field("sourcePage"))||url,
   note:field("note").slice(0,250),
  };
  seen.add(url);items.push(media);
  if(items.length>=1000)break;
 }
 return {items,invalid,duplicates,total,truncated:rows.length>=1200||items.length>=1000};
}
export function galleryPageLinkItem(page,{folder="",keyOf}={}){
 const url=safeHttp(page?.url);
 if(!url||typeof keyOf!=="function")return null;
 const title=String(page.title||"Gallery").trim().slice(0,180)||"Gallery";
 return {
  key:keyOf(url),url,type:"link",title,folder:folder||null,
  thumbnail:safeHttp(page.thumbnail)||null,
  note:"Saved gallery page link. Open on the source website if images are blocked in Vault.",
  tags:["saved-url","gallery-link"],
  sourcePage:safeHttp(page.sourcePage)||url,
  isVaultItem:true,addedAt:new Date().toISOString(),
 };
}
