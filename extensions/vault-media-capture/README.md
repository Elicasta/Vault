# Vault Media Capture — Chrome desktop

Vault can search public image/video pages and inspect their source links, but a website cannot inspect another site's private session or cross-origin network traffic. The optional Chrome companion observes media requests already made by the current browser tab, and supports clean visible-image screenshots. It does not bypass sign-in, paywalls, DRM, or website access controls.

## Install and capture links

1. Download the extension folder from this repository.
2. In desktop Chrome visit `chrome://extensions`, turn on Developer mode, and choose **Load unpacked**.
3. Select `extensions/vault-media-capture`.
4. Open any website and load the images/videos you want to save.
5. Open **Vault Media Capture**, choose **Scan page**, filter to Images or Videos, and select the items.
6. Click **Copy selected for Vault**.
7. In Vault → **Search** → browser/media collector, use **Import actual URLs from Chrome capture** to paste the copied `vault-media-capture-v1` JSON.

Captured links are stored in the extension's tab-scoped session storage for up to one hour (up to 200 links per tab), not automatically transferred to any cloud account. Some media URLs contain expiring access tokens and may stop working. Vault stores the actual media URL only when recognized as a file; video covers remain separate from video sources.

## Smart Image Capture

If a site renders an image on canvas or uses a temporary `blob:` / `data:` URL, a reusable public image link may not exist.

1. Open the image in desktop Chrome.
2. In the extension click **Capture main image**, or choose **Pick exact image**, click the image, and reopen the extension to capture.
3. Chrome saves a cropped PNG of the visible image element. Surrounding interface is excluded where possible; overlays and offscreen portions may still affect the capture.
4. In Vault → **Import Media** → **Upload a permanent copy**, choose the saved PNG. Vault stores the file in private Supabase Storage (subject to the per-file size limit).

Smart Capture creates a screenshot of displayed pixels, not necessarily the original full-resolution image. For original quality, prefer the website's Download action.

## Gallery importing without the Chrome extension

Vault → **Import Media** also supports the gallery workflow:

1. Paste the gallery page URL and choose a Collection or create one.
2. Press **Scan gallery**. Vault detects direct images and linked image-detail pages.
3. Use **Explore photo pages for originals** to inspect an individual photo's full-size link.
4. When a gallery is detected, choose **Import gallery** to scan up to six same-host gallery pages (160 media candidates maximum), dedupe and save the detected links in your selected Collection.

These are URL saves, not file copies. **Find Source** also verifies candidate original image/video URLs by public MIME response where possible. Private websites, DRM, and browser-only media require the original download and file upload.

## Security and limitations

The extension uses `webRequest`, `tabs`, `scripting`, `activeTab`, `storage`, `clipboardWrite`, and `downloads` to observe already-loaded media, copy selected URLs and save a user-triggered cropped image. It does not collect cookies/passwords, intercept response bodies, or change network requests. It is not supported on iOS Safari/Chrome.

Google Drive backup of **permanently stored** Vault media is a separate, optional feature in Vault Settings. It requires a configured Google OAuth client and permission from the signed-in user; it is not enabled merely by installing this extension.

## Status

These changes are on a preview branch until actual browser and media-source flows have been verified. Production is unchanged.
