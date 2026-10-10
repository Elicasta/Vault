import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { discoverLinkedGalleryPages, classifyLinkedPage, galleryPageLevel, shouldOfferGalleryBulkImport } from "../lib/server/gallery-navigation.mjs";
const base="https://pictures.example/";

test("first page gives navigation into categories, not an immediate fake gallery import",()=>{
 const html=[
 '<a class="category-card" href="/category/portraits"><img src="/covers/portrait.webp" alt="Portraits"/></a>',
 '<a href="/category/weddings"><img src="/covers/wedding.webp" alt="Weddings"/></a>',
 '<a href="javascript:alert(1)"><img src="/covers/fake.webp" alt="Fake"/></a>',
 '<a href="https://other.example/category/private"><img src="/covers/offsite.webp" alt="Offsite"/></a>',
 ].join("");
 const pages=discoverLinkedGalleryPages(html,base);
 assert.deepEqual(pages.map(x=>x.url),[
  "https://pictures.example/category/portraits",
  "https://pictures.example/category/weddings",
 ]);
 assert.ok(pages.every(x=>x.kind==="category"));
 const data={pageUrl:base,browsePages:pages,media:[{type:"image",sourceKind:"social-image"}],imagePages:pages,galleryDetected:true};
 assert.equal(galleryPageLevel(data),"categories");
 assert.equal(shouldOfferGalleryBulkImport(data),false);
});
test("second page offers individual galleries, but does not save album cards as original photos",()=>{
 const html=[
 '<a href="/gallery/portrait-collection"><img src="/covers/set1.webp" alt="Portrait collection"></a>',
 '<a href="/gallery/ceremony-story"><img src="/covers/set2.webp" alt="Ceremony story"></a>',
 '<a href="/gallery/second-set"><img src="/covers/set3.webp" alt="Second set"></a>',
 ].join("");
 const pages=discoverLinkedGalleryPages(html,base+"category/portraits");
 assert.equal(pages.length,3);
 assert.ok(pages.every(x=>x.kind==="gallery"));
 const data={pageUrl:base+"category/portraits",browsePages:pages,media:[],imagePages:pages,galleryDetected:true};
 assert.equal(galleryPageLevel(data),"gallery-list");
 assert.equal(shouldOfferGalleryBulkImport(data),false);
});
test("third page contains actual media and linked detail pages; bulk import becomes available",()=>{
 const p=base+"gallery/portrait-collection";
 const links=discoverLinkedGalleryPages([
 '<a href="/photos/one"><img src="/thumbs/one.webp" alt="Photo one"></a>',
 '<a href="/photos/two"><img src="/thumbs/two.webp" alt="Photo two"></a>',
 '<a href="/photo-file/full-one.jpg"><img src="/thumbs/full-one.webp" alt="Original"></a>',
 ].join(""),p);
 assert.equal(links.length,2);
 assert.ok(links.every(x=>x.kind==="photo-page"));
 const media=[
  {url:base+"images/original-1.jpg",type:"image",sourceKind:"gallery-full-image"},
  {url:base+"images/original-2.webp",type:"image",sourceKind:"image-element"},
  {url:base+"images/original-3.png",type:"image",sourceKind:"structured-image"},
 ];
 const data={pageUrl:p,browsePages:links,media,imagePages:links,galleryDetected:true};
 assert.equal(galleryPageLevel(data),"gallery");
 assert.equal(shouldOfferGalleryBulkImport(data),true);
});
test("dedupes links, caps navigation cards, never labels media files as pages",()=>{
 const html=Array.from({length:100},(_,i)=>
  '<a href="/gallery/set-'+i+'"><img src="/thumb/'+i+'.webp" alt="Set '+i+'"/></a>'
 ).join("")+'<a href="/gallery/set-1"><img src="/thumb/duplicate.jpg"></a>'+
 '<a href="/images/original.png"><img src="/thumb/one.webp"></a>';
 const pages=discoverLinkedGalleryPages(html,base,{limit:80});
 assert.equal(pages.length,80);
 assert.equal(pages[1].url,base+"gallery/set-1");
 assert.ok(!pages.some(x=>x.url.endsWith(".png")));
 assert.equal(classifyLinkedPage(base+"category/foo"),"category");
 assert.equal(classifyLinkedPage(base+"gallery/story"),"gallery");
 assert.equal(classifyLinkedPage(base+"photos/one"),"photo-page");
});
test("import and browser have Back/Forward and clickable breadcrumbs; gallery import not on categories",()=>{
 const section=fs.readFileSync("components/ImportGallerySection.jsx","utf8");
 const inApp=fs.readFileSync("components/InAppBrowser.jsx","utf8");
 const collector=fs.readFileSync("components/MediaDiscoveryPanel.jsx","utf8");
 const api=fs.readFileSync("app/api/media-discovery/route.js","utf8");
 assert.match(section,/aria-label="Gallery page navigation"/);
 assert.match(section,/aria-label="Page path"/);
 assert.match(section,/const back=\(\)=>/);
 assert.match(section,/const forward=\(\)=>/);
 assert.match(section,/const breadcrumbTo=index=>/);
 assert.match(section,/onClick=\{\(\)=>openPage\(page\)\}/);
 assert.match(section,/galleryReady&&<>/);
 assert.match(section,/level==="categories"/);
 assert.match(section,/These are photos · review gallery import/);
 assert.match(inApp,/const forwardVideoPage = \(\) =>/);
 assert.match(inApp,/const jumpToPage = index =>/);
 assert.match(inApp,/aria-label="Gallery page path"/);
 assert.match(collector,/Browse categories and galleries/);
 assert.match(collector,/onExplorePage\?\.\(page\)/);
 assert.match(collector,/result\?\.pageLevel === "gallery" && <GalleryImporter/);
 assert.match(api,/discoverLinkedGalleryPages\(html, finalUrl\)/);
 assert.match(api,/pageLevel === "gallery" && result.galleryDetected/);
});
