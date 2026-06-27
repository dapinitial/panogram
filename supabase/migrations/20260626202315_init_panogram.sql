-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Panogram — Phase 1 schema (see VISION.md)                                  ║
-- ║                                                                            ║
-- ║ Security model: PUBLIC-READ social feed. Anyone may read the social        ║
-- ║ surface; writes are gated to the authenticated owner via auth.uid().       ║
-- ║ Telemetry (`events`) is server-write-only and never world-readable.        ║
-- ║                                                                            ║
-- ║ The spatial layer (annotations + finds) is the substrate for BOTH the      ║
-- ║ geocaching loop and native sponsored teleports — one schema, every wedge.  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── Media taxonomy (the 5 formats decided in product) ───────────────────────
create type media_type as enum (
  'panoramic_photo',  -- accessible default (phone panos, stitched landscapes)
  '360_photo',        -- fully spherical, VR-ready
  '360_video',        -- fully spherical video  (Phase 3 — heavy transcode/CDN)
  '180_photo',        -- VR180
  '180_video'         -- VR180 video            (Phase 3)
);

-- ── Annotation kinds (the spatial layer + ad substrate) ─────────────────────
create type annotation_kind as enum (
  'note',       -- a plain spatial note anchored in the scene
  'link',       -- tap-out to a URL
  'product',    -- immersive commerce: tap the sofa → buy
  'cache',      -- geocaching: something hidden to be found
  'sponsored',  -- an in-world brand placement (the White Claw in the dancer's hand)
  'portal'      -- native sponsored teleport: tap → step into another pano
);

-- ── profiles ── one row per auth user ───────────────────────────────────────
create table profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  handle       text unique not null check (handle ~ '^[a-z0-9_.]{2,30}$'),
  display_name text not null default '',
  bio          text not null default '',
  avatar_grad  text,                         -- brand gradient string, mirrors the prototype
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);

-- ── posts ───────────────────────────────────────────────────────────────────
create table posts (
  id           uuid primary key default gen_random_uuid(),
  author_id    uuid not null references profiles (id) on delete cascade,
  type         media_type not null,
  title        text not null check (char_length(title) between 1 and 140),
  location     text not null default '',
  description  text not null default '',
  storage_path text,                         -- Supabase Storage object key for the media
  aspect       text not null default '2/1',  -- '3/1' pano, '2/1' 360, '16/9' video

  -- capture geo: lets a tapped sphere point resolve to a real-world BEARING from
  -- the capture spot. Distance (→ exact coordinate) needs depth/triangulation; see VISION.md.
  capture_lat     double precision,
  capture_lng     double precision,
  capture_heading double precision,          -- compass degrees the pano's 0-yaw faces

  is_sponsored boolean not null default false,
  sponsor_name text,                          -- denormalized for the prototype; real campaigns later
  created_at   timestamptz not null default now()
);
create index posts_author_created_idx on posts (author_id, created_at desc);
create index posts_type_idx           on posts (type);
create index posts_sponsored_idx      on posts (is_sponsored) where is_sponsored;

-- ── annotations ── touch-tag a region of the sphere ─────────────────────────
create table annotations (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references posts (id) on delete cascade,
  author_id     uuid not null references profiles (id) on delete cascade,
  yaw           double precision not null,    -- sphere longitude (radians) — PSV marker position
  pitch         double precision not null,    -- sphere latitude  (radians)
  kind          annotation_kind not null default 'note',
  label         text not null default '',
  body          text not null default '',
  target_url    text,                          -- for 'link' / 'product' / 'sponsored'
  target_post_id uuid references posts (id) on delete set null,  -- for 'portal' teleport ads

  -- resolved real-world geo (optional; bearing is cheap, lat/lng needs distance)
  world_bearing double precision,
  world_lat     double precision,
  world_lng     double precision,
  created_at    timestamptz not null default now()
);
create index annotations_post_idx on annotations (post_id);
create index annotations_kind_idx on annotations (kind);

-- ── finds ── the geocaching completion loop ─────────────────────────────────
create table finds (
  id            uuid primary key default gen_random_uuid(),
  annotation_id uuid not null references annotations (id) on delete cascade,
  user_id       uuid not null references profiles (id) on delete cascade,
  found_at      timestamptz not null default now(),
  found_lat     double precision,
  found_lng     double precision,
  unique (annotation_id, user_id)
);
create index finds_user_idx on finds (user_id, found_at desc);

