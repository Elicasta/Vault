import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Vault mobile startup does not call removed browser state", () => {
  const source = fs.readFileSync("components/vault-v2/VaultV2.jsx", "utf8");
  assert.doesNotMatch(source, /setMobileBrowser|syncMobile|setBrowserOpen|mobileBrowser/);
  assert.doesNotMatch(source, /addEventListener\("resize",\s*syncMobile\)/);
  assert.match(source, /const sync = \(\) => setOnline\(navigator\.onLine\)/);
  assert.match(source, /window\.addEventListener\("online", sync\)/);
  assert.match(source, /window\.addEventListener\("offline", sync\)/);
  assert.match(source, /window\.removeEventListener\("online", sync\)/);
  assert.match(source, /window\.removeEventListener\("offline", sync\)/);
});

test("Essential Vault keeps a dedicated Add Media form rather than the removed in-app browser", () => {
  const source = fs.readFileSync("components/vault-v2/VaultV2.jsx", "utf8");
  assert.match(source, /<AddMediaSheet/);
  assert.doesNotMatch(source, /<InAppBrowser|<ImportMediaWorkspace/);
});
