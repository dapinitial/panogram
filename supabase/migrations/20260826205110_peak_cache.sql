-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Panogram — peak_cache (durable cache for the horizon-peaks layer)          ║
-- ║                                                                            ║
-- ║ The peaks layer names OSM summits around a capture point (VISION           ║
-- ║ deterministic layer). It queried Overpass live on every view — a free,     ║
-- ║ frequently-overloaded service — so peaks silently failed whenever Overpass ║
-- ║ was busy. This table caches a bucket's resolved peaks so Overpass has to    ║
-- ║ succeed only ONCE per ~1km bucket, ever; after that the layer is instant    ║
-- ║ and never depends on a live external call.                                 ║
-- ║                                                                            ║
-- ║ Public-read (peaks are public OSM/ODbL data). Server-write only — the      ║
-- ║ /api/peaks route upserts via the secret-key admin client; there are NO     ║
-- ║ write policies, so the anon key can never poison the cache.                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

create table if not exists public.peak_cache (
  bucket      text primary key,                       -- "lat.toFixed(2),lng.toFixed(2)" — ~1km
  capture_ele double precision not null default 0,    -- ground elevation at the bucket (open-meteo)
  peaks       jsonb not null,                         -- [{name, ele, lat, lng}, …] — OSM natural=peak
  updated_at  timestamptz not null default now()
);

comment on table public.peak_cache is
  'Server-cached OSM peak lookups (ODbL) for the horizon-peaks layer, so it does not depend on live Overpass at request time. Public-read; server-write only (via the secret-key admin client).';

alter table public.peak_cache enable row level security;

-- Public read: peak data is public OSM. (Reads go through the server today, but
-- a public policy keeps it safe to read with the anon key if that ever changes.)
create policy "peak_cache public read" on public.peak_cache
  for select using (true);

-- No insert/update/delete policies on purpose: writes happen only through the
-- secret-key admin client, which bypasses RLS. The anon key cannot write.
