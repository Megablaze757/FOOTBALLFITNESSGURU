-- =============================================================================
-- PHASE 5: pg_cron schedules
--
-- Run this ONCE in the Supabase SQL Editor AFTER deploying the edge functions.
-- It embeds your project ref + service-role key (via Vault), so it is kept out
-- of the migrations. Replace <PROJECT_REF> below.
--
-- Prereqs (enable in Dashboard → Database → Extensions, or run here):
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
-- =============================================================================

-- 1. Store the service-role key in Vault so it isn't written in plaintext here.
--    Run once (replace the value), then the cron jobs read it by name.
--    select vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'service_role_key');

-- Helper: POST to an edge function with the service-role bearer from Vault.
create or replace function public.invoke_edge(fn text)
returns void
language plpgsql
security definer
as $$
declare
  key text;
begin
  select decrypted_secret into key from vault.decrypted_secrets where name = 'service_role_key';
  perform net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/' || fn,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || key
    ),
    body := '{}'::jsonb
  );
end;
$$;

-- 2. Daily journal reminder — 08:00 every day.
select cron.schedule(
  'daily-journal-reminder',
  '0 8 * * *',
  $$ select public.invoke_edge('send-daily-reminders') $$
);

-- 3. Weekly summary email — 04:00 every Monday.
select cron.schedule(
  'weekly-insight-email',
  '0 4 * * 1',
  $$ select public.invoke_edge('weekly-summary') $$
);

-- 4. Program deadline reminders — 09:00 every day.
select cron.schedule(
  'program-deadline-reminders',
  '0 9 * * *',
  $$ select public.invoke_edge('deadline-reminders') $$
);

-- Inspect / remove:
--   select * from cron.job;
--   select cron.unschedule('daily-journal-reminder');
