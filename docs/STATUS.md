# Panogram — status & handoff

Living snapshot for picking the work back up. The *why* is in [VISION.md](VISION.md); the *how/rules*
are in [../CLAUDE.md](../CLAUDE.md).

## Live
- **Prod:** https://panogram-fxfju.ondigitalocean.app — DigitalOcean App Platform (~$5/mo).
- **Admin data room:** `/admin?key=…` — gated by `ADMIN_KEY` (value in `.env.production`, gitignored).
  Bare `/admin` shows a lock screen.
- **Repo:** `dapinitial/panogram` (private). `deploy_on_push` is on → **`git push` redeploys.**

## Stack
Next.js 16 (App Router, TS) · Supabase (Postgres/Auth/Storage/RLS, ref `moepkkdpsimwpshgvwlt`) ·
Photo Sphere Viewer (real 360 rendering) · Resend (email) · PostHog-ready telemetry. Hand-written
"spatial OS" CSS — no Tailwind.

## Done
Feed · real drag-to-explore 360 viewer · magic-link auth (auto-profiles) · upload → Supabase Storage →
persistent posts · likes / saves / comments / follows (persisted) · Explore search · **spatial
annotations + geocache find loop** · shareable `/p/[id]` permalinks (OG previews) · `/u/[handle]`
creator pages · activity notifications · telemetry → gated `/admin` data room · first-run onboarding ·
varied real demo panos · **trust & safety: report · block · admin moderation queue**. RLS enforced;
storage authenticated-write; secret hook + `.githooks` active.

## Legal / policy layer
- Pages (static, spatial-styled via shared `LegalDoc` chrome): `/privacy`, `/terms`, `/guidelines`,
  `/legal/dmca`. Guidelines map 1:1 to the in-app report reasons.
- Surfaced via a site `Footer` (app shell + legal pages), an `AuthSheet` consent line (links Terms +
  Privacy), and a "what's allowed" Guidelines link in the report sheet.
- Operator: **Unakin LLC** · governing law **Washington, USA** · contact/abuse/DMCA **me@davidpuerto.com**.
- ⚠️ Drafted as readable starting points, **not lawyer-reviewed** — get counsel's pass before public
  launch (esp. Privacy + the UGC-license clause in Terms).

## Monetization v2 — campaigns (shipped)
- `advertisers` + `campaigns` tables (cpm_cents, budget_cents, status) — admin-read RLS, secret-key
  writes; `annotations.campaign_id` FK. Migration `20260630011717_ad_campaigns.sql` (3 demo
  advertisers/campaigns seeded with fixed UUIDs the demo placements reference).
- Ad events carry `props.campaignId`; `/admin` Monetization panel has a **per-campaign breakdown**
  (advertiser · impressions · CTR · CPM · modeled spend at its own CPM · budget pacing). Headline =
  summed modeled spend across active campaigns. **Modeled, not booked.**
- Next: let creators/advertisers create campaigns in-app + assign placements; real CPM billing.

## Trust & safety follow-ups (shipped)
- Report a creator from `/u/[handle]` (`ReportCreator`).
- Reports file via `POST /api/report` — inserts as the signed-in user (RLS), reporter derived from
  session (not client-trusted), then fires a best-effort Resend alert to `REPORT_ALERT_TO`
  (default `me@davidpuerto.com`). Note: Resend test mode only delivers to the account-owner email —
  needs a verified domain (or set `REPORT_ALERT_TO` to the Resend account email) to actually land.
- Blocked-accounts manager in the Profile tab (one-tap unblock).

## Monetization — the wedge (native in-world ads)
- **Substrate made real**: tapping a `sponsored`/`product` placement opens an in-world ad card with a
  CTA to the advertiser; tapping a `portal` placement peeks + teleports into another pano. Emits the
  ad event vocab — `ad_impression` (placement rendered in-scene), `ad_peek`, `ad_dwell`, `ad_conversion`.
- Annotation composer gains `sponsored`/`product` kinds + a destination URL (persisted via
  `annotations.target_url` / `target_post_id` — already in the init schema, no migration).
