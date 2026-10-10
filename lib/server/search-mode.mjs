// One source of truth for search safety modes and query scopes. Regular is
// strict by default; opting in to broader results never bypasses provider policy.
export const SEARCH_MODES = Object.freeze(["regular","nsfw","unrestricted"]);
export const SEARCH_SCOPES = Object.freeze(["all","images","videos","sites"]);
export function normalSearchMode(value) { return SEARCH_MODES.includes(value) ? value : "regular"; }
export function normalSearchScope(value) { return SEARCH_SCOPES.includes(value) ? value : "all"; }
export function providerSafety(mode) {
  const value = normalSearchMode(mode);
  return { mode:value, ddg:value === "regular" ? "1" : "-2", bing:value === "regular" ? "strict" : "off" };
}
export function expandedSearchQuery(query, scope = "all") {
  const clean = String(query || "").trim().replace(/\s+/g," ");
  const normalized = normalSearchScope(scope);
  // These focus on result types without introducing adult keywords.
  const extras = { images:"(image OR photo OR gallery)", videos:"(video OR watch OR clip)", sites:"" };
  return extras[normalized] ? clean + " " + extras[normalized] : clean;
}
const IMAGE_LIKE = /(?:\.(?:jpe?g|png|webp|gif|avif)(?:$|[?#])|\/(?:images?|photos?|pictures?|gallery|galleries|albums?|artwork|artworks)(?:\/|$)|\b(?:image|photo|picture|gallery|artwork|illustration)\b)/i;
const VIDEO_LIKE = /(?:\.(?:mp4|m4v|webm|mov|m3u8)(?:$|[?#])|\/(?:watch|video|videos|clips?|shorts|reels?|player)(?:\/|$)|\b(?:video|watch|clip|movie|reel|stream)\b)/i;
const SITES = /(?:\/(?:gallery|galleries|videos?|photos?|collections?|albums?|media|search|results)(?:\/|$)|\b(?:gallery|site|collection|catalog|videos|images|photos)\b)/i;
const ADULT_INDICATORS = /\b(?:adult|nsfw|18\+|explicit|erotic|nude|nudity|porn|xxx)\b/i;
function mediaConfidence(item) {
  const text = [item.title,item.url,item.snippet].filter(Boolean).join(" ");
  return { image:IMAGE_LIKE.test(text),video:VIDEO_LIKE.test(text),site:SITES.test(text),adult:ADULT_INDICATORS.test(text) };
}
export function rankAndMergeSearch(results, { query="", scope="all", mode="regular", limit=40 }={}) {
  const bucket = new Map();
  const terms = String(query).toLowerCase().split(/\s+/).filter(w=>w.length>2).slice(0,8);
  for (const item of Array.isArray(results) ? results : []) {
    let u;
    try {
      u=new URL(String(item?.url||""));
      if (!["http:","https:"].includes(u.protocol)||!u.hostname||u.username||u.password) continue;
      u.hash="";
    } catch {continue;}
    const target=u.href;
    if (bucket.has(target)) {
      const current=bucket.get(target);
      current.sources=[...new Set([...current.sources,...(item.sources||[item.provider||"web"])])];
      continue;
    }
    const title=String(item.title||"").trim();
    if(!title)continue;
    const entry={
      title:title.slice(0,240),url:target,snippet:String(item.snippet||"").slice(0,450),
      host:u.hostname.replace(/^www\./,""),provider:item.provider||"web",
      sources:item.sources||[item.provider||"web"],
    };
    bucket.set(target,entry);
  }
  const array=[...bucket.values()].map(item=>{
    const kinds=mediaConfidence(item);
    const hay=[item.title,item.snippet,item.host].join(" ").toLowerCase();
    let score=terms.reduce((acc,word)=>acc+(item.title.toLowerCase().includes(word)?3:hay.includes(word)?1:0),0);
    score+=Math.min(3,item.sources.length)*2;
    if(scope==="images")score+=kinds.image?7:-2;
    if(scope==="videos")score+=kinds.video?7:-2;
    if(scope==="sites")score+=kinds.site?5:0;
    if(mode==="nsfw")score+=kinds.adult?4:0;
    return {...item,kind:kinds.image&&!kinds.video?"image":kinds.video&&!kinds.image?"video":kinds.image&&kinds.video?"media":"site",score};
  });
  array.sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title));
  return array.slice(0,Math.min(60,Math.max(1,limit))).map(({score,...item})=>item);
}
