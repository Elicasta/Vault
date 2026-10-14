import test from 'node:test';
import assert from 'node:assert/strict';
import { isMediaUrl, cropPosition } from '../lib/media-form.mjs';
test('media entry accepts complete web links and rejects malformed or credential-bearing links', () => {
  for (const url of ['https://example.com/photo.jpg', ' https://example.com/gallery?q=one ', 'http://localhost:3000/test']) assert.equal(isMediaUrl(url), true);
  for (const url of ['', 'https://', 'https://exa mple.com', 'javascript:alert(1)', 'file:///etc/passwd', 'https://name:secret@example.com']) assert.equal(isMediaUrl(url), false);
});
test('crop positions retain zero, clamp edges, and recover invalid values', () => {
  assert.equal(cropPosition(0), 0);
  assert.equal(cropPosition('0'), 0);
  assert.equal(cropPosition(100), 100);
  assert.equal(cropPosition(-10), 0);
  assert.equal(cropPosition(101), 100);
  assert.equal(cropPosition('invalid'), 50);
  assert.equal(cropPosition(Infinity), 50);
});
