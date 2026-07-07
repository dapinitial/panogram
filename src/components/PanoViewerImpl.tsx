"use client";

import { useCallback, useEffect, useRef } from "react";
import { ReactPhotoSphereViewer } from "react-photo-sphere-viewer";
import { MarkersPlugin } from "@photo-sphere-viewer/markers-plugin";
import "@photo-sphere-viewer/core/index.css";
import "@photo-sphere-viewer/markers-plugin/index.css";
import type { Annotation, Post } from "@/lib/types";
import { MEDIA } from "@/lib/types";
import { track } from "@/lib/telemetry";
import type { SunPath } from "@/lib/sun";

// Real equirectangular renderer. Annotations are PSV markers (the spatial layer).
// In add-mode, clicking the sphere reports the yaw/pitch so a new tag can be placed.
//
// SAFETY RAIL (VISION.md annotation layer §6): safety-critical markers
// (rappel/anchor/crack) render dashed + "unverified" until confirmed sightings
// exist. This styling is the trust contract — never bypass it.
function markerOf(a: Annotation, i: number) {
  const unverified = (a.safetyCritical && !(a.confirmedSightings && a.confirmedSightings > 0)) || a.source === "ai";
  const data = { id: a.id, label: a.label, kind: a.kind, targetUrl: a.targetUrl, targetPostId: a.targetPostId, campaignId: a.campaignId };

  // Drawn topo lines (routes, rap lines, approaches) are spherical polylines —
  // the SAME schema whether a climber drew it or the vision pipeline traced it.
  if (a.path && a.path.length > 1) {
    return {
      id: `anno-${i}-path-${a.id ?? a.path[0][0].toFixed(3)}`,
      polyline: a.path,
      svgStyle: {
        stroke: unverified ? "rgba(255,180,84,0.9)" : "var(--accent, #5fe2cb)",
        strokeWidth: "3px",
        strokeLinecap: "round",
        strokeLinejoin: "round",
        strokeDasharray: unverified ? "6 8" : "none",
        fill: "none",
      },
      tooltip: `${a.label || a.kind}${unverified ? " · unverified" : ""}`,
      data,
    };
  }

  return {
    id: `anno-${i}-${a.yaw.toFixed(3)}-${a.pitch.toFixed(3)}`,
    position: { yaw: a.yaw, pitch: a.pitch },
    html: `<div class="pg-marker pg-marker--${a.kind}${unverified ? " pg-marker--unverified" : ""}"><span class="pg-marker-ring"></span><span class="pg-marker-label">${a.label || a.kind}</span></div>`,
    anchor: "center center",
    data,
  };
}

// The deterministic sun layer (VISION §3): today's arc across THIS pano plus
// rise/set anchors on the horizon — gold, dotted, unmistakably "time" not "beta".
function sunMarkersOf(sun: SunPath) {
  const t = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const markers: object[] = [
    { id: "sun-rise", position: { yaw: sun.riseYaw, pitch: 0 }, anchor: "center center", data: { kind: "sun" },
      html: `<div class="pg-marker pg-marker--sun"><span class="pg-marker-ring"></span><span class="pg-marker-label">☀ rises ${t(sun.sunrise)}</span></div>` },
    { id: "sun-set", position: { yaw: sun.setYaw, pitch: 0 }, anchor: "center center", data: { kind: "sun" },
      html: `<div class="pg-marker pg-marker--sun"><span class="pg-marker-ring"></span><span class="pg-marker-label">☾ sets ${t(sun.sunset)}</span></div>` },
  ];
  if (sun.path.length > 1) {
    markers.push({
      id: "sun-arc", polyline: sun.path, tooltip: "Today's sun path", data: { kind: "sun" },
      svgStyle: { stroke: "rgba(255,205,100,0.9)", strokeWidth: "3px", strokeLinecap: "round", strokeDasharray: "1 10", fill: "none" },
    });
  }
  return markers;
}

