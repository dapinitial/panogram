import { NextResponse } from "next/server";

// Deterministic peak data for the horizon-label layer (VISION deterministic
// layer, sibling of the sun): named OSM peaks near a capture point plus the
// capture point's own elevation, so the client can place "▲ Sky Pilot ·
// 2031m" markers by pure bearing math — no AI, no key, ODbL attribution on
// the Atlas. Public read-only; cached per rounded coordinate.

const RADIUS_M = 12000;
const MAX_PEAKS = 20;
const cache = new Map<string, { at: number; body: PeaksResponse }>();
const CACHE_MS = 24 * 60 * 60_000; // peaks don't move

interface Peak { name: string; ele: number | null; lat: number; lng: number }
interface PeaksResponse { captureEle: number; peaks: Peak[] }

async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = 12000): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ ok: false, error: "bad coords" }, { status: 400 });
  }

  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`; // ~1km buckets
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return NextResponse.json({ ok: true, ...hit.body });
  }

  type Overpass = { elements: { lat: number; lon: number; tags?: { name?: string; ele?: string } }[] };
  type Elevation = { elevation: number[] };
  const [osm, ele] = await Promise.all([
    fetchJson<Overpass>("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "data=" + encodeURIComponent(
        `[out:json][timeout:20];node(around:${RADIUS_M},${lat},${lng})[natural=peak][name];out body 60;`,
      ),
    }),
    fetchJson<Elevation>(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`),
  ]);
  if (!osm) {
    return NextResponse.json({ ok: false, error: "peak lookup unavailable" }, { status: 502 });
  }

  const peaks: Peak[] = osm.elements
    .filter((e) => e.tags?.name)
    .map((e) => ({
      name: e.tags!.name!,
      ele: e.tags!.ele ? parseFloat(e.tags!.ele) || null : null,
      lat: e.lat, lng: e.lon,
    }))
    .sort((a, b) => (b.ele ?? 0) - (a.ele ?? 0))
    .slice(0, MAX_PEAKS);

  const body: PeaksResponse = { captureEle: ele?.elevation?.[0] ?? 0, peaks };
  cache.set(key, { at: Date.now(), body });
  return NextResponse.json({ ok: true, ...body });
}
