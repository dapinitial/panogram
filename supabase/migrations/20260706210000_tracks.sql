-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Panogram — GPX tracks (VISION: user-owned route overlays)                  ║
-- ║                                                                            ║
-- ║ A track is the recorded line someone actually traveled, attached to a      ║
-- ║ capture: rendered on the Atlas as a map line and — the differentiator —    ║
-- ║ projected INTO the 360 pano by bearing math ("the line we took, drawn on   ║
-- ║ the mountain"). Product rule: only user-owned/crew tracks — never data     ║
-- ║ borrowed from walled gardens (docs/RESEARCH-mp-topo-format.md).            ║
-- ║                                                                            ║
-- ║ points is a simplified polyline [[lat,lng,ele|null], …] (≤200 vertices,    ║
-- ║ Douglas-Peucker'd client-side — lib/gpx.ts); stats are computed from the   ║
-- ║ raw file before simplification.                                            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

create table tracks (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references posts (id) on delete cascade,
  author_id    uuid not null references profiles (id) on delete cascade,
  label        text not null default '' check (char_length(label) <= 120),
  source       text not null default 'gpx',          -- recorder provenance ('gpx' for now)
  points       jsonb not null,                        -- [[lat,lng,ele|null], …]
  distance_m   double precision not null default 0,
  gain_m       double precision not null default 0,
  created_at   timestamptz not null default now()
);
create index tracks_post_idx on tracks (post_id);

-- ── RLS ── public-read social model, writes as self ─────────────────────────
alter table tracks enable row level security;
create policy "tracks are public"    on tracks for select using (true);
create policy "add track as self"    on tracks for insert with check (auth.uid() = author_id);
create policy "delete own track"     on tracks for delete using (auth.uid() = author_id);
create policy "admins delete tracks" on tracks for delete using (is_admin());

-- Telemetry vocabulary additions (no schema change — documented for the dashboard):
--   Tracks: track_view (+ upload_publish props.hasTrack)