- 3 demo placements seeded in the feed (sponsored on Shinjuku, portal on Aurora→Atacama, product on
  Grand Canyon) so the loop demos immediately.
- `/admin` **Monetization panel**: impressions, CTR, conversions, portal peeks, and a clearly-modeled
  $28-CPM run-rate — the fundraising data room. Revenue is labeled *modeled*, not booked.

## Annotation layer (shipped 2026-07-06)
The concrete build-out of VISION's "annotate" wedge — see VISION.md §"The annotation layer" and
CLAUDE.md protocols 9–10. Migration `20260706180000_annotation_layer.sql` **applied to prod**.
- **Topo drawing** — "draw" rail button in the viewer: click-to-extend spherical polylines with
  live preview, undo/finish, named + saved as `kind='route'` annotations (`path` jsonb).
- **Crowdsourced POIs + sightings** — camps/water/rappel/cairns/etc. (`poi_type`); tapping a marker
  opens the sighting sheet (✓ it's there / ✕ not as described / ∅ gone + field note + sighter GPS =
  native comment + trust signal + triangulation sample). `sightings` table, RLS'd.
- **Safety rail (inviolable)** — `is_safety_critical` (rappel/anchor/crack) and all `source='ai'`
  rows render dashed-amber *unverified* until confirmed sightings exist.
- **Sun layer** — deterministic (`lib/sun.ts`, no deps): "sun" rail button overlays today's arc +
  rise/set times, positioned via capture GPS/heading.
- **Capture geo** — `lib/exif.ts` extracts GPS + heading (EXIF GPS IFD, XMP PoseHeadingDegrees /
  GimbalYawDegree) on upload; persists `capture_lat/lng/heading`; gold geo chip in the chamber.
- **AI vision tagging** — `/api/annotate`: sharp-based equirect→rectilinear reprojection
  (`lib/reproject.ts`, math verified vs synthetic pano), Claude (`claude-opus-4-8`) with JSON-schema
  output, pixel→sphere conversion, rows inserted as the requesting user with `source='ai'`.
  **BYOK**: caller's Anthropic key per request, never stored; `ANTHROPIC_API_KEY` = admin-only
  fallback. "✨ AI annotate" sheet in the viewer menu.
- Telemetry vocab added: `route_draw · sighting · ai_tag_run · sun_path_view · peaks_view`
  (+ `upload_publish` now carries `hasGeo/hasHeading/resized`).

## Overnight pass (2026-07-06, auto mode)
- **Upload hardening** — `lib/downscale.ts` re-encodes >8192px images to viewer-safe JPEG before
  storage (4096 fallback; original on failure; EXIF read first). Compass **heading nudge**
  (N/NE/…/NW) when GPS exists but heading doesn't.
- **EXIF verified on a real camera file** — Ricoh Theta S photosphere from Wikimedia: lat/lng exact,
  heading 67.5° from rational GPSImgDirection. ✅ (PSV yaw *sign* still needs an eyes-on check.)
- **Bearings + triangulation** — `lib/geo.ts`: `worldBearing` now populates `world_bearing` on
  create (viewer + AI route); `intersectBearings` (least-squares, residual-meters confidence)
  ready for cross-pano triangulation. 10/10 unit tests.
- **The Atlas** — new tab: MapLibre over dark Carto tiles, pin per geo-tagged capture,
  click-through to the viewer.
- **OpenBeta wired** — `lib/openbeta.ts` feeds documented climb names/grades near the capture
  point into AI tagging ("match or describe, never invent"). Verified live: 40 climbs @ Squamish
  Apron. Endpoint 502s intermittently → one retry built in.
- **Peak labels** — `/api/peaks` (OSM Overpass `natural=peak` + Open-Meteo elevation, cached);
  "peaks" rail button places `▲ Name · elevation` on the horizon by pure bearing math. Verified:
  34 named peaks near Squamish.
- **/api/annotate rate limit** — 6/user/hour (in-memory; serverless caveat noted inline).
- **/admin annotation-layer panel** — annotations/lines/safety-critical, sightings by verdict,
  AI runs vs proposed vs live, ambient-layer usage.
