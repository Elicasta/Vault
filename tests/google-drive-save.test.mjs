import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { googleDriveFileName, vaultDriveSource, SAVE_TO_DRIVE_EXTENSION_URL } from "../lib/google-drive-save.mjs";

test("Google Drive fallback saves an actual image or video source via Vault's authenticated media route", () => {
  assert.equal(vaultDriveSource("https://cdn.example.org/clip.mp4?sig=abc", "video"), "/api/stream?url=https%3A%2F%2Fcdn.example.org%2Fclip.mp4%3Fsig%3Dabc");
  assert.equal(vaultDriveSource("https://cdn.example.org/photo.webp", "image"), "/api/media?url=https%3A%2F%2Fcdn.example.org%2Fphoto.webp");
  for (const url of ["javascript:alert(1)", "file:///etc/passwd", "data:image/png;base64,aaaa", "https://user:pass@example.org/movie.mp4", ""]) {
    assert.equal(vaultDriveSource(url, "video"), "");
  }
  assert.equal(vaultDriveSource("https://cdn.example.org/clip.mp4", "link"), "");
});

test("Google Drive names preserve file types but never filesystem paths or control characters", () => {
  assert.equal(googleDriveFileName("https://cdn.example.org/movie.webm", "Opening", "video"), "Opening.webm");
  assert.equal(googleDriveFileName("https://cdn.example.org/img.jpg", "Family Photo", "image"), "Family Photo.jpg");
  assert.equal(googleDriveFileName("https://cdn.example.org/video.mp4", "wedding/2026:recap", "video"), "wedding-2026-recap.mp4");
  assert.equal(googleDriveFileName("invalid", "", "video"), "Vault video.mp4");
});

test("Google's verified Save to Drive API is used, without any custom credential collection", () => {
  const source=fs.readFileSync("components/GoogleDriveSave.jsx","utf8");
  assert.match(source,/https:\/\/apis\.google\.com\/js\/platform\.js/);
  assert.match(source,/window\.___gcfg/);
  assert.match(source,/parsetags: "explicit"/);
  assert.match(source,/drive\.render\(mount\.current/);
  assert.match(source,/sitename: "Vault Media Library"/);
  assert.match(source,/vaultDriveSource\(url, type\)/);
  assert.doesNotMatch(source,/type="password"/i);
  assert.ok(SAVE_TO_DRIVE_EXTENSION_URL.includes("gmbmikajjgmnabiglmofipeabaddhgne"));
});

test("Drive fallback is visible in media preview and original gallery image", () => {
  const modal=fs.readFileSync("components/VideoPreviewModal.jsx","utf8");
  const gallery=fs.readFileSync("components/GalleryImporter.jsx","utf8");
  const browser=fs.readFileSync("components/InAppBrowser.jsx","utf8");
  const media=fs.readFileSync("components/MediaDiscoveryPanel.jsx","utf8");
  assert.match(modal,/<GoogleDriveSave/);
  assert.match(modal,/active\?\.url \|\| ""/);
  assert.match(gallery,/<GoogleDriveSave/);
  assert.match(browser,/Sign in on original website/);
  assert.match(browser,/onLoginToWebsite=\{\(\) => openExternal\(currentUrl\)\}/);
  assert.match(media,/onLoginToWebsite/);
  assert.match(media,/cookies cannot be transferred|cookies cannot be imported|cookies cannot be transferred to Vault/i);
});
