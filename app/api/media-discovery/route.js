import { NextResponse } from "next/server";
import { validatePublicUrl, readTextLimited } from "@/lib/server/safe-url";
import { fetchWithRegionFallback } from "@/lib/server/region-fallback.js";
import { guardProxyRequest, securityErrorResponse } from "@/lib/server/proxy-guard";
import { discoverMedia } from "@/lib/server/media-discovery.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_HTML_BYTES = 1_200_000;
const NO_STORE = { "Cache-Control": "no-store" };
const UA = "Mozilla/5.0 (compatible; VaultMediaDiscovery/1.0; +https://vault.example)";

export async function GET(request) {
  const rawUrl = new URL(request.url).searchParams.get("url");
  if (!rawUrl) return NextResponse.json({ error: "Missing page URL" }, { status: 400, headers: NO_STORE });
  try { await guardProxyRequest(request, "discovery"); }
  catch (error) { return securityErrorResponse(error, "Media discovery unavailable"); }

  const checked = await validatePublicUrl(rawUrl);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status, headers: NO_STORE });

  try {
    const response = await fetchWithRegionFallback(checked.url.href, {
      method: "GET",
      timeoutMs: 11_000,
      maxBytes: MAX_HTML_BYTES,
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/*;q=0.8,video/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    const finalUrl = response.url || checked.url.href;
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return NextResponse.json({ error: "Website returned HTTP " + response.status }, { status: 502, headers: NO_STORE });
    }

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (/^image\/(?!svg)/.test(contentType) || /^video\//.test(contentType)) {
      await response.body?.cancel().catch(() => {});
      const type = contentType.startsWith("image/") ? "image" : "video";
      const title = decodeURIComponent(new URL(finalUrl).pathname.split("/").pop() || type);
      return NextResponse.json({
        pageUrl: finalUrl,
        pageTitle: title,
        media: [{ url: finalUrl, type, title, sourcePage: finalUrl, sourceKind: "direct-media", thumbnail: type === "image" ? finalUrl : "", confidence: "high" }],
        counts: { videos: type === "video" ? 1 : 0, images: type === "image" ? 1 : 0 },
        filteredAds: 0, truncated: false,
      }, { headers: NO_STORE });
    }

    if (!/(html|xml)/i.test(contentType)) {
      await response.body?.cancel().catch(() => {});
      return NextResponse.json({ error: "This page is not HTML or supported media. Save its original link instead." }, { status: 415, headers: NO_STORE });
    }

    const html = await readTextLimited(response, MAX_HTML_BYTES);
    const result = discoverMedia(html, finalUrl);
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error) {
    return securityErrorResponse(error, "Could not inspect this page");
  }
}
