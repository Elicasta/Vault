import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("collection cards preview saved media with accessible destination labels", () => {
  const view = read("components/vault-v2/VaultV2.jsx");
  const styles = read("app/vault-v2.css");
  assert.match(view, /function CollectionCard\(\{ folder, items, onOpen \}\)/);
  assert.match(view, /items\.map\(\(item\) => item\.display_thumbnail \|\| item\.thumbnail\)/);
  assert.match(view, /aria-label=\{\`Open collection/);
  assert.match(view, /<CollectionCard key=\{f\.name\}/);
  assert.match(styles, /\.v2-collection-covers\{/);
  assert.match(styles, /\.v2-collection-preview:focus-visible|\.v2-collection.*:focus-visible/s);
});

test("adding inside a collection retains the current collection destination", () => {
  const view = read("components/vault-v2/VaultV2.jsx");
  const sheet = read("components/vault-v2/AddMediaSheet.jsx");
  assert.match(view, /initialFolder=\{route === "collections" \? selectedCollection : ""\}/);
  assert.match(sheet, /initialFolder = ""/);
  assert.match(sheet, /setFolder\(initialItem\?\.folder \|\| initialFolder \|\| ""\)/);
});

test("empty filtered views offer recovery, and mobile filters can reset", () => {
  const view = read("components/vault-v2/VaultV2.jsx");
  assert.match(view, /const activeFilterCount = Object\.values\(filters\)/);
  assert.match(view, /activeFilterCount \? \{action:resetFilters,label:"Clear filters"\}/);
  assert.match(view, /\{action:\(\)=>setBrowserOpen\(true\),label:"Search the web"\}/);
  assert.match(view, /onReset=\{resetFilters\}/);
  assert.match(view, /onReset\?\.\(\); onClose\(\)/);
});

test("media cards try direct original after proxy and do not mislabel every link as a gallery", () => {
  const card = read("components/vault-v2/MediaCard.jsx");
  assert.match(card, /proxied && proxied !== url \? \[proxied, url\] : \[url\]/);
  assert.match(card, /isLink \? "Saved link" : source\.name/);
  assert.match(card, /onError=\{\(\) => setIndex\(\(i\) => i \+ 1\)\}/);
  assert.match(card, /referrerPolicy="no-referrer"/);
});

test("drawer does not display stale activity or shift focus during ordinary state updates", () => {
  const drawer = read("components/vault-v2/DetailDrawer.jsx");
  assert.match(drawer, /const \[activityLoading, setActivityLoading\] = useState\(false\)/);
  assert.match(drawer, /setComments\(\[\]\);\s*setMarks\(\[\]\)/);
  assert.match(drawer, /\}, \[item\?\.key\]\);/);
  assert.match(drawer, /const nav = keyboardState\.current/);
  assert.match(drawer, /onMouseDown=\{closeIfIdle\}/);
  assert.match(drawer, /onTouchStart=\{\(e\) =>/);
  assert.match(drawer, /Loading activity…/);
  assert.doesNotMatch(drawer, /onTouchStart=\{\(e\) => \{[\s\S]*?onTouchEnd[\s\S]*?\}\}\s*>\s*<div className="v2-drawer-head"/);
});

test("destructive and collection changes are guarded during async saves", () => {
  const view = read("components/vault-v2/VaultV2.jsx");
  const drawer = read("components/vault-v2/DetailDrawer.jsx");
  assert.match(view, /await upsertVaultItem\(user\.id, \{ \.\.\.item, folder: value \}\);[\s\S]*?setItems\(\(prev\) => prev\.map/);
  assert.match(view, /collectionError \? <div className="v2-error" role="alert">/);
  assert.match(view, /disabled=\{collectionBusy\} className="v2-iconbtn"/);
  assert.match(drawer, /Delete “\{item\.title \|\| "this item"\}” permanently\? This cannot be undone\./);
});
