// ─── Type detection ───────────────────────────────────────────────────────────

export const detectType = (url) => {
  if (!url) return "unknown";
  const u = url.trim().toLowerCase();
  if (u.includes("youtube.com/watch") || u.includes("youtu.be/") || u.includes("youtube.com/shorts")) return "youtube";
  if (u.includes("vimeo.com/")) return "vimeo";
  if (u.includes("twitter.com") || u.includes("x.com")) return "twitter";
  if (u.includes("facebook.com") || u.includes("fb.watch")) return "facebook";
  if (u.includes("instagram.com")) return "instagram";
  if (u.includes("tiktok.com")) return "tiktok";
  if (u.includes("drive.google.com")) return "gdrive";
  if (/\.(jpg|jpeg|png|gif|webp|avif|svg|bmp)(\?.*)?$/.test(u)) return "image";
  if (/\.(mp4|webm|ogg|mov)(\?.*)?$/.test(u)) return "video";
  return "link";
};

export const getYouTubeId = (url) => {
  const m =
    url.match(/youtube\.com\/watch\?v=([^&]+)/) ||
    url.match(/youtu\.be\/([^?]+)/) ||
    url.match(/youtube\.com\/shorts\/([^?]+)/);
  return m ? m[1] : null;
};

export const getVimeoId = (url) => {
  const m = url.match(/vimeo\.com\/(\d+)/);
  return m ? m[1] : null;
};

export const getGDriveId = (url) => {
  const m =
    url.match(/drive\.google\.com\/file\/d\/([^/]+)/) ||
    url.match(/drive\.google\.com\/open\?id=([^&]+)/);
  return m ? m[1] : null;
};

export const typeLabel = {
  youtube: "YouTube", vimeo: "Vimeo", facebook: "Facebook",
  instagram: "Instagram", tiktok: "TikTok", twitter: "Twitter",
  gdrive: "Drive", image: "Image", video: "Video", link: "Link", unknown: "Link",
};

export const typeColor = {
  youtube: "#FF0000", vimeo: "#1AB7EA", facebook: "#1877F2",
  instagram: "#E1306C", tiktok: "#888888", twitter: "#1DA1F2",
  gdrive: "#34A853", image: "#8B5CF6", video: "#F59E0B",
  link: "#6B7280", unknown: "#6B7280",
};

// Accepts full sheet URL or bare ID
export const extractSheetId = (val) => {
  // Handle published export URLs like /spreadsheets/d/e/PUBID/pubhtml — not usable, need real ID
  // Real edit URL: /spreadsheets/d/REAL_ID/edit
  const realMatch = val.match(/\/spreadsheets\/d\/(?!e\/)([a-zA-Z0-9-_]+)/);
  if (realMatch) return realMatch[1];
  // Bare ID (no slashes, reasonable length)
  const trimmed = val.trim();
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  return trimmed;
};

// ─── Sheet fetching (via Next.js API proxy routes to avoid CORS) ──────────────

const parseSheetCSV = (csv, tabName) => {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));
  const urlIdx = headers.findIndex((h) => h === "url" || h === "link");
  const titleIdx = headers.findIndex((h) => h === "title" || h === "name");
  const noteIdx = headers.findIndex((h) => h === "note" || h === "notes" || h === "description");

  if (urlIdx === -1) return [];

  return lines
    .slice(1)
    .map((line, i) => {
      // CSV parser that handles quoted fields containing commas
      const cols = [];
      let cur = "", inQ = false;
      for (let ci = 0; ci < line.length; ci++) {
        const ch = line[ci];
        if (ch === '"') { inQ = !inQ; }
        else if (ch === "," && !inQ) { cols.push(cur); cur = ""; }
        else { cur += ch; }
      }
      cols.push(cur);

      const url = (cols[urlIdx] || "").trim().replace(/^"|"$/g, "");
      if (!url || !url.startsWith("http")) return null;

      return {
        id: `${tabName}-${i}`,
        url,
        title: titleIdx >= 0 ? (cols[titleIdx] || "").trim().replace(/^"|"$/g, "") || url : url,
        note: noteIdx >= 0 ? (cols[noteIdx] || "").trim().replace(/^"|"$/g, "") : "",
        type: detectType(url),
        tab: tabName,
      };
    })
    .filter(Boolean);
};

export const fetchAllTabs = async (sheetId) => {
  const res = await fetch(`/api/tabs?id=${encodeURIComponent(sheetId)}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.tabs.map((name) => ({ name }));
};

export const fetchTabData = async (sheetId, tabName) => {
  const res = await fetch(`/api/sheet?id=${encodeURIComponent(sheetId)}&tab=${encodeURIComponent(tabName)}`);
  if (!res.ok) return [];
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("json")) return []; // error response
  const csv = await res.text();
  return parseSheetCSV(csv, tabName);
};
