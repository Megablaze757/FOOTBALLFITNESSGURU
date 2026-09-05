-- =============================================================================
-- FINISHED REELS, WHERE THE PERSON WHO ASKED FOR THEM ACTUALLY IS.
--
-- Reported as "make the admin one click to make the reel — it's too complex",
-- and then "I want it in admin dashboard not github". Both fair: recording runs
-- on a GitHub runner because that is where a full ffmpeg and a browser live,
-- but a finished video sitting in an Actions artefact means opening GitHub,
-- finding the run, downloading a zip and unzipping it — to watch a 20-second
-- video the app asked for.
--
-- So the runner uploads the finished file here and the admin panel plays it.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reels', 'reels', false,
  -- 40MB. A 30-second 1080x1920 H.264 file is 3-6MB; anything ten times that
  -- is not a reel, and a cap is the only thing standing between an open insert
  -- policy and somebody's disk quota.
  41943040,
  array['video/mp4', 'application/x-subrip', 'text/plain']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- --- Who may write ----------------------------------------------------------
--
-- ANY AUTHENTICATED USER, AND THAT IS A DELIBERATE TRADE rather than an
-- oversight. The uploader is a GitHub runner signing in as the demo account —
-- the same credentials that already let it film the signed-in app — and
-- tightening this further would mean either a service-role key as a second
-- GitHub secret, or a flag on a specific account that names that account in
-- this repository. Both are worse: one is a key that can do anything, the
-- other publishes which account CI uses.
--
-- What is actually at risk: a signed-in athlete could put a file in a private
-- bucket they cannot read back. The size cap and the mime list bound it, and
-- an admin can delete it. That is a small, bounded nuisance against a real
-- credential risk on the other side.
drop policy if exists "reels: insert authenticated" on storage.objects;
create policy "reels: insert authenticated" on storage.objects for insert to authenticated
  with check (bucket_id = 'reels');

-- --- Who may read -----------------------------------------------------------
--
-- Admins only. These are marketing assets with the app's own screens in them,
-- filmed on a demo account — nothing private, but nothing anybody else has a
-- reason to browse either.
-- public.is_admin() from migration 0005, not a hand-rolled subquery: it is
-- SECURITY DEFINER with a pinned search_path and it is what every other admin
-- policy in this project uses. A second copy of that check is a second thing
-- to get right.
drop policy if exists "reels: read admin" on storage.objects;
create policy "reels: read admin" on storage.objects for select to authenticated
  using (bucket_id = 'reels' and public.is_admin());

drop policy if exists "reels: delete admin" on storage.objects;
create policy "reels: delete admin" on storage.objects for delete to authenticated
  using (bucket_id = 'reels' and public.is_admin());
