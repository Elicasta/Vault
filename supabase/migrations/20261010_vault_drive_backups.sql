-- Vault Google Drive backups. NOT applied to production automatically.
-- Service role exclusively manages tokens and backup jobs; no browser access.
create table if not exists public.vault_drive_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_refresh_token text not null,
  google_email text,
  root_folder_id text not null,
  status text not null default 'connected' check(status in ('connected','reconnect_required')),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_backup_at timestamptz
);
alter table public.vault_drive_connections enable row level security;
revoke all on public.vault_drive_connections from anon, authenticated;
-- No public policies: the authenticated, server-side route checks Vault identity
-- and uses a service key that is never included in client bundles.

create table if not exists public.vault_drive_backups (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_key text not null,
  source_url text not null,
  drive_file_id text,
  source_kind text not null default 'unresolved'
    check (source_kind in ('supabase-original','external-original','cover-only','link-only','unresolved')),
  status text not null default 'pending'
    check (status in ('pending','backed_up','failed','link_only')),
  bytes bigint,
  sha256 text,
  error text,
  backed_up_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(user_id, item_key)
);
create index if not exists vault_drive_backups_user_status_idx on public.vault_drive_backups(user_id,status);
alter table public.vault_drive_backups enable row level security;
revoke all on public.vault_drive_backups from anon, authenticated;
