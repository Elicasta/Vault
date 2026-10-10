import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { discoverMedia, canonicalMediaUrl } from "../lib/server/media-discovery.mjs";
import { parseCapturedMedia, cleanCapturedUrl, buildVaultMediaItem } from "../lib/media-capture-import.mjs";

const PAGE = "https://example.com/gallery";
const mediaHTML = [
  "<html><head><title>Gallery 2026</title>",
  '<meta property="og:image" content="https://cdn.example.com/cover.jpg">',
  '<meta property="og:video" content="https://cdn.example.com/main.mp4?utm_campaign=test&token=abc">',
  "</head><body>",
  '<video title="The performance" poster="https://cdn.example.com/poster.webp"><source type="video/mp4" src="https://cdn.example.com/show.mp4"></video>',
  '<video title="Second performance" src="/video-two.webm"></video>',
  '<div class="ad-slot"><video src="https://doubleclick.net/ads/preroll.mp4"></video></div>',
  '<a href="/videos/interesting-clip" title="Interesting clip"><img src="/thumb.png"></a>',
  '<img alt="Wide shot" srcset="/small.jpg 200w, /large.jpg 1200w">',
  '<img alt="Tracker" src="https://doubleclick.net/pixel.png">',
  '<img alt="Tiny" src="/small-icon.png" width="8" height="8">',
  '</body></html>'
].join("");

test("page extractor finds distinct video elements and one video card per source", () => {
  const result = discoverMedia(mediaHTML, PAGE);
  const urls = result.media.map((x) => x.url);
  assert.ok(urls.includes("https://cdn.example.com/show.mp4"));
  assert.ok(urls.includes("https://example.com/video-two.webm"));
  assert.ok(urls.includes("https://example.com/videos/interesting-clip"));
  assert.ok(urls.includes("https://cdn.example.com/main.mp4?token=abc"));
  assert.equal(new Set(urls).size, urls.length);
  assert.ok(result.counts.videos >= 4);
});

test("extractor keeps largest responsive image and excludes ads", () => {
  const result = discoverMedia(mediaHTML, PAGE);
  assert.ok(result.media.some((x) => x.url === "https://example.com/large.jpg" && x.type === "image"));
  assert.equal(result.media.some((x) => x.url.includes("doubleclick") || x.url.includes("preroll")), false);
  assert.equal(result.media.some((x) => x.url.endsWith("/small-icon.png")), false);
  assert.equal(result.media.some((x) => x.url.endsWith("/thumb.png")), false);
  assert.ok(result.counts.images >= 2);
});

test("canonical URLs collapse known video embeds and remove tracking, preserve signed params", () => {
  assert.equal(canonicalMediaUrl("https://youtu.be/dQw4w9WgXcQ?utm_source=newsletter", PAGE), "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(canonicalMediaUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ", PAGE), "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(canonicalMediaUrl("https://player.vimeo.com/video/1234", PAGE), "https://vimeo.com/1234");
  assert.equal(canonicalMediaUrl("file:///etc/passwd", PAGE), "");
  assert.equal(canonicalMediaUrl("http://localhost/admin", PAGE), "");
  assert.equal(canonicalMediaUrl("https://cdn.example.com/video.mp4?token=abc", PAGE), "https://cdn.example.com/video.mp4?token=abc");
});

test("structured page JSON can identify multiple individual assets", () => {
  const structured = JSON.stringify({ "@graph": [
    { "@type": "VideoObject", name: "One", contentUrl: "https://cdn.example.com/one.mp4", thumbnailUrl: "https://cdn.example.com/one.jpg" },
    { "@type": "VideoObject", name: "Two", contentUrl: "https://cdn.example.com/two.mp4", thumbnailUrl: "https://cdn.example.com/two.jpg" },
    { "@type": "ImageObject", name: "Photo", contentUrl: "https://cdn.example.com/photo.webp" },
  ] });
  const html = '<title>Catalog</title><script type="application/ld+json">' + structured + '</script>';
  const result = discoverMedia(html, PAGE);
  assert.equal(result.counts.videos, 2);
  assert.equal(result.counts.images, 1);
  assert.deepEqual(result.media.filter((x) => x.type === "video").map((x) => x.title).sort(), ["One", "Two"]);
});