- **Research note**: onX's public `mp-tools` repo (github.com/onXmaps/mp-tools) is their internal
  Claude Code plugin for Mountain Project dev — anonymous `getPhotosTopos` exposes their
  interactive-topo format (`topoData` overlays + `topoRelations` w/ pitch links). Useful as
  **schema inspiration + dev-time research only** — not licensed for product use; OpenBeta stays
  the product integration.

## Cross-review fixes + GPX candidates (2026-07-06, from shotgundetour's review)
shotgundetour's Fable instance reviewed the tracks slice — 6 findings, all addressed:
1. ✅ **Multi-`<trkseg>` preserved** — segments never bridge pauses; distance/gain exclude gaps.
2. ✅ **`<rtept>` is a true fallback** — never merged with track points.
3. ✅ **Size/point caps + iterative DP** — 25MB / 20k-pt caps, explicit-stack simplifier (60k-pt
   monotonic climb test passes).
4. ⏳ **Yaw sign** — still the standing eyes-on check (one flip point, shared by all layers).
5. ✅ **Heading required for projection** — no more silent `?? 0`; 'route' button hidden without
   compass heading (upload nudge covers acquisition).
6. ✅ **Tracks are owner-only** — decided possessive, not collaborative: migration
   `20260707000000_tracks_owner_only.sql` (**NOT pushed — needs approval**) requires post
   ownership on insert. Smaller notes fixed too: `<trk><name>` preferred over metadata name
   ("Garmin Connect"), failed track insert surfaces an error.
**Plus their spec'd two-source candidates pipeline**: `<wpt>` waypoints (name+sym → poi type) and
timed segment gaps ≥20min ("Rest stop (46 min)" / "Overnight stop (9h)") surface in Upload as
tick-to-confirm candidates — never auto-published — inserted as projected POI annotations when
capture GPS + heading exist. Parser: 13/13 tests. Shared-lib verdict recorded on their side:
parser + future consensus-line lib are the reusable pieces; schemas stay separate.

## Tracks pass (2026-07-06, auto mode)
User-owned GPX overlays — VISION's "build the machine, don't borrow the data" answer to
Peakbagger/Strava. **Migration `20260706210000_tracks.sql` written but NOT pushed — needs
explicit `supabase db push` approval** (code no-ops gracefully until then).
- **lib/gpx.ts** — dependency-free parser (trkpt/rtept, CRLF, self-closing), 3D Douglas-Peucker
  to ≤200 pts with a 32-pt density floor, distance + jitter-filtered gain. 14/14 tests.
- **Upload** — optional "Attach GPX" with a stats chip; track persists with the post.
- **Track-in-pano** — 'route' rail button projects the recorded line into the sphere (bearing −
  heading → yaw; elevation delta / distance → pitch; camera ele ≈ nearest track point; seam-split
  segments). Geometry verified. *The feature nobody else has.*
- **Atlas** — tracks render as holo lines, re-added after basemap swaps.
- Peakbagger verdict (same shelf as mp-tools): scraper CLI vs a Cloudflare-challenged hobby site —
  personal trip research only, never runtime. OSM public GPS traces = the open path to communal
  "multiple successful routes" later.

## Second auto-mode pass (2026-07-06, later)
- **Atlas basemaps** — Void (Carto dark) / **Topo (USGS National Map)** / Terrain (OpenTopoMap)
  switcher, persisted; the free substrate Gaia-class apps license.
- **Avalanche chip** — `/api/avalanche` + `lib/avalanche.ts`: US zones via avalanche.org polygons
  (point-in-polygon, cached) + Canada via avalanche.ca point endpoint; viewer shows a
  danger-colored chip linking to the forecast only for active in-season ratings. Verified live
  7/7 (Snoqualmie → NWAC, Garibaldi → off-season, ATX/ocean → none).
