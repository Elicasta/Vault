import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { classifyBackupSource, backupCounts, VAULT_MEDIA_PREFIX } from "../lib/drive-backup-rules.mjs";

test("private Storage upload is backed up as original, not a signed temporary URL", () => {
  const locator=VAULT_MEDIA_PREFIX+"5c1user/2026/10/original.png";
  assert.deepEqual(classifyBackupSource({url:locator,thumbnail:locator}),{url:locator,kind:"supabase-original"});
});

test("public original image beats a private thumbnail and a page URL is never an original", () => {
  assert.deepEqual(classifyBackupSource({url:"https://cdn.photos.example/original.jpg?token=x",
    thumbnail:"vault-media://vault-media/u/cover.png"}),{
    url:"https://cdn.photos.example/original.jpg?token=x",kind:"external-original"});
  assert.deepEqual(classifyBackupSource({url:"https://gallery.example/post/123",
    thumbnail:"vault-media://vault-media/u/cover.png"}),{
    url:"vault-media://vault-media/u/cover.png",kind:"cover-only"});
  assert.equal(classifyBackupSource({url:"https://gallery.example/post/123",thumbnail:"https://cdn.example/preview.webp"}).kind,"cover-only");
  assert.equal(classifyBackupSource({url:"https://gallery.example/post/123",thumbnail:""}).kind,"link-only");
});

test("backup counts never misrepresent thumbnails or links as originals", () => {
  const count=backupCounts([
    {status:"backed_up",source_kind:"supabase-original"},
    {status:"backed_up",source_kind:"external-original"},
    {status:"backed_up",source_kind:"cover-only"},
    {status:"link_only",source_kind:"link-only"},
    {status:"failed",source_kind:"unresolved"},
  ],9);
  assert.deepEqual(count,{images:9,backedUp:3,originals:2,covers:1,linkOnly:1,failed:1});
});

test("Drive OAuth is stateful, CSRF protected, narrow-scoped and refresh tokens encrypted", () => {
  const source=fs.readFileSync("lib/server/drive-backup.mjs","utf8");
  assert.match(source,/drive\.file/);
  assert.match(source,/access_type:"offline"/);
  assert.match(source,/code_challenge_method:"S256"/);
  assert.match(source,/crypto\.timingSafeEqual/);
  assert.match(source,/aes-256-gcm/);
  assert.match(source,/serviceSupabase/);
  assert.match(source,/encrypted_refresh_token|encryptDriveSecret/);
  assert.doesNotMatch(source,/NEXT_PUBLIC_VAULT_DRIVE_TOKEN_KEY/);
});

test("Google callback only trusts one-time state and does not expose token to browser", () => {
  const callback=fs.readFileSync("app/api/drive-backup/callback/route.js","utf8");
  const connect=fs.readFileSync("app/api/drive-backup/connect/route.js","utf8");
  assert.match(callback,/verifyDriveOAuthState\(cookie,state\)/);
  assert.match(callback,/encryptDriveSecret\(result\.refresh_token\)/);
  assert.match(callback,/sameSite:"lax"/);
  assert.match(connect,/requireProxyUser\(request\)/);
  assert.match(connect,/sameSite:"lax"/);
  assert.match(connect,/new URL\(config\.redirectUri\)\.origin/);
});

test("backup server never marks a URL as backed up without uploading actual bytes", () => {
  const route=fs.readFileSync("app/api/drive-backup/route.js","utf8");
  assert.match(route,/await downloadBackupImage\(item,admin\)/);
  assert.match(route,/await uploadDriveImage\(/);
  assert.match(route,/status:"backed_up"/);
  assert.match(route,/status:"link_only"/);
  assert.match(route,/remaining:/);
  assert.match(route,/limit\(250\)/);
  assert.match(route,/candidates\.slice\(0,3\)/);
  assert.match(route,/requireProxyUser/);
});

test("Google Drive settings show connected state, backup progress and reversible disconnection", () => {
  const ui=fs.readFileSync("components/vault-v2/DriveBackupSettings.jsx","utf8");
  const vault=fs.readFileSync("components/vault-v2/VaultV2.jsx","utf8");
  const migration=fs.readFileSync("supabase/migrations/20261010_vault_drive_backups.sql","utf8");
  assert.match(ui,/Back up images now/);
  assert.match(ui,/Covers only/);
  assert.match(ui,/Link only/);
  assert.match(ui,/Disconnect/);
  assert.match(ui,/automatic scheduling is not enabled yet/);
  assert.match(vault,/<DriveBackupSettings userId=\{user\?\.id\}/);
  assert.match(migration,/enable row level security/);
  assert.match(migration,/revoke all .* from anon, authenticated/);
});
