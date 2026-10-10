import { NextResponse } from "next/server";
import { validatePublicUrl, readTextLimited, safeFetch } from "@/lib/server/safe-url";
import { fetchWithRegionFallback } from "@/lib/server/region-fallback.js";
import { guardProxyRequest, securityErrorResponse } from "@/lib/server/proxy-guard";
import { discoverMedia, discoverEmbeddedPlayerUrls } from "@/lib/server/media-discovery.mjs";
import { collectSiteSourceCandidates, publicSourceKind, sourceRank } from "@/lib/server/source-inspector.mjs";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const NO_STORE={"Cache-Control":"no-store"};
const HTML_LIMIT=900_000;
const headers={Accept:"text/html,application/xhtml+xml,image/*;q=0.8,video/*;q=0.8","User-Agent":"Mozilla/5.0 (compatible; VaultSourceInspector/1.0)"};

async function inspectPage(target, origin, depth=0){
  const validation=await validatePublicUrl(target);
  if(!validation.ok)return {page:target,error:validation.error,candidates:[],detailPages:[]};
  const response=await fetchWithRegionFallback(validation.url.href,{
    method:"GET",timeoutMs:7000,maxBytes:HTML_LIMIT,headers,
  });
  if(!response.ok){
    await response.body?.cancel().catch(()=>{});
    return {page:target,error:"Website returned "+response.status,candidates:[],detailPages:[]};
  }
  const mime=response.headers.get("content-type")||"";
  const final=response.url||validation.url.href;
  const type=publicSourceKind(mime);
  if(type){
    await response.body?.cancel().catch(()=>{});
    return {page:final,candidates:[{url:final,type,title:"Actual media file",sourceKind:"direct-response",
      sourcePage:origin||final,verified:true,confidence:"verified",mimeType:mime,thumbnail:type==="image"?final:""}],detailPages:[]};
  }
  if(!/(html|xml)/i.test(mime)){
    await response.body?.cancel().catch(()=>{});
    return {page:final,error:"Not a readable HTML or media response",candidates:[],detailPages:[]};
  }
  const html=await readTextLimited(response,HTML_LIMIT);
  const found=discoverMedia(html,final,{limit:70});
  const candidates=collectSiteSourceCandidates(html,final,found);
  const detailPages=depth>0?[]:[
    ...(found.imagePages||[]).map(x=>({...x,type:"image"})),
    ...(found.videoPages||[]).map(x=>({...x,type:"video"})),
    ...discoverEmbeddedPlayerUrls(html,final,{limit:2}).map(url=>({url,type:"video",title:"Embedded player"})),
  ].filter(x=>x.url!==final).slice(0,16);
  return {page:final,title:found.pageTitle,candidates,detailPages};
}

async function checkCandidate(item){
  const validated=await validatePublicUrl(item.url);
  if(!validated.ok)return {...item,verified:false,confidence:"blocked"};
  try{
    // Small HEAD probes do not download the media. An absent/denied HEAD
    // means a *candidate*, never an automatically verified file.
    const response=await safeFetch(validated.url.href,{method:"HEAD",timeoutMs:2500,maxBytes:8192,headers:{
      Accept:item.type==="image"?"image/*":"video/*,application/vnd.apple.mpegurl",
      "User-Agent":"Mozilla/5.0 (compatible; VaultSourceInspector/1.0)",
    }});
    const mime=response.headers.get("content-type")||"";
    const kind=publicSourceKind(mime);
    const actualUrl=response.url||item.url;
    await response.body?.cancel().catch(()=>{});
    if(response.ok&&kind===item.type) return {...item,url:actualUrl,verified:true,confidence:"verified",mimeType:mime};
    if(response.ok&&kind&&kind!==item.type)return null;
    return {...item,verified:false,confidence:response.status===403||response.status===401?"restricted":"candidate"};
  }catch{return {...item,verified:false,confidence:"unverified"};}
}

export async function GET(request){
  const args=new URL(request.url).searchParams;
  const raw=String(args.get("url")||"").slice(0,2048);
  const kind=["image","video"].includes(args.get("kind"))?args.get("kind"):"all";
  const deeper=args.get("deep")!=="false";
  if(!raw)return NextResponse.json({error:"Missing website or media URL"},{status:400,headers:NO_STORE});
  try{await guardProxyRequest(request,"discovery");}
  catch(e){return securityErrorResponse(e,"Source lookup unavailable");}
  try{
    const primary=await inspectPage(raw,raw,0);
    if(primary.error)return NextResponse.json({
      pageUrl:raw,kind,sources:[],detailPages:[],reason:primary.error,
      guidance:"Open the site normally and use its download control. Protected or browser-local media cannot be extracted from public HTML.",
    },{headers:NO_STORE});

    const nested=[];
    // One level deep, at most three specifically identified media detail pages.
    if(deeper){
      const eligible=primary.detailPages.filter(x=>kind==="all"||x.type===kind);
      // One parallel batch of up to 3 selected detail pages; never site-wide crawl.
      const details=await Promise.allSettled(eligible.slice(0,3).map(async page=>({
        page, data:await inspectPage(page.url,primary.page,1),
      })));
      for(const result of details){
        if(result.status!=="fulfilled")continue;
        const {page,data}=result.value;
        nested.push(...data.candidates.map(x=>({
          ...x,thumbnail:x.thumbnail||page.thumbnail||"",sourcePage:page.url,
        })));
      }
    }
    const map=new Map();
    for(const item of [...primary.candidates,...nested]){
      if(kind!=="all"&&item.type!==kind)continue;
      const existing=map.get(item.type+"|"+item.url);
      if(!existing||sourceRank(item)>sourceRank(existing))map.set(item.type+"|"+item.url,item);
    }
    const ordered=[...map.values()].sort((a,b)=>sourceRank(b)-sourceRank(a)).slice(0,32);
    const checked=[];
    // Parallel, bounded HEAD verification of top six candidates.
    const probes=await Promise.allSettled(ordered.slice(0,6).map(checkCandidate));
    for(const probe of probes)if(probe.status==="fulfilled"&&probe.value)checked.push(probe.value);
    checked.push(...ordered.slice(6));
    checked.sort((a,b)=>sourceRank(b)-sourceRank(a));
    return NextResponse.json({
      pageUrl:primary.page, pageTitle:primary.title||"",kind, sources:checked,
      detailPages:primary.detailPages.slice(0,16),
      counts:{verified:checked.filter(x=>x.verified).length,candidates:checked.length,linkedPages:primary.detailPages.length},
      reason:checked.length?"":"No public file URL was found in this page or its immediate media details.",
      guidance:"Verified means the public URL replied with the expected image/video content type. Unverified URLs may be covers, expire, or require a logged-in browser. For data: and blob: media use the site's Download button and save the actual file.",
    },{headers:NO_STORE});
  }catch(e){return securityErrorResponse(e,"Couldn't inspect original media sources");}
}
