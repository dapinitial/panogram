import { NextResponse } from "next/server";
import { lookupZone } from "@/lib/avalanche";

// Avalanche forecast for a capture point — thin HTTP wrapper over
// lib/avalanche.ts (avalanche.org zones + avalanche.ca point lookup, cached).
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ ok: false, error: "bad coords" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, zone: await lookupZone(lat, lng) });
}
