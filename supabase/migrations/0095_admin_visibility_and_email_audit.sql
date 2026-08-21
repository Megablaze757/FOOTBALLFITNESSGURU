-- =============================================================================
-- 0095 — see what the app is doing on somebody's behalf.
--
-- "NO VISIBILITY INTO EMAIL DELIVERY STATUS. CAN'T TELL IF NOTIFICATIONS ARE
--  WORKING."
--
-- The audit trail already existed: every send has written a row to
-- email_delivery_logs since 0089, with the provider's id when it worked and its
-- error when it did not. Nobody could read it. The only policy on the table is
-- "read own", so an admin querying it saw their own handful of rows and
-- concluded nothing was being sent — which is indistinguishable from nothing
-- being sent.
--
-- Same shape for the other three: weight logs to debug "my weight is wrong",
-- custom exercises to see what the library is missing, and the notification
-- rows that say WHY each email went out. All read-only, all admin-gated in the
-- policy rather than in the UI, because a hidden button is not a permission.
--
-- WHAT AN ADMIN CAN SEE IS DELIBERATELY NARROW. Delivery status, weights,
-- exercise names, and the notification that triggered a send. Not the message
-- body of a coach conversation, not a check-in, not a pain map. Support needs
-- to know whether an email left the building and whether a number was recorded;
-- it does not need to read somebody's training diary.
-- =============================================================================

-- --- who can see what --------------------------------------------------------

drop policy if exists "email delivery: admin read" on public.email_delivery_logs;
create policy "email delivery: admin read" on public.email_delivery_logs
  for select to authenticated using (public.is_admin());

drop policy if exists "body logs: admin read" on public.body_logs;
create policy "body logs: admin read" on public.body_logs
  for select to authenticated using (public.is_admin());

drop policy if exists "custom_ex: admin read" on public.custom_exercises;
create policy "custom_ex: admin read" on public.custom_exercises
  for select to authenticated using (public.is_admin());

drop policy if exists "notifications: admin read" on public.notifications;
create policy "notifications: admin read" on public.notifications
  for select to authenticated using (public.is_admin());

-- --- the numbers at the top of the page --------------------------------------

/**
 * Sent, failed, pending and the success rate, over a window.
 *
 * An RPC rather than four counts from the client: the interesting number is the
 * RATE, and computing it in the browser means shipping every row to work out a
 * percentage. `security definer` with an is_admin() guard inside, so the
 * function cannot be used to read what the policies above already refuse.
 *
 * "Pending" is not a status any sender writes — it is the queue: notifications
 * that want an email and have not had one yet. That is the number that answers
 * "is the cron running at all", which no per-row status can.
 */
