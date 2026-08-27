// Shared: turn a GPX/GeoJSON file into an AtlasPlot (simplified route + curated
// markers). Used by both the flat and 3D Atlas import buttons so the parsing +
// marker-mining lives in one place.
import { parseGpx } from "./gpx";
import { parseGeoJSON } from "./geojson";
import type { AtlasPlot, SavedMapMarker } from "./db";
import type { PoiType } from "./types";

const MAX_BYTES = 25 * 1024 * 1024;

// Garmin/Gaia symbols → our POI vocabulary.
export const SYM_TO_POI: Record<string, PoiType> = {
  campground: "camp", camp: "camp", tent: "camp",
  "drinking water": "water", water: "water", "water source": "water",
  summit: "summit", "trail head": "trailhead", trailhead: "trailhead",
};

export type ImportResult = { plot: AtlasPlot; format: "gpx" | "geojson" } | { error: string };

export async function importPlotFile(file: File): Promise<ImportResult> {
  if (file.size > MAX_BYTES) return { error: "File too large (25MB max)." };
  const text = await file.text();
  const isGeo = /\.(geojson|json)$/i.test(file.name) || text.trimStart().startsWith("{");
  const parsed = isGeo ? parseGeoJSON(text) : parseGpx(text);
  if (!parsed) return { error: "Couldn't read that as a GPX or GeoJSON track." };
  const markers: SavedMapMarker[] = [
    ...parsed.waypoints.map((w): SavedMapMarker => ({
      lat: w.lat, lng: w.lng, label: w.name ?? "Waypoint",
      poiType: SYM_TO_POI[(w.sym ?? "").toLowerCase()] ?? "other",
    })),
    ...parsed.gaps.map((g): SavedMapMarker => ({
      lat: g.lat, lng: g.lng,
      label: g.durationMin >= 360 ? `Overnight stop (${Math.round(g.durationMin / 60)}h)` : `Rest stop (${g.durationMin} min)`,
      poiType: g.durationMin >= 360 ? "camp" : "other",
    })),
  ];
  return {
    plot: { title: parsed.name ?? "Imported route", route: parsed.segments, markers, distanceM: parsed.distanceM, gainM: parsed.gainM },
    format: isGeo ? "geojson" : "gpx",
  };
}
