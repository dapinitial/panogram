-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Storage — the `panoramas` bucket (uploaded immersive media)                ║
-- ║                                                                            ║
-- ║ Public-read so the viewer can load panos by URL. Prototype upload policy   ║
-- ║ is permissive (anon may upload) to make the loop work before auth lands —  ║
-- ║ TIGHTEN to `to authenticated` once sign-in exists (see VISION.md).         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

insert into storage.buckets (id, name, public)
values ('panoramas', 'panoramas', true)
on conflict (id) do nothing;

-- Anyone can view the media.
create policy "panoramas public read"
  on storage.objects for select
  using (bucket_id = 'panoramas');

-- Prototype: allow uploads without auth so the capture loop works today.
-- TODO(auth): change `true` → `auth.role() = 'authenticated'` and scope the path
-- to the user's own folder once sign-in is wired.
create policy "panoramas open upload"
  on storage.objects for insert
  with check (bucket_id = 'panoramas');
