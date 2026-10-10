import { NextResponse } from "next/server";
import { guardProxyRequest, securityErrorResponse } from "@/lib/server/proxy-guard";
import { safeFetch, validatePublicUrl, readTextLimited } from "@/lib/server/safe-url";
import { fetchWithRegionFallback } from "@/lib/server/region-fallback.js";
import { discoverMedia } from "@/lib/server/media-discovery.mjs";
import { chooseBestImage, isImageFileUrl } from "@/lib/server/image-resolution.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };
const MAX_HTML = 1_000_000;
const MAX_PAGES = 8;

// Explicit user-triggered image detail resolution. Each safe public URL is
// checked independently, with bounded concurrency and response sizes.
async function resolveOne(page) {
  const raw = String(page?.url || "").slice(0, 2048);
  const coverUrl = String(page?.thumbnail || "").slice(0, 2048);
  const title = String(page?.title || "Image").slice(0, 180);
  const checked = await validatePublicUrl(raw);
  if (!checked.ok) return { pageUrl: raw, error: checked.error || "URL blocked" };
  if (isImageFileUrl(checked.url.href)) {
    return { pageUrl: raw, image: { url: checked.url.href, type: "image", title, thumbnail: coverUrl || checked.url.href, sourcePage: raw, resolution: "direct" } };
  }
  try {
    const r = await fetchWithRegionFallback(checked.url.href, {
      method: "GET", timeoutMs: 4500, maxBytes: MAX_HTML,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; VaultImageCollector/2.0)",
        Accept: "text/html,application/xhtml+xml,image/*;q=0.8", "Accept-Language": "en-US,en;q=0.9" },
    });
    if (!r.ok) {
      await r.body?.cancel().catch(() => {});
      return { pageUrl: raw, error: "Image page returned HTTP " + r.status };
    }
    const mime = String(r.headers.get("content-type") || "");
    const finalUrl = r.url || checked.url.href;
    if (/^image\/(?:jpeg|png|webp|gif|avif|bmp)/i.test(mime)) {
      await r.body?.cancel().catch(() => {});
      return { pageUrl: raw, image: { url: finalUrl, type: "image", title, thumbnail: coverUrl || finalUrl, sourcePage: raw, resolution: "direct" } };
    }
    if (!/(html|xml)/i.test(mime)) {
      await r.body?.cancel().catch(() => {});
      return { pageUrl: raw, error: "Page does not expose an image" };
    }
    const html = await readTextLimited(r, MAX_HTML);
    const found = discoverMedia(html, finalUrl);
    const image = chooseBestImage(found.media, { pageUrl: finalUrl, coverUrl, title });
    return image ? { pageUrl: raw, image } : { pageUrl: raw, error: "No public full-size image was found on this detail page" };
  } catch (error) {
    return { pageUrl: raw, error: "Could not read this image page (" + (error?.status || "unavailable") + ")" };
  }
}

export async function POST(request) {
  try { await guardProxyRequest(request, "discovery"); }
  catch (error) { return securityErrorResponse(error, "Image lookup unavailable"); }
  let data;
  try { data = await request.json(); }
  catch { return NextResponse.json({ error: "Expected JSON list of pages" }, { status: 400, headers: NO_STORE }); }
  const pages = Array.isArray(data?.pages) ? data.pages : [];
  if (!pages.length || pages.length > MAX_PAGES || pages.some((p) => typeof p?.url !== "string")) {
    return NextResponse.json({ error: "Select between 1 and 8 image pages" }, { status: 400, headers: NO_STORE });
  }
  const results = [];
  // Maximum two concurrent outbound requests; no broad automatic crawling.
  for (let i = 0; i < pages.length; i += 2) {
    const group = await Promise.all(pages.slice(i, i + 2).map(resolveOne));
    results.push(...group);
  }
  return NextResponse.json({ results }, { headers: NO_STORE });
}
