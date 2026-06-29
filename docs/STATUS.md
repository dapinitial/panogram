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
  rewritten public-read policy). **Not yet pushed to prod** — pending `supabase db push`.

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
1. ~~**Trust & safety** — block / report / basic moderation.~~ **Built** (see above); pending prod
   `db push`. Follow-ups: report a creator from `/u/[handle]`, email alert on new reports, rate-limit
   report spam, "blocked users" management screen.
2. **Wedge & monetization** — AI-native ad layer on the spatial annotations; mature `/admin` as the
   fundraising data room.
3. **Real content** — the artist's own panos (current demo images are **unlicensed placeholders** —
   clear licensing before public); smooth upload→share.
4. Optional — seed demo activity for `/admin`; de-beta shipmate's Vercel path; 360-video (Phase 3);
   Resend SMTP + verified domain for email volume.

## Known caveats
- Demo feed panos are CC/demo images (license before public). Real content = uploads.
- Auth email uses Supabase built-in (rate-limited); switch to Resend SMTP + verified domain for volume.
- `/admin` data is sparse until real usage accrues.
