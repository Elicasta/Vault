import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalSearchMode,normalSearchScope,providerSafety,expandedSearchQuery,rankAndMergeSearch } from "../lib/server/search-mode.mjs";

test("search defaults to strict Regular mode, with opt-in NSFW or unrestricted",()=>{
  assert.equal(normalSearchMode(undefined),"regular");
  assert.equal(normalSearchMode("bogus"),"regular");
  assert.equal(normalSearchMode("nsfw"),"nsfw");
  assert.equal(normalSearchMode("unrestricted"),"unrestricted");
  assert.equal(providerSafety("regular").ddg,"1");
  assert.equal(providerSafety("regular").bing,"strict");
  assert.equal(providerSafety("nsfw").ddg,"-2");
  assert.equal(providerSafety("unrestricted").bing,"off");
  assert.equal(normalSearchScope("bad"),"all");
});
test("image and video queries target media without implicitly adding NSFW content",()=>{
  assert.match(expandedSearchQuery("skyline","videos"),/video OR watch OR clip/);
  assert.match(expandedSearchQuery("skyline","images"),/image OR photo OR gallery/);
  assert.equal(expandedSearchQuery("skyline","all"),"skyline");
});
test("search results merge provider duplicates and rank media pages",()=>{
  const result=rankAndMergeSearch([
    {title:"Moon gallery",url:"https://site.test/photos/moon",snippet:"Beautiful image gallery",provider:"duckduckgo-html"},
    {title:"Moon gallery",url:"https://site.test/photos/moon",snippet:"duplicate",provider:"bing-html"},
    {title:"Unrelated guide",url:"https://example.net/about",provider:"bing-html"},
    {title:"Moon video clip",url:"https://site.test/watch/moon",provider:"duckduckgo-lite"},
    {title:"bad",url:"javascript:alert(1)",provider:"duckduckgo-html"},
  ],{query:"moon",scope:"images",mode:"regular"});
  assert.equal(result.length,3);
  assert.equal(result[0].url,"https://site.test/photos/moon");
  assert.equal(result[0].sources.length,2);
  assert.equal(result.some(x=>x.url.startsWith("javascript:")),false);
  assert.ok(result[0].kind==="image"||result[0].kind==="media");
});
test("search endpoint genuinely sends per-provider safe search controls and merges results",()=>{
  const route=fs.readFileSync("app/api/browser-search/route.js","utf8");
  assert.match(route,/url\.searchParams\.set\("kp", safety\.ddg\)/);
  assert.match(route,/url\.searchParams\.set\("adlt", safety\.bing\)/);
  assert.match(route,/normalSearchMode\(searchParams\.get\("mode"\)\)/);
  assert.match(route,/normalSearchScope\(searchParams\.get\("scope"\)\)/);
  assert.match(route,/Promise\.allSettled/);
  assert.match(route,/rankAndMergeSearch/);
  assert.match(route,/guardProxyRequest\(req,"search"\)/);
  assert.doesNotMatch(route,/if \(results\.length\) \{\s*return NextResponse\.json\(\{ query: q, locale:/);
});
test("Vault browser exposes clear safety controls and media scopes with regular default",()=>{
  const view=fs.readFileSync("components/InAppBrowser.jsx","utf8");
  assert.match(view,/useState\("regular"\)/);
  assert.match(view,/useState\("all"\)/);
  assert.match(view,/NSFW/);
  assert.match(view,/Unrestricted/);
  assert.match(view,/aria-pressed=\{searchMode===value\}/);
  assert.match(view,/All results/);
  assert.match(view,/Sites \/ galleries/);
  assert.match(view,/searchScope/);
  assert.match(view,/Filter by website/);
  assert.match(view,/More results/);
});
test("Vault uses universal import with gallery depth and keeps Chrome image capture",()=>{
  const vault=fs.readFileSync("components/vault-v2/VaultV2.jsx","utf8");
  const importer=fs.readFileSync("components/ImportMediaWorkspace.jsx","utf8");
  const gallery=fs.readFileSync("components/ImportGallerySection.jsx","utf8");
  const extension=JSON.parse(fs.readFileSync("extensions/vault-media-capture/manifest.json","utf8"));
  const popup=fs.readFileSync("extensions/vault-media-capture/popup.html","utf8");
  assert.match(vault,/\/import/);
  assert.doesNotMatch(vault,/Venice AI|Perchance AI|route==="venice"/);
  assert.match(importer,/Save URL to Vault/);
  assert.match(importer,/uploadVaultMedia/);
  assert.match(importer,/ImportGallerySection/);
  assert.match(gallery,/GalleryImporter/);
  assert.match(gallery,/ImageDetailPanel/);
  assert.match(gallery,/onCreateFolder/);
  assert.match(popup,/Smart Image Capture/);
  assert.ok(!extension.permissions.includes("sidePanel"));
  assert.match(fs.readFileSync("app/studios/perchance/page.jsx","utf8"),/redirect\("\/import"\)/);
  assert.match(fs.readFileSync("app/studios/venice/page.jsx","utf8"),/redirect\("\/import"\)/);
});
