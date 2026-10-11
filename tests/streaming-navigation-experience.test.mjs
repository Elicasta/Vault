import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");

test("home leads with real media and a one-click watch action", () => {
  const view = read("components/vault-v2/VaultV2.jsx");
  const css = read("app/vault-v2.css");
  assert.match(view, /function FeaturedStage\(/);
  assert.match(view, /onWatch=\{play\}/);
  assert.match(view, /const featuredItem = continueItems\[0\] \|\| videoItems\[0\] \|\| recentItems\[0\]/);
  assert.match(view, /Continue Watching/);
  assert.match(view, /Recently Added/);
  assert.match(view, /Your Videos/);
  assert.match(view, /Photos & Artwork/);
  assert.match(css, /\.v2-featured-art:after\{/);
  assert.match(css, /\.v2-desktop-nav/);
});

test("collection covers are designed even when the folder has no thumbnail", () => {
  const view = read("components/vault-v2/VaultV2.jsx");
  const css = read("app/vault-v2.css");
  assert.match(view, /v2-collection-artwork/);
  assert.match(view, /v2-tone-\$\{tone\}/);
  assert.match(view, /VAULT COLLECTION/);
  assert.match(view, /covers\.length \? covers\.map/);
  for (let i=0;i<5;i++) assert.ok(css.includes(".v2-tone-"+i));
});

test("library media browse uses curated types with advanced filters optionally available", () => {
  const view = read("components/vault-v2/VaultV2.jsx");
  assert.match(view, /className="v2-browse-types"/);
  assert.match(view, /aria-pressed=\{filters\.type===type\}/);
  assert.match(view, /advancedFiltersOpen && <div className="v2-advanced-filters"/);
  assert.match(view, /router\.push\("\/library\?type=video"\)/);
});

test("collection descendants remain visible even when their parent has no direct media",()=>{
  const view=read("components/vault-v2/VaultV2.jsx");
  assert.match(view,/function collectionBranch\(/);
  assert.match(view,/names\.has\(f\.parent_folder\)/);
  assert.match(view,/descendantNames\.has\(folderFor\(/);
  assert.match(view,/collectionBranch\(f\.name,folders\)\.has/);
});

test("scroll containment prevents horizontal page movement without disabling accessibility zoom", () => {
  const v2 = read("app/vault-v2.css");
  const search = read("components/InAppBrowser.css");
  const layout = read("app/layout.jsx");
  assert.match(v2, /overflow-x:clip/);
  assert.match(v2, /\.v2-main\{width:100%;max-width:100%;min-width:0/);
  assert.match(search, /\.vv-browser-main\{scrollbar-gutter:stable/);
  assert.match(search, /overflow-x:hidden!important/);
  assert.match(search, /font-size:16px!important/);
  assert.match(search, /position:sticky;bottom:0/);
  assert.doesNotMatch(layout, /userScalable\s*:\s*false|maximumScale\s*:\s*1/);
});
