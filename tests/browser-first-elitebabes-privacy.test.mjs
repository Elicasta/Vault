import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { isEliteBabesUrl, collectEliteBabesImages, enrichEliteBabesDiscovery } from "../lib/server/site-adapters/elitebabes.mjs";
import { hostnameForPage, siteNeedsBrowser, markSiteBrowserFirst, clearBrowserFirst, isWebsiteAccessDenial } from "../lib/browser-first-fallback.mjs";
import { withDiscreetMediaLabels, makePrivateMediaLabel } from "../lib/private-media-labels.mjs";

const TARGET = "https://www.elitebabes.com/metart-polly-yangs-in-rose-serenity-1-123409/";

test("EliteBabes adapter recognizes every site page and rejects lookalike domains", () => {
  assert.equal(isEliteBabesUrl(TARGET), true);
  assert.equal(isEliteBabesUrl("https://elitebabes.com/other-page/"), true);
  assert.equal(isEliteBabesUrl("https://cdn.elitebabes.com/gallery/"), true);
  for (const url of [
    "https://elitebabes.com.evil.example/gallery",
    "https://other-elitebabes.com/gallery",
    "https://random.example/gallery",
    "file:///site/gallery",
  ]) assert.equal(isEliteBabesUrl(url), false, url);
});

test("site adapter identifies image originals without relabeling page links as images", () => {
  const html = [
    '<a class="gallery" href="/photos/original-one.jpg"><img src="/thumb/one.webp" alt="One"></a>',
    '<a data-fancybox="photos" href="/photos/original-two.webp"><img srcset="/thumb/two-120.jpg 120w,/thumb/two-640.jpg 640w" alt="Two"></a>',
    '<a href="/gallery/next-page"><img src="/thumb/three.webp" alt="not-an-image-url"></a>',
    '<a href="javascript:alert(1)"><img src="/thumb/four.webp"></a>',
    '<a href="/photos/original-one.jpg"><img src="/thumb/duplicate.webp"></a>',
  ].join("");
  const images = collectEliteBabesImages(html, TARGET);
  assert.ok(images.some(item => item.url === "https://www.elitebabes.com/photos/original-one.jpg"));
  assert.ok(images.some(item => item.url === "https://www.elitebabes.com/photos/original-two.webp"));
  assert.equal(images.find(item => item.url.endsWith("original-two.webp"))?.thumbnail,
    "https://www.elitebabes.com/thumb/two-640.jpg");
  assert.ok(!images.some(item => item.url.includes("next-page")));
  assert.ok(!images.some(item => item.url.startsWith("javascript:")));
  assert.equal(images.filter(item => item.url.endsWith("original-one.jpg")).length, 1);
  assert.equal(collectEliteBabesImages(html, "https://other.example/gallery").length, 0);
});

test("adapter merges gallery originals with generic public media while retaining linked image pages", () => {
  const page = {
    media: [{ url: "https://www.elitebabes.com/thumb/one.webp", type: "image", thumbnail: "", title: "Thumbnail" }],
    imagePages: [{ url: TARGET + "page-2", thumbnail: "https://cdn.example/cover.jpg" }],
    galleryDetected: false, counts: { images: 1, videos: 0 }
  };
  const original = '<a class="lightbox" href="/photos/large.jpg"><img src="/thumb/one.webp"></a>';
  const enriched = enrichEliteBabesDiscovery(page, original, TARGET);
  assert.equal(enriched.siteAdapter, "elitebabes");
  assert.equal(enriched.media.length, 2);
  assert.equal(enriched.imagePages.length, 1);
  assert.equal(enriched.counts.images, 2);
  assert.equal(enrichEliteBabesDiscovery(page, original, "https://example.org/"), page);
});

function fakeStorage() {
  const state = new Map();
  return {
    getItem: key => state.has(key) ? state.get(key) : null,
    setItem: (key, value) => state.set(key, value),
  };
}
test("403 browser-first fallback remembers only the host for this browser session", () => {
  const store = fakeStorage();
  const site = "https://www.elitebabes.com/example?private=1";
  assert.equal(hostnameForPage(site), "www.elitebabes.com");
  assert.equal(siteNeedsBrowser(site, store), false);
  assert.equal(markSiteBrowserFirst(site, store), true);
  assert.equal(siteNeedsBrowser("https://www.elitebabes.com/any-other-page", store), true);
  assert.equal(siteNeedsBrowser("https://example.com/any-other-page", store), false);
  assert.equal([...store.getItem("vault-browser-first-hosts-v1").matchAll(/private=1/g)].length, 0);
  clearBrowserFirst(site, store);
  assert.equal(siteNeedsBrowser(site, store), false);
});

test("only upstream access-denied response gets 403 browser-first status", () => {
  assert.equal(isWebsiteAccessDenial({ status: 403 }, { code: "SITE_ACCESS_DENIED" }), true);
  assert.equal(isWebsiteAccessDenial({ status: 403 }, { error: "Website returned HTTP 403" }), true);
  assert.equal(isWebsiteAccessDenial({ status: 403 }, { code: "AUTH_REQUIRED" }), false);
  assert.equal(isWebsiteAccessDenial({ status: 502 }, { code: "SITE_ACCESS_DENIED" }), false);
});

test("discreet labels replace saved titles and notes while preserving source URLs and media", () => {
  const item = { url: TARGET, sourcePage: TARGET, type: "link", title: "Gallery name",
    note: "Source page: " + TARGET, tags: ["saved-url", "private-details"], thumbnail: "https://example.org/thumb.jpg", siteName: "Site name" };
  const hidden = withDiscreetMediaLabels(item);
  assert.equal(hidden.title, "Web reference");
  assert.equal(hidden.note, "Personal reference.");
  assert.deepEqual(hidden.tags, ["saved-url", "private-reference"]);
  assert.equal(hidden.url, TARGET);
  assert.equal(hidden.sourcePage, TARGET);
  assert.equal(hidden.thumbnail, item.thumbnail);
  assert.equal(hidden.siteName, "Vault Import");
  assert.equal(withDiscreetMediaLabels(item, false), item);
  assert.equal(makePrivateMediaLabel("image"), "Visual reference");
  assert.equal(makePrivateMediaLabel("video"), "Video reference");
});

test("Vault shows browser-first collector inside its browser and import workspace, and privacy notes are enabled by default", () => {
  const browser = fs.readFileSync("components/InAppBrowser.jsx", "utf8");
  const discovery = fs.readFileSync("components/MediaDiscoveryPanel.jsx", "utf8");
  const importer = fs.readFileSync("components/ImportMediaWorkspace.jsx", "utf8");
  const gallery = fs.readFileSync("components/ImportGallerySection.jsx", "utf8");
  const api = fs.readFileSync("app/api/media-discovery/route.js", "utf8");
  assert.match(browser, /onSave=\{saveToVault\}/);
  assert.match(browser, /useState\(true\).*discreetLabels|discreetLabels, setDiscreetLabels\] = useState\(true\)/);
  assert.match(discovery, /siteNeedsBrowser/);
  assert.match(discovery, /markSiteBrowserFirst/);
  assert.match(discovery, /ELITEBABES.*VAULT GALLERY ADAPTER/);
  assert.match(discovery, /<CapturedMediaImport/);
  assert.match(importer, /<CapturedMediaImport/);
  assert.match(importer, /withDiscreetMediaLabels/);
  assert.match(gallery, /siteNeedsBrowser/);
  assert.match(api, /enrichEliteBabesDiscovery/);
  assert.match(api, /SITE_ACCESS_DENIED/);
  assert.ok(!api.includes("cookie:"));
});
