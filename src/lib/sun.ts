// The deterministic layer (VISION.md "annotation layer" §3) — sun position and
// rise/set from capture GPS + compass heading. Math, not AI: always correct,
// zero inference cost. Standard low-precision solar formulas (≈ suncalc's,
// accurate to ~1 minute / ~0.3° — plenty for "crests that ridge at 6:42am").
//
// Sphere convention: a pano's yaw 0 faces `capture_heading` compass degrees
// (posts.capture_heading), so sphere yaw = sun azimuth − heading. Sun altitude
// maps straight to pitch. Both radians, matching PSV markers.

const RAD = Math.PI / 180;
const DAY_MS = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
const OBLIQUITY = 23.4397 * RAD; // Earth's axial tilt

const toJulian = (date: Date) => date.valueOf() / DAY_MS - 0.5 + J1970;
const fromJulian = (j: number) => new Date((j + 0.5 - J1970) * DAY_MS);
const toDays = (date: Date) => toJulian(date) - J2000;

function solarMeanAnomaly(d: number) { return RAD * (357.5291 + 0.98560028 * d); }
function eclipticLongitude(M: number) {
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)); // equation of center
  const P = RAD * 102.9372; // perihelion of Earth
  return M + C + P + Math.PI;
}
function declination(L: number) { return Math.asin(Math.sin(L) * Math.sin(OBLIQUITY)); }
function rightAscension(L: number) { return Math.atan2(Math.sin(L) * Math.cos(OBLIQUITY), Math.cos(L)); }
function siderealTime(d: number, lw: number) { return RAD * (280.16 + 360.9856235 * d) - lw; }

/** Sun azimuth (compass rad, 0 = north, clockwise) + altitude (rad) at a moment/place. */
export function sunPosition(date: Date, lat: number, lng: number): { azimuth: number; altitude: number } {
  const lw = -lng * RAD, phi = lat * RAD, d = toDays(date);
  const M = solarMeanAnomaly(d), L = eclipticLongitude(M);
  const dec = declination(L), ra = rightAscension(L);
  const H = siderealTime(d, lw) - ra; // hour angle
  const altitude = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  // atan2 azimuth is measured from south; flip to compass-from-north
  const azS = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  return { azimuth: azS + Math.PI, altitude };
}

/** Sunrise / solar noon / sunset for the calendar day containing `date`. */
export function sunTimes(date: Date, lat: number, lng: number): { sunrise: Date; solarNoon: Date; sunset: Date } {
  const lw = -lng * RAD, phi = lat * RAD;
  const n = Math.round(toDays(date) - 0.0009 - lw / (2 * Math.PI));
  const ds = 0.0009 + lw / (2 * Math.PI) + n; // approx solar transit
  const M = solarMeanAnomaly(ds), L = eclipticLongitude(M), dec = declination(L);
  const Jnoon = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const h0 = -0.833 * RAD; // sun's upper limb touches the horizon (refraction included)
  const cosH = (Math.sin(h0) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  const H = Math.acos(Math.min(1, Math.max(-1, cosH))); // clamp: polar day/night degrades to noon
  const Jset = Jnoon + H / (2 * Math.PI), Jrise = Jnoon - H / (2 * Math.PI);
  return { sunrise: fromJulian(Jrise), solarNoon: fromJulian(Jnoon), sunset: fromJulian(Jset) };
}

const TWO_PI = 2 * Math.PI;
const normYaw = (yaw: number) => ((yaw % TWO_PI) + TWO_PI) % TWO_PI;

export interface SunPath {
  sunrise: Date;
  sunset: Date;
  /** Where on the sphere the sun rises/sets — anchor the ✦ markers here. */
  riseYaw: number;
  setYaw: number;
  /** The day's arc across THIS pano: [[yaw,pitch],…] radians, above-horizon only. */
  path: [number, number][];
}

/**
 * The sun's arc drawn across a specific pano ("crests that ridge at 6:42am").
 * Needs the post's capture geo; returns null without it — the UI simply
 * doesn't offer the layer. Renders via the same PSV polyline as route topos.
 */
export function sunPathForPano(
  post: { captureLat?: number | null; captureLng?: number | null; captureHeading?: number | null },
  date: Date = new Date(),
  samples = 48,
): SunPath | null {
  const { captureLat: lat, captureLng: lng } = post;
  if (lat == null || lng == null) return null;
  const heading = (post.captureHeading ?? 0) * RAD;

  const { sunrise, sunset } = sunTimes(date, lat, lng);
  const toYawPitch = (t: Date): [number, number] => {
    const { azimuth, altitude } = sunPosition(t, lat, lng);
    return [normYaw(azimuth - heading), altitude];
  };

  const span = sunset.valueOf() - sunrise.valueOf();
  const path: [number, number][] = [];
  for (let i = 0; i <= samples; i++) {
    const p = toYawPitch(new Date(sunrise.valueOf() + (span * i) / samples));
    if (p[1] >= 0) path.push(p); // above-horizon only
  }
  return { sunrise, sunset, riseYaw: toYawPitch(sunrise)[0], setYaw: toYawPitch(sunset)[0], path };
}
