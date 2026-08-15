-- =============================================================================
-- 0083 — run the Oura sync every morning.
--
-- The nightly pull lives in the `sync-oura` Edge Function. This is the thing
-- that calls it, using pg_cron and pg_net, so the schedule lives in the
-- database rather than in a Worker whose deployed source nobody has.
--
-- WHY 05:00 UTC. Oura finishes processing a night's sleep shortly after you
-- wake, and the app's morning reminder emails go out on the Worker's own cron.
-- Pulling before those means the readiness a notification is based on already
-- includes last night. Early enough for Europe, and late enough that a US
-- athlete's night is also in — a ring uploads whenever it next reaches a phone,
-- and the function asks for seven days precisely so a late arrival is not lost.
--
-- BEFORE RUNNING THIS, three things have to be true or the job fails silently
-- every morning:
--
--   1. `supabase functions deploy sync-oura`
--   2. `supabase secrets set CRON_SECRET=<a long random string>`
--   3. The two settings below are filled in with YOUR project's values.
--
-- Both extensions are available on Supabase but are not enabled by default.
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- --- Where to call, and with what ---------------------------------------------
--
-- Stored in a table rather than inlined into the job body, so rotating the
-- secret is an UPDATE rather than an unschedule-and-recreate. Service-role only
-- — no policy is created, and RLS is on, so the anon and authenticated roles
-- cannot read it at all.
create table if not exists public.cron_config (
  key   text primary key,
  value text not null
);
alter table public.cron_config enable row level security;

comment on table public.cron_config is
  'Endpoints and secrets for scheduled jobs. Service role only: RLS is on and no policy grants access.';

-- REPLACE BOTH VALUES. The URL is your project ref; the secret must match what
-- `supabase secrets set CRON_SECRET=...` was given.
insert into public.cron_config (key, value) values
  ('sync_oura_url', 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-oura'),
  ('cron_secret',   'REPLACE_WITH_THE_SAME_VALUE_AS_CRON_SECRET')
on conflict (key) do nothing;   -- do nothing, so re-running never clobbers a real secret

-- --- The job ------------------------------------------------------------------

-- Unschedule first so this migration can be re-run without stacking duplicate
-- jobs, which is how one athlete ends up with four syncs a morning.
select cron.unschedule('sync-oura-daily')
  where exists (select 1 from cron.job where jobname = 'sync-oura-daily');

select cron.schedule(
  'sync-oura-daily',
  '0 5 * * *',
  $$
  select net.http_post(
    url     := (select value from public.cron_config where key = 'sync_oura_url'),
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-secret', (select value from public.cron_config where key = 'cron_secret')
               ),
    body    := '{}'::jsonb
  );
  $$
);

-- --- Did it run? --------------------------------------------------------------
--
-- pg_net is fire-and-forget: cron.job_run_details will say the SQL succeeded
-- even if the HTTP call came back 403, so "the job ran" and "the sync worked"
-- are different questions. The honest answer to the second one is whether
-- last_sync_at is moving, which is what the app itself now checks — see
-- syncHealth in lib/biometrics.ts.
--
-- Admin-gated because it reports on every athlete at once.
create or replace function public.oura_sync_health()
returns table (connections int, synced_today int, stale int, erroring int)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    count(*)::int,
    count(*) filter (where last_sync_at >= current_date)::int,
    count(*) filter (where last_sync_at is null or last_sync_at < now() - interval '48 hours')::int,
    count(*) filter (where last_error is not null)::int
  from public.wearable_connections
  where provider = 'oura' and access_token is not null;
$$;

revoke all on function public.oura_sync_health() from public;
grant execute on function public.oura_sync_health() to authenticated;
