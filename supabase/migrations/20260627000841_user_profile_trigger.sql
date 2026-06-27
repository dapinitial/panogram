-- Auto-create a profile row whenever a new auth user signs up. The generated
-- handle satisfies profiles.handle's regex (^[a-z0-9_.]{2,30}$); the user can
-- rename later. SECURITY DEFINER so it can write to public.profiles from the
-- auth schema trigger context.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, handle, display_name, avatar_grad)
  values (
    new.id,
    'user_' || substr(replace(new.id::text, '-', ''), 1, 10),
    coalesce(nullif(split_part(new.email, '@', 1), ''), 'creator'),
    'linear-gradient(135deg,#ff6b35,#7c3aed)'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
