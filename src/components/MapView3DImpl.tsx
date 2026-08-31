"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Post, PoiType } from "@/lib/types";
import { POI } from "@/lib/types";
import type { AtlasPlot, SavedMapMarker, MapRoutePoint } from "@/lib/db";
import { ROUTE_COLORS } from "@/lib/db";
import { importPlotFile } from "@/lib/plot-import";
import { trackStats } from "@/lib/gpx";
import { track } from "@/lib/telemetry";
import { useIdleReveal } from "@/lib/use-idle-reveal";
import MapSocial from "@/components/MapSocial";
import { sunPosition, sunTimes } from "@/lib/sun";
import { distanceM } from "@/lib/geo";

// Destination point a distance (m) + compass bearing (deg) from an origin (haversine).
function destPoint(lat: number, lng: number, bearingDeg: number, distM: number): [number, number] {
  const R = 6371000, br = (bearingDeg * Math.PI) / 180, d = distM / R;
  const la1 = (lat * Math.PI) / 180, lo1 = (lng * Math.PI) / 180;
  const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(br));
  const lo2 = lo1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
  return [(lo2 * 180) / Math.PI, (la2 * 180) / Math.PI];
}
const hhmm = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// Mapbox base styles offered on the 3D map (dusk light preset only applies to Standard).
const STYLES = {
  standard: "mapbox://styles/mapbox/standard",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
  outdoors: "mapbox://styles/mapbox/outdoors-v12",
} as const;
type StyleKey = keyof typeof STYLES;
const STYLE_LABELS: Record<StyleKey, string> = { standard: "Standard", satellite: "Satellite", outdoors: "Outdoors" };
const uid = () => Math.random().toString(36).slice(2);

