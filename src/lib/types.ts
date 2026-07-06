// Shared types — mirror the `media_type` enum + posts/annotations in the schema
// (supabase/migrations/...init_panogram.sql).

export type MediaType =
  | "panoramic_photo"
  | "360_photo"
  | "360_video"
  | "180_photo"
  | "180_video";

export interface MediaSpec {
  id: MediaType;
  label: string;     // human label
  short: string;     // badge text
  immersive: boolean; // true = spherical/VR (360/180), false = flat-wide pano
}

export const MEDIA: Record<MediaType, MediaSpec> = {
  panoramic_photo: { id: "panoramic_photo", label: "Panoramic Photo", short: "Panoramic", immersive: false },
  "360_photo":     { id: "360_photo",       label: "360° Photo",      short: "360°",      immersive: true },
  "360_video":     { id: "360_video",       label: "360° Video",      short: "360° Video", immersive: true },
  "180_photo":     { id: "180_photo",       label: "180° Photo",      short: "VR180",     immersive: true },
  "180_video":     { id: "180_video",       label: "180° Video",      short: "VR180 Video", immersive: true },
};

export interface Annotation {
  id?: string;   // DB id (present when loaded from the server)
  yaw: number;   // radians — sphere longitude
  pitch: number; // radians — sphere latitude
  label: string;
  kind: "note" | "link" | "product" | "cache" | "sponsored" | "portal" | "route" | "poi" | "nature" | "cultural";
  targetUrl?: string;     // link / product / sponsored — tap-out destination
  targetPostId?: string;  // portal — teleport target pano
  campaignId?: string;    // backing ad campaign (attributes impressions/conversions)

  // Annotation layer (VISION.md) — topo lines, POIs, the safety rail
  source?: "human" | "ai";      // AI-proposed tags are reviewable, never authoritative
  path?: [number, number][];    // spherical polyline [[yaw,pitch],…] radians — 'route' lines
  poiType?: PoiType;            // 'poi' — what the placeable thing is
  safetyCritical?: boolean;     // rappel/anchor/crack — renders UNVERIFIED until confirmed
  confirmedSightings?: number;  // confirmed-sighting count (the trust upgrade)
}

// The backcountry's living map — placeable POI vocabulary (mirrors the
// annotations.poi_type check constraint; keep both in sync by migration).
export type PoiType =
  | "camp" | "bivy" | "water" | "trailhead" | "cairn" | "mine" | "wreck" | "summit"
  | "rappel" | "anchor" | "crack" // ← safety-critical subset (VISION §6)
  | "other";

export const POI: Record<PoiType, { label: string; safetyCritical: boolean }> = {
  camp:      { label: "Camp",           safetyCritical: false },
  bivy:      { label: "Bivy",           safetyCritical: false },
  water:     { label: "Water source",   safetyCritical: false },
  trailhead: { label: "Trailhead",      safetyCritical: false },
  cairn:     { label: "Cairn",          safetyCritical: false },
  mine:      { label: "Mine",           safetyCritical: false },
  wreck:     { label: "Wreck",          safetyCritical: false },
  summit:    { label: "Summit",         safetyCritical: false },
  rappel:    { label: "Rappel station", safetyCritical: true },
  anchor:    { label: "Anchor",         safetyCritical: true },
  crack:     { label: "Crack system",   safetyCritical: true }, // observation, never an endorsement
  other:     { label: "Point of interest", safetyCritical: false },
};

// A sighting — the native comment, a reputation signal, and a triangulation
// sample in one (mirrors the `sightings` table).
export interface Sighting {
  id: string;
  annotationId: string;
  verdict: "confirmed" | "disputed" | "gone";
  note: string;
  createdAt: string;
  author: Author;
}

export interface Author {
  handle: string;
  initials: string;
  grad: string;
}

export interface Post {
  id: string;
  authorId?: string; // DB author (absent for seed/mock posts)
  type: MediaType;
  title: string;
  location: string;
  author: Author;
  poster: string;   // CSS background for the card (fast, pretty)
  panoUrl: string;  // real equirectangular image the viewer loads
  likes: number;
  comments: number;
  saves: number;
  annotationCount?: number;
  annotations?: Annotation[];

  // capture geo (posts.capture_*) — feeds the deterministic sun layer (lib/sun.ts)
  // and bearing/triangulation. Absent on seed/mock posts.
  captureLat?: number;
  captureLng?: number;
  captureHeading?: number; // compass degrees the pano's 0-yaw faces
}

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  author: Author;
}
