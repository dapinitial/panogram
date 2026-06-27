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
  yaw: number;   // radians — sphere longitude
  pitch: number; // radians — sphere latitude
  label: string;
  kind: "note" | "link" | "product" | "cache" | "sponsored" | "portal";
}

export interface Author {
  handle: string;
  initials: string;
  grad: string;
}

export interface Post {
  id: string;
  type: MediaType;
  title: string;
  location: string;
  author: Author;
  poster: string;   // CSS background for the card (fast, pretty)
  panoUrl: string;  // real equirectangular image the viewer loads
  likes: number;
  comments: number;
  saves: number;
  annotations?: Annotation[];
}
