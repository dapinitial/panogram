"use client";

import dynamic from "next/dynamic";
import type { Post } from "@/lib/types";
import type { AtlasPlot } from "@/lib/db";

// MapLibre touches window/WebGL — browser only, same rule as the 360 viewer.
const Impl = dynamic(() => import("./MapViewImpl"), {
  ssr: false,
  loading: () => (
    <div className="psv-loading" style={{ minHeight: 420 }}>
      <span>Unfolding the atlas…</span>
    </div>
  ),
});

export default function MapView(props: {
  posts: Post[];
  onOpen: (id: string) => void;
  user: { id: string; email?: string } | null;
  onAuthRequired: () => void;
  plot: AtlasPlot | null;
  onPlotChange: (p: AtlasPlot | null) => void;
}) {
  return <Impl {...props} />;
}
