# Panogram

**Stand inside the world instead of scrolling past it.** A spatial-native social platform for
immersive media — panoramic, 360°, and 180° photos and video you can step into, explore, and annotate.

- **Product thesis, metrics & roadmap:** [docs/VISION.md](docs/VISION.md)
- **Engineering protocols (read before contributing):** [CLAUDE.md](CLAUDE.md)

## Stack

Next.js 16 (App Router, TypeScript) · Supabase (Postgres / Auth / Storage / RLS) ·
Photo Sphere Viewer (real equirectangular rendering) · Resend (email) · PostHog (analytics).
Styling is a hand-written "spatial OS" CSS system — no Tailwind.

## Quickstart

```bash
# 1. install
npm install

# 2. secrets — copy the template, then fill in your keys (never commit .env.local)
cp .env.example .env.local
#    NEXT_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY  → Supabase → Project Settings → API
#    SUPABASE_SECRET_KEY                          → same page (server-only)
#    RESEND_API_KEY                               → resend.com

# 3. enable the secret-scanning pre-commit hook
git config core.hooksPath .githooks

# 4. database (requires the supabase CLI + this folder's .envrc account token)
supabase link --project-ref <your-ref>
supabase db push

# 5. run
npm run dev          # → http://localhost:3000
```

Magic-link auth needs your local URL allowlisted: **Supabase → Authentication → URL Configuration** →
Site URL `http://localhost:3000`, redirect `http://localhost:3000/**`.

## What works today

Spatial feed · real drag-to-explore 360 viewer · magic-link sign-in · upload → Supabase Storage →
persistent posts · live telemetry → admin data room at `/admin`.

## Layout

```
src/app/         routes (shell, /admin, auth callback, api)
src/components/   Nav, Feed, PostCard, Immersive + PanoViewer, Upload, AuthSheet
src/lib/          supabase clients, email, telemetry, types
supabase/         migrations = the DB source of truth (schema + RLS)
docs/VISION.md    the product thesis
CLAUDE.md         engineering protocols
```
