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

-- THE REMINDERS ARE NOT HERE ANY MORE.
--
-- Five jobs used to live in this file — the daily journal reminder, the weekly
-- summary, deadline reminders, streak milestones and the evening workout
-- reminder — and every one of them was ALSO being sent by the Cloudflare
-- Worker's own cron. Two senders, two Resend calls, one athlete getting each
-- message twice. See migration 0097, which unschedules them on a database that
-- already has them.
--
-- They all run from cloudflare/src/index.ts now: 08:00 for the morning set and
-- 19:00 for the workout reminder, declared in cloudflare/wrangler.toml. One
-- deploy, one place to read the logic, one copy of the email shell.
--
-- `invoke_edge` above is kept because it is still how you would schedule any
-- FUTURE Edge Function that has no Worker equivalent.

-- Inspect / remove:
--   select * from cron.job;
--   select cron.unschedule('daily-journal-reminder');
