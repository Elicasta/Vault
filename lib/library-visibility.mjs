export const HIDDEN_LIBRARY_TAG = "__vault_hidden_v1__";
export function isHiddenLibraryItem(item) {
  return Array.isArray(item?.tags) && item.tags.includes(HIDDEN_LIBRARY_TAG);
}
export function withLibraryVisibility(item, hidden) {
  const existing = Array.isArray(item?.tags) ? item.tags : [];
  const tags = existing.filter((tag) => tag !== HIDDEN_LIBRARY_TAG);
  if (hidden) tags.push(HIDDEN_LIBRARY_TAG);
  return { ...item, tags };
}
