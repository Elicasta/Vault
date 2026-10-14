import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { parseCapturedMedia, buildVaultMediaItem } from "../lib/media-capture-import.mjs";

const read = p=>fs.readFileSync(p,"utf8");
const scope={URL,console};
vm.runInNewContext(read("extensions/vault-media-capture/source-aware.js"),scope,{
  filename:"source-aware.js",timeout:1000,
});
const sources=scope.VaultSourceAware;
const examples=[
 ["https://www.youtube.com/watch?v=dQw4w9WgXcQ","youtube","video",/img\.youtube\.com\/vi\/dQw4w9WgXcQ\/hqdefault/],
 ["https://youtu.be/dQw4w9WgXcQ","youtube","video",/hqdefault/],
 ["https://drive.google.com/file/d/1AbcDefGhijKlmnopQrStuvWXyZ12345/view","drive","link",/drive\.google\.com\/thumbnail/],
 ["https://docs.google.com/spreadsheets/d/1AbcDefGhijKlmnopQrStuvWXyZ12345/edit","drive","link",/drive\.google\.com\/thumbnail/],
 ["https://www.pinterest.com/pin/123456789/","pinterest","link",/^$/],
 ["https://pin.it/abcd12","pinterest","link",/^$/],
 ["https://vimeo.com/123456789","vimeo","video",/vumbnail\.com/],
 ["https://example.org/articles/something","website","link",/^$/],
 ["https://cdn.example.org/photo.webp","image","image",/photo\.webp/],
 ["https://example.org/video.mp4","video-file","video",/^$/],
];
for(const [link,source,type,cover] of examples){
 test("source-aware capture recognizes "+source+" from "+new URL(link).hostname,()=>{
   const item=sources.identify(link);
   assert.equal(item.source,source);assert.equal(item.type,type);
   assert.match(item.thumbnail,cover);
 });
}
test("credentials and non-web protocols are not considered shareable URLs",()=>{
 for(const url of ["javascript:alert(1)","file:///private/photo.jpg","https://me:password@example.org/x"])
   assert.equal(sources.identify(url),null);
});
test("source classifier prevents Drive shares from being disguised as video files",()=>{
 const entry=sources.enrich({url:"https://drive.google.com/file/d/1AbcDefGhijKlmnopQrStuvWXyZ12345/view",type:"video",title:"Private share"});
 assert.equal(entry.type,"link");assert.equal(entry.source,"drive");
});
test("Chrome capture parser preserves provider links and distinct media cover",()=>{
 const rows=[
  sources.enrich({url:"https://www.youtube.com/watch?v=dQw4w9WgXcQ",title:"My music"}),
  sources.enrich({url:"https://www.pinterest.com/pin/123456789/",thumbnail:"https://i.pinimg.com/736x/demo.jpg",title:"My pin"}),
  sources.enrich({url:"https://drive.google.com/file/d/1AbcDefGhijKlmnopQrStuvWXyZ12345/view",title:"My document"}),
 ];
 const parsed=parseCapturedMedia(JSON.stringify({format:"vault-media-capture-v1",items:rows}));
 assert.equal(parsed.length,3);
 assert.deepEqual([...parsed.map(item=>item.type)].sort(),["link","link","video"].sort());
 const pin=parsed.find(item=>item.source==="pinterest");
 const save=buildVaultMediaItem(pin,"Inspiration", url=>"url-key", url=>"link");
 assert.equal(save.source,"pinterest");
 assert.equal(save.thumbnail,"https://i.pinimg.com/736x/demo.jpg");
 assert.equal(save.folder,"Inspiration");
});
test("Chrome popup and context menu support account check and saving arbitrary pages",()=>{
 const popup=read("extensions/vault-media-capture/popup.js");
 const background=read("extensions/vault-media-capture/background.js");
 const html=read("extensions/vault-media-capture/popup.html");
 const manifest=JSON.parse(read("extensions/vault-media-capture/manifest.json"));
 assert.equal(manifest.version,"2.1.0");
 assert.match(html,/source-aware\.js/);
 assert.match(popup,/checkVaultAccount/);
 assert.match(popup,/getVaultSessionFromPage/);
 assert.match(popup,/data-vault-extension-session/);
 assert.match(background,/importScripts\("source-aware\.js"\)/);
 for(const action of ["vault_save_link","vault_save_page","vault_save_image"])
   assert.match(background,new RegExp(action));
 assert.match(popup,/sourceAware\.enrich/);
 assert.match(background,/sourceAware\.enrich/);
});
test("account identity is read from signed-in Vault tab without exposing tokens",()=>{
 const gate=read("components/AuthGate.jsx");
 const picker=read("components/ExtensionSavePicker.jsx");
 assert.match(gate,/data-vault-extension-session="signed-in"/);
 assert.match(gate,/data-vault-extension-account=\{session\.user\?\.email/);
 assert.match(picker,/supabase\.auth\.getUser\(\)/);
 assert.match(picker,/upsertVaultItem\(userId, item\)/);
 assert.match(picker,/Connected to \{accountEmail/);
 assert.match(picker,/Cover URL for /);
 assert.doesNotMatch(read("extensions/vault-media-capture/popup.js"),/chrome\.cookies|supabase\.auth\.getSession/);
});
test("all extension JavaScript parses",async()=>{
 const {spawnSync}=await import("node:child_process");
 for(const file of ["popup.js","background.js","source-aware.js","batch-parser.js"]){
  const r=spawnSync(process.execPath,["--check","extensions/vault-media-capture/"+file],{encoding:"utf8"});
  assert.equal(r.status,0,file+": "+r.stderr);
 }
});
