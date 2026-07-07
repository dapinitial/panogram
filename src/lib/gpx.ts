// GPX track parsing for the tracks layer (VISION: user-owned tracks are the
// honest version of "overlay successful routes" — build the machine, don't
// borrow the incumbent's data). Regex-based so it runs in both the browser
// (Upload) and node (tests) without a DOM dependency; GPX from Gaia, Garmin,
// Suunto, and friends is regular enough for this to be robust.

import { distanceM } from "./geo";

export interface TrackPoint { lat: number; lng: number; ele: number | null }

export interface ParsedTrack {
  points: TrackPoint[];   // simplified, ≤ MAX_POINTS
  rawCount: number;       // points before simplification
  distanceM: number;
  gainM: number;          // total ascent (3m threshold to ignore GPS jitter)
  name: string | null;
}

const MAX_POINTS = 200;
const GAIN_NOISE_M = 3;

/** Parse a GPX document (track points, falling back to route points). */
export function parseGpx(xml: string): ParsedTrack | null {
  const name = xml.match(/<name>([^<]{1,120})<\/name>/)?.[1]?.trim() ?? null;

  const points: TrackPoint[] = [];
  const ptRe = /<(trkpt|rtept)\b([^>]*)>([\s\S]*?)<\/\1>|<(trkpt|rtept)\b([^>]*)\/>/g;
  for (const m of xml.matchAll(ptRe)) {
    const attrs = m[2] ?? m[5] ?? "";
    const inner = m[3] ?? "";
    const lat = parseFloat(attrs.match(/lat="([^"]+)"/)?.[1] ?? "");
    const lng = parseFloat(attrs.match(/lon="([^"]+)"/)?.[1] ?? "");
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const ele = parseFloat(inner.match(/<ele>([^<]+)<\/ele>/)?.[1] ?? "");
    points.push({ lat, lng, ele: Number.isFinite(ele) ? ele : null });
  }
  if (points.length < 2) return null;

  // Stats on the RAW track (simplification would understate both).
  let dist = 0, gain = 0, climb = 0;
  for (let i = 1; i < points.length; i++) {
    dist += distanceM(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
    const a = points[i - 1].ele, b = points[i].ele;
    if (a != null && b != null) {
      climb += b - a;
      if (climb >= GAIN_NOISE_M) { gain += climb; climb = 0; }
      else if (climb < 0) climb = 0;
    }
  }

  return { points: simplify(points, MAX_POINTS), rawCount: points.length, distanceM: dist, gainM: gain, name };
}

// Douglas-Peucker in 3D local meters (elevation included — the pano projection
// needs shape in z, not just plan view), tolerance-searched to land at or
// under maxPoints, with a density floor: a track that DP collapses too far
// (straight trails) falls back to uniform sampling so the projected pitch
// still follows the terrain between endpoints.
const MIN_POINTS = 32;

function simplify(pts: TrackPoint[], maxPoints: number): TrackPoint[] {
  if (pts.length <= maxPoints) return pts;
  const lat0 = pts[0].lat;
  const mx = 111320 * Math.cos((lat0 * Math.PI) / 180), my = 111320;
  const xyz = pts.map((p) => ({ x: p.lng * mx, y: p.lat * my, z: p.ele ?? 0 }));

  const keep = new Uint8Array(pts.length);

  function dp(a: number, b: number, tol: number) {
    if (b - a < 2) return;
    const A = xyz[a];
    const dx = xyz[b].x - A.x, dy = xyz[b].y - A.y, dz = xyz[b].z - A.z;
    const len2 = dx * dx + dy * dy + dz * dz || 1;
    let worst = -1, worstD = 0;
    for (let i = a + 1; i < b; i++) {
      const t = Math.max(0, Math.min(1, ((xyz[i].x - A.x) * dx + (xyz[i].y - A.y) * dy + (xyz[i].z - A.z) * dz) / len2));
      const d = Math.hypot(xyz[i].x - (A.x + t * dx), xyz[i].y - (A.y + t * dy), xyz[i].z - (A.z + t * dz));
      if (d > worstD) { worstD = d; worst = i; }
    }
    if (worstD > tol) { keep[worst] = 1; dp(a, worst, tol); dp(worst, b, tol); }
  }

  // Double the tolerance until the survivor count fits.
  for (let tol = 2; tol < 100000; tol *= 2) {
    keep.fill(0); keep[0] = keep[pts.length - 1] = 1;
    dp(0, pts.length - 1, tol);
    let n = 0;
    for (let i = 0; i < keep.length; i++) n += keep[i];
    if (n <= maxPoints) {
      if (n >= Math.min(MIN_POINTS, pts.length)) return pts.filter((_, i) => keep[i]);
      break; // over-collapsed — fall through to uniform sampling
    }
  }
  const step = (pts.length - 1) / (MIN_POINTS - 1);
  return Array.from({ length: MIN_POINTS }, (_, i) => pts[Math.round(i * step)]);
}
