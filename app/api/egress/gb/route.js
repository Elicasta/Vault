import { serveRegionalEgress } from "@/lib/server/region-egress-handler.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "lhr1";
export async function POST(request) { return serveRegionalEgress(request, "gb"); }
