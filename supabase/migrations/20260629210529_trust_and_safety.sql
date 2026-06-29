-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Panogram — Trust & Safety (P0 before real users)                           ║
-- ║                                                                            ║
-- ║ Three primitives on the existing public-read social model:                 ║
-- ║   • blocks   — a user mutes another user (content hidden client-side; the   ║
-- ║               row is the source of truth the app filters on).              ║
-- ║   • reports  — anyone authed flags a post/comment/annotation/profile for    ║
-- ║               moderation. Admin-readable; admin-resolvable.                ║
-- ║   • removal  — posts gain a soft-remove (removed_at). Removed posts vanish   ║
-- ║               from public read; the row survives for the report trail and   ║
-- ║               eventual storage cleanup. Author still sees their own.        ║
-- ║                                                                            ║
-- ║ Block enforcement is deliberately CLIENT-SIDE (see CLAUDE.md / STATUS):     ║
-- ║ public-read stays intact; the app filters blocked authors out of the feed   ║
-- ║ and threads. Reports + admin removal are the hard safety net.              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── blocks ── one row per (blocker → blocked) direction ─────────────────────
create table blocks (
  blocker_id uuid not null references profiles (id) on delete cascade,
  blocked_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on blocks (blocked_id);

-- ── report taxonomy ─────────────────────────────────────────────────────────
create type report_reason as enum (
  'spam',           -- spam / scams / misleading
  'harassment',     -- bullying, targeted abuse
  'hate',           -- hateful / discriminatory
  'nudity',         -- sexual / explicit
  'violence',       -- violent or graphic
  'illegal',        -- illegal goods / activity
  'other'           -- catch-all (use details)
);
create type report_status as enum ('open', 'reviewing', 'actioned', 'dismissed');
create type report_target as enum ('post', 'comment', 'annotation', 'profile');

-- ── reports ── moderation queue ─────────────────────────────────────────────
create table reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid references profiles (id) on delete set null,  -- null = reporter deleted
  target_type  report_target not null,
  target_id    uuid not null,                                     -- post/comment/annotation/profile id
  post_id      uuid references posts (id) on delete cascade,      -- moderation context (where it lives)
  reason       report_reason not null,
  details      text not null default '' check (char_length(details) <= 1000),
  status       report_status not null default 'open',
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references profiles (id) on delete set null
);
create index reports_status_idx on reports (status, created_at desc);
create index reports_target_idx on reports (target_type, target_id);

-- ── posts: soft-remove for moderation ───────────────────────────────────────
alter table posts add column removed_at     timestamptz;
alter table posts add column removed_reason text;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Row Level Security                                                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
alter table blocks  enable row level security;
alter table reports enable row level security;

-- blocks: only the blocker ever sees or mutates their own block rows.
create policy "see own blocks"  on blocks for select using (auth.uid() = blocker_id);
create policy "block as self"   on blocks for insert with check (auth.uid() = blocker_id);
create policy "unblock as self" on blocks for delete using (auth.uid() = blocker_id);

-- reports: an authed user files as themselves and may read their own; admins
-- read every report and resolve them.
create policy "file report as self" on reports for insert with check (auth.uid() = reporter_id);
create policy "read own reports"    on reports for select using (auth.uid() = reporter_id or is_admin());
create policy "admins resolve"      on reports for update using (is_admin());

-- posts: removed posts disappear from public read (author + admins still see
-- them, so the author knows it's gone and the data room can review). Replaces
-- the open "posts are public" read policy from the init migration.
drop policy "posts are public" on posts;
create policy "posts are public" on posts for select
  using (removed_at is null or auth.uid() = author_id or is_admin());

-- posts: admins may moderate any post (set removed_at). Authors keep their own
-- update policy from the init migration; this is additive (RLS is permissive).
create policy "admins moderate posts" on posts for update using (is_admin());

-- comments / annotations: admins may delete reported content outright (these are
-- cheap and regenerable; posts are soft-removed instead to preserve the trail).
create policy "admins delete comments"    on comments    for delete using (is_admin());
create policy "admins delete annotations" on annotations for delete using (is_admin());

-- Telemetry vocabulary additions (no schema change — documented for the dashboard):
--   Safety: report · block · unblock · mod_remove · mod_dismiss