// Deterministic peak labels — OSM peaks placed on the horizon by bearing math.
export interface PeakMarker { name: string; ele: number | null; yaw: number; pitch: number }

function peakMarkersOf(peaks: PeakMarker[]) {
  return peaks.map((p, i) => ({
    id: `peak-${i}-${p.name}`,
    position: { yaw: p.yaw, pitch: p.pitch },
    anchor: "center center",
    data: { kind: "peak" },
    html: `<div class="pg-marker pg-marker--peak"><span class="pg-marker-ring"></span><span class="pg-marker-label">▲ ${p.name}${p.ele ? ` · ${Math.round(p.ele)}m` : ""}</span></div>`,
  }));
}

// A recorded track projected into the sphere — segments pre-split at the yaw
// seam by the caller; rendered as glowing holo polylines.
export interface TrackOverlay { label: string; segments: [number, number][][] }

function trackMarkersOf(overlays: TrackOverlay[]) {
  return overlays.flatMap((t, ti) =>
    t.segments
      .filter((seg) => seg.length > 1)
      .map((seg, si) => ({
        id: `track-${ti}-${si}`,
        polyline: seg,
        tooltip: `🥾 ${t.label}`,
        data: { kind: "track" },
        svgStyle: {
          stroke: "rgba(143,233,255,0.9)",
          strokeWidth: "4px",
          strokeLinecap: "round",
          strokeLinejoin: "round",
          fill: "none",
        },
      })),
  );
}

export type SelectedMarker = { id?: string; label?: string; kind?: string; targetUrl?: string; targetPostId?: string; campaignId?: string };

export default function PanoViewerImpl({
  post, annotations, addMode, onPlace, onSelect, sunPath, peaks, trackOverlays,
}: {
  post: Post;
  annotations: Annotation[];
  addMode: boolean;
  onPlace: (yaw: number, pitch: number) => void;
  onSelect: (m: SelectedMarker) => void;
  sunPath?: SunPath | null;
  peaks?: PeakMarker[] | null;
  trackOverlays?: TrackOverlay[] | null;
}) {
  const onSelectRef = useRef(onSelect);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any>(null);
  const draggedOnce = useRef(false);
  const addModeRef = useRef(addMode);
  const onPlaceRef = useRef(onPlace);
  const sunRef = useRef(sunPath);
  const peaksRef = useRef(peaks);
  const tracksRef = useRef(trackOverlays);
  // Event handlers and onReady read these refs strictly after effects run.
  useEffect(() => {
    onSelectRef.current = onSelect;
    addModeRef.current = addMode;
    onPlaceRef.current = onPlace;
    sunRef.current = sunPath;
    peaksRef.current = peaks;
    tracksRef.current = trackOverlays;
  });

  // Push marker changes imperatively so the panorama image never reloads.
  useEffect(() => {
    markersRef.current?.setMarkers([
      ...annotations.map(markerOf),
      ...(sunPath ? sunMarkersOf(sunPath) : []),
      ...(peaks ? peakMarkersOf(peaks) : []),
      ...(trackOverlays ? trackMarkersOf(trackOverlays) : []),
    ]);
  }, [annotations, sunPath, peaks, trackOverlays]);

  const onReady = useCallback(
    (instance: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const viewer = instance as any;
      const mp = viewer.getPlugin(MarkersPlugin);
      markersRef.current = mp;
      mp?.setMarkers([
        ...annotations.map(markerOf),
        ...(sunRef.current ? sunMarkersOf(sunRef.current) : []),
        ...(peaksRef.current ? peakMarkersOf(peaksRef.current) : []),
        ...(tracksRef.current ? trackMarkersOf(tracksRef.current) : []),
      ]);

      mp?.addEventListener("select-marker", (e: { marker: { data?: SelectedMarker } }) => {
        if (e.marker?.data?.kind === "sun" || e.marker?.data?.kind === "peak" || e.marker?.data?.kind === "track") return; // ambient layers, not annotations
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
