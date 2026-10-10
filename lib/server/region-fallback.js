import { createHmac, timingSafeEqual } from "node:crypto";
import { outboundFetch, validatePublicUrl } from "./outbound-fetch.js";

export const REGIONAL_NODES = Object.freeze(["us", "gb", "de"]);
const MAX_REGIONAL_BYTES = 64 * 1024 * 1024;
const SIGN_WINDOW_MS = 45_000;
const rotations = new Map();

function signingSecret() {
  return process.env.VAULT_REGION_EGRESS_SECRET || process.env.VAULT_PROXY_SESSION_SECRET || "";
}
export function regionalGatewayOrigin() {
  const explicit = String(process.env.VAULT_REGION_EGRESS_ORIGIN || "").trim();
  const vercel = String(process.env.VERCEL_URL || "").trim();
  const origin = explicit || (vercel ? "https://" + vercel : "");
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    return url.origin;
  } catch { return ""; }
}
export function makeRegionalSignature(body, timestamp, secret = signingSecret()) {
  if (!secret || secret.length < 32) return "";
  return createHmac("sha256", secret).update(String(timestamp) + "\n" + body).digest("hex");
}
export function checkRegionalSignature(body, timestamp, signature, secret = signingSecret(), now = Date.now()) {
  const t = Number(timestamp);
  if (!Number.isSafeInteger(t) || Math.abs(now - t) > SIGN_WINDOW_MS) return false;
  const expected = makeRegionalSignature(body, timestamp, secret);
  if (!expected || !/^[a-f0-9]{64}$/.test(String(signature || ""))) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}
export function rotatedRegionalNodes(hostname, previous = null) {
  const count = rotations.get(hostname) || 0;
  rotations.set(hostname, count + 1);
  if (rotations.size > 5000) rotations.clear();
  const ordered = REGIONAL_NODES.map((_, i) => REGIONAL_NODES[(count + i) % REGIONAL_NODES.length]);
  return previous ? ordered.filter((r) => r !== previous).concat(ordered.filter((r) => r === previous)) : ordered;
}
export function shouldRetryDifferentRegion(status) {
  return [401, 403, 407, 408, 429, 451, 500, 502, 503, 504].includes(Number(status));
}

export async function fetchWithRegionFallback(target, options = {}) {
  const checked = await validatePublicUrl(target);
  if (!checked.ok) {
    const error = new Error(checked.error);
    error.status = checked.status;
    error.code = checked.code;
    throw error;
  }
  const url = checked.url.href;
  const directOptions = { ...options };
  delete directOptions.region;
  let firstError = null;
  let directResponse = null;
  try {
    directResponse = await outboundFetch(url, directOptions);
    if (!shouldRetryDifferentRegion(directResponse.status)) return directResponse;
  } catch (error) { firstError = error; }

  const origin = regionalGatewayOrigin();
  const secret = signingSecret();
  if (!origin || secret.length < 32) {
    if (directResponse) return directResponse;
    throw firstError || new Error("Direct fetch failed and regional egress is not configured.");
  }
  const maxBytes = Math.min(MAX_REGIONAL_BYTES, Math.max(1024, Number(options.maxBytes) || MAX_REGIONAL_BYTES));
  const headers = Object.fromEntries(new Headers(options.headers || {}).entries());
  const safeHeaders = {};
  for (const name of ["accept", "accept-language", "user-agent", "range", "referer"]) {
    if (headers[name]) safeHeaders[name] = headers[name];
  }
  const body = JSON.stringify({ url, headers: safeHeaders, maxBytes, timeoutMs: Math.min(12_000, Math.max(2000, Number(options.timeoutMs) || 8000)) });
  const started = Date.now();
  const nodes = rotatedRegionalNodes(checked.url.hostname);
  let lastError = firstError;
  for (const region of nodes) {
    if (options.signal?.aborted) break;
    const timestamp = String(Date.now());
    const signature = makeRegionalSignature(body, timestamp, secret);
    try {
      const gateway = origin + "/api/egress/" + region;
      const response = await outboundFetch(gateway, {
        method: "POST", body, maxBytes, timeoutMs: 14_000, signal: options.signal,
        headers: { "Content-Type": "application/json", "X-Vault-Egress-Timestamp": timestamp, "X-Vault-Egress-Signature": signature },
      });
      if (response.ok || response.status === 206) {
        await directResponse?.body?.cancel().catch(() => {});
        response.headers.set("X-Vault-Region-Used", region);
        response.headers.set("X-Vault-Region-Retries", String(nodes.indexOf(region) + 1));
        return response;
      }
      lastError = new Error("Regional egress " + region + " returned " + response.status);
      await response.body?.cancel().catch(() => {});
      if (Date.now() - started > 32_000) break;
    } catch (error) {
      lastError = error;
    }
  }
  if (directResponse) {
    directResponse.headers.set("X-Vault-Region-Failed", "true");
    return directResponse;
  }
  throw firstError || lastError || new Error("All regional entries failed");
}
