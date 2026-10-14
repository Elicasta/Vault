import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=path=>fs.readFileSync(path,"utf8");

test("Vault no longer navigates to web search, adult discovery, or the separate import page",()=>{
 const v=read("components/vault-v2/VaultV2.jsx");
 assert.doesNotMatch(v,/\/search|\/nsfw|\/import/);
 assert.doesNotMatch(v,/InAppBrowser|ImportMediaWorkspace/);
 assert.equal(fs.existsSync("app/api/browser-search/route.js"),false);
 for(const route of ["search","nsfw","import"])assert.match(read("app/"+route+"/page.jsx"),/redirect\("\/library"\)/);
});

test("plus Add Media replaces the old import with a cover-first URL workflow",()=>{
 const v=read("components/vault-v2/VaultV2.jsx");
 const form=read("components/vault-v2/AddMediaSheet.jsx");
 assert.match(v,/<AddMediaSheet/);
 assert.match(v,/Add Media<\/button>/);
 assert.match(form,/Media URL/);
 assert.match(form,/Cover URL/);
 assert.match(form,/Automatic/);
 assert.match(form,/Cover image URL/);
 assert.match(form,/getThumbCandidates\(target\)/);
});

test("new titles have name, tag, description and collection fields",()=>{
 const form=read("components/vault-v2/AddMediaSheet.jsx");
 for(const label of ["Name","Tags","Description","Collection"])assert.ok(form.includes(label));
 assert.match(form,/title:name\.trim\(\),note:description\.trim\(\),tags:tagList\(tags\)/);
 assert.match(form,/folder:destination \|\| null/);
});

test("new cover URL is verified by preview before persistence",()=>{
 const form=read("components/vault-v2/AddMediaSheet.jsx");
 assert.match(form,/coverReady && !coverFailed/);
 assert.match(form,/onLoad=\{\(\)=>setCoverReady\(true\)\}/);
 assert.match(form,/onError=/);
 assert.match(form,/setError\(e\?\.message/);
});

test("existing Chrome browser capture is still versioned but no longer in main Vault UI",()=>{
 const popup=read("extensions/vault-media-capture/popup.js");
 const modern=read("components/vault-v2/VaultV2.jsx");
 assert.match(popup,/vault-media-capture-v1/);
 assert.doesNotMatch(modern,/ImportMediaWorkspace|InAppBrowser/);
});
