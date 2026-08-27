"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Post } from "@/lib/types";
import { track } from "@/lib/telemetry";

// The Atlas in 3D — a SEPARATE engine from the MapLibre 2D map (Slice 4). Mapbox
// Standard gives real terrain, atmosphere, and a globe you tilt into; we render
// the same capture pins on it. Loaded only when the 3D toggle is on (dynamic,
// ssr:false) so Mapbox's SDK + token never touch the 2D path or SSR.

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export default function MapView3DImpl({ posts, onOpen }: { posts: Post[]; onOpen: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const onOpenRef = useRef(onOpen);
  useEffect(() => { onOpenRef.current = onOpen; });

  const geoPosts = posts.filter((p) => p.captureLat != null && p.captureLng != null);

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
    if (geoPosts.length) map.fitBounds(bounds, { padding: 90, maxZoom: 10.5, pitch: 60, bearing: -18, duration: 0 });

    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts.length]);

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
