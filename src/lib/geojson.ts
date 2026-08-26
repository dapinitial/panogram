// GeoJSON → the same ParsedTrack shape parseGpx produces, so the Plot flow and
// the map renderer are parser-agnostic. LineString/MultiLineString become the
// route (simplified to a rough outline); Point/MultiPoint features become
// candidate markers. GeoJSON has no timed-pause concept, so `gaps` is always
// empty. Coordinates are [lng, lat, ele?] per the spec — swapped to the app's
// internal lat-first {lat, lng, ele}.

import { MAX_POINTS, simplify, trackStats, type ParsedTrack, type TrackPoint, type GpxWaypoint } from "./gpx";

const MAX_JSON_BYTES = 25 * 1024 * 1024;
const MAX_WAYPOINTS = 30;

type Position = number[];
interface Geometry { type: string; coordinates?: unknown; geometries?: Geometry[] }
interface Feature { type: "Feature"; geometry: Geometry | null; properties?: Record<string, unknown> | null }

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
function toPoint(pos: Position): TrackPoint | null {
  const [lng, lat, ele] = pos;
  if (!finite(lat) || !finite(lng)) return null;
  return { lat, lng, ele: finite(ele) ? ele : null };
}
const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : null;

/** Parse a GeoJSON document into a ParsedTrack, or null if unreadable / empty. */
export function parseGeoJSON(text: string): ParsedTrack | null {
  if (text.length > MAX_JSON_BYTES) return null;
  let root: unknown;
  try { root = JSON.parse(text); } catch { return null; }
  if (!root || typeof root !== "object") return null;

  // Normalise anything (FeatureCollection / Feature / bare geometry) to features.
  const obj = root as { type?: string; features?: unknown; geometry?: unknown; properties?: unknown };
  const features: Feature[] =
    obj.type === "FeatureCollection" && Array.isArray(obj.features)
      ? (obj.features as Feature[])
      : obj.type === "Feature"
        ? [obj as Feature]
        : [{ type: "Feature", geometry: obj as Geometry, properties: null }];

  const rawSegments: TrackPoint[][] = [];
  const waypoints: GpxWaypoint[] = [];

  // Walk a geometry (recursing into GeometryCollection), routing lines to
  // segments and points to waypoints, tagged with the owning feature's props.
  function walk(geom: Geometry | null, props: Record<string, unknown> | null | undefined) {
    if (!geom) return;
    switch (geom.type) {
      case "LineString": {
        const seg = ((geom.coordinates as Position[]) ?? []).map(toPoint).filter((p): p is TrackPoint => !!p);
        if (seg.length > 1) rawSegments.push(seg);
        break;
      }
      case "MultiLineString":
        for (const line of (geom.coordinates as Position[][]) ?? []) {
          const seg = line.map(toPoint).filter((p): p is TrackPoint => !!p);
          if (seg.length > 1) rawSegments.push(seg);
        }
        break;
      case "Point": {
        const p = toPoint((geom.coordinates as Position) ?? []);
        if (p && waypoints.length < MAX_WAYPOINTS) waypoints.push(waypointFrom(p, props));
        break;
      }
      case "MultiPoint":
        for (const pos of (geom.coordinates as Position[]) ?? []) {
          const p = toPoint(pos);
          if (p && waypoints.length < MAX_WAYPOINTS) waypoints.push(waypointFrom(p, props));
        }
        break;
      case "GeometryCollection":
        for (const g of geom.geometries ?? []) walk(g, props);
        break;
    }
  }
  for (const f of features) walk(f?.geometry ?? null, f?.properties);

  if (!rawSegments.length && !waypoints.length) return null;

  const rawCount = rawSegments.reduce((n, s) => n + s.length, 0);
  const { distanceM, gainM } = trackStats(rawSegments);
  const segments = rawSegments.map((pts) =>
    simplify(pts, Math.max(8, Math.round((pts.length / Math.max(rawCount, 1)) * MAX_POINTS))));

  // Document/feature name and a recorded-at, if the file carries them.
  const topProps = (obj.properties as Record<string, unknown> | null) ?? features[0]?.properties ?? null;
  const name = str(topProps?.name) ?? str(topProps?.title);
  const recordedAt = normISO(topProps?.time ?? topProps?.timestamp ?? topProps?.date);

  return { segments, rawCount, distanceM, gainM, name, recordedAt, waypoints, gaps: [] };
}

function waypointFrom(p: TrackPoint, props: Record<string, unknown> | null | undefined): GpxWaypoint {
  return {
    lat: p.lat, lng: p.lng, ele: p.ele,
    name: str(props?.name) ?? str(props?.title),
    sym: str(props?.sym) ?? str(props?.type), // fed through SYM_TO_POI by the caller
  };
}

function normISO(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
