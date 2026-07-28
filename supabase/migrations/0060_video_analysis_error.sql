-- Video analysis failures left no trace.
--
-- Two clips (21MB and 42MB .mov) sat at status 'ready' from 19 July with no
-- ai_plans row and nothing anywhere saying why. The analysis runs in the
-- browser, catches every failure, silently substitutes a synthetic estimate and
-- writes that out as if it were tracked — so a clip that failed and a clip that
-- worked are indistinguishable in the database. That is why "2 videos had
-- errors" could not be answered from the data.
--
-- These two columns make it answerable: what the numbers actually came from,
-- and what went wrong if anything did.

alter table public.videos add column if not exists analysis_error text;
alter table public.videos add column if not exists analysis_source text;

comment on column public.videos.analysis_error is
  'Why in-browser pose tracking failed, if it did. Null on a clean run. Set even when a synthetic estimate was shown, so a degraded result is visible rather than silent.';
comment on column public.videos.analysis_source is
  'mediapipe = real pose tracking. synthetic = deterministic estimate because tracking failed; the numbers are not measurements.';

-- Find degraded analyses without scanning the JSON.
create index if not exists videos_analysis_error_idx
  on public.videos (user_id, created_at desc)
  where analysis_error is not null;
