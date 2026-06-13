"use client";

const paths = {
  vault: <><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 5V3h8v2M8 11h8"/></>,
  home: <><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></>,
  star: <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.2 6.4 20.2 7.5 14 3 9.6l6.2-.9L12 3z"/>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  video: <><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/></>,
  image: <><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="10" r="1.6"/><path d="M4 17l5-5 4 4 3-3 4 4"/></>,
  box: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M4.5 7.8L12 12l7.5-4.2"/><path d="M12 12v8.5"/></>,
  link: <><path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1"/></>,
  folder: <><path d="M3 7h7l2 2h9v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></>,
  drive: <><path d="M8.4 4h7.2l5 8.7-3.6 6.3H7l-3.6-6.3L8.4 4z"/><path d="M8.4 4l3.6 8.7h8.6"/><path d="M3.4 12.7H12L7 19"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a8 8 0 0 0 .1-1l2-1.5-2-3.5-2.4 1a7 7 0 0 0-1.7-1L15 6h-6l-.4 3a7 7 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a8 8 0 0 0 .1 1l-2 1.5 2 3.5 2.4-1a7 7 0 0 0 1.7 1l.4 3h6l.4-3a7 7 0 0 0 1.7-1l2.4 1 2-3.5-2.2-1.5z"/></>,
  logout: <><path d="M10 4H5v16h5"/><path d="M15 16l4-4-4-4"/><path d="M9 12h10"/></>,
  x: <><path d="M6 6l12 12"/><path d="M18 6L6 18"/></>,
  menu: <><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></>,
  chevronRight: <path d="M9 5l7 7-7 7"/>,
  chevronLeft: <path d="M15 5l-7 7 7 7"/>,
  plus: <><path d="M12 5v14"/><path d="M5 12h14"/></>,
  play: <path d="M8 5v14l11-7L8 5z"/>,
  pause: <><path d="M8 5v14"/><path d="M16 5v14"/></>,
  sync: <><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M19 11a7 7 0 0 0-12-4.5L4 9"/><path d="M5 13a7 7 0 0 0 12 4.5L20 15"/></>,
  gridLarge: <><rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/></>,
  gridSmall: <><rect x="4" y="4" width="4" height="4"/><rect x="10" y="4" width="4" height="4"/><rect x="16" y="4" width="4" height="4"/><rect x="4" y="10" width="4" height="4"/><rect x="10" y="10" width="4" height="4"/><rect x="16" y="10" width="4" height="4"/><rect x="4" y="16" width="4" height="4"/><rect x="10" y="16" width="4" height="4"/><rect x="16" y="16" width="4" height="4"/></>,
  masonry: <><rect x="4" y="4" width="7" height="10"/><rect x="13" y="4" width="7" height="5"/><rect x="13" y="11" width="7" height="9"/><rect x="4" y="16" width="7" height="4"/></>,
  list: <><path d="M8 6h12"/><path d="M8 12h12"/><path d="M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></>,
  document: <><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/></>,
  file: <><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h6"/></>,
  alert: <><path d="M12 3l10 18H2L12 3z"/><path d="M12 9v5"/><path d="M12 18h.01"/></>,
  headset: <><path d="M4 13a8 8 0 0 1 16 0v4a3 3 0 0 1-3 3h-2v-7h5"/><path d="M4 13h5v7H7a3 3 0 0 1-3-3v-4z"/></>,
  volume: <><path d="M4 10v4h4l5 4V6L8 10H4z"/><path d="M16 9a4 4 0 0 1 0 6"/><path d="M18 6a8 8 0 0 1 0 12"/></>,
  volumeOff: <><path d="M4 10v4h4l5 4V6L8 10H4z"/><path d="M18 9l-5 5"/><path d="M13 9l5 5"/></>,
  light: <><circle cx="12" cy="10" r="4"/><path d="M9 17h6"/><path d="M10 21h4"/><path d="M12 2v2"/><path d="M4 10H2"/><path d="M22 10h-2"/><path d="M5.6 3.6L7 5"/><path d="M17 5l1.4-1.4"/></>,
  external: <><path d="M14 4h6v6"/><path d="M10 14L20 4"/><path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5"/></>,
  inbox: <><path d="M4 4h16l-2 10h-4a2 2 0 0 1-4 0H6L4 4z"/><path d="M4 14v5h16v-5"/></>,
  table: <><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 10h16"/><path d="M9 5v14"/></>,
};

export default function Icon({ name, size = 16, strokeWidth = 1.8, filled = false, style }) {
  const content = paths[name] || paths.link;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "inline-block", flexShrink: 0, ...style }}
    >
      {content}
    </svg>
  );
}
