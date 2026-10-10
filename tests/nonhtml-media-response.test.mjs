import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  normalizedMime, classifyKnownMime, sniffMediaSignature, sniffHtmlPrefix, inspectAmbiguousBody,
} from "../lib/server/media-response-classifier.mjs";
import { isUnsupportedDiscoveryResponse, isWebsiteAccessDenial, siteNeedsBrowser } from "../lib/browser-first-fallback.mjs";

const encoder=new TextEncoder();
test("valid preview HTML and common MIME types are classified without false negatives",()=>{
  assert.equal(normalizedMime(" TEXT/HTML; charset=UTF-8"),"text/html");
  assert.equal(classifyKnownMime("text/html; charset=UTF-8"),"html");
  assert.equal(classifyKnownMime("application/xhtml+xml"),"html");
  assert.equal(classifyKnownMime("image/webp"),"image");
  assert.equal(classifyKnownMime("video/mp4"),"video");
  assert.equal(classifyKnownMime("application/vnd.apple.mpegurl"),"video");
  assert.equal(classifyKnownMime("application/json"),"unknown");
});
test("mislabeled page with real HTML is processed, and JSON or plain text is not",async()=>{
  const html="<!doctype html><html><head><title>Test Gallery</title></head><body><img src='/photo.jpg'></body></html>";
  assert.equal(sniffHtmlPrefix(encoder.encode(html)),true);
  assert.equal(sniffHtmlPrefix(encoder.encode('{"error":"forbidden"}')),false);
  const payload=await inspectAmbiguousBody(new Response(html,{headers:{"content-type":"application/octet-stream"}}));
  assert.equal(payload.kind,"html");
  assert.equal(payload.html,html);
  const json=await inspectAmbiguousBody(new Response('{"error":"blocked"}',{headers:{"content-type":"application/json"}}));
  assert.equal(json.kind,"unsupported");
});
test("public image bytes are recognized even if server calls them octet-stream",async()=>{
  const png=new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2,3]);
  const bytes=await inspectAmbiguousBody(new Response(png,{headers:{"content-type":"application/octet-stream"}}));
  assert.equal(bytes.kind,"image");
  assert.equal(sniffMediaSignature(new Uint8Array([0xff,0xd8,0xff,0xe0])),"image");
  assert.equal(sniffMediaSignature(encoder.encode("GIF89a hello")),"image");
  const webp=new Uint8Array([...encoder.encode("RIFF"),1,0,0,0,...encoder.encode("WEBP"),1,2,3]);
  assert.equal(sniffMediaSignature(webp),"image");
  const mp4=new Uint8Array([0,0,0,24,...encoder.encode("ftypisom"),0,0,0,0]);
  assert.equal(sniffMediaSignature(mp4),"video");
  assert.equal(sniffMediaSignature(encoder.encode("garbage text")),"");
});
test("reject oversized unknown HTML, and do not treat media URL as HTML merely by extension",async()=>{
  const payload=await inspectAmbiguousBody(new Response("<html>"+ "x".repeat(3000)+"</html>"),256);
  assert.equal(payload.kind,"unsupported");
  assert.equal(payload.reason,"too-large");
  const json=await inspectAmbiguousBody(new Response('{"url":"https://site.test/a.mp4"}'));
  assert.equal(json.kind,"unsupported");
});
test("415 media scanner fallback does not poison the whole site and keeps existing 403 boundary",()=>{
  assert.equal(isUnsupportedDiscoveryResponse({status:415},{code:"SITE_NON_HTML"}),true);
  assert.equal(isUnsupportedDiscoveryResponse({status:415},{code:"AUTH_REQUIRED"}),false);
  assert.equal(isWebsiteAccessDenial({status:415},{code:"SITE_NON_HTML"}),false);
  const mem={getItem:()=>null};
  assert.equal(siteNeedsBrowser("https://gallery.example/another-page",mem),false);
  const scanner=fs.readFileSync("app/api/media-discovery/route.js","utf8");
  const collector=fs.readFileSync("components/MediaDiscoveryPanel.jsx","utf8");
  const gallery=fs.readFileSync("components/ImportGallerySection.jsx","utf8");
  assert.match(scanner,/inspectAmbiguousBody\(response, MAX_HTML_BYTES\)/);
  assert.match(scanner,/code: "SITE_NON_HTML"/);
  assert.match(scanner,/guardProxyRequest\(request, "discovery"\)/);
  assert.match(scanner,/validatePublicUrl\(rawUrl\)/);
  assert.match(collector,/isUnsupportedDiscoveryResponse/);
  assert.match(gallery,/isUnsupportedDiscoveryResponse/);
  assert.match(collector,/<CapturedMediaImport/);
  assert.match(gallery,/GalleryImporter/);
  assert.match(gallery,/ImageDetailPanel/);
});
