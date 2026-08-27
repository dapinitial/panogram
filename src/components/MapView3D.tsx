"use client";

import dynamic from "next/dynamic";
import type { Post } from "@/lib/types";
import type { AtlasPlot } from "@/lib/db";

// Mapbox GL touches window/WebGL and ships a large SDK — browser-only, and loaded
// only when the 3D toggle is on, so the 2D Atlas never pays for it.
const Impl = dynamic(() => import("./MapView3DImpl"), {
  ssr: false,
  loading: () => (
    <div className="psv-loading" style={{ minHeight: 420 }}>
      <span>Lifting the world into 3D…</span>
    </div>
  ),
});

export default function MapView3D(props: {
  posts: Post[];
  onOpen: (id: string) => void;
  plot: AtlasPlot | null;
  onPlotChange: (p: AtlasPlot | null) => void;
}) {
  return <Impl {...props} />;
}
