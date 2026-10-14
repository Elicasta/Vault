# Elicasta Vault Chrome extension v2.1

**Save to your own Vault account.** Open Vault in desktop Chrome and sign in first. The extension can confirm the email displayed by Vault on an authenticated tab, but cannot see or store your password, Supabase tokens or cookies. When you click **Choose folder & save**, a Vault window completes the write using the current website login.

## Supported capture flows

- Paste any standard HTTPS URL into **Save a link from anywhere**; the extension identifies YouTube, Google Drive, Google Docs/Sheets/Slides, Pinterest, Vimeo, TikTok, Instagram, Dropbox, Reddit and regular pages
- Click **Save this page** to use the page title and Open Graph cover where available
- Right-click an image, link, or page and choose the matching Vault action
- Use **Find media**, Select All, and **Choose folder & save** for gallery items
- Existing CSV/TSV and Google Sheets URL-list parsing remains in the extension

A YouTube link is saved as a YouTube video link, a Drive link stays a Drive share (not guessed to be a video), and Pinterest remains a pin/page link. Generic HTTPS sites save as links. The extension never downloads content behind restricted sharing permissions or grants access to private Drive files.

## Install and connect

1. Download the latest `vault-media-capture.zip` from the preview at `/downloads/vault-media-capture.zip`.
2. Unzip it and use Chrome (desktop) → `chrome://extensions` → **Developer mode** → **Load unpacked**, selecting the unzipped `vault-media-capture` folder containing `manifest.json`.
3. Open `https://vault-preview-temp-git-polish-vault-p-5026a8-elicastas-projects.vercel.app` in desktop Chrome and sign in.
4. Open the extension and press **Refresh**. The **Connected to Vault** status should show your account email.
5. Select links or media, choose a Vault collection, review automatically detected title and cover, and save.

If the site does not expose a usable cover, the Vault save window requests a **Cover URL** before saving. Covers from private sites or expiring links may fail later. Saving a page link does not copy its media bytes into Supabase Storage.

## Permissions and privacy

Broad website access is needed to discover sources on arbitrary pages. The extension captures only when you choose to scan, save, or right-click. It does not read website passwords or Supabase credentials. The account indicator only reads the authenticated account name from your own Vault tab. Full session and permissions enforcement remain on Vault's side. Chrome extensions require desktop Chrome.
