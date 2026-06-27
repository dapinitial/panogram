# CLAUDE.md — Panogram operating protocols

Spatial social platform for immersive media (panoramic / 360° / 180°). The *why* —
wedge, metric tree, monetization, roadmap — lives in **[docs/VISION.md](docs/VISION.md)**.
This file is the **how**: the rules any agent or contributor must follow. Read it before
editing.

> **Next.js 16, not the one you know.** Breaking changes vs. older training data: `cookies()`
> is async, `middleware`→`proxy`, App Router specifics. When unsure, check
> `node_modules/next/dist/` or the Next 16 docs — don't assume older APIs.

## Commands
- `npm run dev` — local dev (http://localhost:3000)
- `npm run build` — production build + typecheck (run before committing non-trivial changes)
- `npm run lint` — eslint
- `supabase db push` — apply new migrations to the live DB (deploys to production — get explicit OK)

## Protocols (these are hard rules)

**1. Secrets never leave the machine.**
- Real secrets live only in `.env.local` (gitignored) and the macOS keychain. Only `.env.example`
  (placeholders) is committed.
- Never paste a key into code, a doc, or any committed file. Never echo secret *values* to output —
  mask them. The pre-commit hook scans for tokens; do not bypass it to commit a secret.

**2. Supabase account isolation is sacred.**
- `.envrc` (direnv) exports `SUPABASE_ACCESS_TOKEN` from the keychain (`panogram-supabase`), locking
  every `supabase` command in this folder to the **panogram** account. Never defeat this, never run a
  remote `supabase` command with a different token, never hardcode another project's ref.
- This machine also hosts `~/Sites/sedulous` and `~/Sites/shotgundetour` on **different** Supabase
  accounts. Writing to the wrong DB is the worst mistake you can make here. If the keychain entry is
  missing the token is empty and commands fail safely — that is by design; do not "fix" it by logging
  in globally.

**3. Four Supabase clients — use the right one.**
| Client | File | Key | Use |
|---|---|---|---|
| `getSupabase()` | `lib/supabase.ts` | publishable | anon reads, RLS-gated |
| `getSupabaseAdmin()` | `lib/supabase.ts` | **secret** | server-only writes that bypass RLS (telemetry). **NEVER import into a Client Component.** |
| `supabaseServer()` | `lib/supabase-server.ts` | publishable | SSR/route reads as the signed-in user (cookies) |
| `browserSupabase()` | `lib/supabase-browser.ts` | publishable | client session: auth, authed reads/writes |
- `SUPABASE_SECRET_KEY` has **no** `NEXT_PUBLIC_` prefix on purpose — it must never enter the browser
  bundle. `lib/email.ts` is `import "server-only"` for the same reason. Browser vars use `NEXT_PUBLIC_`.

**4. RLS is the security boundary, not the app.**
- Every new table ships with `enable row level security` + explicit policies **in the same migration**.
  Public-read social model; writes gated to `auth.uid()`. The `events` table is server-write-only
  (no public policies; admin-read via `is_admin()`).
- Migrations: `supabase migration new <name>` → write SQL → `supabase db push`. **Never edit an
  already-applied migration** — add a new one. `db push` is a production deploy: get explicit approval.

**5. Storage writes are authenticated-only.**
- The `panoramas` bucket is public-read, **authenticated-write**. Don't loosen the upload policy back
  to anon.

**6. Styling = the hand-written spatial system. No Tailwind, no UI kit.**
- All styles live in `src/app/globals.css` (CSS variables + a "spatial OS" design language: void
  background, glass depth, HUD motifs, brand gradient, Space Grotesk + Inter). Match the existing
  tokens and class conventions. Do not introduce Tailwind or a component library.

**7. The 360 viewer is client-only.**
- Photo Sphere Viewer / three.js touch `window`/WebGL — they must load via `dynamic(..., { ssr:false })`
  (see `components/PanoViewer.tsx`). Never import them so they run during SSR.

**8. Telemetry is the product's nervous system.**
- User actions call `track(eventName, …)` (`lib/telemetry.ts`) → `/api/events` → `events` table →
  `/admin` dashboard. New meaningful interactions should emit an event; keep the name vocabulary in
  sync with the init migration's comment block.

## Review checklist (before commit / PR)
- [ ] New table → RLS enabled + policies in the migration?
- [ ] No `getSupabaseAdmin` / `SUPABASE_SECRET_KEY` / `lib/email` import in a `"use client"` file?
- [ ] No secret value in any committed file (hook should pass without `--no-verify`)?
- [ ] `npm run build` green?
- [ ] New user action emits a `track()` event where it matters?

## Map
- `src/app/` — routes: `page.tsx` (shell), `admin/` (data room), `auth/callback/`, `api/{events,test-email}/`
- `src/components/` — `Nav`, `Feed`, `PostCard`, `Immersive`+`PanoViewer*`, `Upload`, `AuthSheet`
- `src/lib/` — supabase clients, `email.ts`, `telemetry.ts`, `types.ts`, `mock.ts`
- `src/proxy.ts` — session refresh (Next 16 "proxy", formerly middleware)
- `supabase/migrations/` — schema + RLS (source of truth for the DB)
- `docs/VISION.md` — product thesis · `.githooks/` — secret-scan pre-commit

## Setup (new clone)
`cp .env.example .env.local` → fill keys → `git config core.hooksPath .githooks` →
`supabase link --project-ref <ref>` → `supabase db push` → `npm run dev`.
