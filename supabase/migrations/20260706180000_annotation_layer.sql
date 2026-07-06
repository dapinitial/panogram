-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Panogram — Annotation layer substrate (VISION.md "The annotation layer")   ║
-- ║                                                                            ║
-- ║ Three extensions to the existing spatial schema:                           ║
-- ║   • kinds+source — routes (drawn topo lines), placeable POIs, nature and   ║
-- ║     cultural tags; every annotation records whether a human or the AI       ║
-- ║     pipeline authored it. AI-traced and human-drawn lines share ONE schema  ║
-- ║     — a climber correcting an AI line is both a better topo and a labeled   ║
-- ║     training sample.                                                        ║
-- ║   • path — a spherical polyline ([[yaw,pitch],…] radians) rendered by the   ║
-- ║     PSV markers plugin. Null = point marker (every existing row).           ║
-- ║   • sightings — the crowdsource loop. A sighting is three things at once:   ║
-- ║     the platform's native comment, a reputation signal, and a triangulation ║
-- ║     sample (sighter's own GPS). Confirmations are what upgrade safety-      ║
-- ║     critical markers out of the "unverified" display style.                 ║
-- ║                                                                            ║
-- ║ SAFETY RAIL (inviolable, VISION §6): rows where is_safety_critical is true  ║
-- ║ (rappel/anchor/crack) must NEVER render as authoritative — the client shows ║
-- ║ them dashed/unverified until confirmed sightings exist, and framing is      ║
-- ║ observational ("crack system"), never an endorsement ("attempt this").     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── annotation kinds: the drawn + placeable vocabulary ──────────────────────
alter type annotation_kind add value if not exists 'route';    -- drawn topo line (path holds the polyline)
alter type annotation_kind add value if not exists 'poi';      -- placeable point of interest (poi_type says what)
alter type annotation_kind add value if not exists 'nature';   -- flora/fauna tag (+ traditional uses in body)
alter type annotation_kind add value if not exists 'cultural'; -- attributed cultural pointer — name the nation, link tribal sources

create type annotation_source as enum (
  'human',  -- placed or drawn in the viewer
  'ai'      -- proposed by the vision pipeline (/api/annotate) — always reviewable, never authoritative
);

alter table annotations add column source annotation_source not null default 'human';
alter table annotations add column path jsonb;  -- spherical polyline [[yaw,pitch],…] (radians); null = point marker

-- The backcountry's living map: what a placeable POI is. Text + check (not an
-- enum) so the vocabulary can grow by migration without type surgery.
alter table annotations add column poi_type text check (poi_type in (
  'camp', 'bivy', 'water', 'trailhead', 'cairn', 'mine', 'wreck', 'summit',
  'rappel', 'anchor', 'crack',   -- ← the safety-critical subset
  'other'
));

-- Derived, not app-enforced: the safety rail keys off this column.
alter table annotations add column is_safety_critical boolean
  generated always as (poi_type in ('rappel', 'anchor', 'crack')) stored;

create index annotations_source_idx on annotations (source);
create index annotations_poi_idx    on annotations (poi_type) where poi_type is not null;

-- ── sightings ── confirm/dispute an annotation from the field ───────────────
create type sighting_verdict as enum (
  'confirmed',  -- "it's there, as described" (rapped it, drank it, slept there)
  'disputed',   -- "not as described" (line is off, water is seasonal)
  'gone'        -- "no longer exists" (bolts chopped, cairn scattered)
);

create table sightings (
  id            uuid primary key default gen_random_uuid(),
  annotation_id uuid not null references annotations (id) on delete cascade,
  user_id       uuid not null references profiles (id) on delete cascade,
  verdict       sighting_verdict not null default 'confirmed',
  note          text not null default '' check (char_length(note) <= 500),
  -- where the sighter stood — every sighting is a triangulation sample
  sighted_lat   double precision,
  sighted_lng   double precision,
  created_at    timestamptz not null default now(),
  unique (annotation_id, user_id)  -- one living verdict per user; update to change
);
create index sightings_annotation_idx on sightings (annotation_id, created_at desc);
create index sightings_user_idx       on sightings (user_id, created_at desc);

-- ── RLS ── public-read social model, writes as self ─────────────────────────
alter table sightings enable row level security;
create policy "sightings are public"    on sightings for select using (true);
create policy "sight as self"           on sightings for insert with check (auth.uid() = user_id);
create policy "update own sighting"     on sightings for update using (auth.uid() = user_id);
create policy "delete own sighting"     on sightings for delete using (auth.uid() = user_id);
create policy "admins delete sightings" on sightings for delete using (is_admin());

-- Telemetry vocabulary additions (no schema change — documented for the dashboard):
--   Annotation layer: route_draw · sighting · ai_tag_run · sun_path_view
