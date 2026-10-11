import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { withDiscreetMediaLabels } from "../lib/private-media-labels.mjs";

const read = path => fs.readFileSync(path, "utf8");

test("adult discovery is reached through a separate route and explicit 18+ consent", () => {
  const page = read("app/nsfw/page.jsx");
  const view = read("components/vault-v2/VaultV2.jsx");
  assert.match(page, /route="nsfw"/);
  assert.match(view, /router\.push\("\/nsfw"\)/);
  assert.match(view, /I confirm that I am at least 18/);
  assert.match(view, /disabled=\{!nsfwAcknowledged\}/);
  assert.match(view, /sessionStorage\.setItem\("vault-nsfw-consent-v1", "yes"\)/);
  assert.match(view, /initialMode=\{route === "nsfw" \? "nsfw" : "regular"\}/);
});

test("NSFW-sourced items are tagged and excluded from regular home shelves", () => {
  const browser = read("components/InAppBrowser.jsx");
  const view = read("components/vault-v2/VaultV2.jsx");
  const saved = withDiscreetMediaLabels({title:"Original",type:"link",tags:["nsfw","saved-url"]},true);
  assert.ok(saved.tags.includes("nsfw"), "discreet labels must preserve adult classification");
  assert.match(browser, /initialMode === "nsfw"[\s\S]*"nsfw"/);
  assert.match(view, /const displayItems = useMemo\(\(\) => resolvedItems\.filter\(item => !isNsfwTagged\(item\)\)/);
  assert.match(view, /const nsfwItems = useMemo\(\(\) => resolvedItems\.filter\(isNsfwTagged\)/);
  assert.match(view, /if \(route === "nsfw"\) return nsfwItems/);
});

test("adult browsing history is not written to standard persistent browser history", () => {
  const browser = read("components/InAppBrowser.jsx");
  assert.match(browser, /if \(initialMode === "nsfw"\) setHistory\(\[\]\)/);
  assert.match(browser, /if \(initialMode !== "nsfw"\) try \{ localStorage\.setItem\(HISTORY_KEY/);
  assert.match(browser, /if \(initialMode !== "nsfw"\) try \{ localStorage\.removeItem\(HISTORY_KEY/);
  assert.match(browser, /initialMode === "nsfw" \? <details className="vv-search-preferences"/);
});

test("mixed search results show source thumbnails and direct playable videos", () => {
  const browser = read("components/InAppBrowser.jsx");
  const preview = read("components/SearchResultPreview.jsx");
  const styles = read("components/InAppBrowser.css");
  assert.match(browser, /<SearchResultPreview result=\{r\} index=\{index\} onPreview=\{onPreview\}/);
  assert.match(preview, /getThumbCandidates\(source\)/);
  assert.match(preview, /IntersectionObserver/);
  assert.match(preview, /\/api\/metadata\?url=/);
  assert.match(preview, /\/api\/media\?url=/);
  assert.match(preview, /<video className="vv-result-inline-video"/);
  assert.match(preview, /controls playsInline autoPlay preload="metadata"/);
  assert.match(styles, /\.vv-result-kind-badge/);
  assert.match(browser, /savedUrl===r\.url\?"Saved ✓":"Save"/);
});

test("search from Discover starts web results directly rather than requiring a second workflow", () => {
  const view = read("components/vault-v2/VaultV2.jsx");
  const browser = read("components/InAppBrowser.jsx");
  assert.match(view, /aria-label="Search the web"/);
  assert.match(view, /onSubmit=\{\(event\)=>\{event\.preventDefault\(\);setBrowserOpen\(true\)\}\}/);
  assert.match(browser, /if \(isLikelyUrl\(q\)\) openUrl\(q\)/);
  assert.match(browser, /else runSearch\(q\)/);
  assert.match(browser, /searchQuery \? "minmax\(0,1fr\)"/);
});