- **MP topo-format study** — `docs/RESEARCH-mp-topo-format.md` from mp-tools' *published docs*
  (deliberately no API calls — their script impersonates the iOS app). Key takeaways: line↔route
  relations with pitch numbers (adopt as `route_ref`+`pitch` when OpenBeta linking lands), sparse
  control points (validates our draw UX), typed gear markers attached to lines.
- Walled-garden verdict recorded: onX Offroad/Backcountry/Gaia/MP have no public APIs; their
  substrate layers (USGS topo, MVUM, PAD-US, avalanche.org) are free — assemble, don't beg.
  PAD-US public-land + USFS MVUM overlays deferred until Atlas usage justifies them.

## Trust & safety (P0)
- **Report** — `⋯` menu in the viewer reports a capture/creator; per-comment `⚑` reports a comment.
  Reason chips → `reports` table (RLS: file as self, admin-read).
- **Block** — `⋯ → Block @handle`. Client-side hide (public-read kept intact): blocked authors are
  filtered out of feed + comment threads via `blocks` and `loadMyBlocks`.
- **Moderate** — `/admin` shows an open-report queue. **Remove** soft-removes a post (`posts.removed_at`,
  hidden from public read by RLS) or deletes a comment/annotation and clears every report on it;
  **Dismiss** closes the report. Actions hit `POST /api/moderation`, gated by `ADMIN_KEY`.
- Telemetry vocab added: `report · block · mod_remove · mod_dismiss`.
- Migration: `supabase/migrations/20260629210529_trust_and_safety.sql` (blocks, reports, posts soft-remove,
  rewritten public-read policy). **Applied to prod.**

## Deploy / ops (via shipmate)
shipmate (`~/Sites/shipmate`, `dapinitial/shipmate`) is the deploy tool.
- Env injected from `.env.local` + `.env.production` (prod overrides); secrets encrypted in DO.
- `~/.claude/skills/deploy/bin/do-provision.sh ~/Sites/panogram update` — redeploy with env changes.
- `~/.claude/skills/deploy/bin/do-app.sh <status|url|logs|redeploy|rollback|destroy> ~/Sites/panogram`.
- `supabase db push` for migrations (link cached the DB password).

## Conventions
Commits human-authored, **no AI attribution**. Secrets only in `.env.local`/`.env.production`/keychain —
never committed. Per-project Supabase account isolation via `.envrc` + keychain.

## Open / next (priority order)
0. **Annotation-layer follow-ups** — ~~EXIF real-file check~~ ✅, ~~rate limit~~ ✅, ~~admin panel~~ ✅,
   ~~heading nudge~~ ✅ (see Overnight pass). Remaining: eyes-on check of PSV yaw sign with a real
   render (one flip point in `lib/reproject.ts` if mirrored — sun/peaks/AI tags all share it);
   founder AI-tagging runbook via Claude Code (CLAUDE.md protocol 10); Atlas: cluster pins at low
   zoom once post count grows; triangulation UI (intersectBearings is ready, needs cross-pano
   feature linking). ATX→Squamish trip (summer 2026) = seed-content + eval-dataset collection,
   protocol in VISION.md.
1. ~~**Trust & safety** — block / report / basic moderation.~~ **Built**; migration applied.
   Follow-ups: rate-limit report spam (report-from-profile, email alert, blocked-manager shipped —
   see "Trust & safety follow-ups").
2. ~~**Wedge & monetization** — AI-native ad layer on the spatial annotations; `/admin` data room.~~
   **Built** (see above). Follow-ups: real advertiser/campaign objects (vs. denormalized labels);
   AI-native targeting/placement; charge a CPM; per-campaign breakdown in `/admin`.
3. **Real content** — the artist's own panos (current demo images are **unlicensed placeholders** —
   clear licensing before public); smooth upload→share.
4. Optional — seed demo activity for `/admin`; de-beta shipmate's Vercel path; 360-video (Phase 3);
   Resend SMTP + verified domain for email volume.

## Known caveats
- Demo feed panos are CC/demo images (license before public). Real content = uploads.
- Auth email uses Supabase built-in (rate-limited); switch to Resend SMTP + verified domain for volume.
- `/admin` data is sparse until real usage accrues.
