import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {parseInAppUrlBatch,galleryPageLinkItem} from "../lib/in-app-url-batch.mjs";

const url1="https://gallery.example/album/portrait-session";
const url2="https://gallery.example/album/wedding-day";
test("pasted newline URLs from original Google Sheet become distinct saved gallery links",()=>{
 const result=parseInAppUrlBatch(url1+"\n"+url2+"\n"+url1,{folder:"Favorites"});
 assert.equal(result.items.length,2);
 assert.equal(result.duplicates,1);
 assert.deepEqual(result.items.map(x=>x.type),["link","link"]);
 assert.ok(result.items.every(x=>x.folder==="Favorites"));
 assert.ok(result.items[0].title.toLowerCase().includes("portrait session"));
});
test("multi-column Google Sheets TSV preserves titles, collections, original gallery URLs and thumbnails",()=>{
 const text=[
  "URL\tTitle\tCollection\tThumbnail",
  url1+"\tPortrait Session\tPortraits\thttps://cdn.example/covers/portrait.jpg",
  url2+"\tWedding Day\tWeddings\thttps://cdn.example/covers/wedding.jpg",
 ].join("\n");
 const result=parseInAppUrlBatch(text);
 assert.equal(result.items.length,2);
 assert.equal(result.items[0].title,"Portrait Session");
 assert.equal(result.items[0].folder,"Portraits");
 assert.equal(result.items[1].folder,"Weddings");
 assert.equal(result.items[0].thumbnail,"https://cdn.example/covers/portrait.jpg");
});
test("quoted CSV, explicit type, invalid private hosts and a malformed percent-encoding don't break batch",()=>{
 const csv=[
  "URL,Title,Type,Folder",
  '"https://gallery.example/gallery/a","A, B Gallery",link,"Main"',
  '"https://gallery.example/%not-valid","Odd",link,"Main"',
  "http://127.0.0.1/private,Local,link,Main",
 ].join("\n");
 const result=parseInAppUrlBatch(csv);
 assert.equal(result.items.length,2);
 assert.equal(result.items[0].title,"A, B Gallery");
 assert.equal(result.invalid,1);
});
test("gallery pages are saved as links even when image relay returns 403",()=>{
 const item=galleryPageLinkItem({
  url:url1,title:"Portrait Session",thumbnail:"https://cdn.example/cover.webp",kind:"gallery",sourcePage:"https://gallery.example/category/portraits"
 },{folder:"Research",keyOf:x=>"k"+x.length});
 assert.equal(item.type,"link");
 assert.equal(item.url,url1);
 assert.equal(item.folder,"Research");
 assert.equal(item.title,"Portrait Session");
 assert.ok(item.tags.includes("gallery-link"));
 assert.equal(item.thumbnail,"https://cdn.example/cover.webp");
 assert.equal(galleryPageLinkItem({url:"file:///secret"}, {keyOf:()=>1}),null);
});
test("in-app Import Media exposes Sheet URL, clipboard/CSV lists, without gallery scanning",()=>{
 const workspace=fs.readFileSync("components/ImportMediaWorkspace.jsx","utf8");
 const comp=fs.readFileSync("components/GalleryUrlBatchImport.jsx","utf8");
 assert.match(workspace,/<GalleryUrlBatchImport folder=\{folder\}/);
 assert.match(comp,/Load Sheet URL list/);
 assert.match(comp,/\/api\/sheet-import/);
 assert.match(comp,/parseInAppUrlBatch/);
 assert.match(comp,/Choose CSV \/ TSV/);
 assert.match(comp,/Save selected gallery links/);
 assert.match(comp,/await onSave\(media\)/);
 assert.doesNotMatch(comp,/\/api\/media-discovery/);
});
test("accessible category results expose gallery URLs to save, denied gallery offers Save Link",()=>{
 const gallery=fs.readFileSync("components/ImportGallerySection.jsx","utf8");
 const saver=fs.readFileSync("components/GalleryPageLinkSaver.jsx","utf8");
 assert.match(gallery,/allPages.length>0&&<GalleryPageLinkSaver/);
 assert.match(gallery,/Save this gallery URL to Vault/);
 assert.match(saver,/Gallery URL list/);
 assert.match(saver,/Save /);
 assert.match(saver,/galleryPageLinkItem\(page/);
 assert.match(saver,/type="checkbox"/);
 assert.match(saver,/target="_blank"/);
});
test("clean link cards keep stored cover previews and Original source navigation",()=>{
 const card=fs.readFileSync("components/vault-v2/MediaCard.jsx","utf8");
 const detail=fs.readFileSync("components/vault-v2/DetailDrawer.jsx","utf8");
 assert.match(card,/item\.display_thumbnail, item\.thumbnail/);
 assert.match(card,/isLink \? \[\] : getThumbCandidates/);
 assert.match(detail,/Open original source/);
 assert.match(detail,/target="_blank"/);
 assert.match(detail,/rel="noopener noreferrer"/);
});
