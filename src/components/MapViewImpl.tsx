"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Post, Track, PoiType } from "@/lib/types";
import { POI } from "@/lib/types";
import { track } from "@/lib/telemetry";
import { loadTracksForPosts, saveMap, loadMyMaps, deleteMap, type SavedMap, type SavedMapMarker, type MapRoutePoint } from "@/lib/db";
import { parseGpx, type ParsedTrack } from "@/lib/gpx";
import { parseGeoJSON } from "@/lib/geojson";
import { stashPendingMap, readPendingMap, clearPendingMap } from "@/lib/plot-draft";

// The Atlas: every geo-tagged capture as a pin on a world map — the "world,
// not feed" surface the spatial layer builds toward. Three free basemaps, no
// API keys: the void (Carto dark, matches the theme), USGS topo (the layer
// Gaia-class apps are built on), and OpenTopoMap terrain.
//
// Plot (Slice 1): import a GPX/GeoJSON → simplified route outline + curated
// markers (camp/water/POI), plus click-to-drop human markers. Local only —
// nothing persists yet (Save/login is a later slice). Imported lines render
// dashed-amber UNVERIFIED (safety rail, CLAUDE.md §9): observation, not endorsement.

const OSM_ATTR = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
function rasterStyle(tiles: string[], attribution: string, tileSize = 256): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: { base: { type: "raster", tiles, tileSize, attribution } },
    layers: [{ id: "base", type: "raster", source: "base" }],
  };
}

