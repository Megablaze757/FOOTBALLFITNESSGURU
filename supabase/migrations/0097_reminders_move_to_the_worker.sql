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
-- While both were live every one of those emails went out TWICE — two senders,
-- two Resend calls, two rows in email_delivery_logs, one athlete wondering why
-- the app nags. Nothing in the app could show that: each sender looked correct
-- on its own, and neither knew the other existed.
--
-- ORDER MATTERS IF YOU ARE APPLYING THIS BY HAND. Deploy the Worker bundle
-- first (2026-08-24.1 or later — it carries the milestone job that only existed
-- in the Edge Function until now), confirm /health reports that version, and
-- run this after. The other way round leaves a gap with nothing sending.
--
-- Safe to run twice: cron.unschedule throws if the job is already gone, so each
-- one is guarded.

do $$
declare
  job text;
begin
  foreach job in array array[
    'daily-journal-reminder',
    'weekly-insight-email',
    'program-deadline-reminders',
    'streak-milestone-emails',
    'workout-log-reminders'
  ] loop
    if exists (select 1 from cron.job where jobname = job) then
      perform cron.unschedule(job);
    end if;
  end loop;
end $$;
