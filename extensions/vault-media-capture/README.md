# Vault Media Capture (Chrome desktop)

Vault's in-app browser analyzes public HTML, but a webpage cannot read cross-origin
network requests made by other sites. This Chrome MV3 companion observes the
actual media request URLs the current tab loads. It does not download files or
bypass authentication, DRM, paywalls, or ad playback.

## Install (unpacked)
1. Download this repository or this extension folder to Chrome desktop.
2. Open chrome://extensions, turn on **Developer mode**, and select **Load unpacked**.
3. Choose the extensions/vault-media-capture folder.
4. Open a media page, let the desired videos or images load normally, then click the Vault Media Capture extension.
5. Click **Scan page**, select the specific videos/images, then **Copy selected for Vault**.
6. Open Vault browser, paste/open the original page, switch to **Media**, choose **Import actual URLs from Chrome capture**, paste the copied JSON, and save selected media.

No data is sent to a third party. Captured links are kept in session storage per
tab (up to 200, one hour). Sites can issue expiring signed CDN URLs that later
stop working. Prefer durable post pages when they exist. Ad URL filtering is
heuristic, not a guarantee. Some protected/browser-blob/DRM media have no
reusable URL. Chrome extensions cannot be used on iOS Chrome.

## Permissions
- **webRequest + host_permissions:** observe direct video/image media URLs across sites.
- **tabs, scripting, activeTab:** scan currently active page DOM when requested.
- **storage:** preserve the current tab's captured URLs across extension worker restarts.
- **clipboardWrite:** copy selected media metadata to Vault.

The extension reads only public media URLs from requests; it does not intercept
HTTP bodies, cookies, authentication headers, or alter network traffic.

## Vault preview integration

This Chrome companion outputs the `vault-media-capture-v1` JSON format consumed by Vault's Media Collector. The branch preview is used only for validation until its UI and stream handling have been verified.

## Per-item verification

In Vault's Media Collector, use **Copy URL** or **Open URL** on any detected asset before selecting it. The exact asset URL, along with the page of origin, is saved into the Vault library when you choose **Save to Vault**.

## Video and cover pairing

The playable MP4/WebM/HLS URL is stored as the Vault item URL, while the poster/image URL is the cover. Use Preview to verify a source before saving. A page that exposes only a poster cannot be saved as a video. When a saved stream repeatedly fails or renders only audio, choose Remove from Library from the player; its record and link remain available under Settings > Hidden links for restoration.

## Inside-Vault video page exploration

From a gallery, choose **Explore video pages → Open page** to inspect the individual video's page without leaving Vault. The selected cover image travels with the page. Vault inspects the page and up to one nested iframe player for MP4, WebM or HLS URLs; the detected stream URL is what saves to the library, not its poster. Use **Back to listing** to return to the previous gallery. Some dynamically rendered or protected sites cannot expose a public stream to the web app: use the desktop Chrome companion when permitted.

## Gallery import and automatic regional retries

Vault Browser accepts public HTTP(S) website URLs without a provider blocklist. A site's own X-Frame-Options or Content-Security-Policy can still prevent the live iframe preview. **Media** scanning works separately when public HTML is readable.

When an image gallery is detected, **Import gallery** offers an existing folder or a new folder. It inspects linked detail pages to look for originals, follows up to six same-host gallery pages, and saves up to 160 unique source links with a saved/skipped/unresolved summary. It stores URLs rather than binary copies.

Vault first fetches websites directly. For access or network failures, its signed server-side regional relay automatically tries three different egress functions (US `iad1`, UK `lhr1`, Germany `fra1`) in rotating order. The regional endpoints are not accessible without a short-lived HMAC signature based on `VAULT_PROXY_SESSION_SECRET`, and both ends enforce public-only destinations and bounded bodies. Production deployments must verify that their Vercel plan actually places the three functions in distinct compute regions, and that the site's own geographic policy permits access. This does not bypass accounts, paywalls, DRM or website embedding permissions. Self-routing uses `VERCEL_URL`; a different trusted gateway can be set through `VAULT_REGION_EGRESS_ORIGIN` and `VAULT_REGION_EGRESS_SECRET`.
