"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Post } from "@/lib/types";
import { POI } from "@/lib/types";
import type { AtlasPlot } from "@/lib/db";
import { track } from "@/lib/telemetry";

// The Atlas in 3D — a SEPARATE engine from the MapLibre 2D map (Slice 4). Mapbox
// Standard gives real terrain, atmosphere, and a globe you tilt into; we render
// the same capture pins on it. Loaded only when the 3D toggle is on (dynamic,
// ssr:false) so Mapbox's SDK + token never touch the 2D path or SSR.

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export default function MapView3DImpl({ posts, onOpen, plot }: { posts: Post[]; onOpen: (id: string) => void; plot: AtlasPlot | null }) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const onOpenRef = useRef(onOpen);
  useEffect(() => { onOpenRef.current = onOpen; });
  const plotRef = useRef<AtlasPlot | null>(plot);
  useEffect(() => { plotRef.current = plot; }, [plot]);
  const plotMarkersRef = useRef<mapboxgl.Marker[]>([]);

  const geoPosts = posts.filter((p) => p.captureLat != null && p.captureLng != null);

  // Draw the plotted route (draped on the terrain) + its curated markers. Amber
  // dashed = unverified, same language as the flat Atlas (safety rail §9).
  function renderPlot(map: mapboxgl.Map) {
    if (map.getLayer("plot-route")) map.removeLayer("plot-route");
    if (map.getSource("plot-route")) map.removeSource("plot-route");
    for (const mk of plotMarkersRef.current) mk.remove();
    plotMarkersRef.current = [];
    const p = plotRef.current;
    if (!p) return;
    const segs = p.route.filter((s) => s.length > 1);
    if (segs.length) {
      map.addSource("plot-route", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: segs.map((seg) => seg.map((pt) => [pt.lng, pt.lat])) } },
      });
      map.addLayer({
        id: "plot-route", type: "line", source: "plot-route",
        paint: { "line-color": "#ffb454", "line-width": 3, "line-opacity": 0.95, "line-dasharray": [2, 1.6] },
        layout: { "line-cap": "round", "line-join": "round" },
      });
    }
    for (const m of p.markers) {
      const critical = POI[m.poiType].safetyCritical;
      const el = document.createElement("div");
      el.className = "plot-pin" + (critical ? " is-critical" : "");
      el.title = m.label;
      const dot = document.createElement("span");
      dot.className = "plot-pin-dot";
      const lab = document.createElement("span");
      lab.className = "plot-pin-label";
      lab.textContent = m.label;
      el.append(dot, lab);
      plotMarkersRef.current.push(new mapboxgl.Marker({ element: el, anchor: "bottom" }).setLngLat([m.lng, m.lat]).addTo(map));
    }
  }

  function fitToPlot(map: mapboxgl.Map): boolean {
    const p = plotRef.current;
    if (!p) return false;
    const b = new mapboxgl.LngLatBounds();
    for (const seg of p.route) for (const pt of seg) b.extend([pt.lng, pt.lat]);
    for (const m of p.markers) b.extend([m.lng, m.lat]);
    if (b.isEmpty()) return false;
    map.fitBounds(b, { padding: 90, maxZoom: 12, pitch: 62, bearing: -18, duration: 0 });
    return true;
  }

  useEffect(() => {
    if (!box.current || !TOKEN) return;
    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: box.current,
      style: "mapbox://styles/mapbox/standard",
      center: [-100, 40],
      zoom: 2.6,
      pitch: 55,
      projection: { name: "globe" },
      attributionControl: true,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");

    map.on("style.load", () => {
      // Cinematic dusk lighting + atmospheric fog for the globe.
      try { map.setConfigProperty("basemap", "lightPreset", "dusk"); } catch { /* style variant */ }
      map.setFog({
        color: "rgb(12, 12, 22)",
        "high-color": "rgb(40, 26, 80)",
        "horizon-blend": 0.08,
        "space-color": "rgb(3, 3, 9)",
        "star-intensity": 0.55,
      });
      // Real 3D relief — a DEM with exaggeration so the mountains actually rise.
      if (!map.getSource("mapbox-dem")) {
        map.addSource("mapbox-dem", {
          type: "raster-dem", url: "mapbox://mapbox.mapbox-terrain-dem-v1", tileSize: 512, maxzoom: 14,
        });
      }
      map.setTerrain({ source: "mapbox-dem", exaggeration: 1.5 });
      renderPlot(map); // route + markers, once the style/terrain are ready
    });

    const bounds = new mapboxgl.LngLatBounds();
    for (const p of geoPosts) {
      const el = document.createElement("button");
      el.className = "map-pin";
      el.title = p.title;
      const dot = document.createElement("span");
      dot.className = "map-pin-dot";
      dot.style.background = p.author.grad;
      const lab = document.createElement("span");
      lab.className = "map-pin-label";
      lab.textContent = p.title;
      el.append(dot, lab);
      el.addEventListener("click", () => {
        track("card_click", { postId: p.id, props: { from: "map3d" } });
        onOpenRef.current(p.id);
      });
      new mapboxgl.Marker({ element: el, anchor: "bottom" }).setLngLat([p.captureLng!, p.captureLat!]).addTo(map);
      bounds.extend([p.captureLng!, p.captureLat!]);
    }
    // Frame the plot if there is one, otherwise the capture pins.
    if (!fitToPlot(map) && geoPosts.length) map.fitBounds(bounds, { padding: 90, maxZoom: 10.5, pitch: 60, bearing: -18, duration: 0 });

    return () => { mapRef.current = null; map.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts.length]);

  // Re-draw when the shared plot changes (e.g. a route imported over in the flat view).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const go = () => { renderPlot(map); fitToPlot(map); };
    if (map.isStyleLoaded()) go(); else map.once("style.load", go);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plot]);

  if (!TOKEN) {
    return (
      <div className="map-wrap">
        <div className="map-stage map-3d-empty">
          <div className="map-empty glass" style={{ position: "static", maxWidth: 420 }}>
            <div className="eyebrow">3D needs a Mapbox key</div>
            <p>Set <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> to fly the terrain in 3D. The flat Atlas works without it.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="map-wrap">
      <div ref={box} className="map-stage" />
      <div className="map-3d-hint glass">Drag to orbit · scroll to zoom · right-drag to tilt</div>
    </div>
  );
}
