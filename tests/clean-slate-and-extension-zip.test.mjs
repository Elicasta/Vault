import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Chrome extension is packaged as a downloadable ZIP before Next.js builds", () => {
 const pkg=JSON.parse(fs.readFileSync("package.json","utf8"));
 assert.match(pkg.scripts.build,/node scripts\/package-vault-extension\.mjs && next build/);
 const script=fs.readFileSync("scripts/package-vault-extension.mjs","utf8");
 assert.match(script,/deflateRawSync/);
 assert.match(script,/vault-media-capture\.zip/);
 assert.match(script,/readdirSync\(root/);
 const manifest=JSON.parse(fs.readFileSync("extensions/vault-media-capture/manifest.json","utf8"));
 assert.equal(manifest.manifest_version,3);
 assert.equal(manifest.background.service_worker,"background.js");
 const background=fs.readFileSync("extensions/vault-media-capture/background.js","utf8");
 const popup=fs.readFileSync("extensions/vault-media-capture/popup.js","utf8");
 assert.match(background,/vault-preview-temp-git-polish-vault-p-5026a8-elicastas-projects\.vercel\.app/);
 assert.match(popup,/vault-preview-temp-git-polish-vault-p-5026a8-elicastas-projects\.vercel\.app/);
});

test("local queued writes from before the Vault reset are cleared once", () => {
 const s=fs.readFileSync("lib/sync-outbox.js","utf8");
 assert.match(s,/vault_full_reset_20261014_applied/);
 assert.match(s,/local\.removeItem\(OUTBOX_KEY\)/);
 assert.match(s,/local\.setItem\(RESET_KEY,"yes"\)/);
 assert.match(s,/clearPreResetPendingOnce\(\)/);
});
