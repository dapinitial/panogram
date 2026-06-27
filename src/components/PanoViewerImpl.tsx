"use client";

import { useCallback, useRef } from "react";
import { ReactPhotoSphereViewer } from "react-photo-sphere-viewer";
import { MarkersPlugin } from "@photo-sphere-viewer/markers-plugin";
import "@photo-sphere-viewer/core/index.css";
import "@photo-sphere-viewer/markers-plugin/index.css";
import type { Post } from "@/lib/types";
import { MEDIA } from "@/lib/types";
import { track } from "@/lib/telemetry";

// Real equirectangular renderer (three.js under the hood). Annotations become
// PSV markers — the literal spatial layer from the vision, shown today as a
// glowing HUD tag floating in the scene.
export default function PanoViewerImpl({ post }: { post: Post }) {
  const draggedOnce = useRef(false);

  const markers =
    (post.annotations ?? []).map((a, i) => ({
      id: `anno-${i}`,
      position: { yaw: a.yaw, pitch: a.pitch },
      html: `<div class="pg-marker pg-marker--${a.kind}"><span class="pg-marker-ring"></span><span class="pg-marker-label">${a.label}</span></div>`,
      anchor: "center center",
      tooltip: { content: a.label, position: "top center" },
      data: { kind: a.kind, label: a.label },
    })) ?? [];

  const onReady = useCallback(
    (instance: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const viewer = instance as any;
      viewer.addEventListener("position-updated", () => {
        if (!draggedOnce.current) {
          draggedOnce.current = true;
          track("explore_drag", { postId: post.id, props: { type: post.type } });
        }
      });
      try {
        const mp = viewer.getPlugin(MarkersPlugin);
        mp?.addEventListener("select-marker", (e: { marker: { data?: { label?: string } } }) => {
          track("annotation_tap", { postId: post.id, props: { label: e.marker?.data?.label } });
        });
      } catch {
        /* no markers on this post */
      }
    },
    [post.id, post.type],
  );

  // 180 formats: clamp the horizontal field so it reads as a half-sphere.
  const immersive = MEDIA[post.type].immersive;
  const is180 = post.type.startsWith("180");

  return (
    <ReactPhotoSphereViewer
      src={post.panoUrl}
      height="100%"
      width="100%"
      containerClass="psv-stage"
      navbar={["zoom", "fullscreen"]}
      defaultZoomLvl={is180 ? 40 : 0}
      minFov={30}
      maxFov={is180 ? 90 : 100}
      plugins={markers.length ? [[MarkersPlugin, { markers }]] : []}
      onReady={onReady}
      loadingTxt={immersive ? "Entering sphere…" : "Loading view…"}
    />
  );
}
