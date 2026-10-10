# File-first gallery import (HTTP 403 recovery)

When a source gallery blocks automated inspection, Vault **cannot** promise to display or retrieve its original image binaries from the server. This workflow is intentionally different from browser-captured URLs: it imports **files** saved by the user directly from the original website, without contacting the blocked host through Vault again.

## On iPhone / iPad
1. Open the original gallery in Safari.
2. Use the original website's permitted **Save Image**, **Save to Photos**, or **Save to Files** option.
3. Return to Vault → Import Media. Tap **Choose saved images** (at the top or alongside a blocked gallery); select multiple files from Photos/Files.
4. Vault uploads the selected files into private Supabase Storage in the active collection (up to 50 files per operation, 50 MB per file).
5. Where iOS allows **Copy Image**, try **Paste copied image**. Clipboard permissions vary; use the file picker if not supported.

## On desktop
Use Save Image As on the original website, then drag images into the Import Media upload zone, select multiple files, or copy an actual image and choose Paste copied image. Do not paste only its URL.

## Error behavior
- Category/gallery Back and Forward remain available.
- An upstream 403 doesn't prevent file imports.
- Gallery browsing falls back to the same file-first actions without site-specific adapters.
- Selecting original files guarantees permanent copies only when the upload itself succeeds; image copyright and site permissions still apply.
- Saving a URL or a cover does **not** make an original image available when its host refuses remote access.

## Validation
Run `node --test tests/file-first-gallery-recovery.test.mjs`, the full test suite, lint, TypeScript and a production build. The interactive Safari clipboard behavior and the site's real image Save options still require manual device tests.

Preview only: do not merge to production without user verification.
