# Panogram — deployment & ownership handoff

How to stand up this app on a **fresh Supabase + DigitalOcean** account owned and
billed by the client, and what changes hands. Everything the app needs is in this
repo — the `supabase/migrations/` are the source of truth for the schema/RLS, and
the seeds create the demo content.

> **Ownership model.** The goal of a handoff is that the **client owns the
> accounts** (Supabase, DigitalOcean, Mapbox, the domain) — billed to them, in
> their name. Unakin, LLC keeps whatever **collaborator/deploy access** the
> services agreement specifies (to build and maintain), not ownership. Nothing
> below runs on Unakin's accounts.

---

## 0. Prerequisites (the client creates/owns these)

| Account | For | Notes |
|---|---|---|
| **GitHub** | the code | fork/transfer this repo, or grant the maintainer access |
| **Supabase** | DB · Auth · Storage | one project; free tier is fine to start |
| **DigitalOcean** | hosting (App Platform) | ~$5–12/mo |
| **Mapbox** | 3D map tiles | free to 50k loads/mo |
| **Resend** (optional) | magic-link + alert email | only if using email features |
| **Domain/DNS** | the public URL | e.g. via their registrar |

---

## 1. Supabase — schema, RLS, seeds

1. Create a new Supabase project (note the region). Copy from **Settings → API**:
   - Project URL `https://<ref>.supabase.co`
   - **Publishable** key (`sb_publishable_…`) — browser-safe
   - **Secret** key (`sb_secret_…`) — server-only, never commit
2. From a clone of this repo:
   ```bash
   supabase link --project-ref <ref>     # authenticates to the client's Supabase
   supabase db push                       # applies ALL migrations → full schema + RLS + seeds
   ```
   This creates every table (`profiles`, `posts`, `maps`, `trips`, `trip_editor_invites`, …),
   all RLS policies, the helper functions (`is_admin`, `can_manage_trips`,
   `grant_trip_editor`, `invite_trip_editor`, `claim_trip_editor_invites`), and
   **seeds the Pico de Orizaba demo trip**.
3. **Storage:** the `panoramas` bucket is created by a migration (public-read,
   authenticated-write). No manual step.

> `supabase db push` is a production write — treat it as a deploy.

---

## 2. Mapbox token (3D map + embeds)

1. In the client's Mapbox account, create a **public token** (`pk.…`).
2. **Restrict it** (Token → URL restrictions) to the origins that will *render the
   map* — which is the **app's own origin** (the map runs inside the `/embed`
   iframe, so the iframe's origin is what matters, **not** the site that embeds it):
   - `https://<the deployed app origin>`
   - `http://localhost:3000` (for local dev)
   - Mapbox does **not** accept wildcards; list exact hosts.

---

## 3. Environment variables

Copy `.env.example` → `.env.local` for local dev; set the same on the host for prod.

| Var | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | build + run | browser-safe |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | build + run | browser-safe, RLS-protected |
| `SUPABASE_SECRET_KEY` | **server only** | never in the browser bundle / commits |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | **build** + run | inlined at build — see gotcha below |
| `NEXT_PUBLIC_SITE_URL` | build + run | the deployed origin |
| `RESEND_API_KEY`, `RESEND_FROM`, `REPORT_ALERT_TO` | server | only for email features |
| `ANTHROPIC_API_KEY` | server | admin-only fallback for AI tagging (optional) |
| `ADMIN_KEY` | server | optional gate for `/admin` |

> **Gotcha — `NEXT_PUBLIC_*` inline at BUILD time.** They're baked into the bundle
> when the app builds, not read at runtime. If you set `NEXT_PUBLIC_MAPBOX_TOKEN`
> *after* a build, the map shows "needs a key" until you **rebuild**. On DO, mark
> these as available at **build time**.

---

## 4. DigitalOcean App Platform

1. **Create App → GitHub →** pick this repo + branch `main`.
2. It auto-detects Next.js. Build: `npm run build`, Run: `npm start`.
3. Add all env vars from §3. For each `NEXT_PUBLIC_*`, set scope to
   **build & run** (RUN_AND_BUILD_TIME) so it's inlined.
4. Enable **Deploy on push** (default) — commits to `main` auto-deploy.
5. Deploy. Watch it reach **ACTIVE**.
6. Point the client's domain at the app (DO → Settings → Domains) and set
   `NEXT_PUBLIC_SITE_URL` to that domain (then redeploy so it's inlined).

---

## 5. Verify

- `GET /` → 200, feed renders.
- `/` → Atlas tab → 3D → the satellite globe + terrain render (Mapbox token OK).
- `/embed/pico-de-orizaba` → 200, autoplay fly-by (this is what gets iframed).
- `/studio` (signed out) → magic-link login screen.

---

## 6. First trip editor (one-time)

On a fresh DB no one is an editor yet (the demo migration's grant targets
Unakin's email, which won't exist on the client's DB). After the client's owner
**signs in once** (so their `profiles` row exists), grant them from the Supabase
SQL editor:

```sql
-- make the owner a trip editor (manage /studio); use their sign-in email
update public.profiles p set can_manage_trips = true
from auth.users u
where u.id = p.id and lower(u.email) = lower('owner@theirdomain.com');

-- (optional) full admin for the /admin data room:
-- update public.profiles p set is_admin = true
-- from auth.users u where u.id = p.id and lower(u.email) = lower('owner@theirdomain.com');
```

After that, **every other editor can be added from the CMS** — `/studio` →
editors panel → invite by email (auto-claims on their first magic-link login). No
more SQL needed.

---

## 7. Moving existing content (optional)

The seeds include the Pico demo, so a fresh install isn't empty. To move trips
created on the prototype DB:

- **Simplest:** re-upload the GPX/GeoJSON through `/studio` on the new instance.
- **Bulk:** `pg_dump` the `public.trips` (and `public.maps` if wanted) rows from
  the old project and `psql`-restore into the new one. Coordinate a maintenance
  window; don't run it against the wrong database.

---

## 8. What changes hands

- **Client owns:** their **accounts and data** — the Supabase project, the DO app,
  the Mapbox token, the domain — all billed to them, credentials in their name. The
  app runs entirely on the client's infrastructure, independent of Unakin.
- **Unakin retains:** ownership of **all source code and IP** — the delivered app,
  the fly-tour engine, and the CMS scaffolding. The client receives a **perpetual,
  non-exclusive license to use** the deployed application for their business; IP does
  **not** assign to the client. Unakin deploys and maintains it under the
  Managed-Services Agreement.
- **Offboarding:** the client keeps running the last delivered build on their own
  accounts (per the license + continuity terms); Unakin's collaborator/deploy access
  is removed. A source buyout, if ever wanted, is a separate priced agreement.

---

## Guardrails carried from CLAUDE.md

- Secrets live only in `.env.local` / the host's env — never committed.
- Every table ships RLS + policies in its migration; never edit an applied
  migration (add a new one).
- Keep the two Supabase accounts straight — never point a `supabase` command at
  the wrong project. On the client's machine/CI, only their token should be active.
