"use client";

import dynamic from "next/dynamic";
import type { MapRoutePoint, SavedMapMarker } from "@/lib/db";

// Mapbox is browser-only (window/WebGL) + a large SDK, so the lean trip globe
// loads client-side only. Used by the /embed page and the Trips CMS preview.
const Impl = dynamic(() => import("./TripGlobeImpl"), {
  ssr: false,
  loading: () => <div className="trip-globe trip-globe--empty"><span>Lifting the world into 3D…</span></div>,
});

export default function TripGlobe(props: {
  route: MapRoutePoint[][];
  markers?: SavedMapMarker[];
  color?: string;
  autoplay?: boolean;
  loop?: boolean;
  playToken?: number;
  onFlyingChange?: (flying: boolean) => void;
}) {
  return <Impl {...props} />;
}
