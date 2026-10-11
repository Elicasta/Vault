import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = (file) => fs.readFileSync(file, "utf8");

test("the unified V2 shell is default and retains an explicit rollback switch", () => {
  const shell = source("components/VaultExperience.jsx");
  const modern = source("components/vault-v2/VaultV2.jsx");
  assert.match(shell, /NEXT_PUBLIC_VAULT_UI_V2 !== "false"/);
  assert.match(shell, /<VaultV2 route=\{route\}/);
  assert.match(modern, /<ImportMediaWorkspace/);
  assert.match(modern, /<InAppBrowser/);
  assert.match(modern, /<GoogleDriveBackup/);
});

test("continue watching navigates to an actual filtered library", () => {
  const modern = source("components/vault-v2/VaultV2.jsx");
  assert.match(modern, /router\.push\("\/library\?status=continue"\)/);
  assert.match(modern, /searchParams\.get\("status"\) === "continue"/);
  assert.match(modern, /status:routeStatus/);
  assert.match(modern, /filters\.status==="continue"/);
});

test("library network failures are visible and cannot impersonate an empty Vault", () => {
  const data = source("lib/supabase.js");
  const modern = source("components/vault-v2/VaultV2.jsx");
  assert.match(data, /throw new Error\("Could not load your Vault library:/);
  assert.doesNotMatch(data, /\[vault_items\]"[^\n]*\n\s*return \[\]/);
  assert.match(modern, /if\(loadError\) return <div className="v2-error"/);
  assert.match(modern, /!loadError && !displayItems\.length/);
  assert.match(modern, /refresh\(user\?\.id\)\.then\(\(\)=>setLoadError\(""\)\)/);
});

test("V2 saving cannot double-submit or dismiss an active file upload", () => {
  const dialog = source("components/vault-v2/AddMediaSheet.jsx");
  assert.match(dialog, /saveInFlight = useRef\(false\)/);
  assert.match(dialog, /if \(!valid \|\| saveInFlight\.current\) return/);
  assert.match(dialog, /saveInFlight\.current = true/);
  assert.match(dialog, /saveInFlight\.current = false/);
  assert.match(dialog, /onMouseDown=\{closeIfIdle\}/);
  assert.match(dialog, /disabled=\{saving\} aria-label="Close add media"/);
  assert.match(dialog, /aria-busy=\{saving\}/);
  assert.match(dialog, /inert=\{saving\}/);
  assert.match(dialog, /catch \(e\) \{\n\s*setError/);
});

test("V2 player reactions use persistent state and expose failed writes", () => {
  const modern = source("components/vault-v2/VaultV2.jsx");
  const player = source("components/Player.jsx");
  assert.match(modern, /recordItemOil\(user\.id, item\.key\)/);
  assert.match(modern, /reactingKeys\.current\.has\(item\.key\)/);
  assert.match(modern, /onOil=\{\(\)=>reactToItem\(playerItem\)\}/);
  assert.doesNotMatch(modern, /onOil=\{\(\)=>\{\}\}/);
  assert.match(player, /integrated && \(\s*<button type="button" onClick=\{triggerOil\}/);
  assert.match(player, /Could not save reaction/);
});

test("Chrome extension targets the same stable V2 preview instead of a stale feature build", () => {
  const service = source("extensions/vault-media-capture/background.js");
  const popup = source("extensions/vault-media-capture/popup.js");
  const docs = source("extensions/vault-media-capture/README.md");
  const origin = "https://vault-preview-temp-git-polish-vault-p-5026a8-elicastas-projects.vercel.app";
  for (const file of [service, popup, docs]) assert.ok(file.includes(origin));
  assert.match(service, /isOldVaultPreview\(savedOrigin\)/);
  assert.match(popup, /if \(isOldVaultPreview\(origin\)\)/);
  assert.doesNotMatch(service + popup, /https:\/\/vault-preview-temp-git-feat-extension-/);
});
