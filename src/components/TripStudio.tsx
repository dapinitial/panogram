"use client";

import { useEffect, useRef, useState } from "react";
import TripGlobe from "@/components/TripGlobe";
import { importPlotFile } from "@/lib/plot-import";
import { track } from "@/lib/telemetry";
import { POI, type PoiType } from "@/lib/types";
import type { IntroLevel, LightPreset } from "@/lib/fly-tour";
import {
  loadTrips, createTrip, updateTrip, deleteTrip, loadTripEditors, grantTripEditor, ROUTE_COLORS,
  type Trip, type MapRoutePoint, type SavedMapMarker, type FlyConfig,
} from "@/lib/db";

// The Trips CMS editor. Left: the trip list + editors panel. Right: a 3D preview
// with ALL the tools in a CONTROL BAR BELOW the map (map stays clean, like the
// embed). Upload a GPX/GeoJSON, tune the fly-by, edit markers, publish — then
// copy the <iframe> snippet for the external site.

type Draft = {
  id?: string; slug?: string; title: string; region: string;
  route: MapRoutePoint[][]; markers: SavedMapMarker[]; color: string;
  summitM: number | null; distanceM: number; gainM: number;
  autoplay: boolean; published: boolean; fly: FlyConfig;
};

const blankDraft = (): Draft => ({
  title: "", region: "", route: [], markers: [], color: "#57eaff",
  summitM: null, distanceM: 0, gainM: 0, autoplay: true, published: false, fly: {},
});
const summitOf = (route: MapRoutePoint[][]): number | null => {
  let m = -Infinity;
  for (const s of route) for (const p of s) if ((p.ele ?? -Infinity) > m) m = p.ele ?? -Infinity;
  return Number.isFinite(m) ? Math.round(m) : null;
};
const hasRoute = (d: Draft | null) => !!d && d.route.some((s) => s.length > 1);
const km = (m: number) => (m / 1000).toFixed(1);

const INTROS: { v: IntroLevel; label: string }[] = [
  { v: "space", label: "🌍 Space" }, { v: "continent", label: "🗺️ Continent" },
  { v: "country", label: "🏳️ Country" }, { v: "region", label: "⛰️ Region" },
  { v: "area", label: "🌲 Area" }, { v: "trailhead", label: "🥾 Trailhead" },
];
const LIGHTS: { v: LightPreset; label: string }[] = [
  { v: "dawn", label: "Dawn" }, { v: "day", label: "Day" }, { v: "dusk", label: "Dusk" }, { v: "night", label: "Night" },
];
const PACES: { v: number; label: string }[] = [
  { v: 0.7, label: "Relaxed" }, { v: 1, label: "Cinematic" }, { v: 1.5, label: "Brisk" },
];

