import { NextResponse } from "next/server";

// Proxies a Google Drive file download so client-side loaders (Three.js)
// can fetch binary files without CORS issues
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get("id");

  if (!fileId) {
    return NextResponse.json({ error: "Missing file id" }, { status: 400 });
  }

  try {
    let url = `https://drive.google.com/uc?export=download&id=${fileId}`;
    let res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(30000),
    });

    // Large files hit Google's virus scan confirmation page — extract confirm token
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      const html = await res.text();
      const confirmMatch =
        html.match(/confirm=([a-zA-Z0-9-_]+)/) ||
        html.match(/name="confirm" value="([^"]+)"/);
      const uuidMatch = html.match(/name="uuid" value="([^"]+)"/);

      if (confirmMatch) {
        url = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=${confirmMatch[1]}${uuidMatch ? `&uuid=${uuidMatch[1]}` : ""}`;
        res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0" },
          redirect: "follow",
          signal: AbortSignal.timeout(60000),
        });
      } else {
        throw new Error("File requires authentication or is too large to proxy.");
      }
    }

    if (!res.ok) throw new Error(`Download failed (${res.status})`);

    // Stream the body straight through
    return new NextResponse(res.body, {
      headers: {
        "Content-Type": res.headers.get("content-type") || "application/octet-stream",
        "Cache-Control": "s-maxage=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
