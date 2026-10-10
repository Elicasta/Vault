import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizeGeneratorPublicUrl, inferGeneratorUrlType, buildGeneratorUrlItem } from "../lib/generator-save-url.mjs";

test("Save URL to Vault is the default saving path for generated image or video",()=>{
  const keyOf=(url)=>"key:"+url;
  const time=new Date("2026-10-10T12:00:00.000Z");
  const direct=buildGeneratorUrlItem("https://media.example/scene.webp?sig=abc",{
    site:"venice",siteName:"Venice AI",folder:"Venice AI",title:"One scene",keyOf,now:time,
  });
  assert.equal(direct.type,"image");
  assert.equal(direct.url,"https://media.example/scene.webp?sig=abc");
  assert.equal(direct.folder,"Venice AI");
  assert.equal(direct.key,"key:https://media.example/scene.webp?sig=abc");
  assert.equal(direct.title,"One scene");
  assert.ok(direct.tags.includes("saved-url"));
  assert.equal(direct.addedAt,time.toISOString());
  const page=buildGeneratorUrlItem("https://perchance.org/ai-text-to-image-generator",{
    site:"perchance",folder:"Perchance AI",keyOf,
  });
  assert.equal(page.type,"link");
  assert.equal(page.title,"perchance.org");
  assert.equal(inferGeneratorUrlType("https://cdn.example/x.webm"),"video");
});

test("blob, data, local/private URL forms cannot masquerade as durable media links",()=>{
  const invalid=["blob:https://venice.ai/123","data:image/png;base64,xyz","file:///tmp/a.png","javascript:alert(1)","http://localhost/file.png","http://127.0.0.1/image.png","http://192.168.1.99/image.png","https://username:password@somewhere.com/a.jpg"];
  for(const item of invalid) assert.equal(normalizeGeneratorPublicUrl(item),"",item);
  assert.match(normalizeGeneratorPublicUrl("perchance.org/ai-text-to-image-generator"),/^https:\/\/perchance\.org\//);
  assert.throws(()=>buildGeneratorUrlItem("blob:https://venice.ai/123",{keyOf:()=>1}),/public website or media URL/);
});

test("saving UI makes URL first, permanent file copy second and Drive backup last",()=>{
  const source=fs.readFileSync("components/GeneratorWorkspace.jsx","utf8");
  const browser=fs.readFileSync("components/InAppBrowser.jsx","utf8");
  const p=source.indexOf(">1. Save URL to Vault<");
  const f=source.indexOf(">3. Save Permanent Copy<");
  const b=source.indexOf(">4. Back up permanent files<");
  assert.ok(p>=0&&f>p&&b>f,"URL should be primary before file and Drive backups");
  assert.match(source,/buildGeneratorUrlItem\(actual/);
  assert.match(source,/onSave\(item\)/);
  assert.match(browser,/Save URL to Vault/);
  const actions=browser.indexOf("function SearchResults(");
  const browserActions=browser.slice(actions);
  assert.ok(browserActions.indexOf("Save URL to Vault")>=0 && browserActions.indexOf("Save URL to Vault")<browserActions.indexOf("Find media"));
});
