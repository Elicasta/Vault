# Vault — Save Images (Chrome extension v1.2)

A desktop Chrome companion for the existing Vault website. Vault's Import Media page and its saving system are **unchanged**.

## Install in Chrome

1. Download or clone the Elicasta/Vault repository on the feature branch and locate the extensions/vault-media-capture folder.
2. In desktop Chrome, open **chrome://extensions**.
3. Enable **Developer mode** and choose **Load unpacked**.
4. Select the vault-media-capture folder, not the entire Vault repository. Pin the extension.
5. In the extension, expand **Vault destination** once and check the URL. The initial default is the latest development preview; change it when a stable Vault domain becomes available.

This is an unpacked development extension, not a Chrome Web Store install. Chrome on iPhone cannot load desktop Chrome extensions.

## Save a single image

Right-click a visible image and select **Save image to Vault**. The extension opens the configured Vault Import Media page and prepares the image URL in **Import from your browser**. Confirm and click **Save selected to Vault** in the existing website.

Alternatively, choose **Add image to Vault capture queue** to collect multiple right-clicked images before opening Vault.

**Important:** This saves the image's URL, not automatically a permanent copy of its bytes. Some URLs expire or reject access outside the original site. For permanent storage, use the source website's permitted Save Image As action, then upload that file into Vault.

## Save a whole gallery

1. Open the gallery normally in Chrome and scroll so lazy-loaded images appear.
2. Click the Vault extension and choose **Find images on page**.
3. Filter Images/Videos and choose items, or click **Select all**.
4. Click **Send selected to Vault**. The extension also copies JSON to your clipboard as a fallback.
5. In Vault's existing import review, confirm the selection and press **Save selected to Vault**.

Gallery scanning uses image elements, image anchors, responsive srcsets, CSS backgrounds, network requests already made by Chrome, and accessible frames. Some items are thumbnails; not every website exposes full-resolution URLs. The extension does not bypass website access restrictions.

## Import URL lists from Google Sheets

This preserves the older spreadsheet workflow without needing Google OAuth or changing Vault's website.

- **Copy/paste:** Select cells or columns containing URLs in Google Sheets, copy, expand **Import a Google Sheets URL list** in Vault's extension, paste, then click **Add URLs to selection**.
- **CSV/TSV:** Export CSV from Google Sheets (File → Download → Comma Separated Values), then use **Choose CSV / TSV** in the extension.
- Supported headings (case-insensitive): URL, Image URL, Link, Title, Type, Source Page, Thumbnail; one-column lists also work.
- Recognizes JPG, PNG, WebP, GIF, AVIF, HEIC, MP4, MOV, WebM and similar URLs. For extensionless image links, include a Type column with image, or select **Treat links without image extensions as images**.
- Duplicates are removed; batches have a 300-item maximum. You review before saving. This is a **URL-list import**, not a live Google Sheets sync or automatic download of all URLs.

## Sending to the existing Vault import page

The extension opens your configured HTTPS Vault address at /import, fills the existing **Browser-captured media links** field and clicks **Review captured media**. The final Save is a separate user action. If you're signed out, sign in and return to /import. If automatic handoff doesn't succeed, use **Copy selected (manual fallback)** and paste the JSON into the existing Vault field.

No changes to Vault's page, database or saved-media model are necessary.

## Smart screenshot capture

If content is rendered to canvas or a temporary blob URL, use **Capture main image** or **Pick exact image** from the extension. This saves a screenshot of visible pixels (not original resolution). Upload the saved PNG into Vault using the existing file uploader.

## Privacy and limitations

- Context-menu saving and batch import are user-triggered, not silent background uploads.
- The extension observes media URLs in Chrome tabs, but does not read passwords, cookies or OAuth credentials. No media is automatically transmitted to Vault.
- Captured URLs may contain expiring signed query parameters; don't share copied exports publicly. Handoff targets the HTTPS Vault address you configured.
- Broad host permissions are used to capture media from different sites. Install only from a trusted source.
- The extension runs on desktop Chrome, not iPhone Chrome. Google Sheets import uses copied/exported data, not a Google account connection.
- Sites may block direct image access, restrict frames or hide originals; success on every website is not guaranteed.

Production is untouched; this is a preview development branch until manually tested in Chrome.