// The Atlas in 3D — a SEPARATE engine from the MapLibre 2D map (Slice 4). Mapbox
// Standard gives real terrain, atmosphere, and a globe you tilt into; we render
// the same capture pins on it. Loaded only when the 3D toggle is on (dynamic,
// ssr:false) so Mapbox's SDK + token never touch the 2D path or SSR.

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export default function MapView3DImpl({ posts, onOpen, plot, onPlotChange, user, onAuthRequired }: {
  posts: Post[];
  onOpen: (id: string) => void;
  plot: AtlasPlot | null;
  onPlotChange: (p: AtlasPlot | null) => void;
  user: { id: string; email?: string } | null;
  onAuthRequired: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const onOpenRef = useRef(onOpen);
  useEffect(() => { onOpenRef.current = onOpen; });
  const plotRef = useRef<AtlasPlot | null>(plot);
  useEffect(() => { plotRef.current = plot; }, [plot]);
  const plotMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const onPlotChangeRef = useRef(onPlotChange);
  useEffect(() => { onPlotChangeRef.current = onPlotChange; });

  const [mstyle, setMstyle] = useState<StyleKey>("standard");
  const [addMode, setAddMode] = useState(false);
  const addModeRef = useRef(false);
  useEffect(() => { addModeRef.current = addMode; }, [addMode]);
  const [drawMode, setDrawMode] = useState(false);
  const [drawing, setDrawing] = useState<MapRoutePoint[]>([]);
  const drawModeRef = useRef(false);
  const drawingRef = useRef<MapRoutePoint[]>([]);
  useEffect(() => { drawModeRef.current = drawMode; }, [drawMode]);
  const [editing, setEditing] = useState(false);
  const { revealed, bind } = useIdleReveal(drawMode || addMode || editing);
  const [sunOn, setSunOn] = useState(false);
  const sunOnRef = useRef(false);
  useEffect(() => { sunOnRef.current = sunOn; }, [sunOn]);
  const sunMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const [flatView, setFlatView] = useState(false);       // compass toggle: 3D tilt ↔ top-down north
  const [isTouch] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(hover: none), (pointer: coarse)").matches);
  const tiltRef = useRef<{ bearing: number; pitch: number }>({ bearing: -18, pitch: 62 });
  useEffect(() => { drawingRef.current = drawing; }, [drawing]);
  const [err, setErr] = useState("");
  const plotInputRef = useRef<HTMLInputElement>(null);

  function drawLive(map: mapboxgl.Map) {
    if (map.getLayer("draw-line")) map.removeLayer("draw-line");
    if (map.getSource("draw-line")) map.removeSource("draw-line");
    const pts = drawingRef.current;
    if (!pts.length) return;
    map.addSource("draw-line", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: pts.map((p) => [p.lng, p.lat]) } } });
    // emissive-strength self-lights the preview so the dusk lighting can't darken it into a faint tone.
    map.addLayer({ id: "draw-line", type: "line", source: "draw-line", paint: { "line-color": "#c6ff2e", "line-width": 6, "line-opacity": 1, "line-emissive-strength": 1 }, layout: { "line-cap": "round", "line-join": "round" } });
  }

  function finishDraw() {
    const pts = drawing;
    setDrawMode(false);
    setDrawing([]);
    if (pts.length < 2) return;
    const cur = plotRef.current;
    const route = cur ? [...cur.route, pts] : [pts];
    const { distanceM, gainM } = trackStats(route);
    onPlotChangeRef.current({ title: cur?.title ?? "Drawn route", route, markers: cur?.markers ?? [], distanceM, gainM });
    track("route_draw", { props: { points: pts.length, source: "3d" } });
  }

  useEffect(() => { const map = mapRef.current; if (map) drawLive(map); }, [drawing]);

  async function takePlot(file: File | undefined) {
    if (!file) return;
    setErr("");
    const res = await importPlotFile(file);
    if ("error" in res) { setErr(res.error); return; }
    onPlotChangeRef.current(res.plot);
    track("plot_import", { props: { format: res.format, markers: res.plot.markers.length, from: "3d" } });
  }

  // Edit the shared plot's markers / route colour by index (rename, retype, delete).
  const patchMarker = (i: number, patch: Partial<SavedMapMarker>) => {
    const cur = plotRef.current; if (!cur) return;
    onPlotChangeRef.current({ ...cur, markers: cur.markers.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  };
  const removeMarker = (i: number) => {
    const cur = plotRef.current; if (!cur) return;
    onPlotChangeRef.current({ ...cur, markers: cur.markers.filter((_, j) => j !== i) });
  };
  const setColor = (c: string) => {
    const cur = plotRef.current; if (!cur) return;
    onPlotChangeRef.current({ ...cur, color: c });
  };

  const geoPosts = posts.filter((p) => p.captureLat != null && p.captureLng != null);

  // Draw the plotted route (draped on the terrain) + its curated markers. Amber
  // dashed = unverified, same language as the flat Atlas (safety rail §9).
  function renderPlot(map: mapboxgl.Map) {
    if (map.getLayer("plot-route")) map.removeLayer("plot-route");
    if (map.getLayer("plot-route-casing")) map.removeLayer("plot-route-casing");
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
      const lay = { "line-cap": "round" as const, "line-join": "round" as const };
      const col = p.color ?? "#ffd24a";
      // Thin dark edge, bright emissive core — the colour reads vivid, not a black-bordered tone.
      map.addLayer({ id: "plot-route-casing", type: "line", source: "plot-route", paint: { "line-color": "#05060a", "line-width": 9, "line-opacity": 0.5 }, layout: lay });
      map.addLayer({ id: "plot-route", type: "line", source: "plot-route", paint: { "line-color": col, "line-width": 7, "line-opacity": 0.84, "line-emissive-strength": 1 }, layout: lay });
    }
    p.markers.forEach((m, i) => {
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
      const mk = new mapboxgl.Marker({ element: el, anchor: "bottom", draggable: true }).setLngLat([m.lng, m.lat]).addTo(map);
      mk.on("dragend", () => {
        const ll = mk.getLngLat();
        const cur = plotRef.current;
        if (!cur) return;
        onPlotChangeRef.current({ ...cur, markers: cur.markers.map((mm, j) => (j === i ? { ...mm, lat: ll.lat, lng: ll.lng } : mm)) });
      });
      plotMarkersRef.current.push(mk);
    });
  }

  // Sun layer (ported from the flat Atlas): a daytime-sweep wedge + sunrise/sunset
  // rays from the map centre for today. emissive-strength keeps it lit under dusk.
  function renderSun(map: mapboxgl.Map) {
    for (const id of ["sun-arc", "sun-rays"]) { if (map.getLayer(id)) map.removeLayer(id); if (map.getSource(id)) map.removeSource(id); }
    for (const mk of sunMarkersRef.current) mk.remove();
    sunMarkersRef.current = [];
    if (!sunOnRef.current) return;
    const c = map.getCenter(), lat = c.lat, lng = c.lng, now = new Date();
    const { sunrise, sunset } = sunTimes(now, lat, lng);
    const bb = map.getBounds();
    if (!bb) return;
    const rayLen = Math.max(500, distanceM(bb.getNorth(), bb.getWest(), bb.getSouth(), bb.getEast()) * 0.22);
    const DEG = 180 / Math.PI;
    const span = sunset.valueOf() - sunrise.valueOf();
    const fan: [number, number][] = [[lng, lat]];
    for (let i = 0; i <= 36; i++) {
      const s = sunPosition(new Date(sunrise.valueOf() + (span * i) / 36), lat, lng);
      if (s.altitude >= 0) fan.push(destPoint(lat, lng, s.azimuth * DEG, rayLen));
    }
    fan.push([lng, lat]);
    if (fan.length > 3) {
      map.addSource("sun-arc", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [fan] } } });
      map.addLayer({ id: "sun-arc", type: "fill", source: "sun-arc", paint: { "fill-color": "#ffcd64", "fill-opacity": 0.15, "fill-emissive-strength": 0.9 } });
    }
    const riseEnd = destPoint(lat, lng, sunPosition(sunrise, lat, lng).azimuth * DEG, rayLen);
    const setEnd = destPoint(lat, lng, sunPosition(sunset, lat, lng).azimuth * DEG, rayLen);
    map.addSource("sun-rays", { type: "geojson", data: { type: "FeatureCollection", features: [
      { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[lng, lat], riseEnd] } },
      { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[lng, lat], setEnd] } },
    ] } });
    map.addLayer({ id: "sun-rays", type: "line", source: "sun-rays", paint: { "line-color": "#ffcd64", "line-width": 2, "line-opacity": 0.85, "line-dasharray": [2, 2], "line-emissive-strength": 1 }, layout: { "line-cap": "round" } });
    const label = (pos: [number, number], text: string) => {
      const el = document.createElement("div"); el.className = "sun-label"; el.textContent = text;
      sunMarkersRef.current.push(new mapboxgl.Marker({ element: el, anchor: "center" }).setLngLat(pos).addTo(map));
    };
    label(riseEnd, `☀ ${hhmm(sunrise)}`);
    label(setEnd, `☾ ${hhmm(sunset)}`);
    const nw = sunPosition(now, lat, lng);
    if (nw.altitude > 0) label(destPoint(lat, lng, nw.azimuth * DEG, rayLen * 0.78), "☀ now");
  }
  function toggleSun() {
    setAddMode(false); setDrawMode(false);
    setSunOn((v) => { if (!v) track("sun_path_view", { props: { from: "3d" } }); return !v; });
  }

  // Compass as a real toggle: flatten to top-down north, then restore the prior tilt.
  function toggleView() {
    const map = mapRef.current; if (!map) return;
    if (map.getPitch() > 2 || Math.abs(map.getBearing()) > 0.5) {
      tiltRef.current = { bearing: map.getBearing(), pitch: map.getPitch() };
      map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
      setFlatView(true);
    } else {
      map.easeTo({ ...tiltRef.current, duration: 600 });
      setFlatView(false);
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
      style: STYLES[mstyle],
      center: [-100, 40],
      zoom: 2.6,
      pitch: 55,
      projection: { name: "globe" },
      attributionControl: true,
      touchPitch: true,        // two-finger vertical drag tilts on touch (default, made explicit)
      pitchWithRotate: true,
    });
    mapRef.current = map;
    map.touchZoomRotate.enable();
    map.touchPitch.enable();   // belt-and-suspenders so touch tilt is always available
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right"); // compass → our own toggle

    // Click the terrain to draw a line, else drop a marker (when armed).
    map.on("click", (e) => {
      if (drawModeRef.current) { setDrawing((d) => [...d, { lat: e.lngLat.lat, lng: e.lngLat.lng, ele: null }]); return; }
      if (!addModeRef.current) return;
      const m: SavedMapMarker = { lat: e.lngLat.lat, lng: e.lngLat.lng, label: "New marker", poiType: "other" };
      const cur = plotRef.current;
      onPlotChangeRef.current(cur
        ? { ...cur, markers: [...cur.markers, m] }
        : { title: "New map", route: [], markers: [m], distanceM: 0, gainM: 0 });
      setAddMode(false);
      track("plot_marker_add", { props: { poiType: "other", from: "3d" } });
    });

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
      drawLive(map);   // any in-progress freehand line
      renderSun(map);  // sun wedge + rays, if toggled on
    });

    // Sun follows the spot you're framing; keep the compass toggle's label in sync.
    map.on("moveend", () => {
      renderSun(map);
      setFlatView(map.getPitch() < 2 && Math.abs(map.getBearing()) < 0.5);
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

  useEffect(() => {
    const map = mapRef.current;
    if (map && map.isStyleLoaded()) renderSun(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sunOn]);

  // Switch Mapbox base style (terrain + plot re-apply on the style.load handler).
  const styleInit = useRef(true);
  useEffect(() => {
    if (styleInit.current) { styleInit.current = false; return; }
    mapRef.current?.setStyle(STYLES[mstyle]);
  }, [mstyle]);

  useEffect(() => {
    const map = mapRef.current;
    if (map) map.getCanvas().style.cursor = (addMode || drawMode) ? "crosshair" : "";
  }, [addMode, drawMode]);

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
    <div className="map-wrap" data-idle={!revealed} {...bind}
      onFocusCapture={() => setEditing(true)} onBlurCapture={() => setEditing(false)}>
      <div ref={box} className="map-stage" />
      <div className="map-3d-controls">
        <div className="seg map-3d-seg">
          {(Object.keys(STYLES) as StyleKey[]).map((k) => (
            <button key={k} className="seg-opt" data-active={mstyle === k} onClick={() => setMstyle(k)}>{STYLE_LABELS[k]}</button>
          ))}
        </div>
        <div className="map-3d-tools">
          <button className="btn-sec" onClick={() => plotInputRef.current?.click()}>Import</button>
          <button className="btn-sec" data-on={addMode} onClick={() => { setDrawMode(false); setAddMode((v) => !v); }}>{addMode ? "Click terrain…" : "Add marker"}</button>
          <button className="btn-sec" data-on={drawMode} onClick={() => { setAddMode(false); setDrawMode((v) => { if (v) setDrawing([]); return !v; }); }}>Draw</button>
          <button className="btn-sec" data-on={sunOn} onClick={toggleSun}>Sun</button>
          <button className="btn-sec" onClick={toggleView} title={flatView ? "Tilt back to 3D" : "Flatten to top-down north"}>{flatView ? "3D view" : "Top-down"}</button>
        </div>
      </div>
      <input ref={plotInputRef} type="file" hidden accept=".gpx,.geojson,.json,application/gpx+xml,application/geo+json" onChange={(e) => takePlot(e.target.files?.[0])} />
      {err && <div className="map-3d-err glass">{err}</div>}
      {drawMode && (
        <div className="map-draw-hud glass">
          <span>{drawing.length === 0 ? "Click the terrain to start the line" : `${drawing.length} point${drawing.length === 1 ? "" : "s"}`}</span>
          {drawing.length > 0 && <button className="hint-act" onClick={() => setDrawing((d) => d.slice(0, -1))}>↩ Undo</button>}
          <button className="hint-act" onClick={() => { setDrawMode(false); setDrawing([]); }}>✕ Cancel</button>
          {drawing.length > 1 && <button className="hint-act hint-act--go" onClick={finishDraw}>✓ Finish line</button>}
        </div>
      )}
      {plot && (plot.markers.length > 0 || plot.route.length > 0) && (
        <div className="plot-panel glass">
          <div className="plot-colors">
            <span className="plot-colors-label">Line</span>
            {ROUTE_COLORS.map((c) => (
              <button key={c} className="plot-color" data-on={(plot.color ?? "#ffd24a") === c} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Route color ${c}`} />
            ))}
          </div>
          {plot.markers.length > 0 && (
            <div className="plot-cands">
              {plot.markers.map((m, i) => (
                <div className="plot-cand" key={i} data-critical={POI[m.poiType].safetyCritical}>
                  <input className="plot-cand-label" value={m.label} onChange={(e) => patchMarker(i, { label: e.target.value })} />
                  <select value={m.poiType} onChange={(e) => patchMarker(i, { poiType: e.target.value as PoiType })}>
                    {(Object.keys(POI) as PoiType[]).map((k) => <option key={k} value={k}>{POI[k].label}</option>)}
                  </select>
                  <button className="plot-cand-x" onClick={() => removeMarker(i)} aria-label="Remove marker">✕</button>
                </div>
              ))}
            </div>
          )}
          {/* Likes + comments — shows when a SAVED map is open (id rides the shared plot). */}
          {plot.id && <MapSocial key={plot.id} mapId={plot.id} user={user} onAuthRequired={onAuthRequired} />}
        </div>
      )}
      {!drawMode && !plot && (
        <div className="map-3d-hint glass">
          {isTouch
            ? "Drag to pan · pinch to zoom · two-finger drag up/down to tilt — or tap Top-down/3D"
            : "Drag to orbit · scroll to zoom · right-drag to tilt — or use Top-down/3D"}
        </div>
      )}
    </div>
  );
}
