import "server-only";

// Avalanche forecast lookup for a capture point (VISION deterministic layers).
// Two public sources, no keys: avalanche.org (US — zone polygons + danger) and
// avalanche.ca (Canada — direct point endpoint). Off-season or unzoned points
// resolve to zone:null and the client simply shows nothing. Cached hard —
// forecasts change at most daily.

export interface Zone {
  name: string;
  danger: string;      // e.g. "considerable", "Summer Conditions"
  dangerLevel: number; // 1–5; 0/-1 = no rating / off-season
  offSeason: boolean;
  link: string;
  source: "avalanche.org" | "avalanche.ca";
}

const pointCache = new Map<string, { at: number; zone: Zone | null }>();
const POINT_CACHE_MS = 6 * 60 * 60_000;
let usLayer: { at: number; features: UsFeature[] } | null = null;
const US_LAYER_MS = 24 * 60 * 60_000;

type UsFeature = {
  properties: { name: string; danger: string; danger_level: number; off_season: boolean; link: string };
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
};

async function fetchJson<T>(url: string, timeoutMs = 10000): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Standard ray casting; rings are [lng, lat].
function inRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inFeature(lng: number, lat: number, f: UsFeature): boolean {
  const polys = (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates) as number[][][][];
  return polys.some((poly) => inRing(lng, lat, poly[0]) && !poly.slice(1).some((hole) => inRing(lng, lat, hole)));
}

const CA_LEVELS: Record<string, number> = { low: 1, moderate: 2, considerable: 3, high: 4, extreme: 5 };

async function lookupCanada(lat: number, lng: number): Promise<Zone | null> {
  type CaResp = {
    url?: string;
    report?: {
      title?: string;
      dangerRatings?: { ratings: Record<string, { rating: { value: string; display: string } }> }[];
    };
  };
  const d = await fetchJson<CaResp>(`https://api.avalanche.ca/forecasts/en/products/point?lat=${lat}&long=${lng}`);
  const today = d?.report?.dangerRatings?.[0]?.ratings;
  if (!d?.url || !today) return null;
  // Headline = the worst rating across elevation bands.
  let best = { value: "norating", display: "No rating", level: 0 };
  for (const band of Object.values(today)) {
    const lvl = CA_LEVELS[band.rating.value] ?? 0;
    if (lvl > best.level) best = { value: band.rating.value, display: band.rating.display, level: lvl };
    else if (best.level === 0 && band.rating.value === "offseason") best = { value: "offseason", display: band.rating.display, level: 0 };
  }
  return {
    name: "Avalanche Canada", danger: best.display, dangerLevel: best.level,
    offSeason: best.value === "offseason", link: d.url, source: "avalanche.ca",
  };
}

async function lookupUs(lat: number, lng: number): Promise<Zone | null> {
  if (!usLayer || Date.now() - usLayer.at > US_LAYER_MS) {
    const d = await fetchJson<{ features: UsFeature[] }>("https://api.avalanche.org/v2/public/products/map-layer", 15000);
    if (d?.features) usLayer = { at: Date.now(), features: d.features };
  }
  const f = usLayer?.features.find((f) => inFeature(lng, lat, f));
  if (!f) return null;
  const p = f.properties;
  return {
    name: p.name, danger: p.danger, dangerLevel: p.danger_level,
    offSeason: p.off_season, link: p.link, source: "avalanche.org",
  };
}


/** Resolve a point to its avalanche-forecast zone (US or Canada), cached. */
export async function lookupZone(lat: number, lng: number): Promise<Zone | null> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const hit = pointCache.get(key);
  if (hit && Date.now() - hit.at < POINT_CACHE_MS) return hit.zone;

  // Rough national routing; the 49th-parallel overlap tries Canada then the US.
  let zone: Zone | null = null;
  if (lat > 48.5 && lng < -52) zone = await lookupCanada(lat, lng);
  if (!zone && lat > 24 && lat < 72 && lng < -66 && lng > -170) zone = await lookupUs(lat, lng);

  pointCache.set(key, { at: Date.now(), zone });
  return zone;
}
