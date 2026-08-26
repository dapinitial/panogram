# The Atlas — spec

> The map that ties every capture to a real place — and lets you *plan* against it.

The Atlas is Panogram's map surface. It's where captures live as geo-pins, where a trip's
route is plotted, and where the immersive layer (panos, 360°) attaches back to real-world
coordinates. This doc is the source of truth for building it; the *why* sits under
[VISION.md](VISION.md) (teleport → annotate → discover). **Protocols still bind** — read
[../CLAUDE.md](../CLAUDE.md), especially the safety rail (§9) and login/RLS (§3–4).

Status legend: ✅ built · 🟡 partial · ⬜ not yet.

---

## 1. View modes — one place, several ways to see it

| Mode | Engine | State |
|---|---|---|
| **Flat (2D)** | MapLibre GL | ✅ the current Atlas (`MapView`/`MapViewImpl`) |
| **3D** | **Mapbox GL** (terrain/globe) | ⬜ new — behind a **3D button** |
| **Panorama / 360°** | existing `PanoViewer` (Photo Sphere Viewer) | ✅ reached by opening a pin's capture |

**Two engines, one toggle — this is the core architecture decision.** MapLibre is the default
2D map (free tiles, layer switching, Plot). The **3D button mounts a separate Mapbox-powered
component**, lazy-loaded via `dynamic(..., { ssr:false })` so Mapbox's SDK + token never load
on the 2D path and never touch SSR (same rule as the 360 viewer, §7). They are *distinct
components behind a mode switch*, not a style-swap inside one map — because they genuinely are
two different things (different SDK, different capabilities, different cost).

Decision (2026-08-26): **MapLibre now, Mapbox-ready.** Build 2D + Plot on MapLibre with no new
dependency or bill; add the Mapbox 3D mode as its own component when a token exists.

---

## 2. Basemaps & layers — the onX-style switcher

Already wired in `MapViewImpl` (`BASEMAPS`, `pg_basemap` localStorage): **Void** (Carto dark),
**Topo** (USGS The National Map), **Terrain** (OpenTopoMap). Adding a layer = one entry in that
map. Planned additions (all free / attribution-only): **Satellite** (Esri World Imagery, or
Mapbox Satellite once on Mapbox), **USFS** roads/visitor, **USGS imagery/NAIP**.

**Licensing reality (researched 2026-08 — verify current terms before shipping any paid tier):**
- **onX and CalTopo are NOT licensable** for our app. Both are closed consumer products with no
  public tile/API developer plan. Use them as UX inspiration, not as a source. onX is itself
  built on Mapbox; its signature value (private-parcel ownership) is licensed data, not a map API.
- **Parcel/ownership data**, if ever wanted, comes from an aggregator like **Regrid** — not onX.
- **Google Maps Platform** can't be a swappable layer next to non-Google basemaps under its ToS;
  the only piece worth it is **Photorealistic 3D Tiles** (via Map Tiles API), and only inside a
  Google/Cesium viewer. Not part of v1.
- Free government/open layers (USGS, USFS, OpenTopoMap, Esri imagery) cover the onX *experience*.

---

## 3. Plot — upload a route, keep only what matters

A **Plot button** on the Atlas imports a **GPX or GeoJSON** file and lays it on the map.

**Simplify, don't dump.** We do not want hundreds of trackpoints — we want the **rough route
outline** plus the **meaningful markers**: camp, water source, points of interest, and whatever
a human or the system adds of value. Concretely:
- **Route** → Douglas-Peucker simplified to a rough outline. `lib/gpx.ts` already has `simplify()`
  and a hard point cap — reuse it. 🟡
- **Markers** → mined as *candidates the user curates* (nothing auto-publishes): GPX `<wpt>` +
  timed segment gaps → camp/water/summit/etc. Already implemented for upload in `Upload.tsx`
  (`Candidate`, `SYM_TO_POI`) — lift that logic. 🟡
- **Marker vocabulary** already exists: `PoiType` = camp · bivy · water · trailhead · cairn ·
  summit · … (`lib/types.ts`, mirrored by the `annotations.poi_type` DB check). Reuse; don't
  reinvent. ✅

**New work:**
- ⬜ `parseGeoJSON()` in `lib/gpx.ts` (or `lib/geo.ts`) returning the **same `ParsedTrack`
  shape**: `LineString`/`MultiLineString` → track (then `simplify`); `Point` features → candidate
  markers. GPX path already produces this shape, so downstream is shared.
- ⬜ The Plot UI: file picker → simplified preview on the map → curate markers → Save.

---

## 4. Save model — draw free, sign in to save

Today drawing/tagging is gated at *entry* (opening the tool demands sign-in) — backwards, it
interrupts the magic moment. Target model:
- **Plot / draw / tag freely without login** — everything is a local draft (client state).
- **Sign in only on Save** — the AuthSheet appears at Save; after auth the draft flushes to the
  DB tied to `auth.uid()`.
- **Saved plots land in the user's own space** — isolated per member (the "maps" model, §5).

⚠️ **Magic-link draft survival.** Sign-in leaves the page (email → `/auth/callback` → back). An
in-memory draft is lost across that round-trip. So on Save-before-auth we must **stash the draft
(+ context id) in localStorage**, and on return **restore it and re-open Save**. `/auth/callback`
should return to the originating view, not `/`. This is the one genuinely tricky part.

---

## 5. Ownership — maps & members ⬜

A saved plot belongs to a member. New schema (RLS in the same migration, per §4 of CLAUDE.md):
- `maps` table — `owner = auth.uid()`, public-read, owner-write.
- Plotted routes/markers hang off a `map_id` (annotations already carry `author_id`, so a "my
  contributions" view is queryable even before this lands).
- A member's dashboard lists their maps; each map is isolated to them.

---

## 6. Safety rail (inviolable — CLAUDE.md §9)

Imported tracks and markers are **observations, not endorsements**. Any imported line or
safety-critical marker (a "route", an anchor, "climbable") renders **dashed-amber unverified**
until confirmed sightings exist. An uploaded GPX is never authoritative. The Plot importer must
set `source` / `is_safety_critical` so this styling applies — never ship "attempt this" framing.

---

## 7. Build slices (ordered)

1. **Plot v1 (MapLibre, local-only)** — Plot button + `parseGeoJSON` + reuse `parseGpx`/`simplify`
   + curate markers → render simplified route & markers on the Atlas. No persistence yet, no login.
   *Ships the core value fastest; touches no schema.*
2. **Login-on-save** — move the auth gate from draw/tag entry to Save; add the localStorage
   draft-survival + `/auth/callback` return-to-context.
3. **Maps & members** — `maps` schema + RLS, save plots to a member's dashboard, isolation.
4. **3D mode** — Mapbox GL component behind the 3D button (token + `dynamic` ssr:false), terrain.
5. **Layers** — satellite (Esri/Mapbox) + USFS added to the basemap switcher.

Each slice is independently shippable. Start at #1.
