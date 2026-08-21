-- =============================================================================
-- PocketAthlete — migrations 0092 to 0095, in one file.
--
-- HOW TO RUN IT. Either:
--
--   1. Supabase dashboard -> SQL Editor -> New query -> paste the whole file
--      -> Run. It is one transaction-free script; run it top to bottom.
--
--   2. Or, from GitHub: Actions -> "Apply SQL to Supabase" -> Run workflow,
--      with file = supabase/apply-0092-0095.sql. That needs the repo secret
--      SUPABASE_ACCESS_TOKEN (supabase.com/dashboard/account/tokens).
--      Prefer this one: it prints what the database returned and fails the run
--      on a non-2xx, so "did it apply?" has an answer in the log rather than in
--      somebody's memory of a paste.
--
-- SAFE TO RUN TWICE. Every statement is `if not exists`, `create or replace`,
-- `drop policy if exists` before create, or a guarded `do $$` block. Running it
-- again changes nothing and errors nowhere — so if you are unsure whether it
-- already went in, run it.
--
-- SAFE TO RUN LATE. Nothing here is required for the app to work; each feature
-- degrades to what it did before and says which migration is missing rather
-- than showing an empty screen. Applying it turns those features on.
--
-- WHAT IT ADDS, in order:
--
--   0092  Meal-plan preferences that were only ever held in React state.
--         "Keep it cheap" has existed since the planner did and was never
--         saved anywhere — so a plan generated in budget mode was rebuilt
--         WITHOUT it on the nutrition page. Same seed, different dinners, in
--         two places at once. Adds diet_budget and diet_cook_level.
--
--   0093  A weekly food budget in pounds, and the supermarket it is measured
--         in. The shop has to move off the device with it: store prices differ
--         by a flat index per shop, so once a budget can change the plan, an
--         athlete whose phone said Aldi and whose laptop said Tesco would be
--         handed two different weeks from one seed.
--
--   0094  A run's own duration, separate from the session it sat inside. A
--         footballer's Tuesday is a 90-minute session with a 20-minute run in
--         it, and pace computed from the session reads 4:30/km as 20:00/km.
--         Also widens distance_km, which was silently rounding 5.666km to 5.67.
--
--   0095  Admin visibility and the email audit. The delivery log has recorded
--         every send since 0089 and the only policy on it was "read own", so an
--         admin querying it saw their own handful of rows and concluded nothing
--         was being sent — which is exactly what nothing being sent looks like.
--         Adds admin reads, a summary function, an audit that joins each send
--         to the notification that triggered it, and the two email categories
--         that were asked for and did not exist (recovery alerts, meal plan).
--
-- AFTER RUNNING IT, one thing is still outstanding and is NOT in this file:
-- paste cloudflare/worker.js into the Cloudflare dashboard. The admin email
-- panel's configuration check, test send and retry are Worker routes, and the
-- Worker is deployed by hand. /health reports version 2026-08-21.1 once it is.
-- =============================================================================


-- ============================================================================
-- 0092_meal_plan_preferences.sql
-- ============================================================================

-- =============================================================================
-- Two meal-plan preferences that were only ever held in React state.
--
-- "KEEP IT CHEAP" WAS NEVER SAVED. The tick box has existed for as long as the
-- planner has, and nothing wrote it anywhere. That is worse than a setting that
-- forgets itself: the nutrition page rebuilds the same week from the saved seed
-- and the saved preferences, so a plan generated in budget mode was re-rendered
-- WITHOUT it — the same seed, a different set of meals, in two places at once.
--
-- COOKING LEVEL IS NEW. Recipes are rated Easy / Medium / Involved from their
-- own contents (see lib/recipe-difficulty.ts), and somebody who says they can't
-- face cooking should get the simple ones first all week rather than having to
-- swap dinner every night.
--
-- Both default to today's behaviour, so an existing athlete's plan does not
-- change under them when this runs.
-- =============================================================================

alter table public.profiles add column if not exists diet_budget boolean not null default false;
alter table public.profiles add column if not exists diet_cook_level text;

-- 'any' and 'easy' only. Written as a check rather than an enum so adding a
-- third option later is one migration and not a type rewrite.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_diet_cook_level_check'
  ) then
    alter table public.profiles
      add constraint profiles_diet_cook_level_check
      check (diet_cook_level is null or diet_cook_level in ('any', 'easy'));
  end if;
