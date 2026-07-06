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
- Telemetry vocab added: `route_draw · sighting · ai_tag_run · sun_path_view` (+ `upload_publish`
  now carries `hasGeo/hasHeading`).

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
0. **Annotation-layer follow-ups** — verify PSV yaw sign + EXIF extraction against a *real* Osmo 360
   file (each has one documented flip point if mirrored); rate-limit `/api/annotate`; surface
   `ai_tag_run` + sightings in `/admin`; sun arc assumes north-facing center when heading is missing
   (add a manual heading nudge in Upload); founder AI-tagging runbook via Claude Code (CLAUDE.md
   protocol 10); ATX→Squamish trip (summer 2026) = seed-content + eval-dataset collection, protocol
   in VISION.md.
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
