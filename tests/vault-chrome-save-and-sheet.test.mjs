import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
const folder="extensions/vault-media-capture";
const parser=await import("../extensions/vault-media-capture/batch-parser.js");
const p=globalThis.VaultBatchParser || parser.default;
function source(name){return fs.readFileSync(path.join(folder,name),"utf8");}

test("Google Sheets copied tab-separated rows with headings become media import items",()=>{
 const input="URL\tTitle\tType\tSource Page\n"+
 "https://images.example/original.png\tOriginal A\timage\thttps://gallery.example/set1\n"+
 "https://images.example/render?id=1\tPhoto without extension\timage\thttps://gallery.example/set1\n"+
 "https://images.example/original.png\tDuplicate\timage\thttps://gallery.example/set1\n";
 const r=p.parseSpreadsheetRows(input);
 assert.equal(r.items.length,2);
 assert.equal(r.duplicates,1);
 assert.equal(r.items[0].title,"Original A");
 assert.equal(r.items[1].type,"image");
 assert.equal(r.items[0].sourcePage,"https://gallery.example/set1");
});

test("CSV quoted commas, quoted names and one-column URLs parse without data loss",()=>{
 const csv='Image URL,Title,Type\n"https://example.org/first.jpg","Portrait, Studio",image\n'+
   '"https://example.org/movie.mp4","Scene ""A""",video\n';
 const r=p.parseSpreadsheetRows(csv);
 assert.deepEqual(r.items.map(x=>x.title),["Portrait, Studio",'Scene "A"']);
 const single=p.parseSpreadsheetRows("https://example.org/a.jpg\nhttps://example.org/b.webp\n");
 assert.equal(single.items.length,2);
});

test("unknown links are not silently mislabeled images, unless user opts in",()=>{
 const input="https://example.org/image/render?id=33\nhttps://example.org/full.jpg\nnot a url";
 const r=p.parseSpreadsheetRows(input);
 assert.equal(r.items.length,1);
 assert.equal(r.unrecognized,1);
 assert.equal(r.invalid,1);
 const override=p.parseSpreadsheetRows(input,{unknownAsImage:true});
 assert.equal(override.items.length,2);
 assert.equal(override.items[0].type,"image");
});

test("Google Sheets URLs resolve only trusted docs.google.com spreadsheet export endpoints",()=>{
 assert.equal(p.sheetCsvExportUrl("https://docs.google.com/spreadsheets/d/AbCdEfGhIjKlMnO123/edit#gid=55"),
 "https://docs.google.com/spreadsheets/d/AbCdEfGhIjKlMnO123/export?format=csv&gid=55");
 assert.equal(p.sheetCsvExportUrl("https://docs.google.com/spreadsheets/d/AbCdEfGhIjKlMnO123/view?gid=2"),
 "https://docs.google.com/spreadsheets/d/AbCdEfGhIjKlMnO123/export?format=csv&gid=2");
 for(const url of ["https://docs.google.com.evil.example/spreadsheets/d/abcdefg1234/edit",
  "http://docs.google.com/spreadsheets/d/abcdefg1234/edit",
  "https://docs.google.com.evil/spreadsheets/d/abcdefg1234/edit",
  "javascript:alert(1)"])assert.equal(p.sheetCsvExportUrl(url),"");
});

test("popup includes right-click handoff, sheet CSV controls and existing capture UI",()=>{
 const manifest=JSON.parse(source("manifest.json"));
 const popup=source("popup.js"),html=source("popup.html");
 assert.equal(manifest.manifest_version,3);
 assert.ok(manifest.permissions.includes("contextMenus"));
 assert.match(popup,/VAULT_OPEN_IMPORT/);
 assert.match(popup,/Review captured media|Copied .* links/);
 assert.match(popup,/VaultBatchParser/);
 assert.match(popup,/sheetCsvExportUrl/);
 assert.match(popup,/allFrames: true/);
 assert.match(popup,/browser-original-candidate/);
 assert.match(html,/id="sheet-file"/);
 assert.match(html,/id="sheet-text"/);
 assert.match(html,/id="sheet-load"/);
 assert.match(html,/id="vault-url"/);
 assert.match(html,/id="send"/);
 assert.match(html,/id="smart-crop"/);
 assert.match(html,/src="batch-parser.js"/);
 assert.ok(html.indexOf('src="batch-parser.js"')<html.indexOf('src="popup.js"'));
});

test("background extension only sends into user-configured HTTPS Vault import after action",async()=>{
 const background=source("background.js");
 const listeners={install:[],context:[],updated:[],message:[],removed:[]};
 const created=[],menus=[],injections=[];
 const storageData={};
 const chrome={
  webRequest:{onBeforeRequest:{addListener(){}},onHeadersReceived:{addListener(){}}},
  tabs:{onRemoved:{addListener:x=>listeners.removed.push(x)},onUpdated:{addListener:x=>listeners.updated.push(x)},
   create:async opts=>{created.push(opts);return {id:101,status:"loading",url:opts.url};}},
  storage:{session:{set:async()=>{},get:async()=>({}),remove:async()=>{}},
    local:{get:async()=>storageData,set:async data=>Object.assign(storageData,data)}},
  contextMenus:{create:x=>menus.push(x),onClicked:{addListener:x=>listeners.context.push(x)}},
  runtime:{onInstalled:{addListener:x=>listeners.install.push(x)},
   onMessage:{addListener:x=>listeners.message.push(x)},lastError:undefined},
  scripting:{executeScript:async opts=>{injections.push(opts);return [{result:true}];}},
 };
 vm.runInNewContext(background,{chrome,URL,Date,Math,Promise,setTimeout(){return 0;},setInterval(){return 0;},clearInterval(){},console});
 for(const fn of listeners.install)fn();
 assert.deepEqual(Array.from(menus.map(x=>x.id)),["vault_save_image","vault_queue_image"]);
 assert.ok(listeners.context.length>0);
 for(const fn of listeners.context)fn({menuItemId:"vault_save_image",srcUrl:"https://images.example/photo.webp"},{
   id:22,url:"https://gallery.example/album/1",
 });
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(created.length,1);
 assert.equal(created[0].url,"https://vault-preview-temp-9tnwnrk1f-elicastas-projects.vercel.app/import");
 for(const fn of listeners.updated)fn(101,{status:"complete"},{url:created[0].url});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(injections.length,1);
 assert.equal(injections[0].world,"MAIN");
 assert.equal(injections[0].args[0].includes("https://images.example/photo.webp"),true);
 assert.doesNotMatch(background,/document\.cookie|chrome\.cookies\.get|Authorization:\s*Bearer/);
 assert.match(background,/HTMLTextAreaElement\.prototype/);
 assert.match(background,/Review captured media/);
});

test("feature branch does not modify Vault import page or its saved-media database",()=>{
 const popup=source("popup.js"),bg=source("background.js");
 assert.match(popup,/chrome\.storage\.local\.set/);
 assert.match(bg,/chrome\.tabs\.create/);
 assert.doesNotMatch(bg,/supabase|api\/save|api\/media-discovery/);
});
