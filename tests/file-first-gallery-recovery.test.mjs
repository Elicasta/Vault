import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("file-first local recovery is offered without needing another HTTP request to the blocked gallery",()=>{
 const panel=fs.readFileSync("components/LocalGalleryRecovery.jsx","utf8");
 assert.match(panel,/function LocalGalleryRecovery/);
 assert.match(panel,/type="file"/);
 assert.match(panel,/multiple/);
 assert.match(panel,/Choose saved images/);
 assert.match(panel,/Paste copied image/);
 assert.match(panel,/onImportFiles\(files\)/);
 assert.match(panel,/navigator\.clipboard\.read\(\)/);
 assert.match(panel,/file.type|entry\.types\.find/);
 assert.match(panel,/role="status"/);
 assert.match(panel,/Save to Photos/);
 assert.doesNotMatch(panel,/fetch\(|api\/media|media-discovery/);
});
test("on blocked galleries import buttons are inline with back/forward and preserve collection",()=>{
 const gallery=fs.readFileSync("components/ImportGallerySection.jsx","utf8");
 assert.match(gallery,/status==="browser"&&<div className="vv-gallery-browser-recovery">/);
 assert.match(gallery,/<LocalGalleryRecovery compact sourceUrl=\{target\}/);
 assert.match(gallery,/onImportFiles=\{onImportFiles\}/);
 assert.match(gallery,/uploading=\{uploading\}/);
 assert.match(gallery,/const back=\(\)=>/);
 assert.match(gallery,/const forward=\(\)=>/);
 assert.match(gallery,/pageNeedsBrowser/);
});
test("original-file imports use private authenticated Supabase storage and the chosen collection, not a remote proxy",()=>{
 const workspace=fs.readFileSync("components/ImportMediaWorkspace.jsx","utf8");
 const client=fs.readFileSync("lib/supabase.js","utf8");
 assert.match(workspace,/<LocalGalleryRecovery sourceUrl=\{sourceUrl\} uploading=\{uploading\} onImportFiles=\{importFiles\}/);
 assert.match(workspace,/onImportFiles=\{importFiles\} uploading=\{uploading\}/);
 assert.match(workspace,/const importFiles=useCallback\(async incoming=>/);
 assert.match(workspace,/uploadVaultMedia\(userId,file\)/);
 assert.match(workspace,/folder:folder\|\|null/);
 assert.match(workspace,/slice\(0,50\)/);
 assert.match(client,/export async function uploadVaultMedia/);
 assert.match(client,/await requireStorageOwner\(userId\)/);
 assert.match(client,/storage\.from\(VAULT_MEDIA_BUCKET\)\.upload/);
});
test("browser discovery links directly to file recovery for an inaccessible gallery",()=>{
 const browser=fs.readFileSync("components/MediaDiscoveryPanel.jsx","utf8");
 assert.match(browser,/Open file-first import/);
 assert.match(browser,/encodeURIComponent\(pageUrl\)/);
 assert.match(browser,/status === "browser"/);
});
