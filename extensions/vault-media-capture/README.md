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

## Google sign-in and Save to Google Drive fallback

### Signing in on a media website with Google

From Vault Browser, select **Page preview > Sign in on original website**. That opens the real site in a separate tab where Google's normal sign-in/verification can run. Go back to Vault and use **Rescan / find media** for public pages. Note: signing in on another origin does **not** grant Vault's server-side scanner your website cookies. If the site's videos/images only exist inside your authenticated page, use the companion desktop Chrome Media Capture extension from that page; it can observe media already loaded in your signed-in browser without collecting passwords.

### Direct file fallback into Google Drive

For detected media, select **Preview > Save file to Google Drive**. This is Google's officially documented `gapi.savetodrive.render` widget. When clicked it prompts Google to authenticate if needed, then saves the accessible image/video **file bytes** into your Drive (instead of only saving a link in Vault). In the browser's **Quick save > Save to Google Drive instead**, direct image/video file links also have this action.

Vault serves the media using its own authenticated `/api/media` or `/api/stream` route so Google's browser widget has a same-origin source, avoiding cross-origin media restrictions where possible. Image relay cap is 20 MB, video relay cap defaults to 512 MB and may be smaller in regional fallback; your browser must remain open until Google's transfer finishes. Google authentication stays with Google's widget: Vault never requests or stores your Google password or Drive access tokens.

If the file URL is missing or private/DRM-protected, Google's button cannot invent the media. On **desktop Chrome**, open the original signed-in site and use Google's official **Save to Google Drive** Chrome extension in the right-click menu for a visible image, HTML5 video, or screenshot: https://chromewebstore.google.com/detail/save-to-google-drive/gmbmikajjgmnabiglmofipeabaddhgne . Other browsers/iPhone cannot use that desktop extension. The two Google products are independent, and Vault cannot invoke the third-party Chrome extension automatically.

The Google save button stores files in Drive; it does not automatically add the Drive file to Vault or select a Drive folder. The existing Vault folder picker applies to saving links **inside Vault**.

Preview verification: Google Save to Drive uses a same-origin Vault media URL and requires an authenticated Vault session for that URL to respond. The actual Google widget's sign-in and Drive transfer occur in the user's browser, so full end-to-end verification requires an interactive browser session.

## URL-first AI generator saving and Google Drive backup

**Save URL to Vault is the primary action.** In Search, Venice and Perchance workspaces, save a public page/image/video URL into a Collection with a title. URLs that start with blob: are temporary browser objects, not permanent Vault URLs.

**Permanent Copy is optional.** For a Venice or Perchance generation without an accessible file URL, use Chrome Media Capture → Smart Image Capture → Capture main image, or Pick exact image and click the visual element to select it. The Chrome extension saves a cropped PNG in Vault Captures. In Vault's Venice or Perchance workspace, upload that PNG using Save Permanent Copy; this stores real file bytes in private Supabase Storage (50 MB/file max). A screenshot covers visible rendered pixels, not necessarily the original resolution.

**Google Drive Backup is optional.** In Vault Settings, the backup tool can copy eligible private Supabase-stored images/videos to a new Vault Backups folder using Google user consent and drive.file OAuth scope. It skips Drive files previously backed up using file identifiers. The Google Web Client ID environment variable NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID and exact authorized JavaScript origins for preview/production must be configured first. The Google account connection, real Drive file upload, and Chrome smart cropping remain unverified until tested interactively.

Site-specific Google login is opened on the original Venice or Perchance website: their third-party sessions and browser-local generation histories cannot be transferred into the Vault iframe.

## Live studios and stronger search

In Vault use **Venice AI** or **Perchance AI** from navigation. The interactive website appears as a main canvas with save URL, permanent file upload and collection options. If the website rejects embedded sign-in, Google verification or local browser storage, choose **Full Chrome Studio**. With the Vault Media Capture Chrome companion installed, this opens the real generator in a normal Chrome tab with Vault Studio in its side panel. The original site handles its login and stores its own first-party browser state. Chrome Studio cannot be installed on mobile Safari or iOS Chrome; the embedded preview may therefore not support all features on an iPhone.

In the Chrome side panel, select the generated media or current page and press **Save URL to Vault**. An already-open authenticated Vault Studio tab confirms the save through its existing application session; otherwise the panel opens the Vault Studio URL with the destination filled in for the user to confirm. No site passwords, login cookies, or browser-local history are imported into Vault. Use Smart Image Capture / Permanent Copy for temporary blob URLs or generated media without a stable link.

Vault browser search now offers three modes. **Regular** (default) requests strict provider SafeSearch, **NSFW** allows adult results and favors adult-related result matches, and **Unrestricted** requests the broadest supported indexing without adult-specific ranking. All modes use the same protected public web discovery path; providers and regional rules may still restrict results. Scope options All, Images, Videos, Sites/galleries, domain filter and extra result pages are available. URLs remain the primary save method.

## Finding the actual source URL, including on iPhone

In Vault Search, enter a website or media title, open an individual result with **Find media**, then select **Find source URL** at the top of the media panel. Vault checks the selected public HTML page, follows up to three explicitly identified image/video detail pages and tests up to six media candidates with public-only, DNS-validated HEAD requests. **Verified** means a public response confirmed an image or video MIME type; it does not mean the link is permanent or authenticated. Save a verified file URL into your current Collection, copy it or inspect an individual media page. Unverified links are labeled and deliberately do not offer Save verified file.

The same Source Finder is available in the Venice and Perchance Vault workspaces for pasted public detail links. It cannot access private authenticated site sessions, DRM, temporary blob: URLs, data: images or cross-origin browser storage.

**iPhone:** If the Venice/Perchance iframe displays a blank white area, Vault now defaults to a compact explanation instead of an empty pane. Tap **Open Venice AI website** or **Open Perchance AI website** to create normally in Safari. Return to Vault to paste a share/media URL and press Save URL to Vault. If the generated image has no durable media URL (Perchance can generate image data inline inside nested frames), tap the source website's **Download** control, then in the Vault AI Studio use **Save Permanent Copy** to upload the actual photo or video from Files. Desktop Chrome Studio requires the installed companion extension; iOS Chrome and Safari cannot install it.

The Source Finder inspects public content only, never forwards third-party login credentials, and does not guarantee access to websites that deny embedding or media extraction.