-- ── social graph + engagement ───────────────────────────────────────────────
create table follows (
  follower_id  uuid not null references profiles (id) on delete cascade,
  following_id uuid not null references profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create table likes (
  post_id    uuid not null references posts (id) on delete cascade,
  user_id    uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table saves (
  post_id    uuid not null references posts (id) on delete cascade,
  user_id    uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references posts (id) on delete cascade,
  user_id    uuid not null references profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index comments_post_idx on comments (post_id, created_at);

-- ── telemetry ── the engagement / CTR / conversion firehose ─────────────────
-- Insert-only, written server-side with the secret key. No public SELECT — raw
-- event data never leaves the server. Product analytics live in PostHog; this is
-- the durable, queryable source of truth behind the admin dashboard.
--
-- Event vocabulary (`name`):
--   Discovery/engagement: view · card_click · viewer_open · explore_drag
--   Spatial:              annotation_view · annotation_tap · annotation_create · annotation_action
--   Geocache:             cache_hide · cache_find
--   Social:               like · unlike · save · comment · follow · share · signup
--   Ads (substrate only): ad_impression · ad_peek (portal teleport) · ad_dwell · ad_conversion
create table events (
  id            bigint generated always as identity primary key,
  name          text not null,
  user_id       uuid references profiles (id) on delete set null,    -- null = logged-out
  session_id    text,                          -- anonymous session correlation
  post_id       uuid references posts (id) on delete set null,
  annotation_id uuid references annotations (id) on delete set null, -- spatial/ad attribution
  props         jsonb not null default '{}',   -- dwell_ms, source tab, region class, campaign, …
  created_at    timestamptz not null default now()
);
create index events_name_created_idx on events (name, created_at desc);
create index events_post_idx          on events (post_id);
create index events_user_idx          on events (user_id, created_at desc);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Admin helper                                                               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- SECURITY DEFINER so the policy check on `events` doesn't recurse into RLS on
-- `profiles`. Used by admin-only read policies and the admin dashboard.
create or replace function is_admin() returns boolean
  language sql security definer stable set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Row Level Security                                                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
alter table profiles    enable row level security;
alter table posts       enable row level security;
alter table annotations enable row level security;
alter table finds       enable row level security;
alter table follows     enable row level security;
alter table likes       enable row level security;
alter table saves       enable row level security;
alter table comments    enable row level security;
alter table events      enable row level security;

-- Public read across the social surface.
create policy "profiles are public"    on profiles    for select using (true);
create policy "posts are public"       on posts       for select using (true);
create policy "annotations are public" on annotations for select using (true);
create policy "finds are public"       on finds       for select using (true);
create policy "follows are public"     on follows     for select using (true);
create policy "likes are public"       on likes       for select using (true);
create policy "saves are private"      on saves       for select using (auth.uid() = user_id);
create policy "comments are public"    on comments    for select using (true);

-- Writes: you may only act as yourself.
create policy "insert own profile" on profiles for insert with check (auth.uid() = id);
create policy "update own profile" on profiles for update using (auth.uid() = id);

create policy "insert own post" on posts for insert with check (auth.uid() = author_id);
create policy "update own post" on posts for update using (auth.uid() = author_id);
create policy "delete own post" on posts for delete using (auth.uid() = author_id);

-- Annotations: COMMUNITY-CAPABLE — any authed user may annotate any post, as
-- themselves (powers the crowdsourced spatial-map moat). To gate to owner-only at
-- launch, AND the check with:
--   and author_id = (select author_id from posts where id = post_id)
create policy "annotate as self"     on annotations for insert with check (auth.uid() = author_id);
create policy "delete own annotation" on annotations for delete using (auth.uid() = author_id);

create policy "find as self"   on finds for insert with check (auth.uid() = user_id);

create policy "follow as self"   on follows for insert with check (auth.uid() = follower_id);
create policy "unfollow as self" on follows for delete using (auth.uid() = follower_id);

create policy "like as self"   on likes for insert with check (auth.uid() = user_id);
create policy "unlike as self" on likes for delete using (auth.uid() = user_id);

create policy "save as self"   on saves for insert with check (auth.uid() = user_id);
create policy "unsave as self" on saves for delete using (auth.uid() = user_id);

create policy "comment as self"    on comments for insert with check (auth.uid() = user_id);
create policy "delete own comment" on comments for delete using (auth.uid() = user_id);

-- events: written only by the secret-key server client (bypasses RLS). Admins may
-- READ for the dashboard; no one else can select. RLS on + admin-only select.
create policy "admins read events" on events for select using (is_admin());
