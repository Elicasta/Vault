# Elicasta Vault Chrome extension v2.0

**Repository:** [Elicasta/Vault](https://github.com/Elicasta/Vault)
**Feature:** Right-click image saving, gallery multi-selection, folder selection, and Google Sheets URL import.

## Install (desktop Chrome)

1. Download the [Elicasta extension feature branch](https://github.com/Elicasta/Vault/tree/feat/extension-folder-picker-bulk-20261010) as a ZIP and unzip it.
2. In Chrome, open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select `extensions/vault-media-capture` from the extracted repository.
4. Pin Vault to your Chrome toolbar.
5. In **Vault destination**, use `https://vault-preview-temp-git-feat-extension-7e2809-elicastas-projects.vercel.app` for this preview branch. After the final release, change to the permanent Elicasta Vault URL.

## Save a single image

Right-click a photo → **Save image to Vault**.
A separate Vault window opens. If requested, sign into your own Vault account.
Choose **Inbox**, an existing folder, or a nested gallery. Use **Create** to make a new gallery inside the selected folder.
Press **Save to Vault** to complete the operation.

For several manually chosen images, right-click **Add image to Vault capture queue** on each one, then open the extension.

## Save a large gallery

1. Open the original gallery in Chrome, scroll so lazy-loaded images appear.
2. Click the Vault extension icon and **Find images on page**.
3. Select individual images, or **Select all**. The extension supports up to 300 URLs per batch.
4. Choose **Choose folder & save**.
5. In the Vault picker, choose a destination and confirm. All selected images go to that folder.

The prior Google Sheets copy/paste, public CSV URL, and exported CSV/TSV importer remain available.

## Behavior and privacy

- This is a user-triggered action. The extension never auto-saves or reads site passwords, browser cookies, or Supabase credentials.
- The capture window is owned by the signed-in Vault website, which uses the existing authenticated save functions.
- Duplicate URLs use Vault's stable item keys. Re-saving a URL keeps existing title, notes, tags, and cover settings, but moves it to the selected destination.
- Partial failures show the count and preserve only unsaved items for retry.
- The extension does not bypass website access restrictions. Saving a URL is **not downloading a permanent copy**. Hotlink-blocked, expiring, or 403-protected images can still fail later.
- If you have rights to download a file, use the original website's download feature and upload that file to Vault for permanent storage.
- Some websites use thumbnails or canvas media without reusable original URLs; the existing screenshot tool can capture visible pixels, not original resolution.
- Chrome on iPhone does not install desktop Chrome extensions.
