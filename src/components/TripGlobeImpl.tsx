"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { MapRoutePoint, SavedMapMarker } from "@/lib/db";
import { flyTour, type TourHandle } from "@/lib/fly-tour";

// A lean, CHROMELESS Standard-Satellite globe that drapes a route on real
// terrain and flies the cinematic helicopter tour. No tools, no panels — it's
// the embed surface (white-label) and the CMS preview. All editing UI lives
// outside it (the Trips CMS control bar). Reuses the shared fly-tour engine.

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export default function TripGlobeImpl({
  route, color = "#57eaff", autoplay = false, loop = false, playToken = 0, onFlyingChange,
}: {
  route: MapRoutePoint[][];
  markers?: SavedMapMarker[];
  color?: string;
  autoplay?: boolean;
  loop?: boolean;
  playToken?: number;   // bump to (re)start the tour on demand (CMS "Fly" button)
  onFlyingChange?: (flying: boolean) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const tourRef = useRef<TourHandle | null>(null);
  const loopRef = useRef(loop);
  useEffect(() => { loopRef.current = loop; }, [loop]);
  const [ready, setReady] = useState(false);

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

  function frame(map: mapboxgl.Map) {
    const b = new mapboxgl.LngLatBounds();
    for (const p of path) b.extend([p.lng, p.lat]);
    if (!b.isEmpty()) map.fitBounds(b, { padding: 60, maxZoom: 13, pitch: 55, bearing: -20, duration: 0 });
  }

  function startTour() {
    const map = mapRef.current; if (!map || !path.length) return;
    tourRef.current?.cancel();
    onFlyingChange?.(true);
    tourRef.current = flyTour(map, path, {
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

    map.on("style.load", () => {
      try { map.setConfigProperty("basemap", "lightPreset", "dusk"); } catch {}
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
      drawRoute(map);
      frame(map);
      setReady(true);
      if (autoplay) setTimeout(() => { if (mapRef.current) startTour(); }, 900);
    });

    return () => { tourRef.current?.cancel(); mapRef.current = null; map.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-draw when the route/color changes (CMS live preview after an import).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    drawRoute(map); frame(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, color, ready]);

  // Manual fly trigger (CMS button bumps playToken).
  useEffect(() => {
    if (playToken > 0 && ready) startTour();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playToken]);

  if (!TOKEN) {
    return <div className="trip-globe trip-globe--empty"><span>3D needs a Mapbox key (NEXT_PUBLIC_MAPBOX_TOKEN).</span></div>;
  }
  return <div ref={box} className="trip-globe" />;
}