create or replace function public.email_log_summary(since_days int default 7)
returns table (
  sent bigint,
  failed bigint,
  delivered bigint,
  bounced bigint,
  pending bigint,
  success_rate numeric,
  last_send timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cutoff timestamptz := now() - make_interval(days => greatest(1, least(365, coalesce(since_days, 7))));
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  return query
  with logs as (
    select status from public.email_delivery_logs where created_at >= cutoff
  ), counted as (
    select
      count(*) filter (where status in ('sent', 'delivered')) as ok,
      count(*) filter (where status = 'failed') as bad,
      count(*) filter (where status = 'delivered') as got_there,
      count(*) filter (where status in ('bounced', 'complained')) as bounced_off
      from logs
  )
  select
    counted.ok,
    counted.bad,
    counted.got_there,
    counted.bounced_off,
    (select count(*) from public.notifications n
      where n.emailed_at is null and n.email_category <> 'none' and n.created_at >= cutoff),
    case when counted.ok + counted.bad = 0 then null
         else round((counted.ok::numeric * 100) / (counted.ok + counted.bad), 1) end,
    (select max(created_at) from public.email_delivery_logs)
    from counted;
end;
$$;

revoke all on function public.email_log_summary(int) from public, anon;
grant execute on function public.email_log_summary(int) to authenticated;

/**
 * What triggered each email, in one row per send.
 *
 * The audit the spec asks for is a JOIN, not a new table: the notification says
 * why it exists ("You've logged 7 days in a row"), and the delivery log says
 * what happened to the email it produced. Keeping them apart means neither can
 * drift from the truth, and a notification that never became an email is still
 * visible as a trigger with no send.
 *
 * The address is masked here rather than in the UI. An admin debugging delivery
 * needs to recognise an address, not read the mailing list, and a masked column
 * cannot be un-masked by a curious client.
 */
create or replace function public.email_audit(since_days int default 7, max_rows int default 200)
returns table (
  -- NOT `at`: reserved in PostgreSQL, and a function that returns one fails
  -- at CREATE time rather than at call time. See lib/migration-syntax.test.ts.
  sent_at timestamptz,
  user_id uuid,
  recipient text,
  trigger_kind text,
  trigger_title text,
  email_category text,
  status text,
  error_message text
)
language plpgsql
security definer
set search_path = public, pg_temp, auth
as $$
declare
  cutoff timestamptz := now() - make_interval(days => greatest(1, least(365, coalesce(since_days, 7))));
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  return query
  select
    l.created_at,
    l.user_id,
    case
      when u.email is null then '—'
      -- j***@example.com. Enough to recognise, not enough to harvest.
      else left(u.email, 1) || '***@' || split_part(u.email, '@', 2)
    end,
    n.kind,
    n.title,
    coalesce(n.email_category, split_part(l.email_type, '_', 1)),
    l.status,
    l.error_message
    from public.email_delivery_logs l
    left join auth.users u on u.id = l.user_id
    -- The pipeline logs `notification_<kind>`, so the kind is the join key when
    -- the send came from a notification. Weekly summaries and the launch
    -- announcement have no notification row and simply show no trigger.
    left join lateral (
      select n2.kind, n2.title, n2.email_category
        from public.notifications n2
       where n2.user_id = l.user_id
         and l.email_type = 'notification_' || n2.kind
         and n2.emailed_at is not null
       order by abs(extract(epoch from (n2.emailed_at - l.created_at)))
       limit 1
    ) n on true
   where l.created_at >= cutoff
   order by l.created_at desc
   limit greatest(1, least(1000, coalesce(max_rows, 200)));
end;
$$;

revoke all on function public.email_audit(int, int) from public, anon;
grant execute on function public.email_audit(int, int) to authenticated;

-- --- the two email types that were asked for and did not exist ---------------

/**
 * Recovery alerts and the meal-plan summary.
 *
 * The other four the spec lists were already here under different names —
 * a streak reminder is a check-in reminder, a goal milestone is a milestone.
 * These two had no category at all, so a producer could not have written one
 * even if it existed: email_category is constrained, and an unknown value is
 * rejected rather than silently sent.
 *
 * Both default to ON like the rest, and both are optional — they go through the
 * same consent and per-category checks in pending_notification_emails.
 */
alter table public.profiles
  add column if not exists email_recovery_alerts boolean not null default true,
  add column if not exists email_meal_plan boolean not null default true;

alter table public.notifications drop constraint if exists notifications_email_category_check;
alter table public.notifications add constraint notifications_email_category_check check (
  email_category in ('none', 'checkin', 'workout', 'weekly', 'milestone', 'program', 'recovery', 'meal_plan', 'essential')
);

create or replace function public.pending_notification_emails()
returns table (
  id uuid, user_id uuid, title text, body text, href text, kind text, email_category text
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select n.id, n.user_id, n.title, n.body, n.href, n.kind, n.email_category
    from public.notifications n
    join public.profiles p on p.id = n.user_id
   where n.emailed_at is null
     and n.email_category <> 'none'
     and (n.email_category = 'essential' or n.read_at is null)
     and (n.email_category = 'essential' or p.health_data_consent_at is not null)
     and n.created_at > now() - case
       when n.email_category = 'essential' then interval '30 days'
       else interval '7 days'
     end
     and case n.email_category
       when 'essential' then true
       when 'checkin' then p.email_checkin_reminders
       when 'workout' then p.email_workout_reminders
       when 'weekly' then p.email_weekly_summary
       when 'milestone' then p.email_milestones
       when 'program' then p.email_program_reminders
       when 'recovery' then p.email_recovery_alerts
       when 'meal_plan' then p.email_meal_plan
       else false
     end
   order by n.created_at
   limit 200;
$$;

revoke execute on function public.pending_notification_emails() from public, anon, authenticated;
grant execute on function public.pending_notification_emails() to service_role;

notify pgrst, 'reload schema';
