"use client";

import dynamic from "next/dynamic";
import type { Annotation, Post } from "@/lib/types";
import type { SelectedMarker } from "./PanoViewerImpl";
import type { SunPath } from "@/lib/sun";

// ssr:false guarantees the WebGL/three.js bundle (and anything touching `window`)
// only ever loads in the browser — never during server render.
const Impl = dynamic(() => import("./PanoViewerImpl"), {
  ssr: false,
  loading: () => (
    <div className="psv-loading">
      <span>Initializing spatial view…</span>
    </div>
  ),
});

export default function PanoViewer(props: {
  post: Post;
  annotations: Annotation[];
  addMode: boolean;
  onPlace: (yaw: number, pitch: number) => void;
  onSelect: (m: SelectedMarker) => void;
  sunPath?: SunPath | null;
}) {
  return <Impl {...props} />;
}
