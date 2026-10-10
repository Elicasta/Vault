# Vault: gallery URLs first

Goal: If a website exposes categories and gallery links but refuses to serve its actual image gallery to Vault's scanner, **collect the gallery page URLs and save them into the Vault library anyway**.

## In-app workflows

1. Import Media → enter a category or gallery-index URL → Scan page. Once links are discovered, use the **Gallery URL list** to select links and **Save gallery URLs**. This does not request images from those galleries.
2. If a clicked gallery returns HTTP 403, **Save this gallery URL to Vault** remains available in the blocked-gallery panel without loading image files.
3. Import Media → **Import gallery URLs in bulk**: paste lines from Google Sheets or a CSV/TSV table with URL, Title, Collection, Thumbnail and Type columns. Review, select and save directly into Vault.
4. Or paste a public Google Sheets URL and load its selected gid through the **existing** authenticated `/api/sheet-import` route. Existing Sheet parsing already retains gallery names, folders and URLs. Private Sheets can be exported to CSV or pasted.
5. Saved items have type **link**. The modern library shows an identifiable link icon and fallback. Open the card → **Open original gallery**. Thumbnail failures do not affect link access.

## Access and content limits
- URLs are **references**, not downloaded photographs. The source site's authenticated session may still be required when opened, and a link may expire.
- Importing these records never requires Vault to fetch the protected image file or bypass upstream 403.
- Only public HTTP(S) links are accepted; no data:, blob:, private-host or local addresses.
- Import capped at 1,000 URLs per pasted file/list; direct scanner link list capped by existing discovery limits. URL persistence uses normal authenticated private Supabase Vault items and existing selected collections.
- Existing Chrome extension, full media imports, page navigation, file upload and user library are preserved.
- No migration, deletion or automatic merge to production.

## Validation
Unit tests: `tests/in-app-gallery-url-import.test.mjs`; full suite, lint, typecheck and Next build. Device-level signed-in save, private Sheet permissions and third-party website restrictions still require manual verification.
