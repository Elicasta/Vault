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
