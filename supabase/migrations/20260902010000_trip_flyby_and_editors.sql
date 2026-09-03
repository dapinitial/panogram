-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Panogram — per-trip fly-by settings + collaborator granting                 ║
-- ║                                                                            ║
-- ║ `trips.fly` holds the cinematic camera config the CMS edits (opening        ║
-- ║ altitude, birdseye pitch, pace, sun sweep, base light mood) — a small JSONB ║
-- ║ blob so the shape can evolve without migrations.                            ║
-- ║                                                                            ║
-- ║ grant_trip_editor() lets an existing editor invite a collaborator by handle ║
-- ║ WITHOUT the admin key in the browser: it's SECURITY DEFINER and self-checks ║
-- ║ that the caller already holds can_manage_trips (so only editors can grant). ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

alter table public.trips
  add column if not exists fly jsonb not null default '{}';

comment on column public.trips.fly is
  'Cinematic fly-by config: {intro,pitch,pace,sunSweep,lightPreset}. Read by the fly-tour engine.';

-- Grant or revoke a collaborator's trip-editor access by @handle. Only callable
-- by someone who is already a trip editor (or admin); it flips can_manage_trips
-- on the target profile. SECURITY DEFINER so it can update another profile row
-- (RLS otherwise limits profile writes to the owner) — the authorization check
-- is the can_manage_trips() guard below.
create or replace function grant_trip_editor(target_handle text, enable boolean default true)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  tid uuid;
begin
  if not can_manage_trips() then
    raise exception 'not authorized';
  end if;
  select id into tid from public.profiles where handle = target_handle;
  if tid is null then
    return false;
  end if;
  update public.profiles set can_manage_trips = enable where id = tid;
  return true;
end;
$$;
