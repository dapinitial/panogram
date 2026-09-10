"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { MapRoutePoint, SavedMapMarker, FlyConfig } from "@/lib/db";
import { POI } from "@/lib/types";
import { flyTour, type TourHandle } from "@/lib/fly-tour";

// A lean, CHROMELESS Standard-Satellite globe that drapes a route on real
// terrain and flies the cinematic helicopter tour, honoring the trip's per-trip
// fly-by settings. It's the embed surface (white-label) and the CMS preview.
// Marker add/drag only when `editable`; a minimal ▶ only when `showPlay`.

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
type LngLat = { lng: number; lat: number };
const reducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function TripGlobeImpl({
  route, markers = [], color = "#57eaff", fly = {}, autoplay = false, loop = false,
  playToken = 0, stopToken = 0, editable = false, addMode = false,
  showPlay = false, showLabels = false, stopOnInteract = false, neutral = false,
  onAddMarker, onMoveMarker, onFlyingChange,
}: {
  route: MapRoutePoint[][];
  markers?: SavedMapMarker[];
  color?: string;
  fly?: FlyConfig;
  autoplay?: boolean;
  loop?: boolean;
  playToken?: number;    // bump to (re)start the tour (CMS "Fly" button)
  stopToken?: number;    // bump to cancel a running tour (CMS "Stop" button)
  editable?: boolean;
  addMode?: boolean;
  showPlay?: boolean;    // render a minimal ▶ when idle (embed with autoplay off)
  showLabels?: boolean;  // always show marker labels (embed; hover is not a thing on phones)
  stopOnInteract?: boolean; // first user gesture cancels the tour + stops looping (embed)
  neutral?: boolean;     // white-label: neutral fallback text, no dev hints
  onAddMarker?: (ll: LngLat) => void;
  onMoveMarker?: (i: number, ll: LngLat) => void;
  onFlyingChange?: (flying: boolean) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const tourRef = useRef<TourHandle | null>(null);
  const markerObjs = useRef<mapboxgl.Marker[]>([]);
  const drawnRouteRef = useRef<MapRoutePoint[][] | null>(null); // last route drawn — skips redundant redraws
  const [ready, setReady] = useState(false);
  const [flying, setFlying] = useState(false);
  const [mapErr, setMapErr] = useState(false);

  // Refs so the one-time map handlers see fresh values.
  const loopRef = useRef(loop); useEffect(() => { loopRef.current = loop; }, [loop]);
  const flyRef = useRef(fly); useEffect(() => { flyRef.current = fly; }, [fly]);
  const addModeRef = useRef(addMode); useEffect(() => { addModeRef.current = addMode; }, [addMode]);
  const onAddRef = useRef(onAddMarker); useEffect(() => { onAddRef.current = onAddMarker; });
  const onMoveRef = useRef(onMoveMarker); useEffect(() => { onMoveRef.current = onMoveMarker; });
  const onFlyRef = useRef(onFlyingChange); useEffect(() => { onFlyRef.current = onFlyingChange; });
  const editableRef = useRef(editable); useEffect(() => { editableRef.current = editable; }, [editable]);

  const path = route.flat();

  const setFly = (v: boolean) => { setFlying(v); onFlyRef.current?.(v); };

  // Update the route IN PLACE (setData) — never removeSource. Mapbox v3 throws
  // inside _updateTerrain if a source is removed while the terrain DEM is still
  // loading, and an uncaught error here would crash the whole page (a white
  // error screen on the client's site). Also cheaper than re-adding layers.
  type GJ = Parameters<mapboxgl.GeoJSONSource["setData"]>[0];
  function drawRoute(map: mapboxgl.Map) {
    try {
      const segs = route.filter((s) => s.length > 1);
      const data: GJ = {
        type: "Feature", properties: {},
        geometry: { type: "MultiLineString", coordinates: segs.map((s) => s.map((p) => [p.lng, p.lat])) },
      };
      const src = map.getSource("trip-route") as mapboxgl.GeoJSONSource | undefined;
      if (src) {
        src.setData(data);
        if (map.getLayer("trip-route")) map.setPaintProperty("trip-route", "line-color", color);
        return;
      }
      if (!segs.length) return;
      map.addSource("trip-route", { type: "geojson", data });
      const lay = { "line-cap": "round" as const, "line-join": "round" as const };
      map.addLayer({ id: "trip-route-casing", type: "line", source: "trip-route", paint: { "line-color": "#05060a", "line-width": 9, "line-opacity": 0.5 }, layout: lay });
      map.addLayer({ id: "trip-route", type: "line", source: "trip-route", paint: { "line-color": color, "line-width": 7, "line-opacity": 0.9, "line-emissive-strength": 1 }, layout: lay });
    } catch (e) { console.warn("[trip-globe] route draw", e); }
  }

  function drawMarkers(map: mapboxgl.Map) {
    for (const mk of markerObjs.current) mk.remove();
    markerObjs.current = [];
    markers.forEach((m, i) => {
      const critical = POI[m.poiType]?.safetyCritical;
      const el = document.createElement("div");
      el.className = "plot-pin" + (critical ? " is-critical" : "");
      el.title = m.label;
      const dot = document.createElement("span"); dot.className = "plot-pin-dot";
      const lab = document.createElement("span"); lab.className = "plot-pin-label"; lab.textContent = m.label;
      el.append(dot, lab);
      const mk = new mapboxgl.Marker({ element: el, anchor: "bottom", draggable: editableRef.current })
        .setLngLat([m.lng, m.lat]).addTo(map);
      if (editableRef.current) mk.on("dragend", () => { const ll = mk.getLngLat(); onMoveRef.current?.(i, { lng: ll.lng, lat: ll.lat }); });
      markerObjs.current.push(mk);
    });
  }

  function frame(map: mapboxgl.Map) {
    const b = new mapboxgl.LngLatBounds();
    for (const p of path) b.extend([p.lng, p.lat]);
    for (const m of markers) b.extend([m.lng, m.lat]);
    if (!b.isEmpty()) map.fitBounds(b, { padding: 60, maxZoom: 13, pitch: 55, bearing: -20, duration: 0 });
  }

  function stopTour() { tourRef.current?.cancel(); }

  function startTour() {
    const map = mapRef.current; if (!map || path.length < 2) return;
    tourRef.current?.cancel();
    setFly(true);
    // Capture the handle so a cancelled-but-still-finishing older tour can't
    // clobber the state of the one that replaced it.
    let handle: TourHandle | null = null;
    handle = flyTour(map, path, {
      ...flyRef.current,
      onEnd: (cancelled) => {
        if (tourRef.current !== handle) return; // stale tour — ignore
        tourRef.current = null;
        setFly(false);
        if (!cancelled && loopRef.current) setTimeout(() => { if (mapRef.current && !tourRef.current) startTour(); }, 1800);
      },
    });
    tourRef.current = handle;
  }

  useEffect(() => {
    if (!box.current || !TOKEN) return;
    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: box.current,
      style: "mapbox://styles/mapbox/standard-satellite",
      center: path.length ? [path[0].lng, path[0].lat] : [-98, 20],
      zoom: path.length ? 9 : 2.5,
      pitch: 55, projection: { name: "globe" },
      attributionControl: true, interactive: true,
    });
    mapRef.current = map;

    // Tile/style/token failures: surface a neutral overlay instead of a black canvas.
    map.on("error", (e) => {
      const status = (e as { error?: { status?: number } }).error?.status;
      if (status === 401 || status === 403) setMapErr(true);
    });

    map.on("click", (e) => {
      if (addModeRef.current && onAddRef.current) onAddRef.current({ lng: e.lngLat.lng, lat: e.lngLat.lat });
    });

    // Embed: the first real gesture hands control to the visitor for good.
    if (stopOnInteract) {
      const takeover = () => { if (tourRef.current) { loopRef.current = false; tourRef.current.cancel(); } };
      map.on("mousedown", takeover); map.on("touchstart", takeover); map.on("wheel", takeover);
    }

    map.on("style.load", () => {
      const base = flyRef.current.lightPreset ?? "dawn"; // matches the tour's opening light
      try { map.setConfigProperty("basemap", "lightPreset", base); } catch {}
      for (const [k, v] of Object.entries({ showPointOfInterestLabels: false, showTransitLabels: false, showRoadLabels: false })) {
        try { map.setConfigProperty("basemap", k, v); } catch {}
      }
      map.setFog({
        range: [2, 20], color: "rgb(18, 16, 34)",
        "high-color": ["interpolate", ["linear"], ["zoom"], 3, "rgb(56, 36, 112)", 7, "rgb(28, 42, 122)"],
        "space-color": ["interpolate", ["linear"], ["zoom"], 2, "rgb(2, 2, 8)", 6, "rgb(7, 9, 26)"],
        "horizon-blend": ["interpolate", ["linear"], ["zoom"], 4, 0.04, 10, 0.015],
        "star-intensity": ["interpolate", ["linear"], ["zoom"], 2, 0.85, 5.5, 0.25, 8, 0],
      });
      if (!map.getSource("mapbox-dem")) {
        map.addSource("mapbox-dem", { type: "raster-dem", url: "mapbox://mapbox.mapbox-terrain-dem-v1", tileSize: 512, maxzoom: 14 });
      }
      map.setTerrain({ source: "mapbox-dem", exaggeration: 1.5 });
      drawRoute(map); drawMarkers(map); frame(map);
      drawnRouteRef.current = route;
      setReady(true);
      // Honour reduced-motion: never auto-launch a 60s camera move on them.
      if (autoplay && !reducedMotion()) setTimeout(() => { if (mapRef.current) startTour(); }, 900);
    });

    return () => { tourRef.current?.cancel(); tourRef.current = null; for (const mk of markerObjs.current) mk.remove(); mapRef.current = null; map.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new route (importing a different file / switching trips) cancels any
  // in-flight tour (it was tracing the OLD path), redraws, and re-frames. Skips
  // the redundant pass when `ready` flips (style.load already drew this route).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || drawnRouteRef.current === route) return;
    try {
      stopTour();
      drawRoute(map); drawMarkers(map); frame(map);
      drawnRouteRef.current = route;
    } catch (e) { console.warn("[trip-globe] route update", e); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, ready]);

  // Colour / marker edits redraw in place — no camera yank.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    try { drawRoute(map); drawMarkers(map); } catch (e) { console.warn("[trip-globe] redraw", e); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, markers, editable]);

  // "Light mood" applies live in the preview, not only on the next fly.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || flying) return;
    try { map.setConfigProperty("basemap", "lightPreset", fly.lightPreset ?? "dawn"); } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fly.lightPreset, ready]);

  // Manual fly / stop triggers (CMS bumps the tokens).
  useEffect(() => { if (playToken > 0 && ready) startTour(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playToken]);
  useEffect(() => { if (stopToken > 0) stopTour(); }, [stopToken]);

  // Crosshair while dropping a marker.
  useEffect(() => {
    const map = mapRef.current;
    if (map) map.getCanvas().style.cursor = addMode ? "crosshair" : "";
  }, [addMode]);

  if (!TOKEN) {
    return (
      <div className="trip-globe trip-globe--empty">
        <span>{neutral ? "Map unavailable." : "3D needs a Mapbox key (NEXT_PUBLIC_MAPBOX_TOKEN)."}</span>
      </div>
    );
  }
  return (
    <div className={"trip-globe-wrap" + (showLabels ? " trip-globe--labels" : "")}>
      <div ref={box} className="trip-globe" />
      {mapErr && (
        <div className="trip-globe-overlay">
          <span>{neutral ? "Map unavailable." : "Mapbox rejected the token for this origin (401/403) — check the token's URL restrictions."}</span>
        </div>
      )}
      {showPlay && ready && !flying && !mapErr && path.length >= 2 && (
        <button className="trip-globe-play" onClick={startTour} aria-label="Play the fly-by">▶ Fly the trail</button>
      )}
    </div>
  );
}
