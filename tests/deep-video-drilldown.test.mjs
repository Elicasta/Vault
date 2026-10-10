import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { discoverMedia, discoverEmbeddedPlayerUrls } from "../lib/server/media-discovery.mjs";
import { isPlayableVideoSource, prepareVideoToSave } from "../lib/video-source-resolver.mjs";

test("image-only gallery cards become navigable video pages, not saved images or fake streams", () => {
  const page = "https://demo.example/gallery";
  const html = [
    "<title>Video Gallery</title>",
    '<a href="/post/clip-1" class="gallery-item"><img alt="First clip" src="/covers/one.webp"></a>',
    '<a href="/content/clip-2"><img alt="Second clip" src="/covers/two.webp"></a>',
    '<a href="/login"><img alt="Login" src="/covers/login.webp"></a>',
    '<a href="https://doubleclick.net/ads/preroll"><img src="/covers/ad.webp"></a>',
    '<a href="/image.jpg"><img alt="Photo" src="/covers/photo.webp"></a>',
  ].join("");
  const result = discoverMedia(html, page);
  assert.equal(result.videoPages.length, 2);
  const urls = result.videoPages.map((p) => p.url);
  assert.deepEqual(urls, ["https://demo.example/post/clip-1", "https://demo.example/content/clip-2"]);
  assert.equal(result.videoPages[0].thumbnail, "https://demo.example/covers/one.webp");
  assert.equal(result.videoPages[1].confidence, "possible-detail");
  assert.equal(result.media.some((m) => m.url === result.videoPages[0].thumbnail), false, "Cover belongs to video page, not standalone image result");
  assert.equal(result.media.some((m) => m.url === result.videoPages[1].thumbnail), false);
  assert.ok(!result.videoPages.some((p) => /login|doubleclick/.test(p.url)));
  assert.equal(isPlayableVideoSource({ type: "video", url: result.videoPages[0].url }), false);
});

test("explicit video card opens its post while preserving poster art", () => {
  const page = "https://demo.example/gallery";
  const html = '<a href="/videos/clip-3" aria-label="Watch the clip"><img alt="Clip three" src="/poster.jpg"></a>';
  const result = discoverMedia(html, page);
  assert.equal(result.videoPages.length, 1);
  assert.equal(result.videoPages[0].url, "https://demo.example/videos/clip-3");
  assert.equal(result.videoPages[0].thumbnail, "https://demo.example/poster.jpg");
  assert.equal(result.media.some((m) => m.url === "https://demo.example/videos/clip-3" && m.type === "video"), true);
});

test("individual post exposes a playable MP4, paired with listing cover", () => {
  const postUrl = "https://demo.example/post/clip-1";
  const html = '<video controls poster="/frame.webp"><source src="https://media.demo.example/clip-1.mp4?token=abc" type="video/mp4"></video>';
  const result = discoverMedia(html, postUrl);
  const source = result.media.find((m) => m.url.includes("/clip-1.mp4"));
  assert.ok(source);
  const saved = prepareVideoToSave({ type: "video", url: postUrl, thumbnail: "https://demo.example/gallery-cover.webp", title: "Clip one", sourcePage: "https://demo.example/gallery" }, source);
  assert.equal(saved.url, "https://media.demo.example/clip-1.mp4?token=abc");
  assert.equal(saved.thumbnail, "https://demo.example/gallery-cover.webp");
});

test("scan safely recognizes only explicit video iframe and inline stream links", () => {
  const url = "https://demo.example/post/clip-1";
  const html = [
    '<iframe src="https://video.demo.example/embed/clip-1"></iframe>',
    '<iframe src="https://doubleclick.net/adserver/track"></iframe>',
    '<iframe src="http://localhost/admin/player"></iframe>',
    '<iframe src="https://video.demo.example/embed/clip-1"></iframe>',
    '<iframe src="/unrelated/about"></iframe>',
    '<script>const player = { file: "https://cdn.demo.example/inside.m3u8?sig=abc", poster: "https://cdn.demo.example/cover.webp" };</script>',
  ].join("");
  const frames = discoverEmbeddedPlayerUrls(html, url);
  assert.deepEqual(frames, ["https://video.demo.example/embed/clip-1"]);
  const media = discoverMedia(html, url).media;
  assert.ok(media.some((m) => m.type === "video" && m.url === "https://cdn.demo.example/inside.m3u8?sig=abc"));
  assert.equal(media.some((m) => m.type === "video" && /\.webp/.test(m.url)), false);
});

test("browser stays on Vault origin when drilling down and has a real back stack", () => {
  const browser = fs.readFileSync("components/InAppBrowser.jsx", "utf8");
  const panel = fs.readFileSync("components/MediaDiscoveryPanel.jsx", "utf8");
  const css = fs.readFileSync("components/InAppBrowser.css", "utf8");
  assert.match(browser, /const exploreVideoPage/);
  assert.match(browser, /const backVideoPage/);
  assert.match(browser, /setVideoTrail\(\(old\) => \[\.\.\.old/);
  assert.match(browser, /<MediaDiscoveryPanel/);
  assert.match(browser, /onExploreVideoPage=\{exploreVideoPage\}/);
  assert.match(browser, /Back to listing/);
  assert.match(panel, /Explore video pages/);
  assert.match(panel, /onExploreVideoPage\?\.\(page\)/);
  assert.match(panel, /Searching this video page for the playable stream/);
  assert.match(panel, /Save actual video \+ cover/);
  assert.match(css, /vv-video-pages-grid/);
  assert.match(css, /vv-video-detail-focus/);
});

test("source resolver limits automatic crawl to selected page and explicit nested video players", () => {
  const route = fs.readFileSync("app/api/video-sources/route.js", "utf8");
  assert.match(route, /discoverEmbeddedPlayerUrls\(html, finalUrl, \{ limit: 2 \}\)/);
  assert.match(route, /validatePublicUrl\(frame\)/);
  assert.match(route, /safeFetch\(checkedFrame\.url\.href/);
  assert.match(route, /guardProxyRequest\(request, "discovery"\)/);
  assert.match(route, /nestedSources/);
  assert.doesNotMatch(route, /Promise\.all\(.*frames/);
});
