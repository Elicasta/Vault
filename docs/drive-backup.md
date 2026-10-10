# Optional Vault image backup to Google Drive

**Save URL to Vault is always the primary action.** Google Drive is an optional second copy; it never changes the saved Vault link, cover, tags, or collection.

## What is implemented

- Save media URLs directly to Vault with no Google dependency.
- Connect to Google with an OAuth consent screen, using only the drive.file scope.
- Encrypt refresh tokens at rest and keep authorization and the Supabase service key server-side.
- Back up image bytes from the private Supabase Storage bucket, or fetch accessible external originals.
- Separately report original copies, cover-only copies, failed downloads, and link-only records. Only mark an item backed up after a Google Drive upload succeeds.
- Run bounded manual backup batches and inspect connection/backup status from Vault Settings. Disconnecting retains existing Drive files.

## Not yet connected or live

The application still needs a Google Cloud OAuth client, an authorized production redirect URI, an encryption secret, and server-only Supabase credentials. The user must consent via Google. The SQL migration is committed for review and is NOT applied automatically. Scheduled/background backups and restoration are future work, not included in this PR.

## Release setup

1. Enable the Google Drive API in Google Cloud and create a Web application OAuth client with the narrow https://www.googleapis.com/auth/drive.file scope.
2. Register the exact redirect https://YOUR-VAULT-DOMAIN/api/drive-backup/callback in Google Cloud. Use a stable domain for production.
3. Configure these server-only Vercel values: VAULT_GOOGLE_CLIENT_ID, VAULT_GOOGLE_CLIENT_SECRET, VAULT_GOOGLE_REDIRECT_URI, VAULT_DRIVE_TOKEN_KEY (32 random bytes in hex or base64), and SUPABASE_SERVICE_ROLE_KEY. Never expose the private values with NEXT_PUBLIC_ prefixes.
4. Keep the existing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and VAULT_PROXY_SESSION_SECRET configured; enable VAULT_SECURITY_V2.
5. Review and apply supabase/migrations/20261010_vault_drive_backups.sql to the intended Supabase project. The tables are RLS enabled; anon and authenticated client roles have no access to the refresh-token table.
6. In Settings, connect Google Drive through Google's consent screen and select Back up images now. Google creates a Vault Backups folder in the selected account.
7. Confirm a Supabase original and an externally accessible original become actual Drive files. Test cover-only and link-only cases and inspect their distinct statuses before merging.

## Behavior and limits

Google Drive file copies are never automatically triggered by Save URL to Vault. Backups are initiated separately; the current implementation processes up to three images per request and up to ten requests per foreground session. The uploaded original is copied, not moved. The image size limit is 20 MiB. If the source is a page URL or inaccessible/expired, Vault retains that URL and records the backup as link-only or failed instead of claiming it is backed up.

Google sign-in on third-party websites remains an original-site handoff; signed-in website cookies are not transferred to the Vault server scanner.

## Verification

Run npm test, npm run lint, npx tsc --noEmit, and npm run build. Verify Google consent, token encryption, user ownership/RLS, source classification, file upload, and disconnection on an actual configured environment before production release.