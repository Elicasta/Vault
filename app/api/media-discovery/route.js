import { NextResponse } from "next/server";
import { validatePublicUrl, readTextLimited } from "@/lib/server/safe-url";
import { fetchWithRegionFallback } from "@/lib/server/region-fallback.js";
import { guardProxyRequest, securityErrorResponse } from "@/lib/server/proxy-guard";
import { discoverMedia } from "@/lib/server/media-discovery.mjs";
import { isEliteBabesUrl, enrichEliteBabesDiscovery } from "@/lib/server/site-adapters/elitebabes.mjs";
import { classifyKnownMime, normalizedMime, inspectAmbiguousBody } from "@/lib/server/media-response-classifier.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_HTML_BYTES = 1_200_000;
// Permit enough response bytes to sniff a real file with an inaccurate MIME,
// but still cap HTML decoding at MAX_HTML_BYTES.
const MAX_MEDIA_RESPONSE_BYTES = 20 * 1024 * 1024;
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
      maxBytes: MAX_MEDIA_RESPONSE_BYTES,
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/*;q=0.8,video/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    const finalUrl = response.url || checked.url.href;
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      const denied = response.status === 401 || response.status === 403 || response.status === 451;
      const tailored = isEliteBabesUrl(checked.url.href);
      return NextResponse.json({
        error: denied
          ? (tailored ? "EliteBabes did not allow Vault's server to read this page (HTTP " + response.status + "). Open the original site in your browser, then use Chrome Media Capture or save the page URL." : "The website denied automated inspection (HTTP " + response.status + "). Open it in your browser, or save its URL instead.")
          : "Website returned HTTP " + response.status,
        code: denied ? "SITE_ACCESS_DENIED" : "UPSTREAM_ERROR",
        sourceUrl: checked.url.href, browserCaptureSupported: tailored,
      }, { status: denied ? 403 : 502, headers: NO_STORE });
    }

    const contentType = normalizedMime(response.headers.get("content-type"));
    let kind = classifyKnownMime(contentType);
    let html = "";
    // Some public sites send a real HTML page as text/plain or
    // application/octet-stream. Inspect bounded signatures, never guess
    // that every successful HTTP response is a readable HTML gallery.
    if (kind === "unknown") {
      const inspected = await inspectAmbiguousBody(response, MAX_HTML_BYTES);
      kind = inspected.kind;
      html = inspected.html || "";
    }
    if (kind === "image" || kind === "video") {
      if (classifyKnownMime(contentType) !== "unknown") {
        await response.body?.cancel().catch(() => {});
      }
      const type = kind;
      const rawName = new URL(finalUrl).pathname.split("/").pop() || type;
      let title=rawName;
      try{title=decodeURIComponent(rawName);}catch{}
      return NextResponse.json({
        pageUrl: finalUrl,
        pageTitle: title,
        media: [{ url: finalUrl, type, title, sourcePage: finalUrl, sourceKind: "direct-media",
          thumbnail: type === "image" ? finalUrl : "", confidence: "high" }],
        counts: { videos: type === "video" ? 1 : 0, images: type === "image" ? 1 : 0 },
        filteredAds: 0, truncated: false,
      }, { headers: NO_STORE });
    }
    if (kind !== "html") {
      // Do not fall through and parse JSON, downloads or a bot challenge as
      // a photo gallery. Give the client a browser-first import action.
      return NextResponse.json({
        error: "This address didn't return a readable HTML gallery or a supported image/video file. " +
          "The website responded with " + (contentType || "an unspecified content type") +
          ". Open the original page or import a permitted downloaded file.",
        code: "SITE_NON_HTML",
        sourceUrl: checked.url.href,
        receivedType: contentType || "unknown",
        guidance: "Open the website in your browser. Save the URL, or use Vault Media Capture on desktop Chrome " +
          "and import the captured URLs. On iPhone, use the site's download action and upload a permanent copy.",
      }, { status: 415, headers: NO_STORE });
    }
    if (!html) html = await readTextLimited(response, MAX_HTML_BYTES);
    const result = enrichEliteBabesDiscovery(discoverMedia(html, finalUrl), html, finalUrl);
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error) {
    return securityErrorResponse(error, "Could not inspect this page");
  }
}
