// Discreet labels protect against revealing content through cards, notes,
// notifications and library searches. Original URLs are preserved intentionally
// for opening the reference. This is not encryption or browsing anonymity.
const LABELS = Object.freeze({
  image: "Visual reference",
  video: "Video reference",
  audio: "Audio reference",
  link: "Web reference",
  file: "Saved reference",
});

export function makePrivateMediaLabel(type) {
  return LABELS[type] || LABELS.file;
}

export function withDiscreetMediaLabels(item, enabled = true) {
  if (!enabled || !item || typeof item !== "object") return item;
  const kind = item.type || "link";
  // Keep functionality tags needed for later uploads and link saves.
  const safeTags = (Array.isArray(item.tags) ? item.tags : [])
    .filter(tag => ["saved-url", "vault-file", "imported", "private-reference"].includes(tag));
  if (!safeTags.includes("private-reference")) safeTags.push("private-reference");
  return {
    ...item,
    title: makePrivateMediaLabel(kind),
    note: "Personal reference.",
    tags: safeTags,
    siteName: item.siteName ? "Vault Import" : item.siteName,
  };
}
