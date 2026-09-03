"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { MapRoutePoint, SavedMapMarker, FlyConfig } from "@/lib/db";
import { POI } from "@/lib/types";
import { flyTour, type TourHandle } from "@/lib/fly-tour";

// A lean, CHROMELESS Standard-Satellite globe that drapes a route on real
// terrain and flies the cinematic helicopter tour, honoring the trip's per-trip
// fly-by settings. No tools, no panels — it's the embed surface (white-label)
// and the CMS preview. Marker add/drag is enabled only when `editable`.

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
type LngLat = { lng: number; lat: number };

export default function TripGlobeImpl({
  route, markers = [], color = "#57eaff", fly = {}, autoplay = false, loop = false, playToken = 0,
  editable = false, addMode = false, onAddMarker, onMoveMarker, onFlyingChange,
}: {
  route: MapRoutePoint[][];
  markers?: SavedMapMarker[];
  color?: string;
  fly?: FlyConfig;
  autoplay?: boolean;
  loop?: boolean;
  playToken?: number;
  editable?: boolean;
  addMode?: boolean;
  onAddMarker?: (ll: LngLat) => void;
  onMoveMarker?: (i: number, ll: LngLat) => void;
  onFlyingChange?: (flying: boolean) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const tourRef = useRef<TourHandle | null>(null);
  const markerObjs = useRef<mapboxgl.Marker[]>([]);
  const [ready, setReady] = useState(false);

  // Refs so the one-time map handlers see fresh values.
  const loopRef = useRef(loop); useEffect(() => { loopRef.current = loop; }, [loop]);
  const flyRef = useRef(fly); useEffect(() => { flyRef.current = fly; }, [fly]);
  const addModeRef = useRef(addMode); useEffect(() => { addModeRef.current = addMode; }, [addMode]);
  const onAddRef = useRef(onAddMarker); useEffect(() => { onAddRef.current = onAddMarker; });
  const onMoveRef = useRef(onMoveMarker); useEffect(() => { onMoveRef.current = onMoveMarker; });
  const editableRef = useRef(editable); useEffect(() => { editableRef.current = editable; }, [editable]);

  const path = route.flat();

  function drawRoute(map: mapboxgl.Map) {
    for (const id of ["trip-route", "trip-route-casing"]) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource("trip-route")) map.removeSource("trip-route");
    const segs = route.filter((s) => s.length > 1);
    if (!segs.length) return;
    map.addSource("trip-route", { type: "geojson", data: {
      type: "Feature", properties: {},
      geometry: { type: "MultiLineString", coordinates: segs.map((s) => s.map((p) => [p.lng, p.lat])) },
    } });
    const lay = { "line-cap": "round" as const, "line-join": "round" as const };
    map.addLayer({ id: "trip-route-casing", type: "line", source: "trip-route", paint: { "line-color": "#05060a", "line-width": 9, "line-opacity": 0.5 }, layout: lay });
    map.addLayer({ id: "trip-route", type: "line", source: "trip-route", paint: { "line-color": color, "line-width": 7, "line-opacity": 0.9, "line-emissive-strength": 1 }, layout: lay });
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

  function startTour() {
    const map = mapRef.current; if (!map || !path.length) return;
    tourRef.current?.cancel();
    onFlyingChange?.(true);
    tourRef.current = flyTour(map, path, {
      ...flyRef.current,
      onEnd: (cancelled) => {
        onFlyingChange?.(false);
        tourRef.current = null;
        if (!cancelled && loopRef.current) setTimeout(() => { if (mapRef.current) startTour(); }, 1800);
      },
    });
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

    map.on("click", (e) => {
      if (addModeRef.current && onAddRef.current) onAddRef.current({ lng: e.lngLat.lng, lat: e.lngLat.lat });
    });

    map.on("style.load", () => {
      const base = flyRef.current.lightPreset ?? "dusk";
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
      setReady(true);
      if (autoplay) setTimeout(() => { if (mapRef.current) startTour(); }, 900);
    });

    return () => { tourRef.current?.cancel(); for (const mk of markerObjs.current) mk.remove(); mapRef.current = null; map.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-draw route + markers when they change (CMS live edits).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    drawRoute(map); drawMarkers(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, color, markers, editable, ready]);

  // Manual fly trigger (CMS bumps playToken).
  useEffect(() => {
    if (playToken > 0 && ready) startTour();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playToken]);

  // Crosshair while dropping a marker.
  useEffect(() => {
    const map = mapRef.current;
    if (map) map.getCanvas().style.cursor = addMode ? "crosshair" : "";
  }, [addMode]);

  if (!TOKEN) {
    return <div className="trip-globe trip-globe--empty"><span>3D needs a Mapbox key (NEXT_PUBLIC_MAPBOX_TOKEN).</span></div>;
  }
  return <div ref={box} className="trip-globe" />;
}
