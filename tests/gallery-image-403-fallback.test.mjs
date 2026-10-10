import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {isDirectImageUrl,isDirectMediaUrl,shouldRememberSiteDenied,isSourceImageDenied} from "../lib/media-access-fallback.mjs";

test("direct gallery image URLs are recognized but gallery pages are not",()=>{
 assert.equal(isDirectImageUrl("https://gallery.example/photos/one.webp?size=original"),true);
 assert.equal(isDirectImageUrl("https://cdn.example/media/original.jpg"),true);
 assert.equal(isDirectImageUrl("https://cdn.example/image?id=x&mime=image%2Fjpeg"),true);
 assert.equal(isDirectImageUrl("https://gallery.example/photo/one"),false);
 assert.equal(isDirectImageUrl("file:///private/image.jpg"),false);
 assert.equal(isDirectImageUrl("https://u:p@example.com/image.jpg"),false);
 assert.equal(isDirectMediaUrl("https://cdn.example/video/scene.mp4"),true);
 assert.equal(isDirectMediaUrl("https://gallery.example/category/portraits"),false);
});
test("403 on original file does not block browsing any other gallery pages on that hostname",()=>{
 assert.equal(shouldRememberSiteDenied("https://gallery.example/images/photo.webp"),false);
 assert.equal(shouldRememberSiteDenied("https://gallery.example/gallery/portraits"),true);
 assert.equal(isSourceImageDenied({status:403},{code:"SITE_ACCESS_DENIED"},"https://cdn.example/a.jpg"),true);
 assert.equal(isSourceImageDenied({status:403},{code:"SITE_ACCESS_DENIED"},"https://gallery.example/gallery/portraits"),false);
 assert.equal(isSourceImageDenied({status:401},{code:"AUTH_REQUIRED"},"https://cdn.example/a.jpg"),false);
});
test("server image relay returns upstream 403 with source-denial code rather than an opaque 500",()=>{
 const s=fs.readFileSync("app/api/media/route.js","utf8");
 assert.match(s,/SOURCE_MEDIA_ACCESS_DENIED/);
 assert.match(s,/upstreamStatus/);
 assert.match(s,/status:403/);
 assert.match(s,/await res\.body\?\.cancel\(\)/);
 assert.match(s,/validatePublicUrl/);
 assert.match(s,/guardProxyRequest\(request, "media"\)/);
 assert.match(s,/fetchWithRegionFallback/);
});
test("source image viewer tries server proxy then normal browser and shows a real fallback",()=>{
 const s=fs.readFileSync("components/ResilientImage.jsx","utf8");
 const panel=fs.readFileSync("components/ImageAccessPanel.jsx","utf8");
 assert.match(s,/mode==="proxy".*\/api\/media\?url=/);
 assert.match(s,/old==="proxy"\?"direct":"unavailable"/);
 assert.match(s,/referrerPolicy="no-referrer"/);
 assert.match(panel,/Open original photo page/);
 assert.match(panel,/Copy image URL/);
 assert.match(panel,/coverOnly/);
 assert.match(panel,/Import Media/);
 assert.match(panel,/permitted download or save option/);
});
test("403 at actual image preserves category-gallery-photo trail and still allows back",()=>{
 const section=fs.readFileSync("components/ImportGallerySection.jsx","utf8");
 const browser=fs.readFileSync("components/MediaDiscoveryPanel.jsx","utf8");
 const importer=fs.readFileSync("components/GalleryImporter.jsx","utf8");
 assert.match(section,/const back=\(\)=>/);
 assert.match(section,/const forward=\(\)=>/);
 assert.match(section,/aria-label="Page path"/);
 assert.match(section,/shouldRememberSiteDenied\(url\)/);
 assert.match(section,/blockedImage\|\|level==="image"/);
 assert.match(section,/coverOnly=\{coverOnly\}/);
 assert.match(section,/<ResilientImage/);
 assert.match(browser,/shouldRememberSiteDenied\(url\)/);
 assert.match(browser,/<ImageAccessPanel/);
 assert.match(browser,/focusedVideo\?\.type==="image"/);
 assert.match(importer,/<ResilientImage/);
 assert.match(importer,/Open original photo page/);
 assert.match(section,/<GalleryImporter/);
 assert.match(browser,/Browse categories and galleries/);
});
