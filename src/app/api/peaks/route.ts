import { NextResponse } from "next/server";

// Deterministic peak data for the horizon-label layer (VISION deterministic
// layer, sibling of the sun): named OSM peaks near a capture point plus the
// capture point's own elevation, so the client can place "▲ Sky Pilot ·
// 2031m" markers by pure bearing math — no AI, no key, ODbL attribution on
// the Atlas. Public read-only; cached per rounded coordinate.

const RADIUS_M = 25000; // wide enough for the distant summits a big vista actually shows
const MAX_PEAKS = 24;
const cache = new Map<string, { at: number; body: PeaksResponse }>();
const CACHE_MS = 24 * 60 * 60_000; // peaks don't move

// Overpass is a fleet of free, frequently-overloaded public mirrors. Pinning one
// (overpass-api.de) with no retry means peaks silently fail whenever it's busy —
// which is often. We race the mirrors and take the first valid answer.
const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

interface Peak { name: string; ele: number | null; lat: number; lng: number }
interface PeaksResponse { captureEle: number; peaks: Peak[] }
interface OverpassEl { lat: number; lon: number; tags?: { name?: string; ele?: string } }

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

// Query every mirror at once; resolve with the first that returns nodes, null if
// they all fail. Cheap here — the result is cached per ~1km bucket for a day.
async function overpassPeaks(lat: number, lng: number): Promise<OverpassEl[] | null> {
  const body = "data=" + encodeURIComponent(
    `[out:json][timeout:25];node(around:${RADIUS_M},${lat},${lng})[natural=peak][name];out body 80;`,
  );
  const attempt = async (url: string): Promise<OverpassEl[]> => {
    const data = await fetchJson<{ elements?: OverpassEl[] }>(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        // Overpass etiquette: identify the app, or generic/absent UAs get throttled.
        "user-agent": "Panogram/1.0 (horizon peak labels; +https://panogram-fxfju.ondigitalocean.app)",
      },
      body,
    }, 11000);
    if (!data?.elements) throw new Error("overpass miss"); // reject so Promise.any skips it
    return data.elements;
  };
  try {
    return await Promise.any(OVERPASS_MIRRORS.map(attempt));
  } catch {
    return null; // every mirror failed
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

  type Elevation = { elevation: number[] };
  const [osmEls, ele] = await Promise.all([
    overpassPeaks(lat, lng),
    fetchJson<Elevation>(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`),
  ]);
  if (!osmEls) {
    return NextResponse.json({ ok: false, error: "peak lookup unavailable" }, { status: 502 });
  }

  const peaks: Peak[] = osmEls
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
