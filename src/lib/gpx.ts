// GPX track parsing for the tracks layer (VISION: user-owned tracks are the
// honest version of "overlay successful routes"). Regex-based so it runs in
// both the browser (Upload) and node (tests) without a DOM dependency.
//
// Shape notes (from shotgundetour's cross-review):
// - <trkseg> boundaries are preserved — segments never bridge a pause, and
//   distance/gain never count the gap.
// - <rtept> is a true fallback: used ONLY when the file has no track points.
// - <wpt> waypoints and timed segment gaps come out as candidate POIs for the
//   uploader to confirm — never auto-published (a gap can just be lost signal).
// - Simplification is iterative (no recursion — huge climbs can't blow the
//   stack) and pre-decimated above a hard point cap.

import { distanceM } from "./geo";

export interface TrackPoint { lat: number; lng: number; ele: number | null }

export interface GpxWaypoint {
  lat: number; lng: number; ele: number | null;
  name: string | null;
  sym: string | null; // Garmin/Gaia symbol, e.g. "Campground", "Drinking Water"
}

export interface GpxGap {
  lat: number; lng: number;          // where the recorder stopped
  durationMin: number;               // how long (from <time>; ≥ MIN_GAP_MIN)
}

export interface ParsedTrack {
  segments: TrackPoint[][]; // simplified; ≤ MAX_POINTS total across segments
  rawCount: number;
  distanceM: number;        // within-segment only — gaps don't count
  gainM: number;            // total ascent (3m threshold to ignore GPS jitter)
  name: string | null;
  waypoints: GpxWaypoint[];
  gaps: GpxGap[];
}

const MAX_POINTS = 200;
const MIN_POINTS = 32;
const GAIN_NOISE_M = 3;
const HARD_POINT_CAP = 20000;  // pre-decimate beyond this before simplifying
const MAX_XML_BYTES = 25 * 1024 * 1024;
const MIN_GAP_MIN = 20;        // shorter pauses are usually just signal loss
const MAX_WAYPOINTS = 30;

const num = (s: string | undefined) => {
  const n = parseFloat(s ?? "");
  return Number.isFinite(n) ? n : null;
};

