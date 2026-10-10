import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { boundedMediaRange, RELAY_RANGE_CHUNK_BYTES } from "../lib/server/relay-range.mjs";
import { RATE_POLICIES } from "../lib/server/rate-limit.js";

const source = (path) => fs.readFileSync(path, "utf8");

test("relay caps direct MP4 ranges but preserves exact small ranges and HLS segments", () => {
  const url = "https://cdn.example.com/media.mp4?token=secret";
  assert.equal(boundedMediaRange("bytes=0-", url), `bytes=0-${RELAY_RANGE_CHUNK_BYTES - 1}`);
  assert.equal(boundedMediaRange("bytes=100-200", url), "bytes=100-200");
  assert.equal(boundedMediaRange("bytes=100-999999999", url), `bytes=100-${100 + RELAY_RANGE_CHUNK_BYTES - 1}`);
  assert.equal(boundedMediaRange("bytes=400-", "https://cdn.example.com/media.m3u8"), "bytes=400-");
  assert.equal(boundedMediaRange("bytes=400-", "https://cdn.example.com/segment.ts"), "bytes=400-");
  assert.equal(boundedMediaRange("bytes=0-1,3-4", url), "bytes=0-1,3-4");
  assert.equal(boundedMediaRange("bytes=999-1", url), "bytes=999-1");
});

test("relay cleans up streaming requests before Vercel's five-minute timeout", () => {
  const relay = source("app/api/stream/route.js");
  assert.match(relay, /MAX_STREAM_DURATION_MS = 65_000/);
  assert.match(relay, /limitStreamLifetime\(upstream\.body, controller\)/);
  assert.match(relay, /clearTimeout\(deadline\)/);
  assert.match(relay, /await reader\.cancel\(reason\)/);
  assert.match(relay, /boundedMediaRange\(range, checked\.url\.href\)/);
  assert.match(relay, /upstream\.status === 416/);
});

test("HLS relay quota accommodates segment and key requests", () => {
  assert.ok(RATE_POLICIES.stream.limit >= 120);
});

test("service worker does not intercept API responses or cache private routes", () => {
  const sw = source("public/sw.js");
  assert.match(sw, /url\.pathname\.startsWith\("\/api\/"\)\) return/);
  assert.match(sw, /SHELL_PATHS\.has\(url\.pathname\)/);
  assert.doesNotMatch(sw, /cache\.put\(request, copy\)/);
});

test("search bypasses caches, renews session, cancels stale requests, and can retry", () => {
  const browser = source("components/InAppBrowser.jsx");
  assert.match(browser, /searchAbort\.current\?\.abort\(\)/);
  assert.match(browser, /sequence !== searchSequence\.current/);
  assert.match(browser, /cache: "no-store"/);
  assert.match(browser, /credentials: "same-origin"/);
  assert.match(browser, /response\.status === 401/);
  assert.match(browser, /ensureProxySession\(null, \{ force: true \}\)/);
  assert.match(browser, /Search in browser/);
  const server = source("app/api/browser-search/route.js");
  assert.match(server, /"Cache-Control": "no-store"/);
});

test("secure Relay renews on focus and preserves playback position on mode switch", () => {
  const session = source("lib/security-session.js");
  const vault = source("components/vault-v2/VaultV2.jsx");
  const player = source("components/Player.jsx");
  assert.match(session, /RENEW_AFTER_MS = 12 \* 60 \* 1000/);
  assert.match(vault, /document\.addEventListener\("visibilitychange", renew\)/);
  assert.match(player, /seekTarget\.current = previousTime/);
  assert.match(player, /refreshInFlight\.current/);
  assert.match(player, /void switchToRelay\(true\)/);
});

// Preview smoke verification request: branch-scoped secure configuration restored.
