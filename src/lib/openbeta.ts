import "server-only";

// OpenBeta (openbeta.io) — the open-licensed climbing route database. VISION
// annotation layer §2: "vision traces the line, the database names it" —
// route identity comes from here, never from the vision model guessing.
// Best-effort: any failure returns [] and tagging proceeds without names.

const ENDPOINT = "https://api.openbeta.io";
const TIMEOUT_MS = 6000;

export interface NearbyClimb {
  name: string;
  grade: string; // YDS or V-scale, '' when ungraded
  area: string;
}

// The public endpoint 502s intermittently — one retry recovers most of them.
async function gql<T>(query: string, variables: Record<string, unknown>, attempt = 0): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`http ${res.status}`);
    const json = await res.json();
    return (json.data as T) ?? null;
  } catch {
    if (attempt === 0) {
      await new Promise((r) => setTimeout(r, 1500));
      return gql<T>(query, variables, 1);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Named climbs near a capture point: crags ranked by climb count, then the
 * top areas' route lists. Two round trips, ~capped output for a prompt.
 */
export async function nearbyClimbs(
  lat: number, lng: number,
  { radiusM = 2500, maxAreas = 3, maxClimbs = 40 } = {},
): Promise<NearbyClimb[]> {
  type CragsNear = { cragsNear: { crags: { uuid: string; areaName: string; totalClimbs: number }[] | null }[] };
  const near = await gql<CragsNear>(
    `query($ll:Point!,$d:Int){cragsNear(lnglat:$ll,maxDistance:$d,includeCrags:true){crags{uuid areaName totalClimbs}}}`,
    { ll: { lat, lng }, d: radiusM },
  );
  if (!near) return [];

  const crags = near.cragsNear
    .flatMap((g) => g.crags ?? [])
    .filter((c) => c.totalClimbs > 0)
    .sort((a, b) => b.totalClimbs - a.totalClimbs)
    .slice(0, maxAreas);
  if (!crags.length) return [];

  type Area = { area: { areaName: string; climbs: { name: string; grades: { yds?: string | null; vscale?: string | null } | null }[] | null } | null };
  const results = await Promise.all(crags.map((c) =>
    gql<Area>(`query($u:ID){area(uuid:$u){areaName climbs{name grades{yds vscale}}}}`, { u: c.uuid }),
  ));

  const out: NearbyClimb[] = [];
  for (const r of results) {
    const a = r?.area;
    if (!a?.climbs) continue;
    for (const cl of a.climbs) {
      out.push({ name: cl.name, grade: cl.grades?.yds ?? cl.grades?.vscale ?? "", area: a.areaName });
      if (out.length >= maxClimbs) return out;
    }
  }
  return out;
}
