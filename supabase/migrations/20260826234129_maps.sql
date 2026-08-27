-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Panogram — maps (member-owned plotted routes; Atlas "Plot" persistence)    ║
-- ║                                                                            ║
-- ║ A map is what a member saves out of the Atlas Plot tool: a simplified      ║
-- ║ route outline plus curated markers (camp/water/POI). Slice 3 of the Atlas  ║
-- ║ (docs/ATLAS.md) — it turns Plot from a throwaway local draft into saved,   ║
-- ║ member-isolated work that lists in their dashboard.                        ║
-- ║                                                                            ║
-- ║ route/markers ride as JSONB (same posture as tracks.points): route is      ║
-- ║ [[{lat,lng,ele|null},…],…] segments; markers is [{lat,lng,label,poiType}]. ║
-- ║                                                                            ║
-- ║ Public-read (social model — a shared map link opens for anyone), but       ║
-- ║ writes are gated to the owner: only auth.uid() can create/edit/delete      ║
-- ║ their own maps. Isolation is the owner_id + these policies.                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

create table if not exists public.maps (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  title       text not null default 'Untitled map',
  route       jsonb not null default '[]',   -- [[{lat,lng,ele},…],…] simplified segments
  markers     jsonb not null default '[]',   -- [{lat,lng,label,poiType},…] curated
  distance_m  double precision not null default 0,
  gain_m      double precision not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.maps is
  'Member-owned plotted routes from the Atlas Plot tool (route + curated markers as JSONB). Public-read; writes gated to owner_id = auth.uid().';

create index if not exists maps_owner_idx on public.maps (owner_id, created_at desc);

alter table public.maps enable row level security;

-- Public read: a shared map opens for anyone (social model).
create policy "maps public read" on public.maps
  for select using (true);

-- Owner-only writes — isolation to the member who made the map.
create policy "maps owner insert" on public.maps
  for insert with check (owner_id = auth.uid());
create policy "maps owner update" on public.maps
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "maps owner delete" on public.maps
  for delete using (owner_id = auth.uid());
