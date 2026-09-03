"use client";

import { useEffect, useRef, useState } from "react";
import TripGlobe from "@/components/TripGlobe";
import { importPlotFile } from "@/lib/plot-import";
import { track } from "@/lib/telemetry";
import {
  loadTrips, createTrip, updateTrip, deleteTrip, ROUTE_COLORS,
  type Trip, type MapRoutePoint, type SavedMapMarker,
} from "@/lib/db";

// The Trips CMS editor. Left: the trip list + New. Right: a 3D preview of the
// route with ALL the editing tools in a CONTROL BAR BELOW the map (the map stays
// clean, like the embed). Upload a GPX/GeoJSON, title it, pick a colour, fly it
// to check, publish — then copy the <iframe> snippet for the external site.

type Draft = {
  id?: string; slug?: string; title: string; region: string;
  route: MapRoutePoint[][]; markers: SavedMapMarker[]; color: string;
  summitM: number | null; distanceM: number; gainM: number;
  autoplay: boolean; published: boolean;
};

const blankDraft = (): Draft => ({
  title: "", region: "", route: [], markers: [], color: "#57eaff",
  summitM: null, distanceM: 0, gainM: 0, autoplay: true, published: false,
});
const summitOf = (route: MapRoutePoint[][]): number | null => {
  let m = -Infinity;
  for (const s of route) for (const p of s) if ((p.ele ?? -Infinity) > m) m = p.ele ?? -Infinity;
  return Number.isFinite(m) ? Math.round(m) : null;
};
const hasRoute = (d: Draft | null) => !!d && d.route.some((s) => s.length > 1);
const km = (m: number) => (m / 1000).toFixed(1);

export default function TripStudio({ baseUrl, userId }: { baseUrl: string; userId: string }) {
  void userId;
  const [trips, setTrips] = useState<Trip[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [playToken, setPlayToken] = useState(0);
  const [flying, setFlying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  // The snippet MUST be an absolute URL to Panogram's origin — a relative src
  // would resolve against the host site (kafadventures.com) and 404. window
  // origin is exactly where this CMS (and the embed) is served.
  const [origin, setOrigin] = useState(baseUrl);
  useEffect(() => { if (typeof window !== "undefined") setOrigin(window.location.origin); }, []);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => setTrips(await loadTrips());
  useEffect(() => { refresh(); }, []);

  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));

  function selectTrip(t: Trip) {
    setErr(""); setCopied(false); setConfirmDel(false);
    setDraft({
      id: t.id, slug: t.slug, title: t.title, region: t.region,
      route: t.route, markers: t.markers, color: t.color, summitM: t.summitM,
      distanceM: t.distanceM, gainM: t.gainM, autoplay: t.autoplay, published: t.published,
    });
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setErr("");
    const res = await importPlotFile(file);
    if ("error" in res) { setErr(res.error); return; }
    const p = res.plot;
    setDraft((d) => {
      const base = d ?? blankDraft();
      return {
        ...base,
        title: base.title || p.title,
        route: p.route, markers: p.markers,
        color: p.color ?? base.color,
        distanceM: p.distanceM, gainM: p.gainM, summitM: summitOf(p.route),
      };
    });
  }

  async function save() {
    if (!draft) return;
    if (!draft.title.trim()) { setErr("Give the trip a title."); return; }
    if (!hasRoute(draft)) { setErr("Upload a route (GPX or GeoJSON) first."); return; }
    setBusy(true); setErr("");
    const input = {
      title: draft.title, region: draft.region, route: draft.route, markers: draft.markers,
      color: draft.color, summitM: draft.summitM, distanceM: draft.distanceM, gainM: draft.gainM,
      autoplay: draft.autoplay, published: draft.published,
    };
    const saved = draft.id
      ? await updateTrip(draft.id, input)
      : await createTrip(input, trips.map((t) => t.slug));
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
    if (ok) { setDraft(null); setConfirmDel(false); await refresh(); }
    else setErr("Delete failed.");
  }

  const embedUrl = draft?.slug ? `${origin}/embed/${draft.slug}` : "";
  const snippet = embedUrl
    ? `<iframe src="${embedUrl}" width="100%" height="540" style="border:0;border-radius:16px" loading="lazy" allow="fullscreen"></iframe>`
    : "";

  function copyText(text: string) {
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  return (
    <main className="studio">
      <header className="studio-head">
        <div>
          <div className="eyebrow">Panogram · white-label</div>
          <h1>Trips CMS</h1>
        </div>
        <a className="btn-sec" href="/">← App</a>
      </header>

      <div className="studio-body">
        <aside className="studio-list">
          <button className="btn-fly studio-new" onClick={() => { setDraft(blankDraft()); setErr(""); setCopied(false); }}>+ New trip</button>
          {trips.map((t) => (
            <button key={t.id} className="studio-trip" data-active={draft?.id === t.id} onClick={() => selectTrip(t)}>
              <b>{t.title}</b>
              <span className="studio-trip-meta">{t.region || "—"}</span>
              <span className="studio-badge" data-pub={t.published}>{t.published ? "Live" : "Draft"}</span>
            </button>
          ))}
          {trips.length === 0 && <p className="plot-hint">No trips yet — create one.</p>}
        </aside>

        <section className="studio-edit">
          {!draft ? (
            <div className="studio-empty">Select a trip on the left, or create a new one.</div>
          ) : (
            <>
              <div className="studio-preview">
                {hasRoute(draft)
                  ? <TripGlobe route={draft.route} color={draft.color} playToken={playToken} onFlyingChange={setFlying} />
                  : <div className="studio-preview-empty"><span>Upload a GPX or GeoJSON to preview the route in 3D.</span></div>}
              </div>

              {/* Control bar — all tools live here, below the clean map. */}
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
                      {km(draft.distanceM)} km · +{Math.round(draft.gainM)} m{draft.summitM ? ` · ${draft.summitM.toLocaleString()} m summit` : ""}
                    </span>
                  )}
                </div>

                <div className="studio-row">
                  <label className="studio-field">
                    <span>Title</span>
                    <input value={draft.title} maxLength={120} placeholder="Pico de Orizaba — Cumbre" onChange={(e) => patch({ title: e.target.value })} />
                  </label>
                  <label className="studio-field">
                    <span>Region</span>
                    <input value={draft.region} maxLength={120} placeholder="Citlaltépetl · Mexico" onChange={(e) => patch({ region: e.target.value })} />
                  </label>
                </div>

                <div className="studio-row">
                  <div className="studio-field">
                    <span>Line colour</span>
                    <div className="plot-colors">
                      {ROUTE_COLORS.map((c) => (
                        <button key={c} className="plot-color" data-on={draft.color === c} style={{ background: c }} onClick={() => patch({ color: c })} aria-label={`Colour ${c}`} />
                      ))}
                    </div>
                  </div>
                  <label className="studio-toggle">
                    <input type="checkbox" checked={draft.autoplay} onChange={(e) => patch({ autoplay: e.target.checked })} />
                    <span>Auto-play fly-by on load</span>
                  </label>
                  <label className="studio-toggle">
                    <input type="checkbox" checked={draft.published} onChange={(e) => patch({ published: e.target.checked })} />
                    <span>Published (visible on the embed)</span>
                  </label>
                </div>

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