end $$;

comment on column public.profiles.diet_budget is 'Prefer cheaper staples when building a meal plan.';
comment on column public.profiles.diet_cook_level is 'any | easy — how much cooking the athlete is up for.';

-- New columns are invisible to PostgREST until it reloads its schema cache.
-- It polls, but a plan saved in the same minute as the migration would fail
-- with "column does not exist" on a column that does.
notify pgrst, 'reload schema';

-- ============================================================================
-- 0093_meal_budget_and_store.sql
-- ============================================================================

-- =============================================================================
-- A weekly food budget, and the shop it is measured in.
--
-- WHY THE STORE HAS TO MOVE TOO. It has been in localStorage, which is a
-- reasonable home for a display preference and the wrong one for an input to
-- the plan. Store prices differ by a flat index per shop, so once a budget can
-- CHANGE the plan — the planner leans harder on price until the week comes in
-- under the ceiling — the same athlete on a phone set to Aldi and a laptop set
-- to Tesco would be handed two different weeks from one seed. That is exactly
-- the bug "keep it cheap was never saved" already caused once, and the fix is
-- the same: an input to the plan belongs with the athlete, not with the device.
--
-- Both are nullable and mean "not set", so nobody's plan changes when this runs.
-- =============================================================================

alter table public.profiles add column if not exists diet_weekly_budget numeric;
alter table public.profiles add column if not exists shop_store text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_diet_weekly_budget_check') then
    alter table public.profiles
      add constraint profiles_diet_weekly_budget_check
      check (diet_weekly_budget is null or (diet_weekly_budget > 0 and diet_weekly_budget <= 1000));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_shop_store_check') then
    alter table public.profiles
      add constraint profiles_shop_store_check
      check (shop_store is null or shop_store in ('tesco', 'sainsburys', 'asda', 'aldi'));
  end if;
end $$;

comment on column public.profiles.diet_weekly_budget is 'Weekly food budget in GBP. The planner leans on price until an ordinary week fits it.';
comment on column public.profiles.shop_store is 'Which supermarket prices are quoted in — an input to the plan, so it lives here and not in localStorage.';

-- New columns are invisible to PostgREST until it reloads its schema cache.
-- It polls, but a plan saved in the same minute as the migration would fail
-- with "column does not exist" on a column that does.
notify pgrst, 'reload schema';

-- ============================================================================
-- 0094_run_duration.sql
-- ============================================================================

-- =============================================================================
-- A run's own duration, separate from the session it sat inside.
--
-- THE TWO ARE NOT THE SAME NUMBER and the app only had one of them. A
-- footballer's Tuesday is a 90-minute session with a 20-minute run in it; a
-- lifter's Saturday is 70 minutes of squats and a 12-minute cool-down jog. Pace
-- computed from the session duration reads 4:30/km as 20:00/km, which is not a
-- rounding error — it is a different sport.
--
-- Runners were the exception that hid it: for them the run IS the session, so
-- one field looked like enough.
--
-- distance_km widens at the same time. It was numeric(6,2) while the check-in
-- accepts and canonicalises three decimals, so a 5.666km run came back as 5.67
-- — small, and exactly the kind of silent edit that makes somebody stop
-- trusting what they typed. A GPS watch reports metres; store metres.
-- =============================================================================

alter table public.training_logs
  add column if not exists run_seconds integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'training_logs_run_seconds_check') then
    alter table public.training_logs
      add constraint training_logs_run_seconds_check
      check (run_seconds is null or (run_seconds >= 0 and run_seconds <= 86400));
  end if;
end $$;

alter table public.training_logs
  alter column distance_km type numeric(7,3);

comment on column public.training_logs.run_seconds is
  'Time spent running, which is not the session duration — pace is computed from this and distance_km.';
comment on column public.training_logs.distance_km is
  'Distance in kilometres to the metre. Widened from numeric(6,2), which silently rounded a 5.666km run to 5.67.';

notify pgrst, 'reload schema';

-- ============================================================================
-- 0095_admin_visibility_and_email_audit.sql
-- ============================================================================

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

