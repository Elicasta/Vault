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

test("extension popup retains gallery scanner, Google Sheets and folder-picker action", () => {
 const manifest = JSON.parse(source("manifest.json"));
 const popup = source("popup.js");
 const html = source("popup.html");
 assert.equal(manifest.manifest_version, 3);
 assert.equal(manifest.version, "2.0.0");
 assert.ok(manifest.permissions.includes("contextMenus"));
 assert.ok(manifest.permissions.includes("alarms"));
 assert.match(popup, /VAULT_OPEN_PICKER/);
 assert.match(popup, /selectedItems/);
 assert.match(popup, /\.slice\(0,300\)/);
 assert.match(popup, /VaultBatchParser/);
 assert.match(popup, /sheetCsvExportUrl/);
 assert.match(popup, /allFrames: true/);
 assert.match(popup, /browser-original-candidate/);
 assert.match(html, /id="sheet-file"/);
 assert.match(html, /id="sheet-text"/);
 assert.match(html, /id="sheet-load"/);
 assert.match(html, /id="vault-url"/);
 assert.match(html, /id="send"/);
 assert.match(html, /id="smart-crop"/);
 assert.match(html, /Choose folder/);
 assert.ok(html.indexOf('src="batch-parser.js"') < html.indexOf('src="popup.js"'));
});

test("right-click opens Vault folder picker and delivers only selected image URLs", async () => {
 const background = source("background.js");
 const listeners = { installed: [], clicked: [], updated: [], removed: [], message: [], alarm: [], startup: [] };
 const opened = [], menus = [], injected = [];
 const session = new Map(), local = {};
 const origin = "https://vault-preview-temp-git-feat-extension-7e2809-elicastas-projects.vercel.app";
 const chrome = {
  webRequest: {onBeforeRequest:{addListener(){}},onHeadersReceived:{addListener(){}}},
  tabs: {
   onRemoved:{addListener:f=>listeners.removed.push(f)},
   onUpdated:{addListener:f=>listeners.updated.push(f)},
   get:async id=>({id,url:origin+"/capture"}),
  },
  windows:{create:async options=>{opened.push(options);return {tabs:[{id:101}]};}},
  storage: {
   session:{
    set:async entries=>Object.entries(entries).forEach(([key,value])=>session.set(key,value)),
    get:async key=>key===null?Object.fromEntries(session):{[key]:session.get(key)},
    remove:async key=>session.delete(key),
   },
   local:{get:async()=>local,set:async next=>Object.assign(local,next)},
  },
  alarms:{
   create(){},onAlarm:{addListener:f=>listeners.alarm.push(f)},
  },
  contextMenus:{create:x=>menus.push(x),onClicked:{addListener:f=>listeners.clicked.push(f)}},
  runtime:{
   onInstalled:{addListener:f=>listeners.installed.push(f)},
   onStartup:{addListener:f=>listeners.startup.push(f)},
   onMessage:{addListener:f=>listeners.message.push(f)},
   lastError:undefined,
  },
  scripting:{executeScript:async opts=>{injected.push(opts);return [{result:true}];}},
 };
 vm.runInNewContext(background,{chrome,URL,Date,Math,Promise,Map,Set,
  setTimeout:(fn)=>{fn();return 1;},clearTimeout(){},console});
 for(const fn of listeners.installed)fn();
 assert.deepEqual(menus.map(item=>item.id), ["vault_save_image","vault_queue_image"]);
 listeners.clicked[0]({menuItemId:"vault_save_image",srcUrl:"https://images.example/photo.webp",
  linkUrl:"https://images.example/full.jpg"},{id:22,url:"https://gallery.example/album/1"});
 await new Promise(resolve=>setImmediate(resolve));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(opened.length, 1);
 assert.equal(opened[0].type, "popup");
 assert.equal(opened[0].url, origin + "/capture");
 assert.equal(opened[0].focused, true);
 assert.equal(injected.length, 1);
 assert.equal(injected[0].world,"MAIN");
 assert.equal(injected[0].args[0].format,"vault-extension-capture-v2");
 assert.equal(injected[0].args[0].items[0].url,"https://images.example/full.jpg");
 assert.equal(injected[0].args[0].items[0].thumbnail,"https://images.example/photo.webp");
 assert.doesNotMatch(background,/document\.cookie|chrome\.cookies\.get|Authorization:\s*Bearer/);
});

test("picker saves via Elicasta Supabase auth and handles batches and folder choice", () => {
 const page=fs.readFileSync("app/capture/page.jsx","utf8");
 const picker=fs.readFileSync("components/ExtensionSavePicker.jsx","utf8");
 const background=source("background.js");
 assert.match(page,/AuthGate/);
 assert.match(page,/ExtensionSavePicker/);
 assert.match(picker,/supabase\.auth\.getUser/);
 assert.match(picker,/getFolders/);
 assert.match(picker,/createFolder/);
 assert.match(picker,/upsertVaultItem/);
 assert.match(picker,/Promise\.allSettled/);
 assert.match(picker,/MAX_PARALLEL_WRITES = 8/);
 assert.match(picker,/buildVaultMediaItem/);
 assert.match(picker,/sessionStorage\.removeItem/);
 assert.match(background,/MAX_BATCH = 300/);
 assert.match(background,/PENDING_PREFIX/);
 assert.match(background,/safeVaultOrigin/);
 assert.doesNotMatch(background,/supabase\.from\(/);
});
