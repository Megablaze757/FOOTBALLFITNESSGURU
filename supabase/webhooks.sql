-- =============================================================================
-- Database Webhooks (run once, AFTER deploying the edge functions)
--
-- Creates triggers that POST row changes to the edge functions, using Supabase's
-- built-in supabase_functions.http_request. Replace <PROJECT_REF> and
-- <SERVICE_ROLE_KEY> before running (SQL Editor).
--
-- This is the SQL equivalent of Dashboard → Database → Webhooks.
-- =============================================================================

-- daily_check_ins INSERT/UPDATE  ->  process-daily-state (AI insight)
drop trigger if exists on_check_in_change on public.daily_check_ins;
create trigger on_check_in_change
  after insert or update on public.daily_check_ins
  for each row
  execute function supabase_functions.http_request(
    'https://<PROJECT_REF>.supabase.co/functions/v1/process-daily-state',
    'POST',
    '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}',
    '{}',
    '5000'
  );

-- videos INSERT  ->  process-video (biomechanics analysis)
drop trigger if exists on_video_insert on public.videos;
create trigger on_video_insert
  after insert on public.videos
  for each row
  execute function supabase_functions.http_request(
    'https://<PROJECT_REF>.supabase.co/functions/v1/process-video',
    'POST',
    '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}',
    '{}',
    '5000'
  );