const CARTO_ATTR = `${OSM_ATTR} · © <a href="https://carto.com/attributions">CARTO</a>`;
const BASEMAPS = {
  void: rasterStyle(
    ["a", "b", "c"].map((s) => `https://${s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png`),
    CARTO_ATTR,
  ),
  light: rasterStyle(
    ["a", "b", "c"].map((s) => `https://${s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png`),
    CARTO_ATTR,
  ),
  satellite: rasterStyle(
    ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
    'Imagery © <a href="https://www.esri.com">Esri</a>, Maxar, Earthstar Geographics',
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
const BASEMAP_LABELS: Record<BasemapKey, string> = {
  void: "Void", light: "Light", satellite: "Satellite", topo: "Topo", terrain: "Terrain",
};

// Garmin/Gaia symbols → our POI vocabulary (same mapping the Upload flow uses).
const SYM_TO_POI: Record<string, PoiType> = {
  campground: "camp", camp: "camp", tent: "camp",
  "drinking water": "water", water: "water", "water source": "water",
  summit: "summit", "trail head": "trailhead", trailhead: "trailhead",
};

// A curated marker on a plotted route. Local only — no DB id yet.
type PlotMarker = {
  id: string;
  lat: number; lng: number;
  label: string;
  poiType: PoiType;
  include: boolean;
  source: "import" | "human";
};

const uid = () => Math.random().toString(36).slice(2);
const MAX_FILE_BYTES = 25 * 1024 * 1024;

export default function MapViewImpl({ posts, onOpen, user, onAuthRequired }: {
  posts: Post[];
  onOpen: (id: string) => void;
  user: { id: string; email?: string } | null;
  onAuthRequired: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onOpenRef = useRef(onOpen);
  useEffect(() => { onOpenRef.current = onOpen; });

  const [basemap, setBasemap] = useState<BasemapKey>(() =>
    (typeof window !== "undefined" && (localStorage.getItem("pg_basemap") as BasemapKey)) || "void");
  const tracksRef = useRef<Track[]>([]);

  // ── Plot state (client-only draft) ──────────────────────────────────────────
  const [plot, setPlot] = useState<ParsedTrack | null>(null);
  const [markers, setMarkers] = useState<PlotMarker[]>([]);
  const [plotErr, setPlotErr] = useState("");
  const [addMode, setAddMode] = useState(false);
  const plotInputRef = useRef<HTMLInputElement>(null);
  // Saving to a member's dashboard (Slice 3).
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [myMaps, setMyMaps] = useState<SavedMap[]>([]);
  const [mapsOpen, setMapsOpen] = useState(false);
  // Mirrors so map handlers bound once at mount read the latest values.
  const plotRef = useRef<ParsedTrack | null>(null);
  const markersRef = useRef<PlotMarker[]>([]);
  const addModeRef = useRef(false);
  const markerObjsRef = useRef<maplibregl.Marker[]>([]); // plot markers only (not capture pins)
  useEffect(() => { plotRef.current = plot; }, [plot]);
  useEffect(() => { markersRef.current = markers; }, [markers]);
  useEffect(() => { addModeRef.current = addMode; }, [addMode]);

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

  // The plotted route — a raster layer dies on setStyle, so this too re-fires on
  // style.load. Dashed amber = UNVERIFIED (safety rail §9), distinct from the
  // solid cyan of confirmed tracks.
  function drawRoute(map: maplibregl.Map) {
    if (map.getLayer("plot-route")) map.removeLayer("plot-route");
    if (map.getSource("plot-route")) map.removeSource("plot-route");
    const p = plotRef.current;
    if (!p) return;
    const segs = p.segments.filter((s) => s.length > 1);
    if (!segs.length) return;
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

  // DOM markers survive setStyle, but a posts-remount rebuilds the map, so we
  // re-attach from the ref. Clear-then-add keeps it idempotent.
  function syncMarkers(map: maplibregl.Map) {
    for (const mk of markerObjsRef.current) mk.remove();
    markerObjsRef.current = [];
    for (const m of markersRef.current) {
      if (!m.include) continue;
      const critical = POI[m.poiType].safetyCritical;
      const el = document.createElement("div");
      el.className = "plot-pin" + (critical ? " is-critical" : "");
      el.title = m.label;
      const dot = document.createElement("span");
      dot.className = "plot-pin-dot";
      const lab = document.createElement("span");
      lab.className = "plot-pin-label";
      lab.textContent = m.label; // textContent, not innerHTML — labels are user input
      el.append(dot, lab);
      const mk = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([m.lng, m.lat]).addTo(map);
      markerObjsRef.current.push(mk);
    }
  }

  function pickBasemap(k: BasemapKey) {
    setBasemap(k);
    localStorage.setItem("pg_basemap", k);
    mapRef.current?.setStyle(BASEMAPS[k]); // markers survive (DOM); line layers re-add on style.load
    track("filter_change", { props: { basemap: k } });
  }

  // ── Plot actions ────────────────────────────────────────────────────────────
  async function takePlot(file: File | undefined) {
    if (!file) return;
    setPlotErr("");
    if (file.size > MAX_FILE_BYTES) { setPlotErr("File too large (25MB max)."); return; }
    const text = await file.text();
    const isGeo = /\.(geojson|json)$/i.test(file.name) || text.trimStart().startsWith("{");
    const parsed = isGeo ? parseGeoJSON(text) : parseGpx(text);
    if (!parsed) { setPlotErr("Couldn't read that as a GPX or GeoJSON track."); return; }

    const mined: PlotMarker[] = [
      ...parsed.waypoints.map((w): PlotMarker => ({
        id: uid(), lat: w.lat, lng: w.lng,
        label: w.name ?? "Waypoint",
        poiType: SYM_TO_POI[(w.sym ?? "").toLowerCase()] ?? "other",
        include: true, source: "import",
      })),
      ...parsed.gaps.map((g): PlotMarker => ({
        id: uid(), lat: g.lat, lng: g.lng,
        label: g.durationMin >= 360 ? `Overnight stop (${Math.round(g.durationMin / 60)}h)` : `Rest stop (${g.durationMin} min)`,
        poiType: g.durationMin >= 360 ? "camp" : "other",
        include: true, source: "import",
      })),
    ];
    setPlot(parsed);
    setMarkers(mined);
    track("plot_import", { props: { format: isGeo ? "geojson" : "gpx", markers: mined.length, points: parsed.rawCount } });

    const map = mapRef.current;
    if (map) {
      const b = new maplibregl.LngLatBounds();
      for (const seg of parsed.segments) for (const pt of seg) b.extend([pt.lng, pt.lat]);
      for (const m of mined) b.extend([m.lng, m.lat]);
      if (!b.isEmpty()) map.fitBounds(b, { padding: 80, maxZoom: 14, duration: 400 });
    }
  }

  function clearPlot() {
    setPlot(null);
    setMarkers([]);
    setPlotErr("");
    setAddMode(false);
    setTitle("");
  }

  const editMarker = (id: string, patch: Partial<PlotMarker>) =>
    setMarkers((ms) => ms.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const removeMarker = (id: string) => setMarkers((ms) => ms.filter((x) => x.id !== id));

  // ── Save / load / delete member maps (Slice 3) ──────────────────────────────
  // Frame the map to a route+markers. If the map isn't built yet (e.g. a plot
  // restored on sign-in before the mount effect runs), remember it and fit once
  // the map is ready (consumed in the mount effect below).
  const pendingFitRef = useRef<{ route: MapRoutePoint[][]; markers: { lat: number; lng: number }[] } | null>(null);
  const fitTo = (route: MapRoutePoint[][], markers: { lat: number; lng: number }[]) => {
    const map = mapRef.current;
    if (!map) { pendingFitRef.current = { route, markers }; return; }
    const b = new maplibregl.LngLatBounds();
    for (const seg of route) for (const pt of seg) b.extend([pt.lng, pt.lat]);
    for (const m of markers) b.extend([m.lng, m.lat]);
    if (!b.isEmpty()) map.fitBounds(b, { padding: 80, maxZoom: 14, duration: 400 });
    pendingFitRef.current = null;
  };

  // Current plot → the persisted shape (only included markers travel).
  function currentPayload() {
    if (!plot) return null;
    const markersOut: SavedMapMarker[] = markersRef.current
      .filter((m) => m.include)
      .map((m) => ({ lat: m.lat, lng: m.lng, label: m.label, poiType: m.poiType }));
    return {
      title: (title.trim() || plot.name || "Untitled map"),
      route: plot.segments, markers: markersOut,
      distanceM: plot.distanceM, gainM: plot.gainM,
    };
  }

  const flash = (msg: string, ms = 3000) => { setSavedMsg(msg); setTimeout(() => setSavedMsg(""), ms); };

  async function saveCurrentMap() {
    const payload = currentPayload();
    if (!payload) return;
    if (!user) { stashPendingMap(payload); return onAuthRequired(); } // login-on-save
    setSaving(true);
    const saved = await saveMap(user.id, payload);
    setSaving(false);
    if (!saved) return flash("Couldn't save — try again.");
    setMyMaps((ms) => [saved, ...ms]);
    track("map_save", { props: { markers: payload.markers.length, points: payload.route.reduce((n, s) => n + s.length, 0) } });
    flash(`Saved “${saved.title}” to your maps.`);
  }

  // Restore a saved/pending map onto the Atlas as the active plot.
  function loadSaved(m: { title: string; route: MapRoutePoint[][]; markers: SavedMapMarker[]; distanceM: number; gainM: number }) {
    const restored: ParsedTrack = {
      segments: m.route, rawCount: m.route.reduce((n, s) => n + s.length, 0),
      distanceM: m.distanceM, gainM: m.gainM, name: m.title, recordedAt: null, waypoints: [], gaps: [],
    };
    setAddMode(false);
    setPlot(restored);
    setTitle(m.title);
    setMarkers(m.markers.map((mk) => ({ id: uid(), lat: mk.lat, lng: mk.lng, label: mk.label, poiType: mk.poiType, include: true, source: "import" as const })));
    fitTo(m.route, m.markers);
  }

  function openMap(m: SavedMap) {
    loadSaved(m);
    setMapsOpen(false);
    track("map_open", { props: { markers: m.markers.length } });
  }

  async function removeSavedMap(id: string) {
    const ok = await deleteMap(id);
    if (ok) { setMyMaps((ms) => ms.filter((x) => x.id !== id)); track("map_delete"); }
  }

  // One effect owns the member's map list. On sign-in: first finish any pending
  // save (a Save the magic link interrupted), THEN load the authoritative list —
  // sequenced so a concurrent load can't duplicate or drop the just-saved map.
  useEffect(() => {
    if (!user) { setMyMaps([]); setMapsOpen(false); return; }
    let cancelled = false;
    (async () => {
      const p = readPendingMap();
      if (p) {
        clearPendingMap();
        loadSaved(p);
        const saved = await saveMap(user.id, { title: p.title, route: p.route, markers: p.markers, distanceM: p.distanceM, gainM: p.gainM });
        if (saved) {
          track("map_save", { props: { restored: true, markers: p.markers.length } });
          flash(`Signed in — saved “${saved.title}” to your maps.`, 3600);
        }
      }
      const mine = await loadMyMaps(user.id); // includes the just-saved map
      if (!cancelled) setMyMaps(mine);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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
      // Build the DOM, don't interpolate into innerHTML — post titles/grads are
      // user input (stored-XSS / CSS-injection vector otherwise).
      const dot = document.createElement("span");
      dot.className = "map-pin-dot";
      dot.style.background = p.author.grad;
      const lab = document.createElement("span");
      lab.className = "map-pin-label";
      lab.textContent = p.title;
      el.append(dot, lab);
      el.addEventListener("click", () => {
        track("card_click", { postId: p.id, props: { from: "map" } });
        onOpenRef.current(p.id);
      });
      new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([p.captureLng!, p.captureLat!]).addTo(map);
      bounds.extend([p.captureLng!, p.captureLat!]);
    }
    if (geoPosts.length) map.fitBounds(bounds, { padding: 80, maxZoom: 11, duration: 0 });

    // Line layers (tracks + plot route) die on setStyle → redraw on every load.
    map.on("style.load", () => { drawTracks(map); drawRoute(map); });
    // Click to drop a human marker when Add-marker mode is armed.
    map.on("click", (e) => {
      if (!addModeRef.current) return;
      const { lng, lat } = e.lngLat;
      setMarkers((ms) => [...ms, { id: uid(), lat, lng, label: "New marker", poiType: "other", include: true, source: "human" }]);
      setAddMode(false);
      track("plot_marker_add", { props: { poiType: "other" } });
    });

    loadTracksForPosts(geoPosts.map((p) => p.id)).then((ts) => {
      tracksRef.current = ts;
      if (map.isStyleLoaded()) drawTracks(map);
    });

    // Re-apply any existing plot (state survives this posts-remount), and honour
    // a fit that was requested before the map existed (restore-on-sign-in).
    const applyPlot = () => {
      drawRoute(map); syncMarkers(map);
      const f = pendingFitRef.current;
      if (f) fitTo(f.route, f.markers);
    };
    if (map.isStyleLoaded()) applyPlot(); else map.once("style.load", applyPlot);

    return () => { mapRef.current = null; map.remove(); };
    // Re-mounting per posts change is fine at prototype scale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts.length]);

  // Live redraw when the plot draft changes (no basemap reload involved).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const go = () => drawRoute(map);
    if (map.isStyleLoaded()) go(); else map.once("style.load", go);
  }, [plot]);

  useEffect(() => {
    const map = mapRef.current;
    if (map) syncMarkers(map);
  }, [markers]);

  useEffect(() => {
    const map = mapRef.current;
    if (map) map.getCanvas().style.cursor = addMode ? "crosshair" : "";
  }, [addMode]);

  const included = markers.filter((m) => m.include).length;

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

      {/* Plot: import a route + curate markers (local draft only). */}
      <div className="plot-panel glass">
        <div className="plot-panel-head">
          <div className="eyebrow">Plot</div>
          <button className="btn-sec" onClick={() => plotInputRef.current?.click()}>
            {plot ? "Replace file" : "Plot a route"}
          </button>
        </div>
        <input
          ref={plotInputRef} type="file" hidden
          accept=".gpx,.geojson,.json,application/gpx+xml,application/geo+json"
          onChange={(e) => takePlot(e.target.files?.[0])}
        />
        {plotErr && <p className="plot-err">{plotErr}</p>}
        {savedMsg && <p className="plot-saved">{savedMsg}</p>}
        {!plot && !plotErr && (
          <p className="plot-hint">Drop a GPX or GeoJSON — we keep the rough outline plus camps, water, and points of interest.</p>
        )}

        {plot && (
          <>
            <div className="plot-meta">
              {plot.name && <b>{plot.name}</b>}
              <span>{(plot.distanceM / 1000).toFixed(1)} km · {Math.round(plot.gainM)} m gain · {included} marker{included === 1 ? "" : "s"}</span>
            </div>
            <div className="plot-actions">
              <button className="btn-sec" data-on={addMode} onClick={() => setAddMode((v) => !v)}>
                {addMode ? "Click map to place…" : "Add marker"}
              </button>
              <button className="btn-sec" onClick={clearPlot}>Clear</button>
            </div>
            <div className="plot-save">
              <input className="plot-title" placeholder="Name this map…" value={title}
                onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveCurrentMap()} />
              <button className="btn-upload" disabled={saving} onClick={saveCurrentMap}>
                {saving ? "Saving…" : user ? "Save map" : "Save map (sign in)"}
              </button>
            </div>
            <p className="plot-note">Imported lines are unverified observations — confirm on the ground, never an endorsement.</p>
            <div className="plot-cands">
              {markers.length === 0 && <p className="plot-hint">No markers yet — use “Add marker”.</p>}
              {markers.map((m) => (
                <div key={m.id} className="plot-cand" data-critical={POI[m.poiType].safetyCritical}>
                  <input type="checkbox" checked={m.include} onChange={(e) => editMarker(m.id, { include: e.target.checked })} aria-label="Include marker" />
                  <input className="plot-cand-label" value={m.label} onChange={(e) => editMarker(m.id, { label: e.target.value })} />
                  <select value={m.poiType} onChange={(e) => editMarker(m.id, { poiType: e.target.value as PoiType })}>
                    {(Object.keys(POI) as PoiType[]).map((k) => (
                      <option key={k} value={k}>{POI[k].label}</option>
                    ))}
                  </select>
                  <button className="plot-cand-x" onClick={() => removeMarker(m.id)} aria-label="Remove marker">✕</button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* My maps — the member's own saved plots (their Atlas dashboard). */}
        {user && myMaps.length > 0 && (
          <div className="plot-maps">
            <button className="plot-maps-toggle" onClick={() => setMapsOpen((v) => !v)}>
              My maps ({myMaps.length}) {mapsOpen ? "▾" : "▸"}
            </button>
            {mapsOpen && (
              <div className="plot-maps-list">
                {myMaps.map((m) => (
                  <div className="plot-map-row" key={m.id}>
                    <button className="plot-map-open" onClick={() => openMap(m)}>
                      <b>{m.title}</b>
                      <span>{(m.distanceM / 1000).toFixed(1)} km · {m.markers.length} marker{m.markers.length === 1 ? "" : "s"}</span>
                    </button>
                    <button className="plot-cand-x" onClick={() => removeSavedMap(m.id)} aria-label="Delete map">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {geoPosts.length === 0 && !plot && (
        <div className="map-empty glass">
          <div className="eyebrow">No located captures yet</div>
          <p>Panoramas with GPS in their metadata land here automatically — shoot with location on and the atlas draws itself.</p>
        </div>
      )}
    </div>
  );
}