test("scanner bounds output and ignores broken JSON-LD", () => {
  const html = "<script type='application/ld+json'>INVALID</script>" + Array.from({ length: 125 }, (_, i) => '<img src="https://cdn.example.com/' + i + '.jpg">').join("");
  const result = discoverMedia(html, PAGE, { limit: 20 });
  assert.equal(result.media.length, 20);
  assert.equal(result.truncated, true);
  assert.throws(() => discoverMedia("x", "javascript:alert('x')"), /Invalid public page URL/);
});

test("Chrome capture JSON and newline URL import deduplicates", () => {
  const batch = JSON.stringify({ format: "vault-media-capture-v1", items: [
    { url: "https://cdn.example.com/a.mp4?utm_source=ad&token=x", type: "video", title: "A", sourcePage: PAGE },
    { url: "https://cdn.example.com/a.mp4?token=x", type: "video", title: "Duplicate" },
    { url: "https://doubleclick.net/ads/preroll.mp4", type: "video" },
    { url: "file:///etc/passwd", type: "image" },
    { url: "https://cdn.example.com/gallery.webp", type: "image" },
  ] });
  const rows = parseCapturedMedia(batch, PAGE);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, "A");
  assert.equal(rows[1].type, "image");
  assert.equal(cleanCapturedUrl("javascript:alert(1)"), "");
  assert.equal(parseCapturedMedia("https://cdn.example.com/a.mp4\nhttps://cdn.example.com/b.jpg").length, 2);
});

test("saving individual assets keeps URL, folder and origin note", () => {
  const item = buildVaultMediaItem({
    type: "video", url: "https://cdn.example.com/clip.mp4", title: "The clip",
    thumbnail: "https://cdn.example.com/frame.jpg", sourcePage: PAGE
  }, "Inspiration", (url) => "k_" + url.length, () => "custom");
  assert.equal(item.url, "https://cdn.example.com/clip.mp4");
  assert.equal(item.folder, "Inspiration");
  assert.equal(item.type, "video");
  assert.match(item.note, /Source page: https:\/\/example\.com\/gallery/);
  assert.equal(item.thumbnail, "https://cdn.example.com/frame.jpg");
  assert.equal(item.isVaultItem, true);
});

test("UI exposes mobile sheet recovery, media switch, bulk selection", () => {
  const browser = fs.readFileSync("components/InAppBrowser.jsx", "utf8");
  const css = fs.readFileSync("components/InAppBrowser.css", "utf8");
  const media = fs.readFileSync("components/MediaDiscoveryPanel.jsx", "utf8");
  const server = fs.readFileSync("app/api/media-discovery/route.js", "utf8");
  assert.match(browser, /<MediaDiscoveryPanel/);
  assert.match(browser, /viewMode === "media"/);
  assert.match(fs.readFileSync("components/vault-v2/VaultV2.jsx", "utf8"), /existingItems=\{displayItems\}/);
  assert.match(browser, /keyboardOpen && isMobile \? "none" : "block"/);
  assert.match(browser, /showQuickSave/);
  assert.match(css, /max-height:\s*min\(55dvh,440px\)/);
  assert.match(media, /Save " \+ selectedCount \+ " to Vault"/);
  assert.match(media, /parseCapturedMedia/);
  assert.match(server, /guardProxyRequest\(request, "discovery"\)/);
  assert.match(server, /validatePublicUrl\(rawUrl\)/);
  assert.doesNotMatch(server, /(?<!safe)\bfetch\s*\(/);
});

test("extension reads network media without modifying network requests", () => {
  const manifest = JSON.parse(fs.readFileSync("extensions/vault-media-capture/manifest.json", "utf8"));
  const background = fs.readFileSync("extensions/vault-media-capture/background.js", "utf8");
  const popup = fs.readFileSync("extensions/vault-media-capture/popup.js", "utf8");
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.permissions.includes("webRequest"));
  assert.equal(manifest.permissions.includes("webRequestBlocking"), false);
  assert.match(background, /onBeforeRequest\.addListener/);
  assert.match(background, /onHeadersReceived\.addListener/);
  assert.match(popup, /vault-media-capture-v1/);
});
