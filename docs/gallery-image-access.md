# Gallery image loading: HTTP 403 handling

When a gallery's last click opens a direct image, the public media URL can respond differently to the original website, Vault's server and a user's browser. HTTP 403 is a denial from the source site, not proof that Vault's page navigation failed.

Vault now:

1. Keeps category → gallery → photo breadcrumbs and Back/Forward available even if the photo returns 403.
2. Attempts the public image proxy, then a normal image request in the user's browser (no referrer), without transferring cookies or manipulating auth.
3. Shows an explicit unavailable state if both requests fail.
4. Offers Open original image/photo page, Copy image URL and Import Media for a permitted download.
5. Never treats a 403 on one direct image as proof that the entire website is blocked.
6. Distinguishes gallery covers from verified full-resolution originals.
7. Reports an image host's 403 as SOURCE_MEDIA_ACCESS_DENIED, not a generic server error.

## Test sequence

- In Vault Search or Import Media, open a category and then a gallery.
- Select an image; check Back, Forward and breadcrumbs after a failed image request.
- If the original website denies Vault's request, choose Open original. Images that require sign-in may open only in a browser session authorized by the source site.
- If the source offers a file you may download, save it on your device and upload through Import Media → Upload a permanent copy.

This feature does not bypass 403, login, DRM, regional restrictions, signed URL expiry, or website protections. For unresolved sites, collect the gallery URL and exact failing image URL to distinguish access denial from rendering problems.

These changes remain in a preview branch until verified on the user's specific gallery.
