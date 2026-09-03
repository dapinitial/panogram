-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Panogram — trip-editor invites (pre-authorize a collaborator by email)      ║
-- ║                                                                            ║
-- ║ Granting by @handle only works once someone has an account. To onboard a    ║
-- ║ collaborator (e.g. Mick @ kaf) BEFORE they sign up, an editor invites their ║
-- ║ EMAIL; when that person logs in (magic link) they auto-claim editor access. ║
-- ║                                                                            ║
-- ║ invite_trip_editor()  — editor-gated: records the invite AND grants now if   ║
-- ║                          a profile with that email already exists.          ║
-- ║ claim_trip_editor_invites() — called on /studio load as the signed-in user; ║
-- ║                          promotes them + consumes the invite if their email ║
-- ║                          was invited. Both SECURITY DEFINER (see guards).    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

create table if not exists public.trip_editor_invites (
  email      text primary key,
  created_at timestamptz not null default now()
);

alter table public.trip_editor_invites enable row level security;

-- Only editors can see or clear pending invites. Inserts happen through the
-- SECURITY DEFINER function below (which enforces the same check), so no insert
-- policy is granted to the client directly.
create policy "invites editor read" on public.trip_editor_invites
  for select using (can_manage_trips());
create policy "invites editor delete" on public.trip_editor_invites
  for delete using (can_manage_trips());

-- Invite by email: record it, and if the person already has a profile, grant now.
create or replace function invite_trip_editor(target_email text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare em text := lower(trim(target_email));
begin
  if not can_manage_trips() then raise exception 'not authorized'; end if;
  if em = '' or position('@' in em) = 0 then return false; end if;
  insert into public.trip_editor_invites(email) values (em) on conflict (email) do nothing;
  update public.profiles p set can_manage_trips = true
    from auth.users u where u.id = p.id and lower(u.email) = em;
  return true;
end;
$$;

-- Claim: promote the current user if their email was invited, then consume it.
create or replace function claim_trip_editor_invites()
returns boolean
language plpgsql security definer set search_path = public
as $$
declare em text; claimed boolean := false;
begin
  select lower(u.email) into em from auth.users u where u.id = auth.uid();
  if em is null then return false; end if;
  if exists (select 1 from public.trip_editor_invites where email = em) then
    update public.profiles set can_manage_trips = true where id = auth.uid();
    delete from public.trip_editor_invites where email = em;
    claimed := true;
  end if;
  return claimed;
end;
$$;
