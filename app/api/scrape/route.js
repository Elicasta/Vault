import { NextResponse } from "next/server";

// In-memory cache (per serverless instance — fine for this use)
const cache = new Map();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url || !url.startsWith("http")) {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  // Cache hit
  const cached = cache.get(url);
  if (cached && Date.now() - cached.at < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    const result = { title: null, image: null, video: null, description: null };

    // ── Reddit special handling ──
    if (url.includes("reddit.com")) {
      const jsonUrl = url.replace(/\/?$/, "") + ".json";
      const r = await fetch(jsonUrl, { headers: { "User-Agent": "MediaVault/1.0" } });
      if (r.ok) {
        const j = await r.json();
        const post = j?.[0]?.data?.children?.[0]?.data;
        if (post) {
          result.title = post.title;
          result.image = post.thumbnail?.startsWith("http") ? post.thumbnail : null;
          if (post.preview?.images?.[0]?.source?.url) {
            result.image = post.preview.images[0].source.url.replace(/&amp;/g, "&");
          }
          // Reddit hosted video
          const rv = post.media?.reddit_video || post.secure_media?.reddit_video;
          if (rv?.fallback_url) {
            result.video = rv.fallback_url.split("?")[0];
          }
        }
        cache.set(url, { at: Date.now(), data: result });
        return NextResponse.json(result);
      }
    }

    // ── Generic OG scraping ──
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);

    const html = (await res.text()).slice(0, 200000); // first 200KB is enough for head tags

    const meta = (prop) => {
      const patterns = [
        new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i"),
        new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`, "i"),
        new RegExp(`<meta[^>]+name=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i"),
        new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${prop}["']`, "i"),
      ];
      for (const p of patterns) {
        const m = html.match(p);
        if (m) return decodeEntities(m[1]);
      }
      return null;
    };

    result.title = meta("og:title") || meta("twitter:title") || extractTitle(html);
    result.image = meta("og:image") || meta("og:image:url") || meta("twitter:image");
    result.video =
      meta("og:video") || meta("og:video:url") || meta("og:video:secure_url") ||
      meta("twitter:player:stream");
    result.description = meta("og:description") || meta("description");

    // Some sites (mixkit) embed direct mp4 in <video> or <source> tags
    if (!result.video) {
      const videoMatch =
        html.match(/<source[^>]+src=["']([^"']+\.mp4[^"']*)["']/i) ||
        html.match(/<video[^>]+src=["']([^"']+\.mp4[^"']*)["']/i);
      if (videoMatch) result.video = decodeEntities(videoMatch[1]);
    }

    // Resolve relative URLs
    const base = new URL(url);
    const absolutize = (u) => {
      if (!u) return null;
      try { return new URL(u, base).href; } catch { return u; }
    };
    result.image = absolutize(result.image);
    result.video = absolutize(result.video);

    cache.set(url, { at: Date.now(), data: result });
    return NextResponse.json(result);
  } catch (err) {
    const fallback = { title: null, image: null, video: null, error: err.message };
    cache.set(url, { at: Date.now(), data: fallback });
    return NextResponse.json(fallback);
  }
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? decodeEntities(m[1].trim()) : null;
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}
