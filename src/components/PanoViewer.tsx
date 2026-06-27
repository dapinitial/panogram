"use client";

import dynamic from "next/dynamic";
import type { Post } from "@/lib/types";

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

export default function PanoViewer({ post }: { post: Post }) {
  return <Impl post={post} />;
}
