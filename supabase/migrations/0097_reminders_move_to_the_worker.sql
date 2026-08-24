-- Stop pg_cron sending the reminders the Cloudflare Worker already sends.
--
-- Five scheduled jobs invoked Edge Functions, and the Worker's own cron does
-- the same work on the same days:
--
--   daily-journal-reminder      -> sendDailyReminders + emailNotifications
--   weekly-insight-email        -> sendWeeklySummaries (Mondays)
--   program-deadline-reminders  -> sendDeadlineReminders
--   streak-milestone-emails     -> sendMilestoneNotifications (ported for this)
--   workout-log-reminders       -> sendWorkoutReminders (19:00)
--
-- Wherever BOTH are live, every one of those emails goes out twice — two
-- senders, two Resend calls, two rows in email_delivery_logs. Neither sender is
-- wrong on its own and neither knows the other exists, which is why nothing in
-- the app can show it.
--
-- NOT EVERY DATABASE HAS pg_cron. The first version of this assumed the `cron`
-- schema was there and failed on the project it was written for with
-- `42P01: relation "cron.job" does not exist` — pg_cron had never been enabled,
-- so supabase/cron/schedule.sql had never been run and those five jobs never
-- existed. Good news for that database (nothing was ever sent twice) and a bug
-- in this file, which has to run cleanly on both.
--
-- So it checks the schema is there first, and does nothing when it is not. The
-- guard has to be an early RETURN rather than an `if ... then` wrapped around
-- the loop: PL/pgSQL only parses a SQL statement when it first executes, so
-- returning before `select ... from cron.job` is reached is what keeps the
-- planner from ever looking for a table that is not there.
--
-- ORDER MATTERS IF YOU ARE APPLYING THIS BY HAND. Deploy the Worker bundle
-- first (2026-08-24.1 or later — it carries the milestone job that only existed
-- in the Edge Function until now), confirm /health reports that version, and
-- run this after. The other way round leaves a gap with nothing sending.
--
-- Safe to run twice, and safe to run on a database that never had pg_cron.

do $$
declare
  job text;
begin
  -- pg_namespace always exists, so this cannot itself be the thing that
  -- throws. to_regclass alone would do for a modern Postgres, but its
  -- behaviour on a MISSING SCHEMA has changed across versions, and this file
  -- has to be safe to paste into whatever the project is running.
  if not exists (select 1 from pg_namespace where nspname = 'cron')
     or to_regclass('cron.job') is null then
    raise notice 'pg_cron is not installed here — nothing to unschedule.';
    return;
  end if;

  foreach job in array array[
    'daily-journal-reminder',
    'weekly-insight-email',
    'program-deadline-reminders',
    'streak-milestone-emails',
    'workout-log-reminders'
  ] loop
    if exists (select 1 from cron.job where jobname = job) then
      perform cron.unschedule(job);
      raise notice 'unscheduled %', job;
    end if;
  end loop;
end $$;
