import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = path => fs.readFileSync(path,"utf8");

test("retired browser search is absent from Vault navigation and runtime",()=>{
 const view=read("components/vault-v2/VaultV2.jsx");
 assert.doesNotMatch(view,/InAppBrowser|setBrowserOpen|browserOpen/);
 assert.doesNotMatch(view,/\/search|\/nsfw|\/import/);
 assert.equal(fs.existsSync("app/api/browser-search/route.js"),false);
});

test("former search, adult, and import routes lead back to the library",()=>{
 for(const path of ["app/search/page.jsx","app/nsfw/page.jsx","app/import/page.jsx"]){
  assert.match(read(path),/redirect\("\/library"\)/);
 }
});

test("plus form accepts URL, cover, name, tags, description, and collection",()=>{
 const sheet=read("components/vault-v2/AddMediaSheet.jsx");
 assert.match(sheet,/Media URL/);
 assert.match(sheet,/Cover image URL/);
 assert.match(sheet,/Automatic/);
 assert.match(sheet,/Name/);
 assert.match(sheet,/Tags/);
 assert.match(sheet,/Description/);
 assert.match(sheet,/Collection/);
 assert.match(sheet,/getThumbCandidates/);
 assert.match(sheet,/\/api\/metadata\?url=/);
});

test("a cover must load before the Add Media form can save",()=>{
 const sheet=read("components/vault-v2/AddMediaSheet.jsx");
 const db=read("lib/supabase.js");
 assert.match(sheet,/coverReady && !coverFailed/);
 assert.match(sheet,/onLoad=\{\(\)=>setCoverReady\(true\)\}/);
 assert.match(sheet,/onError=/);
 assert.match(db,/A cover is required before this item can be saved to Vault/);
});

test("adult tags do not create a separate media room",()=>{
 const view=read("components/vault-v2/VaultV2.jsx");
 assert.doesNotMatch(view,/nsfwAccess|nsfwItems|isNsfwTagged|initialMode=/);
 assert.match(view,/displayItems\.filter/);
});
