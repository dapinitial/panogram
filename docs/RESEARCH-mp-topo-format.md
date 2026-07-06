# Research: Mountain Project's interactive topo format

**Source:** onX's public `mp-tools` repo (github.com/onXmaps/mp-tools — their internal Claude
Code plugin for MP development), specifically `skills/api-client/references/api-endpoints.md`.
Everything below comes from reading their published documentation — **no API calls were made**:
their client script impersonates the MP iOS app (spoofed User-Agent + device ID) against a
private API, which is over the line even for research. Their docs alone answer the schema
question.

**Legal stance (restating CLAUDE.md/STATUS):** MP's API is not licensed for third-party use.
This document is schema homework, not an integration plan. OpenBeta is the product integration.

## Their data model

Three objects, related by IDs:

```
images ──< topos ──< topoRelations >── routes
           (drawing)  (line ↔ route, per pitch)
```

- **`topos`** — `{ id, imageId, topoData }` where `topoData` is a JSON-encoded string of drawn
  overlay items on that image.
- **`topoRelations`** — `{ topoId, imageId, parentId (route id), pitch, annotationIds,
  createdByMethod, createdByUserId, createDate }`. The drawn line is its own object; the
  *relation* binds it to a route entity **with a pitch number**, and one topo can relate to
  many routes/pitches.
- **`topoData.items`** — typed overlay items:

| `it` | Type | Geometry | Notes |
|---|---|---|---|
| 0 | Line | `cp: [{x,y},…]` control points | the route path |
| 1 | Bolt | `x,y` | protection marker |
| 2 | Rappel | `x,y` | descent marker |
| 3 | Belay | `x,y` | belay station |
| 5 | Text | `x,y,t,ta` | route label |
| 6 | Piton | `x,y` | fixed gear |

Style fields: `ic` (hex color), `lw` (line width), `ia` (alpha). **Coordinates are flat image
pixel space**, scaled at render time.

## What Panogram should steal

1. **Line ↔ route-entity relations with pitch.** Their strongest idea. Today a Panogram route
   line's identity lives in its free-text `label`. When routes link to OpenBeta, add a relation
   (`annotations.route_ref uuid` + `pitch smallint`, or a join table for multi-pitch) instead of
   overloading the label — one drawn line can then serve pitch 1 of one route and the start of a
   variation, exactly like their model.
2. **Sparse control points, not freehand samples.** Their lines are a handful of clicked points —
   which is exactly how our draw tool works. Validates the click-to-extend UX; no smoothing debt.
3. **Typed point items *attached to the topo*.** Bolts, belays, rappels, pitons as point markers
   that ride with a line. Our `poi_type` vocabulary already covers rappel/anchor; consider letting
   a POI reference a parent route annotation (`parent_annotation_id`) so gear markers cluster with
   their line.
4. **`createdByMethod`** ≈ our `source` column — same instinct, we're aligned.

## Where Panogram is already ahead

- **Spherical coordinates** (yaw/pitch on the real scene) vs their flat image pixels — our format
  is a strict superset; theirs can't do bearings, sun, peaks, or triangulation.
- **Community verification** (sightings + the unverified safety rail) — MP topos have no trust
  signal beyond authorship.
- **Open posture** — their data is walled; our differentiated layer is user-generated and can be
  openly licensed (decide the UGC data license before launch — see STATUS).

## Follow-ups

- [ ] `annotations.route_ref` (OpenBeta uuid) + `pitch` when route linking lands (migration).
- [ ] `parent_annotation_id` for gear/POI markers clustered on a line (migration, optional).
- [ ] UGC data-licensing decision (Terms) — the open-vs-walled posture is strategic.
