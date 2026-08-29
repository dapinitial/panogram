-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Panogram — map social (likes + comments on Atlas maps)                     ║
-- ║                                                                            ║
-- ║ Maps (member-owned plotted routes) are public-read, so they can be liked   ║
-- ║ and discussed like posts. These two tables mirror the post `likes` /       ║
-- ║ `comments` tables exactly: public-read (the counts + thread show on any    ║
-- ║ shared map), insert/delete gated to the acting user (auth.uid() = user_id).║
-- ║                                                                            ║
-- ║ user_id → profiles(id) (not auth.users) so the UI can join a handle/name   ║
-- ║ onto each comment, same as post comments.                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

create table if not exists public.map_likes (
  map_id     uuid not null references public.maps (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (map_id, user_id)
);

create table if not exists public.map_comments (
  id         uuid primary key default gen_random_uuid(),
  map_id     uuid not null references public.maps (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists map_comments_map_idx on public.map_comments (map_id, created_at);
create index if not exists map_likes_user_idx    on public.map_likes (user_id);

alter table public.map_likes    enable row level security;
alter table public.map_comments enable row level security;

-- Public read — likes count + comment thread open on any shared map.
create policy "map likes public read"    on public.map_likes    for select using (true);
create policy "map comments public read" on public.map_comments for select using (true);

-- Write as self only — you can like/unlike and comment/delete only as yourself.
create policy "map like as self"   on public.map_likes for insert with check (auth.uid() = user_id);
create policy "map unlike as self" on public.map_likes for delete using (auth.uid() = user_id);

create policy "map comment as self"    on public.map_comments for insert with check (auth.uid() = user_id);
create policy "map delete own comment" on public.map_comments for delete using (auth.uid() = user_id);
