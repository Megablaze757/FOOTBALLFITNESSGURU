-- Allow the "analyzed" video status.
--
-- Analysis moved into the browser, and InBrowserAnalysis marks a clip
-- "analyzed" once the biomechanics are computed and saved. The original CHECK
-- constraint predates that status, so every one of those updates was rejected
-- (silently, since the client didn't inspect the error) and clips stayed on
-- "ready" forever.

alter table videos drop constraint if exists videos_status_check;

alter table videos add constraint videos_status_check
  check (status = any (array['uploading', 'processing', 'ready', 'analyzed', 'failed']));

-- Backfill: any clip that already has a saved analysis is, in fact, analyzed.
update videos v
   set status = 'analyzed'
  from ai_plans p
 where p.video_id = v.id
   and v.status <> 'analyzed';
