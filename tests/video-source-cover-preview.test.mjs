import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { isPlayableVideoSource, isVideoFileUrl, uniqueVideoSources, prepareVideoToSave } from "../lib/video-source-resolver.mjs";
import { buildVaultMediaItem } from "../lib/media-capture-import.mjs";
import { isHiddenLibraryItem, withLibraryVisibility, HIDDEN_LIBRARY_TAG } from "../lib/library-visibility.mjs";
import { discoverMedia } from "../lib/server/media-discovery.mjs";

const clip = { type: "video", url: "https://example.com/videos/scene-01", sourcePage: "https://example.com/gallery", title: "Scene", thumbnail: "https://cdn.example.com/frame.jpg" };
const source = { url: "https://cdn.example.com/scene-01.mp4?signature=123", sourceKind: "video-element", type: "video" };

test("video page and cover image cannot masquerade as playable video URLs", () => {
  assert.equal(isPlayableVideoSource(clip), false);
  assert.equal(isVideoFileUrl(clip.thumbnail), false);
  assert.equal(isPlayableVideoSource({ url: clip.thumbnail, type: "video" }), false);
  assert.equal(isPlayableVideoSource(source), true);
  assert.throws(() => prepareVideoToSave(clip), /playable video URL/);
  assert.throws(() => buildVaultMediaItem({ url: clip.thumbnail, type: "video" }, "", (url)=>url, ()=>""), /cover image/);
});

test("video stream URL is saved as actual URL while cover image stays thumbnail", () => {
  const resolved = prepareVideoToSave(clip, source);
  assert.equal(resolved.type, "video");
  assert.equal(resolved.url, source.url);
  assert.equal(resolved.thumbnail, clip.thumbnail);
  const saved = buildVaultMediaItem(resolved, "Clips", (url)=>"key:"+url, ()=>"direct");
  assert.equal(saved.url, source.url);
  assert.equal(saved.key, "key:"+source.url);
  assert.equal(saved.thumbnail, clip.thumbnail);
  assert.equal(saved.folder, "Clips");
  assert.match(saved.note, /Source page:/);
});

test("multi-stream selector keeps video only and preserves direct signed query strings", () => {
  const output = uniqueVideoSources([
    { url: "https://cdn.example.com/poster.jpg", sourceKind: "social-image", type: "video" },
    { url: "https://cdn.example.com/movie.m3u8?token=abc", sourceKind: "video-source", type: "video" },
    { url: "https://cdn.example.com/movie.m3u8?token=abc", sourceKind: "video-source", type: "video" },
    { url: "https://cdn.example.com/track", mimeType: "video/mp4", sourceKind: "browser-network-capture", type: "video" },
    { url: "file:///etc/passwd", type: "video" },
  ]);
  assert.equal(output.length, 2);
  assert.equal(output[0].url, "https://cdn.example.com/movie.m3u8?token=abc");
  assert.equal(output[1].url, "https://cdn.example.com/track");
});

test("structured video content URL outranks a mere page permalink", () => {
  const html = '<script type="application/ld+json">' + JSON.stringify({
    "@type":"VideoObject", "name":"One",
    "url":"https://example.com/videos/one",
    "contentUrl":"https://cdn.example.com/one.webm",
    "thumbnailUrl":"https://cdn.example.com/one.jpg"
  }) + "</script>";
  const candidates = discoverMedia(html,"https://example.com/videos/one").media;
  const video = candidates.find((entry)=>entry.type==="video"&&entry.url.endsWith("/one.webm"));
  assert.ok(video);
  assert.equal(video.thumbnail, "https://cdn.example.com/one.jpg");
});

test("hidden library item survives with original URL, cover, tags and collection; restore reversible", () => {
  const item={...clip,key:"K",folder:"Favorites",tags:["worship","lighting"]};
  const hidden=withLibraryVisibility(item,true);
  assert.ok(isHiddenLibraryItem(hidden));
  assert.equal(hidden.tags.filter((tag)=>tag===HIDDEN_LIBRARY_TAG).length,1);
  assert.equal(hidden.url,item.url);
  assert.equal(hidden.thumbnail,item.thumbnail);
  assert.equal(hidden.folder,item.folder);
  assert.ok(hidden.tags.includes("worship"));
  const stillHidden=withLibraryVisibility(hidden,true);
  assert.equal(stillHidden.tags.filter((tag)=>tag===HIDDEN_LIBRARY_TAG).length,1);
  const restored=withLibraryVisibility(hidden,false);
  assert.equal(isHiddenLibraryItem(restored),false);
  assert.deepEqual(restored.tags,item.tags);
});

test("media preview has player/cover/source choice and protected source resolver", () => {
  const modal=fs.readFileSync("components/VideoPreviewModal.jsx","utf8");
  const panel=fs.readFileSync("components/MediaDiscoveryPanel.jsx","utf8");
  const route=fs.readFileSync("app/api/video-sources/route.js","utf8");
  assert.match(modal,/VideoPlayer/);
  assert.match(modal,/\/api\/stream\?url=/);
  assert.match(modal,/video \+ cover/);
  assert.match(modal,/type="video"/);
  assert.match(panel,/prepareVideoToSave/);
  assert.match(panel,/resolveForSave/);
  assert.match(panel,/setPreviewItem\(item\)/);
  assert.match(panel,/onSave=\{saveFromPreview\}/);
  assert.match(route,/guardProxyRequest\(request, "discovery"\)/);
  assert.match(route,/validatePublicUrl\(target\)/);
  assert.match(route,/uniqueVideoSources/);
  assert.doesNotMatch(route,/(?<!safe)\bfetch\s*\(/);
});

test("audio-only playback can hide from Library but not destroy saved record", () => {
  const vault=fs.readFileSync("components/vault-v2/VaultV2.jsx","utf8");
  const player=fs.readFileSync("components/Player.jsx","utf8");
  const drawer=fs.readFileSync("components/vault-v2/DetailDrawer.jsx","utf8");
  assert.match(player,/Audio is available, but this browser could not decode the video track/);
  assert.match(player,/onRemoveFromLibrary/);
  assert.match(vault,/withLibraryVisibility\(item, hidden\)/);
  assert.match(vault,/items\.filter\(\(item\) => !isHiddenLibraryItem\(item\)\)/);
  assert.match(vault,/hiddenItems\.map/);
  assert.match(vault,/Restore/);
  assert.match(drawer,/Remove from Library/);
});
