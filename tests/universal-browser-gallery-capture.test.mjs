import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { captureBrowserGallery, browserGalleryBookmarklet } from "../lib/browser-gallery-capture.mjs";
import { parseCapturedMedia } from "../lib/media-capture-import.mjs";
import { pageNeedsBrowser, markPageBrowserFirst, clearPageBrowserFirst } from "../lib/browser-first-fallback.mjs";

function node(tag,attrs={},other={}) {
 return {
  tagName:tag.toUpperCase(),getAttribute:k=>attrs[k]||"",
  currentSrc:other.currentSrc||"",naturalWidth:other.naturalWidth||800,naturalHeight:other.naturalHeight||600,
  closest:k=>k==="a[href]"?other.anchor||null:null,
  parentElement:other.parentElement||null,
  alt:attrs.alt||"",title:attrs.title||"",
 };
}
function fakeDocument(images,extras=[]) {
 return {
  title:"Test image gallery",
  querySelectorAll(selector) {
   if(selector.startsWith("img,picture"))return [...images,...extras];
   if(selector.startsWith("[data-original]"))return [];
   return [];
  },
 };
}
const page="https://gallery.example/album/new";

test("Safari capture bookmarklet is self-contained and only runs on explicit user invocation",()=>{
 const code=browserGalleryBookmarklet();
 assert.ok(code.startsWith("javascript:(function captureBrowserGallery("));
 assert.match(code,/document/);
 assert.match(code,/navigator\.clipboard/);
 assert.doesNotMatch(code,/import\s+["'{]|fetch\(/);
 assert.doesNotMatch(code,/document\.cookie|localStorage|sessionStorage|XMLHttpRequest/);
 assert.ok(code.length<15000);
});

test("browser capture identifies actual linked original and visible fallback",()=>{
 const a=node("a",{href:"/originals/story-3840.jpg","data-full":"/full/story-4600.webp"});
 const img=node("img",{alt:"Story","src":"/thumbs/story-640.jpg"},{
  anchor:a,currentSrc:"https://gallery.example/thumbs/story-640.jpg",naturalWidth:640,naturalHeight:480,
 });
 const result=captureBrowserGallery({
  mode:"collect",documentRoot:fakeDocument([img]),pageLocation:{href:page}
 });
 assert.equal(result.format,"vault-media-capture-v1");
 assert.equal(result.sourcePage,page);
 assert.ok(result.items.some(x=>x.url==="https://gallery.example/full/story-4600.webp"&&x.sourceKind==="browser-original-candidate"));
 assert.ok(result.items.some(x=>x.url==="https://gallery.example/originals/story-3840.jpg"&&x.sourceKind==="browser-linked-full-image"));
 assert.ok(result.items.some(x=>x.url==="https://gallery.example/thumbs/story-640.jpg"));
 const reviewed=parseCapturedMedia(JSON.stringify(result),page);
 assert.ok(reviewed.some(x=>x.url.endsWith("/full/story-4600.webp")));
 assert.ok(reviewed.some(x=>x.url.endsWith("/originals/story-3840.jpg")));
 assert.ok(!reviewed.some(x=>x.url.endsWith("/thumbs/story-640.jpg")));
});

test("capture supports extensionless image URLs explicitly visible in browser, without claiming original",()=>{
 const img=node("img",{alt:"Portrait"},{
  currentSrc:"https://img.example/cdn/render?asset=portrait&quality=full",naturalWidth:1200,naturalHeight:1400
 });
 const capture=captureBrowserGallery({mode:"collect",documentRoot:fakeDocument([img]),pageLocation:{href:page}});
 const rows=parseCapturedMedia(JSON.stringify(capture),page);
 assert.equal(rows.length,1);
 assert.equal(rows[0].type,"image");
 assert.equal(rows[0].sourceKind,"browser-visible-image");
 assert.equal(rows[0].sourcePage,page);
 assert.ok(rows[0].url.includes("/cdn/render?asset=portrait"));
});

test("small icons, script URLs and images outside HTTP(S) do not become gallery images",()=>{
 const img=node("img",{alt:"Icon",src:"https://gallery.example/icon.png"},{
  currentSrc:"https://gallery.example/icon.png",naturalWidth:24,naturalHeight:24
 });
 const other=node("img",{alt:"Blob",src:"blob:https://gallery.example/test"},{
  currentSrc:"blob:https://gallery.example/test",naturalWidth:150,naturalHeight:150
 });
 const r=captureBrowserGallery({mode:"collect",documentRoot:fakeDocument([img,other]),pageLocation:{href:page}});
 assert.equal(r.items.length,0);
});

test("a denied gallery URL is cached only for that page, without storing sensitive path",()=>{
 const data=new Map();
 const store={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
 const blocked="https://gallery.example/album/private?id=secret-personal-value";
 const allowed="https://gallery.example/album/another";
 assert.equal(markPageBrowserFirst(blocked,store),true);
 assert.equal(pageNeedsBrowser(blocked,store),true);
 assert.equal(pageNeedsBrowser(allowed,store),false);
 assert.equal([...data.values()].join("").includes("secret-personal-value"),false);
 clearPageBrowserFirst(blocked,store);
 assert.equal(pageNeedsBrowser(blocked,store),false);
});

test("blocked gallery exposes capture right beside failed page; Chrome recognizes originals and multiple frames",()=>{
 const gallery=fs.readFileSync("components/ImportGallerySection.jsx","utf8");
 const media=fs.readFileSync("components/MediaDiscoveryPanel.jsx","utf8");
 const importUI=fs.readFileSync("components/CapturedMediaImport.jsx","utf8");
 const chrome=fs.readFileSync("extensions/vault-media-capture/popup.js","utf8");
 assert.match(gallery,/status==="browser".*?<CapturedMediaImport/s);
 assert.match(gallery,/pageUrl=\{target\}/);
 assert.match(media,/markPageBrowserFirst/);
 assert.match(media,/pageNeedsBrowser/);
 assert.match(importUI,/browserGalleryBookmarklet/);
 assert.match(importUI,/Safari on iPhone \/ iPad/);
 assert.match(importUI,/Copy Safari Capture Gallery bookmarklet/);
 assert.match(importUI,/paste|paste/);
 assert.match(chrome,/allFrames: true/);
 assert.match(chrome,/browser-original-candidate/);
 assert.match(chrome,/browser-linked-full-image/);
});