function parsePoints(chunk: string, tag: "trkpt" | "rtept"): { pts: TrackPoint[]; times: (number | null)[] } {
  const pts: TrackPoint[] = [], times: (number | null)[] = [];
  const re = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}>|<${tag}\\b([^>]*)\\/>`, "g");
  for (const m of chunk.matchAll(re)) {
    const attrs = m[1] ?? m[3] ?? "";
    const inner = m[2] ?? "";
    const lat = num(attrs.match(/lat="([^"]+)"/)?.[1]);
    const lng = num(attrs.match(/lon="([^"]+)"/)?.[1]);
    if (lat == null || lng == null) continue;
    pts.push({ lat, lng, ele: num(inner.match(/<ele>([^<]+)<\/ele>/)?.[1]) });
    const t = inner.match(/<time>([^<]+)<\/time>/)?.[1];
    times.push(t ? Date.parse(t) || null : null);
  }
  return { pts, times };
}

/** Parse a GPX document. Track segments first; route points only as fallback. */
export function parseGpx(xml: string): ParsedTrack | null {
  if (xml.length > MAX_XML_BYTES) return null;

  // Prefer the track's own name over <metadata><name> ("Garmin Connect").
  const name =
    xml.match(/<trk>[\s\S]*?<name>([^<]{1,120})<\/name>/)?.[1]?.trim() ??
    xml.match(/<name>([^<]{1,120})<\/name>/)?.[1]?.trim() ?? null;

  // Segments: one per <trkseg>; a file without <trkseg> tags but with bare
  // <trkpt>s (sloppy exporters) parses as a single segment.
  const segChunks = [...xml.matchAll(/<trkseg\b[^>]*>([\s\S]*?)<\/trkseg>/g)].map((m) => m[1]);
  let rawSegs: { pts: TrackPoint[]; times: (number | null)[] }[] =
    (segChunks.length ? segChunks.map((c) => parsePoints(c, "trkpt")) : [parsePoints(xml, "trkpt")])
      .filter((s) => s.pts.length > 0);
  if (!rawSegs.length) {
    const rte = parsePoints(xml, "rtept"); // fallback ONLY — never merged with trkpts
    if (rte.pts.length) rawSegs = [rte];
  }
  const rawCount = rawSegs.reduce((n, s) => n + s.pts.length, 0);
  if (rawCount < 2) return null;

  // Hard cap: uniform pre-decimation keeps parsing O(bounded) on monster files.
  if (rawCount > HARD_POINT_CAP) {
    const keepEvery = Math.ceil(rawCount / HARD_POINT_CAP);
    rawSegs = rawSegs.map((s) => ({
      pts: s.pts.filter((_, i) => i % keepEvery === 0 || i === s.pts.length - 1),
      times: s.times.filter((_, i) => i % keepEvery === 0 || i === s.times.length - 1),
    }));
  }

  // Stats on the (possibly decimated) raw points, per segment — gaps excluded.
  let dist = 0, gain = 0;
  for (const { pts } of rawSegs) {
    let climb = 0;
    for (let i = 1; i < pts.length; i++) {
      dist += distanceM(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng);
      const a = pts[i - 1].ele, b = pts[i].ele;
      if (a != null && b != null) {
        climb += b - a;
        if (climb >= GAIN_NOISE_M) { gain += climb; climb = 0; }
        else if (climb < 0) climb = 0;
      }
    }
  }

  // Timed segment gaps → candidate stops (the recorder paused HERE for N min).
  const gaps: GpxGap[] = [];
  for (let i = 1; i < rawSegs.length; i++) {
    const prev = rawSegs[i - 1], next = rawSegs[i];
    const tEnd = prev.times[prev.times.length - 1], tStart = next.times[0];
    if (tEnd == null || tStart == null) continue; // untimed → suggest nothing
    const mins = (tStart - tEnd) / 60_000;
    if (mins >= MIN_GAP_MIN) {
      const p = prev.pts[prev.pts.length - 1];
      gaps.push({ lat: p.lat, lng: p.lng, durationMin: Math.round(mins) });
    }
  }

  // Waypoints — explicit named POIs; capped to keep the confirm UI sane.
  const waypoints: GpxWaypoint[] = [];
  for (const m of xml.matchAll(/<wpt\b([^>]*)>([\s\S]*?)<\/wpt>/g)) {
    const lat = num(m[1].match(/lat="([^"]+)"/)?.[1]);
    const lng = num(m[1].match(/lon="([^"]+)"/)?.[1]);
    if (lat == null || lng == null) continue;
    waypoints.push({
      lat, lng,
      ele: num(m[2].match(/<ele>([^<]+)<\/ele>/)?.[1]),
      name: m[2].match(/<name>([^<]{1,80})<\/name>/)?.[1]?.trim() ?? null,
      sym: m[2].match(/<sym>([^<]{1,60})<\/sym>/)?.[1]?.trim() ?? null,
    });
    if (waypoints.length >= MAX_WAYPOINTS) break;
  }

  // Simplify with a shared budget, proportional to segment size.
  const segments = rawSegs.map(({ pts }) =>
    simplify(pts, Math.max(8, Math.round((pts.length / rawCount) * MAX_POINTS))));

  return { segments, rawCount, distanceM: dist, gainM: gain, name, waypoints, gaps };
}

// Douglas-Peucker in 3D local meters (elevation included — the pano projection
// needs shape in z), ITERATIVE (explicit stack), tolerance-searched to fit
// maxPoints, with a density floor: over-collapsed straight trails fall back to
// uniform sampling so projected pitch still follows the terrain.
function simplify(pts: TrackPoint[], maxPoints: number): TrackPoint[] {
  if (pts.length <= maxPoints) return pts;
  const lat0 = pts[0].lat;
  const mx = 111320 * Math.cos((lat0 * Math.PI) / 180), my = 111320;
  const xyz = pts.map((p) => ({ x: p.lng * mx, y: p.lat * my, z: p.ele ?? 0 }));

  const keep = new Uint8Array(pts.length);

  function dp(tol: number) {
    const stack: [number, number][] = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop()!;
      if (b - a < 2) continue;
      const A = xyz[a];
      const dx = xyz[b].x - A.x, dy = xyz[b].y - A.y, dz = xyz[b].z - A.z;
      const len2 = dx * dx + dy * dy + dz * dz || 1;
      let worst = -1, worstD = 0;
      for (let i = a + 1; i < b; i++) {
        const t = Math.max(0, Math.min(1, ((xyz[i].x - A.x) * dx + (xyz[i].y - A.y) * dy + (xyz[i].z - A.z) * dz) / len2));
        const d = Math.hypot(xyz[i].x - (A.x + t * dx), xyz[i].y - (A.y + t * dy), xyz[i].z - (A.z + t * dz));
        if (d > worstD) { worstD = d; worst = i; }
      }
      if (worstD > tol) { keep[worst] = 1; stack.push([a, worst], [worst, b]); }
    }
  }

  const floor = Math.min(MIN_POINTS, maxPoints, pts.length);
  for (let tol = 2; tol < 100000; tol *= 2) {
    keep.fill(0); keep[0] = keep[pts.length - 1] = 1;
    dp(tol);
    let n = 0;
    for (let i = 0; i < keep.length; i++) n += keep[i];
    if (n <= maxPoints) {
      if (n >= floor) return pts.filter((_, i) => keep[i]);
      break; // over-collapsed — fall through to uniform sampling
    }
  }
  const step = (pts.length - 1) / (floor - 1);
  return Array.from({ length: floor }, (_, i) => pts[Math.round(i * step)]);
}
