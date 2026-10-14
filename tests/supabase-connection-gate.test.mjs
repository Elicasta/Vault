import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("components/AuthGate.jsx", "utf8");
const client = fs.readFileSync("lib/supabase.js", "utf8");

test("production Vault refuses to masquerade as an empty local library when Supabase config is absent", () => {
  assert.match(client, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(client, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.match(source, /if \(!isSupabaseConfigured\(\)\) return \(/);
  assert.match(source, /Vault connection unavailable/);
  assert.match(source, /Retry connection/);
  assert.match(source, /role="alert"/);
  assert.doesNotMatch(source, /if \(!isSupabaseConfigured\(\)\) return children;/);
});

test("session restoration failures settle auth loading and report the error", () => {
  assert.match(source, /supabase\.auth\.getSession\(\)\.then/);
  assert.match(source, /\.catch\(\(sessionError\) => \{/);
  assert.match(source, /setChecking\(false\)/);
  assert.match(source, /Could not restore your Vault session/);
});
