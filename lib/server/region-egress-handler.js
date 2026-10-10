import { NextResponse } from "next/server";
import { validatePublicUrl, readTextLimited, safeOutboundErrorMessage } from "./outbound-fetch.js";
import { outboundFetch } from "./outbound-fetch.js";
import { checkRegionalSignature } from "./region-fallback.js";

const MAX_BODY = 16_384;
const MAX_BYTES = 64 * 1024 * 1024;

export async function serveRegionalEgress(request, region) {
  const fail = (error, status = 400) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
  if (request.method !== "POST") return fail("POST required", 405);
  if (Number(request.headers.get("content-length") || 0) > MAX_BODY) return fail("Request too large", 413);
  const text = await request.text();
  if (text.length > MAX_BODY) return fail("Request too large", 413);
  if (!checkRegionalSignature(text, request.headers.get("x-vault-egress-timestamp"), request.headers.get("x-vault-egress-signature"))) {
    return fail("Regional relay authentication required", 401);
  }
  let body;
  try { body = JSON.parse(text); }
  catch { return fail("Invalid regional request JSON", 400); }
  const target = await validatePublicUrl(body.url);
  if (!target.ok) return fail("Destination is not a public HTTP(S) URL", target.status);
  const maxBytes = Number(body.maxBytes);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1024 || maxBytes > MAX_BYTES) return fail("Invalid size limit", 400);
  const timeoutMs = Math.min(12_000, Math.max(2000, Number(body.timeoutMs) || 8000));
  const reqHeaders = new Headers();
  const supplied = new Headers(body.headers || {});
  for (const key of ["accept", "accept-language", "user-agent", "range", "referer"]) {
    if (supplied.has(key)) reqHeaders.set(key, supplied.get(key));
  }
  // Cookies, Authorization and caller-provided Host are never forwarded.
  try {
    const remote = await outboundFetch(target.url.href, {
      method: "GET", timeoutMs, maxBytes, headers: reqHeaders,
    });
    const out = new Headers({ "Cache-Control": "no-store", "X-Vault-Region-Node": region,
      "X-Vault-Compute-Region": process.env.VERCEL_REGION || "unknown",
      "X-Vault-Final-Url": remote.url || target.url.href,
      "X-Content-Type-Options": "nosniff" });
    for (const key of ["content-type", "content-length", "accept-ranges", "content-range", "etag", "last-modified"]) {
      const value = remote.headers.get(key);
      if (value) out.set(key, value);
    }
    return new Response(remote.body, { status: remote.status, headers: out });
  } catch (error) {
    return fail(safeOutboundErrorMessage(error), Number(error?.status) || 502);
  }
}
