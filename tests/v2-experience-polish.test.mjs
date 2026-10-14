import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=path=>fs.readFileSync(path,"utf8");

test("collection cards present visual covers and accessible destination labels",()=>{
 const v=read("components/vault-v2/VaultV2.jsx");
 const css=read("app/vault-v2.css");
 assert.match(v,/function CollectionCard/);
 assert.match(v,/v2-collection-covers/);
 assert.match(v,/Open collection/);
 assert.match(v,/const firstItem = items\[0\] \|\| null/);
 assert.match(v,/firstItem\?\.display_thumbnail \|\| firstItem\?\.thumbnail/);
 assert.match(v,/v2-collection-caption/);
 assert.doesNotMatch(v,/covers\.length \? covers\.map/);
 assert.match(css,/\.v2-collection-preview/);
});

test("adding from a collection preselects it automatically",()=>{
 const v=read("components/vault-v2/VaultV2.jsx");
 const add=read("components/vault-v2/AddMediaSheet.jsx");
 assert.match(v,/initialFolder=\{route === "collections" \? selectedCollection : ""\}/);
 assert.match(add,/initialItem\?\.folder \|\| initialFolder \|\| ""/);
});

test("empty media results can clear filters without launching web search",()=>{
 const v=read("components/vault-v2/VaultV2.jsx");
 assert.match(v,/activeFilterCount \? \{action:resetFilters,label:"Clear filters"\}/);
 assert.match(v,/onReset=\{resetFilters\}/);
 assert.doesNotMatch(v,/setBrowserOpen|InAppBrowser|\/search/);
});

test("media cards prefer stored cover and retry direct originals",()=>{
 const card=read("components/vault-v2/MediaCard.jsx");
 assert.match(card,/item\.display_thumbnail, item\.thumbnail/);
 assert.match(card,/proxied && proxied !== url \? \[proxied, url\] : \[url\]/);
 assert.match(card,/onError=\{\(\) => setIndex\(\(i\) => i \+ 1\)\}/);
});

test("detail does not expose freeform comments or note-taking panels",()=>{
 const d=read("components/vault-v2/DetailDrawer.jsx");
 assert.doesNotMatch(d,/Moment marks|Comments|Add mark/);
 assert.match(d,/item.note\?<p className="v2-clean-description">/);
 assert.match(d,/onMouseDown=\{close\}/);
});

test("dangerous changes are guarded and display errors",()=>{
 const v=read("components/vault-v2/VaultV2.jsx");
 const d=read("components/vault-v2/DetailDrawer.jsx");
 assert.match(v,/await upsertVaultItem\(user\.id, \{ \.\.\.item, folder: value \}\)/);
 assert.match(v,/collectionError \? <div className="v2-error" role="alert">/);
 assert.match(d,/locked.current=true/);
 assert.match(d,/Confirm delete/);
 assert.match(d,/setError\(e\?\.message/);
});
