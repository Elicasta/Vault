// Cap open-ended direct-media range reads so a relay cannot hold a full large file.
// HLS manifests, segments and encryption keys keep their original Range headers.
export const RELAY_RANGE_CHUNK_BYTES = 16 * 1024 * 1024;

export function boundedMediaRange(range, rawUrl, chunkBytes = RELAY_RANGE_CHUNK_BYTES) {
  if (!range) return null;
  let pathname;
  try { pathname = new URL(rawUrl).pathname; } catch { return range; }
  if (!/\.(?:mp4|m4v|mov|webm|ogv|mp3|m4a|aac|ogg)$/i.test(pathname)) return range;
  const match = /^bytes=(\d+)-(\d*)$/i.exec(range.trim());
  if (!match || !Number.isSafeInteger(chunkBytes) || chunkBytes < 1) return range;
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : Infinity;
  if (!Number.isSafeInteger(start) || start < 0 || (end !== Infinity && (!Number.isSafeInteger(end) || end < start))) return range;
  const capped = Math.min(end, start + chunkBytes - 1);
  if (!Number.isSafeInteger(capped)) return range;
  return `bytes=${start}-${capped}`;
}
