"use client";

import { useCallback, useEffect, useRef } from "react";
import { ReactPhotoSphereViewer } from "react-photo-sphere-viewer";
import { MarkersPlugin } from "@photo-sphere-viewer/markers-plugin";
import "@photo-sphere-viewer/core/index.css";
import "@photo-sphere-viewer/markers-plugin/index.css";
import type { Annotation, Post } from "@/lib/types";
import { MEDIA } from "@/lib/types";
import { track } from "@/lib/telemetry";

// Real equirectangular renderer. Annotations are PSV markers (the spatial layer).
// In add-mode, clicking the sphere reports the yaw/pitch so a new tag can be placed.
function markerOf(a: Annotation, i: number) {
  return {
    id: `anno-${i}-${a.yaw.toFixed(3)}-${a.pitch.toFixed(3)}`,
    position: { yaw: a.yaw, pitch: a.pitch },
    html: `<div class="pg-marker pg-marker--${a.kind}"><span class="pg-marker-ring"></span><span class="pg-marker-label">${a.label || a.kind}</span></div>`,
    anchor: "center center",
    data: { id: a.id, label: a.label, kind: a.kind, targetUrl: a.targetUrl, targetPostId: a.targetPostId, campaignId: a.campaignId },
  };
}

export type SelectedMarker = { id?: string; label?: string; kind?: string; targetUrl?: string; targetPostId?: string; campaignId?: string };

export default function PanoViewerImpl({
  post, annotations, addMode, onPlace, onSelect,
}: {
  post: Post;
  annotations: Annotation[];
  addMode: boolean;
  onPlace: (yaw: number, pitch: number) => void;
  onSelect: (m: SelectedMarker) => void;
}) {
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any>(null);
  const draggedOnce = useRef(false);
  const addModeRef = useRef(addMode);
  const onPlaceRef = useRef(onPlace);
  addModeRef.current = addMode;
  onPlaceRef.current = onPlace;

  // Push marker changes imperatively so the panorama image never reloads.
  useEffect(() => {
    markersRef.current?.setMarkers(annotations.map(markerOf));
  }, [annotations]);

  const onReady = useCallback(
    (instance: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const viewer = instance as any;
      const mp = viewer.getPlugin(MarkersPlugin);
      markersRef.current = mp;
      mp?.setMarkers(annotations.map(markerOf));

      mp?.addEventListener("select-marker", (e: { marker: { data?: SelectedMarker } }) => {
        track("annotation_tap", { postId: post.id, props: { label: e.marker?.data?.label } });
        if (e.marker?.data) onSelectRef.current(e.marker.data);
      });
      viewer.addEventListener("position-updated", () => {
        if (!draggedOnce.current) { draggedOnce.current = true; track("explore_drag", { postId: post.id }); }
      });
      // Click to place a new annotation when in add-mode.
      viewer.addEventListener("click", (e: { data: { yaw: number; pitch: number } }) => {
        if (addModeRef.current && e.data) onPlaceRef.current(e.data.yaw, e.data.pitch);
      });
    },
    // annotations intentionally omitted — markers sync via the effect above
    [post.id], // eslint-disable-line react-hooks/exhaustive-deps
  );

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
      plugins={[[MarkersPlugin, {}]]}
      onReady={onReady}
      loadingTxt={MEDIA[post.type].immersive ? "Entering sphere…" : "Loading view…"}
    />
  );
}
