import { NextResponse } from "next/server";
import { safeFetch, validatePublicUrl, readTextLimited } from "@/lib/server/safe-url";
import { fetchWithRegionFallback } from "@/lib/server/region-fallback.js";
import { guardProxyRequest, securityErrorResponse } from "@/lib/server/proxy-guard";
import { discoverMedia, discoverEmbeddedPlayerUrls } from "@/lib/server/media-discovery.mjs";
import { uniqueVideoSources, isVideoFileUrl } from "@/lib/video-source-resolver.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const HTML_LIMIT = 1_200_000;
const CACHE = { "Cache-Control": "no-store" };

// Resolve ONE selected video card's origin page, not the entire result gallery.
// Return selectable direct streams. Never silently map a video cover to a stream.
export async function GET(request) {
  const target = new URL(request.url).searchParams.get("url");
  if (!target) return NextResponse.json({ error: "Missing video or post URL" }, { status: 400, headers: CACHE });
  try { await guardProxyRequest(request, "discovery"); }
  catch (error) { return securityErrorResponse(error, "Video source lookup unavailable"); }

  const checked = await validatePublicUrl(target);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status, headers: CACHE });

  if (isVideoFileUrl(checked.url.href)) {
    return NextResponse.json({
      pageUrl: checked.url.href, sources: uniqueVideoSources([{ url: checked.url.href, type: "video", sourceKind: "direct-file" }]),
      resolution: "direct",
    }, { headers: CACHE });
  }

  try {
    const upstream = await fetchWithRegionFallback(checked.url.href, {
      method: "GET", timeoutMs: 10_000, maxBytes: HTML_LIMIT,
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,video/*;q=0.8,*/*;q=0.5", "Accept-Language": "en-US,en;q=0.9" },
    });
    if (!upstream.ok) {
      await upstream.body?.cancel().catch(() => {});
      return NextResponse.json({ error: "This video page returned HTTP " + upstream.status }, { status: 502, headers: CACHE });
    }
    const finalUrl = upstream.url || checked.url.href;
    const mime = upstream.headers.get("content-type") || "";
    if (/^(?:video\/|application\/(?:x-mpegurl|vnd\.apple\.mpegurl))/i.test(mime)) {
      await upstream.body?.cancel().catch(() => {});
      return NextResponse.json({
        pageUrl: finalUrl,
        sources: uniqueVideoSources([{ url: finalUrl, type: "video", mimeType: mime, sourceKind: "direct-response" }]),
        resolution: "direct",
      }, { headers: CACHE });
    }
    if (!/(html|xml)/i.test(mime)) {
      await upstream.body?.cancel().catch(() => {});
      return NextResponse.json({ pageUrl: finalUrl, sources: [], resolution: "unavailable", reason: "This address is not a webpage or a video stream." }, { headers: CACHE });
    }

    const html = await readTextLimited(upstream, HTML_LIMIT);
    const discovered = discoverMedia(html, finalUrl);
    // Ignore video-page permalinks, image URLs, adverts, and embeds; only
    // independently identified video files can become the saved media URL.
    const direct = discovered.media.filter((entry) => entry.type === "video" && isVideoFileUrl(entry.url));
    const nestedSources = [];
    // Exactly one page deeper: if the selected post uses an iframe player,
    // inspect at most two explicit player embeds. Do not crawl off-page links
    // automatically or attempt to bypass a site's access controls.
    if (!direct.length) {
      const frames = discoverEmbeddedPlayerUrls(html, finalUrl, { limit: 2 });
      for (const frame of frames) {
        try {
          const checkedFrame = await validatePublicUrl(frame);
          if (!checkedFrame.ok) continue;
          const nested = await fetchWithRegionFallback(checkedFrame.url.href, {
            method: "GET", timeoutMs: 6000, maxBytes: HTML_LIMIT,
            headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml;q=0.9,video/*;q=0.8", Referer: new URL(finalUrl).origin + "/" },
          });
          const nestedMime = nested.headers.get("content-type") || "";
          if (!nested.ok) { await nested.body?.cancel().catch(() => {}); continue; }
          if (/^(?:video\/|application\/(?:x-mpegurl|vnd\.apple\.mpegurl))/i.test(nestedMime)) {
            nestedSources.push({ url: nested.url || frame, type: "video", mimeType: nestedMime, sourceKind: "direct-response" });
            await nested.body?.cancel().catch(() => {});
          } else if (/(html|xml)/i.test(nestedMime)) {
            const nestedHtml = await readTextLimited(nested, HTML_LIMIT);
            const inner = discoverMedia(nestedHtml, nested.url || frame);
            nestedSources.push(...inner.media.filter((entry) => entry.type === "video" && isVideoFileUrl(entry.url)));
          } else {
            await nested.body?.cancel().catch(() => {});
          }
        } catch { /* Embedded players may reject server inspection. */ }
      }
    }
    const sources = uniqueVideoSources([...direct, ...nestedSources],
      { sourcePage: finalUrl, title: discovered.pageTitle }).slice(0, 24);

    return NextResponse.json({
      pageUrl: finalUrl, title: discovered.pageTitle, sources,
      resolution: sources.length ? (nestedSources.length ? "nested-player" : sources.length === 1 ? "found" : "choose") : "unavailable",
      reason: sources.length ? "" : "No public direct video stream was exposed by this post or its embedded player. Open the individual clip on its website or use Chrome Media Capture while playing it.",
    }, { headers: CACHE });
  } catch (error) {
    return securityErrorResponse(error, "Video source lookup failed");
  }
}
