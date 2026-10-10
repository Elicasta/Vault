import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { discoverMedia } from "../lib/server/media-discovery.mjs";

test("Import Media stays URL-first but still supports gallery import and actual uploads",()=>{
 const importer=fs.readFileSync("components/ImportMediaWorkspace.jsx","utf8");
 const nav=fs.readFileSync("components/vault-v2/VaultV2.jsx","utf8");
 assert.match(importer,/1\. Save URL to Vault/);
 assert.match(importer,/2\. Import an image gallery|ImportGallerySection/);
 assert.match(importer,/3\. Upload a permanent copy/);
 assert.match(importer,/4\. Back up imported files/);
 assert.match(importer,/buildGeneratorUrlItem/);
 assert.match(importer,/uploadVaultMedia/);
 assert.match(importer,/SourceInspector/);
 assert.match(nav,/\"import\", \"\/import\", \"download\", \"Import Media\"/);
 assert.doesNotMatch(nav,/\"venice\"|\"perchance\"|GeneratorWorkspace/);
 assert.ok(fs.existsSync("app/import/page.jsx"));
});

test("Gallery import uses detected original and linked photo pages with chosen collection",()=>{
 const s=fs.readFileSync("components/ImportGallerySection.jsx","utf8");
 const bulk=fs.readFileSync("components/GalleryImporter.jsx","utf8");
 assert.match(s,/\/api\/media-discovery\?url=/);
 assert.match(s,/<GalleryImporter/);
 assert.match(s,/<ImageDetailPanel/);
 assert.match(s,/onFolderChange=\{onFolderChange\}/);
 assert.match(s,/existingUrls=\{savedUrls\}/);
 assert.match(bulk,/nextPageUrl/);
 assert.match(bulk,/pageIndex < 6/);
 assert.match(bulk,/slice\(0, 160\)/);
 assert.match(bulk,/onCreateFolder\(name\)/);
 assert.match(bulk,/postLookup\(batch\)/);
 assert.match(bulk,/await onSave\(buildVaultMediaItem\(media, folder,/);
});

test("media source discovery continues distinguishing gallery page from original media URLs",()=>{
 const gallery=discoverMedia([
  "<title>Summer Photos</title>",
  '<a href="/photos/one"><img alt="Image 1" src="/covers/one.webp"></a>',
  '<a href="/photos/two"><img alt="Image 2" src="/covers/two.webp"></a>',
  '<a href="/photos/three"><img alt="Image 3" src="/covers/three.webp"></a>',
  '<link rel="next" href="/gallery?page=2">',
 ].join(""),"https://gallery.example/gallery?page=1");
 assert.equal(gallery.imagePages.length,3);
 assert.equal(gallery.galleryDetected,true);
 assert.equal(gallery.nextPageUrl,"https://gallery.example/gallery?page=2");
 assert.equal(gallery.media.filter(x=>x.type==="video").length,0);
});
test("removing provider-specific studio screens does not delete user collections or media",()=>{
 const oldA=fs.readFileSync("app/studios/venice/page.jsx","utf8");
 const oldB=fs.readFileSync("app/studios/perchance/page.jsx","utf8");
 const nav=fs.readFileSync("components/vault-v2/VaultV2.jsx","utf8");
 const manifest=JSON.parse(fs.readFileSync("extensions/vault-media-capture/manifest.json","utf8"));
 const popup=fs.readFileSync("extensions/vault-media-capture/popup.html","utf8");
 assert.match(oldA,/redirect\("\/import"\)/);
 assert.match(oldB,/redirect\("\/import"\)/);
 assert.match(nav,/getVaultItems/);
 assert.match(nav,/createCollection/);
 assert.match(nav,/GoogleDriveBackup/);
 assert.match(popup,/Smart Image Capture/);
 assert.ok(manifest.permissions.includes("downloads"));
 assert.ok(!manifest.permissions.includes("sidePanel"));
 assert.ok(!fs.existsSync("components/StudioLiveBrowser.jsx"));
});
