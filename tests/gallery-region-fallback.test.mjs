import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { discoverMedia } from "../lib/server/media-discovery.mjs";
import { chooseBestImage } from "../lib/server/image-resolution.mjs";
import { checkRegionalSignature, makeRegionalSignature, rotatedRegionalNodes, REGIONAL_NODES, shouldRetryDifferentRegion } from "../lib/server/region-fallback.js";

test("photo gallery distinguishes original image URL from cover and detects next pages", () => {
  const gallery=discoverMedia([
    "<title>Photo Album</title>",
    '<a href="/photos/item-one"><img alt="Photo one" src="/covers/one.webp"></a>',
    '<a href="/photos/item-two"><img alt="Photo two" src="/covers/two.webp"></a>',
    '<a href="/media/original-full.jpg"><img alt="Original photo three" src="/covers/three.webp"></a>',
    '<a href="/login"><img alt="Login" src="/covers/notphoto.jpg"></a>',
    '<link rel="next" href="/gallery?page=2"/>',
  ].join(""),"https://photos.example/gallery?page=1");
  assert.equal(gallery.imagePages.length,2);
  assert.equal(gallery.galleryDetected,true);
  assert.equal(gallery.nextPageUrl,"https://photos.example/gallery?page=2");
  assert.ok(gallery.media.some(x=>x.type==="image"&&x.url==="https://photos.example/media/original-full.jpg"&&x.thumbnail==="https://photos.example/covers/three.webp"));
  assert.ok(!gallery.imagePages.some(x=>/login/.test(x.url)));
});

test("full-resolution images outrank first preview thumbnail", () => {
 const selected=chooseBestImage([
    {type:"image",url:"https://cdn.example/thumb-120.jpg",sourceKind:"image-element"},
    {type:"image",url:"https://cdn.example/original-full.jpg",sourceKind:"gallery-full-image"},
    {type:"image",url:"https://cdn.example/logo.png",sourceKind:"image-element"},
  ], {pageUrl:"https://photos.example/photos/id123",coverUrl:"https://cdn.example/thumb-120.jpg",title:"My picture"});
 assert.equal(selected.url,"https://cdn.example/original-full.jpg");
 assert.equal(selected.thumbnail,"https://cdn.example/thumb-120.jpg");
 assert.equal(selected.sourcePage,"https://photos.example/photos/id123");
});

test("regional proxy request signature is time limited and tamper resistant", () => {
 const secret="a".repeat(48),timestamp=String(Date.now()),body=JSON.stringify({url:"https://example.org/image.jpg"});
 const sig=makeRegionalSignature(body,timestamp,secret);
 assert.equal(sig.length,64);
 assert.equal(checkRegionalSignature(body,timestamp,sig,secret),true);
 assert.equal(checkRegionalSignature(body.replace("image","internal"),timestamp,sig,secret),false);
 assert.equal(checkRegionalSignature(body,timestamp,sig,secret,Date.now()+120_000),false);
 assert.equal(checkRegionalSignature(body,timestamp,sig.replace("a","b"),secret),false);
});

test("automatic proxy retries use distinct region entries", () => {
 assert.deepEqual([...REGIONAL_NODES].sort(),["de","gb","us"]);
 const first=rotatedRegionalNodes("gallery-test.example");
 const second=rotatedRegionalNodes("gallery-test.example");
 assert.notEqual(first[0],second[0]);
 assert.equal(new Set(first).size,3);
 assert.equal(new Set(second).size,3);
 assert.equal(shouldRetryDifferentRegion(403),true);
 assert.equal(shouldRetryDifferentRegion(451),true);
 assert.equal(shouldRetryDifferentRegion(404),false);
});

test("regional endpoints refuse anonymous proxy use and use region-specific compute", () => {
 const relay=fs.readFileSync("lib/server/region-egress-handler.js","utf8");
 assert.match(relay,/checkRegionalSignature/);
 assert.match(relay,/validatePublicUrl/);
 assert.match(relay,/outboundFetch/);
 assert.match(relay,/method: "GET"/);
 assert.match(relay,/MAX_BYTES = 64 \* 1024 \* 1024/);
 for(const [region,code]of [["us","iad1"],["gb","lhr1"],["de","fra1"]]){
  const file=fs.readFileSync("app/api/egress/"+region+"/route.js","utf8");
  assert.match(file,new RegExp('preferredRegion = "'+code+'"'));
 }
});

test("Vault browser attempts public HTTP(S) hosts instead of banning known providers", () => {
 const source=fs.readFileSync("components/InAppBrowser.jsx","utf8");
 assert.doesNotMatch(source,/function shouldSkipIframe/);
 assert.match(source,/setFrameBlocked\(false\)/);
 assert.match(source,/onExplorePage=\{exploreAnyPage\}/);
 assert.match(source,/frameBlocked \?/);
 const gallery=fs.readFileSync("components/GalleryImporter.jsx","utf8");
 assert.match(gallery,/Import image gallery/);
 assert.match(gallery,/Save entire gallery/);
 assert.match(gallery,/postLookup/);
 assert.match(gallery,/New folder name/);
 assert.match(gallery,/gallery page/);
 const panel=fs.readFileSync("components/MediaDiscoveryPanel.jsx","utf8");
 assert.match(panel,/Explore image pages/);
 assert.match(panel,/ImageDetailPanel/);
});

test("media, image and video discovery use regional failover", () => {
 for(const path of ["app/api/media-discovery/route.js","app/api/image-sources/route.js","app/api/video-sources/route.js","app/api/stream/route.js","app/api/media/route.js"]){
  const source=fs.readFileSync(path,"utf8");
  assert.match(source,/fetchWithRegionFallback/);
  assert.match(source,/guardProxyRequest|resolveOne/);
 }
});
