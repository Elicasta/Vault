import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=path=>fs.readFileSync(path,"utf8");

test("clean detail supports previous and next item, keyboard dismissal and deletion confirmation",()=>{
 const src=read("components/vault-v2/DetailDrawer.jsx");
 assert.match(src,/currentIndex=-1,totalItems=0/);
 assert.match(src,/Previous item/);
 assert.match(src,/Next item/);
 assert.match(src,/e\.key==="ArrowLeft"/);
 assert.match(src,/e\.key==="ArrowRight"/);
 assert.match(src,/if\(e\.key==="Escape"\)/);
 assert.match(src,/Confirm delete/);
 assert.match(src,/activeAction|locked\.current/);
});

test("detail focuses on cover, description, tags, favorite and collection",()=>{
 const src=read("components/vault-v2/DetailDrawer.jsx");
 assert.match(src,/v2-clean-detail-poster/);
 assert.match(src,/proxiedMediaUrl\(cover\)/);
 assert.match(src,/v2-clean-description/);
 assert.match(src,/v2-tag-row/);
 assert.match(src,/onFavorite\(item.key/);
 assert.match(src,/onFolder\(item,value\)/);
 assert.match(src,/onEdit\(item\)/);
 assert.doesNotMatch(src,/Comments|Moment marks|tablist/);
});

test("route-aware item navigation works from library and nested collections",()=>{
 const src=read("components/vault-v2/VaultV2.jsx");
 assert.match(src,/const detailContextItems = useMemo/);
 assert.match(src,/route === "collections" && selectedCollection/);
 assert.match(src,/currentIndex=\{detailIndex\}/);
 assert.match(src,/totalItems=\{detailContextItems\.length\}/);
 assert.match(src,/onNavigate=\{\(idx\)=>/);
 assert.match(src,/collectionBranch\(selectedCollection, folders\)/);
});

test("player still supports portrait video and direct media",()=>{
 const src=read("components/Player.jsx");
 assert.match(src,/const \[mediaOrientation, setMediaOrientation\] = useState\("wide"\)/);
 assert.match(src,/ratio < 0\.86 \? "portrait"/);
 assert.match(src,/mediaShell\(isFullscreen, mediaOrientation\)/);
 assert.match(src,/orientation === "portrait"/);
});

test("old browser search endpoints and destination links are gone",()=>{
 const src=read("components/vault-v2/VaultV2.jsx");
 assert.doesNotMatch(src,/InAppBrowser|setBrowserOpen|\/search|\/nsfw/);
 assert.equal(fs.existsSync("app/api/browser-search/route.js"),false);
});

test("mobile form inputs avoid iOS focus zoom",()=>{
 const css=read("app/vault-v2.css");
 assert.match(css,/\.v2-simple-add-fields :is\(input,textarea,select\)\{font-size:16px!important\}/);
 const layout=read("app/layout.jsx");
 assert.doesNotMatch(layout,/maximumScale\s*:\s*1/);
});
