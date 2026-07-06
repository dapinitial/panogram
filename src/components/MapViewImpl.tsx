"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Post } from "@/lib/types";
import { track } from "@/lib/telemetry";

// The Atlas: every geo-tagged capture as a pin on a world map — the "world,
// not feed" surface the spatial layer builds toward. Dark Carto raster tiles
// match the void theme; free with attribution, no API key.

const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: "raster",
      tiles: ["a", "b", "c"].map((s) => `https://${s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png`),
      tileSize: 256,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · © <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [{ id: "carto", type: "raster", source: "carto" }],
};

export default function MapViewImpl({ posts, onOpen }: { posts: Post[]; onOpen: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const onOpenRef = useRef(onOpen);
  useEffect(() => { onOpenRef.current = onOpen; });

  const geoPosts = posts.filter((p) => p.captureLat != null && p.captureLng != null);

  useEffect(() => {
    if (!box.current) return;
    const map = new maplibregl.Map({
      container: box.current,
      style: STYLE,
      center: [-100, 40],
      zoom: 2.2,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    const bounds = new maplibregl.LngLatBounds();
    for (const p of geoPosts) {
      const el = document.createElement("button");
      el.className = "map-pin";
      el.title = p.title;
      el.innerHTML = `<span class="map-pin-dot" style="background:${p.author.grad}"></span><span class="map-pin-label">${p.title}</span>`;
      el.addEventListener("click", () => {
        track("card_click", { postId: p.id, props: { from: "map" } });
        onOpenRef.current(p.id);
      });
      new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([p.captureLng!, p.captureLat!]).addTo(map);
      bounds.extend([p.captureLng!, p.captureLat!]);
    }
    if (geoPosts.length) map.fitBounds(bounds, { padding: 80, maxZoom: 11, duration: 0 });

    return () => map.remove();
    // Re-mounting per posts change is fine at prototype scale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts.length]);

  return (
    <div className="map-wrap">
      <div ref={box} className="map-stage" />
      {geoPosts.length === 0 && (
        <div className="map-empty glass">
          <div className="eyebrow">No located captures yet</div>
          <p>Panoramas with GPS in their metadata land here automatically — shoot with location on and the atlas draws itself.</p>
        </div>
      )}
    </div>
  );
}
