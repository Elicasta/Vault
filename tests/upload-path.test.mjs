import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("private upload helper uses owner-prefixed Vault Storage locators", () => {
  const source = read("lib/supabase.js");
  assert.match(source, /VAULT_MEDIA_BUCKET = "vault-media"/);
  assert.match(source, /VAULT_MEDIA_PREFIX = "vault-media:\/\/vault-media\//);
  assert.match(source, /50 \* 1024 \* 1024/);
  assert.match(source, /Authenticated user does not own this upload/);
  assert.match(source, /\$\{userId\}\/\$\{now\.getUTCFullYear\(\)\}/);
  assert.match(source, /\.storage\.from\(VAULT_MEDIA_BUCKET\)\.upload/);
  assert.match(source, /createSignedUrl\(path, expiresIn\)/);
  assert.match(source, /\.storage\.from\(VAULT_MEDIA_BUCKET\)\.remove\(\[path\]\)/);
});

test("Vault persists canonical private locators instead of expiring signed URLs", () => {
  const source = read("lib/supabase.js");
  assert.match(source, /canonical_url: canonicalUrl/);
  assert.match(source, /isUploadedMedia: uploaded/);
  assert.match(source, /const persistedUrl=item\.canonical_url\|\|item\.url/);
  assert.match(source, /const persistedThumb=item\.canonical_thumbnail\|\|item\.thumbnail\|\|null/);
  assert.match(source, /return Promise\.all\(\(data \|\| \[\]\)\.map\(async \(r\)/);
});

test("Add Media uses a simple URL and verified cover workflow instead of direct uploading",()=>{
 const source=read("components/vault-v2/AddMediaSheet.jsx");
 assert.match(source,/Media URL/);
 assert.match(source,/Cover image URL/);
 assert.match(source,/Name/);
 assert.match(source,/Tags/);
 assert.match(source,/Description/);
 assert.match(source,/coverReady && !coverFailed/);
 assert.doesNotMatch(source,/uploadVaultMedia\(userId,file\)|Upload File/);
});

test("uploaded media deletion removes Storage object and Vault row", () => {
  const source = read("components/vault-v2/VaultV2.jsx");
  assert.match(source, /deleteVaultMedia\(user\.id,item\.canonical_url\)/);
  assert.match(source, /removeVaultItem\(user\.id,item\.key\)/);
  assert.match(source, /userId=\{user\?\.id\}/);
});

test("direct audio uploads have a native player", () => {
  const sources = read("lib/sources.js");
  const player = read("components/Player.jsx");
  assert.match(sources, /AUDIO_RE/);
  assert.match(sources, /id: "audio"/);
  assert.match(sources, /embed: \{ kind: "audio"/);
  assert.match(sources, /if \(k === "audio"\)/);
  assert.match(player, /if \(embed\.kind === "audio"\)/);
  assert.match(player, /<audio/);
  assert.match(player, /embed\?\.kind === "audio"/);
});

test("Add Media uses compact cover preview and form styling",()=>{
 const css=read("app/vault-v2.css");
 assert.match(css,/\.v2-simple-add-form/);
 assert.match(css,/\.v2-simple-cover-art/);
 assert.match(css,/\.v2-simple-add-actions/);
});
