-- Tracks carry provenance ("the line WE took") — unlike annotations, which are
-- deliberately collaborative, a track on someone else's capture is graffiti.
-- Tighten the insert policy: you may only attach a track to YOUR OWN post.
-- (shotgundetour cross-review, finding 6 — decided: possessive, not collaborative.)

drop policy "add track as self" on tracks;
create policy "add track to own post" on tracks for insert
  with check (
    auth.uid() = author_id
    and exists (select 1 from posts p where p.id = post_id and p.author_id = auth.uid())
  );
