import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { collectSiteSourceCandidates, publicSourceKind, sourceIsFileUrl, sourceRank } from "../lib/server/source-inspector.mjs";

test("source inspection identifies original image links separately from gallery covers",()=>{
 const html=[
  '<meta property="og:image" content="https://cdn.example/poster-preview.jpg">',
  '<img src="/thumb-180.jpg" data-original="/media/large-original.png" srcset="/thumb-180.jpg 180w, /media/final-1200.webp 1200w">',
  '<a href="/download/final-image.webp" download>Download original</a>',
  '<a href="/posts/123"><img src="/thumb2.jpg"></a>',
 ].join("");
 const found=collectSiteSourceCandidates(html,"https://photos.example/posts/123",{pageTitle:"Photo story",media:[]});
 assert.ok(found.some(x=>x.url==="https://photos.example/media/large-original.png" && x.type==="image"&&x.sourceKind==="original-image"));
 assert.ok(found.some(x=>x.url==="https://photos.example/media/final-1200.webp" && x.sourceKind==="image-srcset"));
 assert.ok(found.some(x=>x.url==="https://photos.example/download/final-image.webp"&&x.sourceKind==="download-link"));
 assert.ok(!found.some(x=>x.url==="https://photos.example/posts/123"&&x.type==="image"));
});
test("source inspector handles extensionless social media only as unverified candidates before HEAD",()=>{
 const found=collectSiteSourceCandidates(
 '<meta property="og:video" content="https://cdn.example/api/get-video?id=123"><meta property="og:image" content="https://cdn.example/api/get-image?id=456">',
 "https://site.example/video/123");
 assert.ok(found.some(x=>x.type==="video"&&x.url.includes("get-video")));
 assert.ok(found.some(x=>x.type==="image"&&x.url.includes("get-image")));
 assert.ok(found.every(x=>!x.verified));
});
test("source inspector refuses blob, data, JS and credential URL masquerading as source",()=>{
 const html=[
  '<img src="blob:https://perchance.org/abc">',
  '<img src="data:image/jpeg;base64,ABCD">',
  '<img src="javascript:alert(1)">',
  '<img src="https://person:password@cdn.example/photo.png">',
  '<video src="https://cdn.example/video.mp4" poster="/cover.jpg"></video>',
  '<img src="https://cdn.example/logo.png">',
 ].join("");
 const items=collectSiteSourceCandidates(html,"https://perchance.org/ai-text-to-image-generator");
 assert.deepEqual(items.map(x=>x.url),["https://cdn.example/video.mp4"]);
});
test("source verifier distinguishes actual response MIME from guessed URL extension",()=>{
 assert.equal(publicSourceKind("image/webp"),"image");
 assert.equal(publicSourceKind("image/svg+xml"),"");
 assert.equal(publicSourceKind("video/mp4"),"video");
 assert.equal(publicSourceKind("application/vnd.apple.mpegurl"),"video");
 assert.equal(publicSourceKind("text/html"),"");
 assert.equal(sourceIsFileUrl("https://x.example/post/1"),false);
 assert.equal(sourceIsFileUrl("https://x.example/video.webm?expires=1"),true);
 assert.ok(sourceRank({verified:true,sourceKind:"image-element"})>sourceRank({verified:false,sourceKind:"download-link"}));
});
test("server source lookup is guarded and bounded, and no guessed video post URLs are saved",()=>{
 const api=fs.readFileSync("app/api/source-inspector/route.js","utf8");
 const panel=fs.readFileSync("components/SourceInspector.jsx","utf8");
 const finder=fs.readFileSync("components/MediaDiscoveryPanel.jsx","utf8");
 assert.match(api,/guardProxyRequest\(request,"discovery"\)/);
 assert.match(api,/validatePublicUrl/);
 assert.match(api,/method:"HEAD"/);
 assert.match(api,/slice\(0,3\)/);
 assert.match(api,/item\.verified/);
 assert.match(api,/Cache-Control/);
 assert.match(panel,/Find the actual image or video link/);
 assert.match(panel,/Save verified file/);
 assert.match(panel,/navigator\.clipboard\.writeText/);
 assert.match(finder,/<SourceInspector/);
});
test("mobile AI studios never default to a giant blank iframe",()=>{
 const browser=fs.readFileSync("components/StudioLiveBrowser.jsx","utf8");
 assert.match(browser,/setTryEmbedded\(false\)/);
 assert.match(browser,/Try embedded website/);
 assert.match(browser,/Open \{name\} website/);
 assert.match(browser,/iPhone\|iPad/);
});
