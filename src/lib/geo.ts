// Real-world geometry for the spatial layer (VISION: "bearing for free,
// distance is hard"). A tapped sphere point + the pano's compass heading give
// an exact compass BEARING from the capture spot; bearings from 2+ panos that
// see the same feature intersect into real coordinates — the crowdsourced
// spatial-map data moat. Pure math, isomorphic (client + server).

const DEG = 180 / Math.PI;

/** Sphere yaw (radians, 0 = pano center) + capture heading (compass degrees
 *  the center faces) → compass bearing of the tapped feature, 0–360. */
export function worldBearing(captureHeading: number, yaw: number): number {
  return ((captureHeading + yaw * DEG) % 360 + 360) % 360;
}

/** Compass bearing (degrees) from one point toward another. Local-flat
 *  approximation — plenty for the sub-50km ranges peaks/POIs live at. */
export function bearingBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dx = (lng2 - lng1) * Math.cos(((lat1 + lat2) / 2) / DEG);
  const dy = lat2 - lat1;
  return ((Math.atan2(dx, dy) * DEG) % 360 + 360) % 360;
}

/** Approximate ground distance in meters (same local-flat model). */
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dx = (lng2 - lng1) * Math.cos(((lat1 + lat2) / 2) / DEG) * 111320;
  const dy = (lat2 - lat1) * 111320;
  return Math.hypot(dx, dy);
}

export interface BearingObservation {
  lat: number;     // where the observer stood
  lng: number;
  bearing: number; // compass degrees toward the feature
}

export interface TriangulatedPoint {
  lat: number;
  lng: number;
  /** RMS perpendicular distance (meters) of the point from the bearing rays —
   *  a confidence signal; big residuals mean the observations disagree. */
  residualM: number;
}

// Local equirectangular projection: good to well under a meter at the
// sub-10km scales bearings are useful for.
const M_PER_DEG_LAT = 111320;

/**
 * Least-squares intersection of 2+ bearing rays → the feature's coordinates.
 * Returns null for <2 observations or near-parallel bearings (no stable
 * intersection). Standard "closest point to N lines" normal equations.
 */
export function intersectBearings(obs: BearingObservation[]): TriangulatedPoint | null {
  if (obs.length < 2) return null;
  const lat0 = obs.reduce((s, o) => s + o.lat, 0) / obs.length;
  const lng0 = obs.reduce((s, o) => s + o.lng, 0) / obs.length;
  const mPerDegLng = M_PER_DEG_LAT * Math.cos(lat0 / DEG);

  // Accumulate A = Σ(I − ddᵀ), b = Σ(I − ddᵀ)p over rays p + t·d (x east, y north).
  let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
  for (const o of obs) {
    const px = (o.lng - lng0) * mPerDegLng;
    const py = (o.lat - lat0) * M_PER_DEG_LAT;
    const dx = Math.sin(o.bearing / DEG), dy = Math.cos(o.bearing / DEG);
    const m11 = 1 - dx * dx, m12 = -dx * dy, m22 = 1 - dy * dy;
    a11 += m11; a12 += m12; a22 += m22;
    b1 += m11 * px + m12 * py;
    b2 += m12 * px + m22 * py;
  }
  const det = a11 * a22 - a12 * a12;
  if (Math.abs(det) < 1e-6) return null; // parallel bearings never meet
  const x = (a22 * b1 - a12 * b2) / det;
  const y = (a11 * b2 - a12 * b1) / det;

  // Residual: perpendicular distance from the solution to each ray.
  let sq = 0;
  for (const o of obs) {
    const px = (o.lng - lng0) * mPerDegLng, py = (o.lat - lat0) * M_PER_DEG_LAT;
    const dx = Math.sin(o.bearing / DEG), dy = Math.cos(o.bearing / DEG);
    const rx = x - px, ry = y - py;
    const t = rx * dx + ry * dy;
    sq += (rx - t * dx) ** 2 + (ry - t * dy) ** 2;
  }

  return {
    lat: lat0 + y / M_PER_DEG_LAT,
    lng: lng0 + x / mPerDegLng,
    residualM: Math.sqrt(sq / obs.length),
  };
}