export default function TripStudio({ baseUrl, userId }: { baseUrl: string; userId: string }) {
  void userId;
  const [trips, setTrips] = useState<Trip[]>([]);
  const [editors, setEditors] = useState<{ handle: string; isAdmin: boolean }[]>([]);
  const [grantHandle, setGrantHandle] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [playToken, setPlayToken] = useState(0);
  const [flying, setFlying] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [origin, setOrigin] = useState(baseUrl);
  useEffect(() => { if (typeof window !== "undefined") setOrigin(window.location.origin); }, []);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => setTrips(await loadTrips());
  const refreshEditors = async () => setEditors(await loadTripEditors());
  useEffect(() => { refresh(); refreshEditors(); }, []);

  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const patchFly = (p: Partial<FlyConfig>) => setDraft((d) => (d ? { ...d, fly: { ...d.fly, ...p } } : d));

  function selectTrip(t: Trip) {
    setErr(""); setCopied(false); setConfirmDel(false); setAddMode(false);
    setDraft({
      id: t.id, slug: t.slug, title: t.title, region: t.region,
      route: t.route, markers: t.markers, color: t.color, summitM: t.summitM,
      distanceM: t.distanceM, gainM: t.gainM, autoplay: t.autoplay, published: t.published, fly: t.fly,
    });
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setErr("");
    const res = await importPlotFile(file);
    if ("error" in res) { setErr(res.error); return; }
    const p = res.plot;
    setDraft((d) => {
      const b = d ?? blankDraft();
      return {
        ...b, title: b.title || p.title, route: p.route, markers: p.markers,
        color: p.color ?? b.color, distanceM: p.distanceM, gainM: p.gainM, summitM: summitOf(p.route),
      };
    });
  }

  // ── markers ──
  const patchMarker = (i: number, mp: Partial<SavedMapMarker>) =>
    patch({ markers: (draft?.markers ?? []).map((m, j) => (j === i ? { ...m, ...mp } : m)) });
  const removeMarker = (i: number) => patch({ markers: (draft?.markers ?? []).filter((_, j) => j !== i) });
  const addMarkerAt = (ll: { lng: number; lat: number }) => {
    setDraft((d) => (d ? { ...d, markers: [...d.markers, { lat: ll.lat, lng: ll.lng, label: "New marker", poiType: "other" }] } : d));
    setAddMode(false);
  };
  const moveMarker = (i: number, ll: { lng: number; lat: number }) => patchMarker(i, { lat: ll.lat, lng: ll.lng });

  async function save() {
    if (!draft) return;
    if (!draft.title.trim()) { setErr("Give the trip a title."); return; }
    if (!hasRoute(draft)) { setErr("Upload a route (GPX or GeoJSON) first."); return; }
    setBusy(true); setErr("");
    const input = {
      title: draft.title, region: draft.region, route: draft.route, markers: draft.markers,
      color: draft.color, summitM: draft.summitM, distanceM: draft.distanceM, gainM: draft.gainM,
      autoplay: draft.autoplay, published: draft.published, fly: draft.fly,
    };
    const saved = draft.id ? await updateTrip(draft.id, input) : await createTrip(input, trips.map((t) => t.slug));
    setBusy(false);
    if (!saved) { setErr("Save failed — check you have editor access."); return; }
    track("trip_save", { props: { published: saved.published, new: !draft.id } });
    await refresh();
    selectTrip(saved);
  }

  async function del() {
    if (!draft?.id) return;
    setBusy(true);
    const ok = await deleteTrip(draft.id);
    setBusy(false);
    if (ok) { setDraft(null); setConfirmDel(false); await refresh(); } else setErr("Delete failed.");
  }

  async function grant(handle: string, enable: boolean) {
    const h = handle.trim(); if (!h) return;
    const ok = await grantTripEditor(h, enable);
    if (ok) { setGrantHandle(""); await refreshEditors(); }
    else setErr(`Couldn't ${enable ? "add" : "remove"} @${h.replace(/^@/, "")} — check the handle.`);
  }

  const embedUrl = draft?.slug ? `${origin}/embed/${draft.slug}` : "";
  const snippet = embedUrl
    ? `<iframe src="${embedUrl}" width="100%" height="540" style="border:0;border-radius:16px" loading="lazy" allow="fullscreen"></iframe>`
    : "";
  function copyText(text: string) {
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  const fly = draft?.fly ?? {};
  const pitch = fly.pitch ?? 62;

  return (
    <main className="studio">
      <header className="studio-head">
        <div><div className="eyebrow">Panogram · white-label</div><h1>Trips CMS</h1></div>
        <a className="btn-sec" href="/">← App</a>
      </header>

      <div className="studio-body">
        <aside className="studio-list">
          <button className="btn-fly studio-new" onClick={() => { setDraft(blankDraft()); setErr(""); setCopied(false); setAddMode(false); }}>+ New trip</button>
          {trips.map((t) => (
            <button key={t.id} className="studio-trip" data-active={draft?.id === t.id} onClick={() => selectTrip(t)}>
              <b>{t.title}</b>
              <span className="studio-trip-meta">{t.region || "—"}</span>
              <span className="studio-badge" data-pub={t.published}>{t.published ? "Live" : "Draft"}</span>
            </button>
          ))}
          {trips.length === 0 && <p className="plot-hint">No trips yet — create one.</p>}

          <div className="studio-editors">
            <div className="studio-editors-head">Trip editors</div>
            {editors.map((e) => (
              <div className="studio-editor" key={e.handle}>
                <span>@{e.handle}{e.isAdmin && <em> · admin</em>}</span>
                {!e.isAdmin && <button className="studio-editor-x" title="Remove access" onClick={() => grant(e.handle, false)}>✕</button>}
              </div>
            ))}
            <div className="studio-grant">
              <input placeholder="@handle" value={grantHandle} onChange={(e) => setGrantHandle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && grant(grantHandle, true)} />
              <button className="btn-sec" onClick={() => grant(grantHandle, true)}>Grant</button>
            </div>
          </div>
        </aside>

        <section className="studio-edit">
          {!draft ? (
            <div className="studio-empty">Select a trip on the left, or create a new one.</div>
          ) : (
            <>
              <div className="studio-preview">
                {hasRoute(draft)
                  ? <TripGlobe route={draft.route} markers={draft.markers} color={draft.color} fly={draft.fly}
                      playToken={playToken} editable addMode={addMode}
                      onAddMarker={addMarkerAt} onMoveMarker={moveMarker} onFlyingChange={setFlying} />
                  : <div className="studio-preview-empty"><span>Upload a GPX or GeoJSON to preview the route in 3D.</span></div>}
              </div>

              <div className="studio-bar">
                <div className="studio-row">
                  <button className="btn-sec" onClick={() => fileRef.current?.click()}>
                    {hasRoute(draft) ? "Replace route" : "Upload GPX / GeoJSON"}
                  </button>
                  <button className="btn-fly" disabled={!hasRoute(draft)} onClick={() => setPlayToken((n) => n + 1)}>
                    {flying ? "Flying…" : "▶ Fly the trail"}
                  </button>
                  {hasRoute(draft) && (
                    <span className="studio-stats">
                      {km(draft.distanceM)} km · +{Math.round(draft.gainM)} m{draft.summitM ? ` · ${draft.summitM.toLocaleString()} m` : ""}
                    </span>
                  )}
                </div>

                {/* Fly-by settings */}
                <div className="studio-row studio-fly">
                  <label className="studio-field">
                    <span>Opening altitude</span>
                    <select value={fly.intro ?? "space"} onChange={(e) => patchFly({ intro: e.target.value as IntroLevel })}>
                      {INTROS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                    </select>
                  </label>
                  <label className="studio-field studio-field--range">
                    <span>Birdseye angle · {pitch}°</span>
                    <input type="range" min={45} max={78} value={pitch} onChange={(e) => patchFly({ pitch: Number(e.target.value) })} />
                  </label>
                  <label className="studio-field">
                    <span>Pace</span>
                    <select value={fly.pace ?? 1} onChange={(e) => patchFly({ pace: Number(e.target.value) })}>
                      {PACES.map((o) => <option key={o.label} value={o.v}>{o.label}</option>)}
                    </select>
                  </label>
                  <label className="studio-field">
                    <span>Light mood</span>
                    <select value={fly.lightPreset ?? "dawn"} onChange={(e) => patchFly({ lightPreset: e.target.value as LightPreset })}>
                      {LIGHTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                    </select>
                  </label>
                  <label className="studio-toggle">
                    <input type="checkbox" checked={fly.sunSweep !== false} onChange={(e) => patchFly({ sunSweep: e.target.checked })} />
                    <span>Sun sweeps dawn→dusk</span>
                  </label>
                </div>

                {/* Details */}
                <div className="studio-row">
                  <label className="studio-field"><span>Title</span>
                    <input value={draft.title} maxLength={120} placeholder="Pico de Orizaba — Cumbre" onChange={(e) => patch({ title: e.target.value })} /></label>
                  <label className="studio-field"><span>Region</span>
                    <input value={draft.region} maxLength={120} placeholder="Citlaltépetl · Mexico" onChange={(e) => patch({ region: e.target.value })} /></label>
                  <div className="studio-field"><span>Line colour</span>
                    <div className="plot-colors">
                      {ROUTE_COLORS.map((c) => (
                        <button key={c} className="plot-color" data-on={draft.color === c} style={{ background: c }} onClick={() => patch({ color: c })} aria-label={`Colour ${c}`} />
                      ))}
                    </div>
                  </div>
                  <label className="studio-toggle"><input type="checkbox" checked={draft.autoplay} onChange={(e) => patch({ autoplay: e.target.checked })} /><span>Auto-play on load</span></label>
                  <label className="studio-toggle"><input type="checkbox" checked={draft.published} onChange={(e) => patch({ published: e.target.checked })} /><span>Published</span></label>
                </div>

                {/* Markers */}
                {hasRoute(draft) && (
                  <div className="studio-markers">
                    <div className="studio-markers-head">
                      <span>Markers</span>
                      <button className="btn-sec" data-on={addMode} onClick={() => setAddMode((v) => !v)}>{addMode ? "Click the map…" : "+ Add marker"}</button>
                    </div>
                    {draft.markers.map((m, i) => (
                      <div className="studio-marker" key={i} data-critical={POI[m.poiType]?.safetyCritical}>
                        <input value={m.label} onChange={(e) => patchMarker(i, { label: e.target.value })} />
                        <select value={m.poiType} onChange={(e) => patchMarker(i, { poiType: e.target.value as PoiType })}>
                          {(Object.keys(POI) as PoiType[]).map((k) => <option key={k} value={k}>{POI[k].label}</option>)}
                        </select>
                        <button className="studio-editor-x" onClick={() => removeMarker(i)} aria-label="Remove marker">✕</button>
                      </div>
                    ))}
                    {draft.markers.length === 0 && <p className="plot-hint">No markers — drop camp/water/POI with “Add marker”, or they come in from the file.</p>}
                  </div>
                )}

                {err && <div className="studio-err">{err}</div>}

                <div className="studio-row studio-actions">
                  <button className="btn-fly" disabled={busy} onClick={save}>{busy ? "Saving…" : draft.id ? "Save changes" : "Create trip"}</button>
                  {draft.id && !confirmDel && <button className="btn-sec studio-danger" onClick={() => setConfirmDel(true)}>Delete</button>}
                  {draft.id && confirmDel && (
                    <span className="studio-confirm">
                      Delete “{draft.title}”?
                      <button className="btn-sec studio-danger" disabled={busy} onClick={del}>Yes, delete</button>
                      <button className="btn-sec" onClick={() => setConfirmDel(false)}>Cancel</button>
                    </span>
                  )}
                </div>

                {draft.slug && (
                  <div className="studio-embed">
                    <div className="studio-embed-head">
                      <span>Embed on kafadventures.com — paste into a Squarespace Code Block:</span>
                      <span className="studio-embed-actions">
                        <a className="btn-sec" href={embedUrl} target="_blank" rel="noopener noreferrer">Open preview ↗</a>
                        <button className="btn-sec" onClick={() => copyText(embedUrl)}>Copy URL</button>
                        <button className="btn-sec" onClick={() => copyText(snippet)}>{copied ? "Copied ✓" : "Copy snippet"}</button>
                      </span>
                    </div>
                    <code className="studio-snippet">{snippet}</code>
                    {!draft.published && <p className="plot-hint">Note: the embed only renders once this trip is Published.</p>}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      <input ref={fileRef} type="file" hidden accept=".gpx,.geojson,.json,application/gpx+xml,application/geo+json"
        onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
    </main>
  );
}
