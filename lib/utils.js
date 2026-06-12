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
  if (u.includes("reddit.com")) return "reddit";
  if (u.includes("drive.google.com/drive/folders")) return "gdrive-folder";
  if (u.includes("drive.google.com")) return "gdrive";
  if (/\.(jpg|jpeg|png|gif|webp|avif|svg|bmp)(\?.*)?$/.test(u)) return "image";
  if (/\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/.test(u)) return "video";
  if (/\.(obj|glb|gltf|stl|fbx)(\?.*)?$/.test(u)) return "model3d";
  return "link";
};

// Broad category for type-based browsing
export const mediaCategory = (type) => {
  if (["youtube", "vimeo", "video", "facebook", "tiktok", "reddit"].includes(type)) return "Videos";
  if (["image"].includes(type)) return "Photos";
  if (["model3d"].includes(type)) return "3D Models";
  if (["gdrive", "gdrive-folder"].includes(type)) return "Drive";
  return "Links";
};

export const getYouTubeId = (url) => {
  const m = url.match(/youtube\.com\/watch\?v=([^&]+)/) ||
    url.match(/youtu\.be\/([^?]+)/) ||
    url.match(/youtube\.com\/shorts\/([^?]+)/);
  return m ? m[1] : null;
};

export const getVimeoId = (url) => {
  const m = url.match(/vimeo\.com\/(\d+)/);
  return m ? m[1] : null;
};

export const getGDriveId = (url) => {
  const m = url.match(/drive\.google\.com\/file\/d\/([^/]+)/) ||
    url.match(/drive\.google\.com\/open\?id=([^&]+)/) ||
    url.match(/[?&]id=([^&]+)/);
  return m ? m[1] : null;
};

export const getGDriveFolderId = (url) => {
  const m = url.match(/drive\.google\.com\/drive\/folders\/([^?/]+)/);
  return m ? m[1] : null;
};

export const typeLabel = {
  youtube: "YouTube", vimeo: "Vimeo", facebook: "Facebook",
  instagram: "Instagram", tiktok: "TikTok", twitter: "Twitter",
  reddit: "Reddit", gdrive: "Drive", "gdrive-folder": "Drive Folder",
  image: "Image", video: "Video", model3d: "3D Model",
  link: "Link", unknown: "Link",
};

export const typeColor = {
  youtube: "#FF0000", vimeo: "#1AB7EA", facebook: "#1877F2",
  instagram: "#E1306C", tiktok: "#888888", twitter: "#1DA1F2",
  reddit: "#FF4500", gdrive: "#34A853", "gdrive-folder": "#FBBC05",
  image: "#8B5CF6", video: "#F59E0B", model3d: "#06B6D4",
  link: "#6B7280", unknown: "#6B7280",
};

// VR/3D playback formats — set via "format" column in sheet
// flat (default) | 360 | 180 | sbs (3D side-by-side flat) | sbs360 | sbs180 | tb (top-bottom 3D) | anaglyph
export const VR_FORMATS = ["360", "180", "sbs", "sbs360", "sbs180", "tb", "anaglyph"];
export const isVRFormat = (format) => VR_FORMATS.includes((format || "").toLowerCase());

// Stable key for supabase user_data rows
export const itemKey = (url) => {
  // Simple stable hash
  let h = 0;
  for (let i = 0; i < url.length; i++) {
    h = (h << 5) - h + url.charCodeAt(i);
    h |= 0;
  }
  return `k${Math.abs(h)}`;
};

export const extractSheetId = (val) => {
  const realMatch = val.match(/\/spreadsheets\/d\/(?!e\/)([a-zA-Z0-9-_]+)/);
  if (realMatch) return realMatch[1];
  const trimmed = val.trim();
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  return trimmed;
};

// ─── Sheet fetching ───────────────────────────────────────────────────────────

const parseSheetCSV = (csv, tabName) => {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));
  const urlIdx = headers.findIndex((h) => h === "url" || h === "link");
  const titleIdx = headers.findIndex((h) => h === "title" || h === "name");
  const noteIdx = headers.findIndex((h) => h === "note" || h === "notes" || h === "description");
  const tagsIdx = headers.findIndex((h) => h === "tags" || h === "tag");
  const formatIdx = headers.findIndex((h) => h === "format" || h === "vr");

  if (urlIdx === -1) return [];

  return lines
    .slice(1)
    .map((line, i) => {
      const cols = [];
      let cur = "", inQ = false;
      for (let ci = 0; ci < line.length; ci++) {
        const ch = line[ci];
        if (ch === '"') { inQ = !inQ; }
        else if (ch === "," && !inQ) { cols.push(cur); cur = ""; }
        else { cur += ch; }
      }
      cols.push(cur);

      const clean = (idx) => idx >= 0 ? (cols[idx] || "").trim().replace(/^"|"$/g, "") : "";
      const url = clean(urlIdx);
      if (!url || !url.startsWith("http")) return null;

      const tags = clean(tagsIdx)
        .split(/[,;]/)
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);

      const title = clean(titleIdx) || url;
      const format = clean(formatIdx).toLowerCase() || "flat";
      let type = detectType(url);

      // Drive URLs hide the file extension — detect 3D models from the
      // title (e.g. "bugatti.obj") or an explicit format column value
      const titleExt = title.toLowerCase().match(/\.(obj|glb|gltf|stl)$/)?.[1];
      const formatIs3D = ["3d", "obj", "glb", "gltf", "stl", "model"].includes(format);
      if (type === "gdrive" && (titleExt || formatIs3D)) {
        type = "model3d";
      }

      return {
        id: `${tabName}-${i}`,
        key: itemKey(url),
        url,
        title,
        note: clean(noteIdx),
        tags,
        format,
        format3d: titleExt || (formatIs3D && format !== "3d" && format !== "model" ? format : null),
        type,
        tab: tabName,
      };
    })
    .filter(Boolean);
};

export const fetchTabData = async (sheetId, tabName) => {
  const res = await fetch(`/api/sheet?id=${encodeURIComponent(sheetId)}&tab=${encodeURIComponent(tabName)}`);
  if (!res.ok) return [];
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("json")) return [];
  const csv = await res.text();
  return parseSheetCSV(csv, tabName);
};

export const fetchAllTabs = async (sheetId) => {
  const res = await fetch(`/api/tabs?id=${encodeURIComponent(sheetId)}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.tabs.map((name) => ({ name }));
};
