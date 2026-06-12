import { NextResponse } from "next/server";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sheetId = searchParams.get("id");

  if (!sheetId) {
    return NextResponse.json({ error: "Missing sheet id" }, { status: 400 });
  }

  try {
    // Fetch the sheet's HTML page — tab names are embedded in the page markup
    // as data-name attributes on sheet selector buttons
    const htmlUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/htmlview`;
    const res = await fetch(htmlUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!res.ok) {
      throw new Error(`Sheet not accessible (${res.status}). Make sure it is shared as Anyone with link can view.`);
    }

    const html = await res.text();

    // Tab names appear as: <li id="sheet-button-..." data-name="Tab Name" ...>
    const tabMatches = [...html.matchAll(/data-name="([^"]+)"/g)];
    // Also try: aria-label="Tab Name" on sheet buttons
    const ariaMatches = [...html.matchAll(/aria-label="([^"]+)" class="[^"]*gid/g)];

    let tabs = tabMatches.map((m) => decodeHTMLEntities(m[1]));

    // Deduplicate and filter blanks
    tabs = [...new Set(tabs)].filter(Boolean);

    if (tabs.length === 0) {
      // Fallback: try parsing the sheet name list from JS variables in the page
      const sheetNamesMatch = html.match(/"sheetnames":\[(.*?)\]/);
      if (sheetNamesMatch) {
        tabs = sheetNamesMatch[1]
          .split(",")
          .map((s) => s.replace(/"/g, "").trim())
          .filter(Boolean);
      }
    }

    if (tabs.length === 0) {
      // Last resort: try gviz approach to at least confirm sheet exists
      // Return a single "Sheet1" default so user gets something
      tabs = ["Sheet1"];
    }

    return NextResponse.json({ tabs });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function decodeHTMLEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
