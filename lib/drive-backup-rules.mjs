export const VAULT_MEDIA_PREFIX = "vault-media://vault-media/";
const IMAGE_EXTENSION = /\.(?:jpe?g|png|webp|gif|avif|bmp|heic|heif)(?:$|[?#])/i;

/** Image files in Storage or on public media URLs are originals;
 * links to pages are never falsely counted as image backups. */
export function classifyBackupSource(row) {
  const url=String(row?.url||""),thumbnail=String(row?.thumbnail||"");
  if(url.startsWith(VAULT_MEDIA_PREFIX))return {url,kind:"supabase-original"};
  if(IMAGE_EXTENSION.test(url))return {url,kind:"external-original"};
  if(thumbnail.startsWith(VAULT_MEDIA_PREFIX))return {url:thumbnail,kind:"cover-only"};
  if(IMAGE_EXTENSION.test(thumbnail))return {url:thumbnail,kind:"cover-only"};
  return {url,kind:"link-only"};
}
export function backupCounts(records=[],total=0) {
  return {images:total,backedUp:records.filter(x=>x.status==="backed_up").length,
    originals:records.filter(x=>x.status==="backed_up"&&x.source_kind!=="cover-only").length,
    covers:records.filter(x=>x.status==="backed_up"&&x.source_kind==="cover-only").length,
    linkOnly:records.filter(x=>x.status==="link_only").length,
    failed:records.filter(x=>x.status==="failed").length};
}
