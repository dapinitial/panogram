"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Post, Track } from "@/lib/types";
import { track } from "@/lib/telemetry";
import { loadTracksForPosts } from "@/lib/db";

// The Atlas: every geo-tagged capture as a pin on a world map — the "world,
// not feed" surface the spatial layer builds toward. Three free basemaps, no
// API keys: the void (Carto dark, matches the theme), USGS topo (the layer
// Gaia-class apps are built on), and OpenTopoMap terrain.

const OSM_ATTR = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
function rasterStyle(tiles: string[], attribution: string, tileSize = 256): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: { base: { type: "raster", tiles, tileSize, attribution } },
    layers: [{ id: "base", type: "raster", source: "base" }],
  };
}

const BASEMAPS = {
  void: rasterStyle(
    ["a", "b", "c"].map((s) => `https://${s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png`),
    `${OSM_ATTR} · © <a href="https://carto.com/attributions">CARTO</a>`,
  ),
  topo: rasterStyle(
    ["https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}"],
    '© <a href="https://www.usgs.gov/">USGS</a> The National Map',
  ),
  terrain: rasterStyle(
    ["a", "b", "c"].map((s) => `https://${s}.tile.opentopomap.org/{z}/{x}/{y}.png`),
    `${OSM_ATTR} · © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)`,
  ),
} as const;
type BasemapKey = keyof typeof BASEMAPS;
const BASEMAP_LABELS: Record<BasemapKey, string> = { void: "Void", topo: "Topo", terrain: "Terrain" };

export default function MapViewImpl({ posts, onOpen }: { posts: Post[]; onOpen: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onOpenRef = useRef(onOpen);
  useEffect(() => { onOpenRef.current = onOpen; });

  const [basemap, setBasemap] = useState<BasemapKey>(() =>
    (typeof window !== "undefined" && (localStorage.getItem("pg_basemap") as BasemapKey)) || "void");
  const tracksRef = useRef<Track[]>([]);

  // Recorded tracks as map lines. Layers die on setStyle (unlike DOM markers),
  // so drawing is idempotent and re-fired on every style.load.
  function drawTracks(map: maplibregl.Map) {
    for (const t of tracksRef.current) {
      const segs = t.segments.filter((s) => s.length > 1);
      if (!segs.length || map.getSource(`track-${t.id}`)) continue;
      map.addSource(`track-${t.id}`, {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: segs.map((seg) => seg.map(([lat, lng]) => [lng, lat])) } },
      });
      map.addLayer({
        id: `track-${t.id}`, type: "line", source: `track-${t.id}`,
        paint: { "line-color": "#8fe9ff", "line-width": 2.5, "line-opacity": 0.85 },
        layout: { "line-cap": "round", "line-join": "round" },
      });
    }
  }

  function pickBasemap(k: BasemapKey) {
    setBasemap(k);
    localStorage.setItem("pg_basemap", k);
    mapRef.current?.setStyle(BASEMAPS[k]); // markers survive (DOM); track layers re-add on style.load
    track("filter_change", { props: { basemap: k } });
  }

  const geoPosts = posts.filter((p) => p.captureLat != null && p.captureLng != null);

  useEffect(() => {
    if (!box.current) return;
    const map = new maplibregl.Map({
      container: box.current,
      style: BASEMAPS[(localStorage.getItem("pg_basemap") as BasemapKey) || "void"] ?? BASEMAPS.void,
      center: [-100, 40],
      zoom: 2.2,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
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

    map.on("style.load", () => drawTracks(map));
    loadTracksForPosts(geoPosts.map((p) => p.id)).then((ts) => {
      tracksRef.current = ts;
      if (map.isStyleLoaded()) drawTracks(map);
    });

    return () => { mapRef.current = null; map.remove(); };
    // Re-mounting per posts change is fine at prototype scale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts.length]);

  return (
    <div className="map-wrap">
      <div ref={box} className="map-stage" />
      <div className="map-basemaps seg">
        {(Object.keys(BASEMAPS) as BasemapKey[]).map((k) => (
          <button key={k} className="seg-opt" data-active={basemap === k} onClick={() => pickBasemap(k)}>
            {BASEMAP_LABELS[k]}
          </button>
        ))}
      </div>
      {geoPosts.length === 0 && (
        <div className="map-empty glass">
          <div className="eyebrow">No located captures yet</div>
          <p>Panoramas with GPS in their metadata land here automatically — shoot with location on and the atlas draws itself.</p>
        </div>
      )}
    </div>
  );
}
