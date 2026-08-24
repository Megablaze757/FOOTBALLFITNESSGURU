-- =============================================================================
-- PocketAthlete — migrations 0088 to 0098, in one file.
--
-- HOW TO RUN IT. Either:
--
--   1. Supabase dashboard -> SQL Editor -> New query -> paste the whole file
--      -> Run. It is one transaction-free script; run it top to bottom.
--
--   2. Or, from GitHub: Actions -> "Apply SQL to Supabase" -> Run workflow,
--      with file = supabase/apply-0088-0098.sql. That needs the repo secret
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
-- IT STARTS AT 0088 FOR A REASON. An earlier version of this file began at
-- 0092 and failed on a real database with `42703: column "email_category" does
-- not exist`, four hundred lines in: 0095 reads a column that 0091 adds, and
-- 0091 had never been applied. A combined file has to reach back to the last
-- migration anybody is sure about, and since every statement here is safe to
-- run twice, including one you already have costs nothing at all.
--
-- WHAT IT ADDS, in order:
--
--   0088  Ordered programme goals and saved exercises on the profile, and
--         active-rest days as a real kind of training log rather than an
--         absence of one.
--
--   0089  A run's own distance, pace and unit; explicit rest days; display
--         preferences; custom nutrition targets; and the email controls the
--         notification pipeline below reads.
--
--   0090  The last turns of Ask Coach, so a follow-up is still a follow-up
--         after a refresh or on another device.
--
--   0091  ONE notification pipeline, trial-ending reminders, and health
--         consent recorded rather than assumed. This is the one that was
--         missing: it adds notifications.email_category, which 0095's admin
--         email views select from.
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
-- 0088_program_preferences_and_active_rest.sql
-- ============================================================================

-- Audit follow-up: additive programme preferences and explicit active-rest logs.
-- Existing goal_type and JSON plan rows remain valid; nothing is rewritten.

alter table public.profiles
  add column if not exists goals jsonb not null default '[]'::jsonb,
  add column if not exists saved_exercises text[] not null default '{}';

alter table public.programs
  add column if not exists goals jsonb not null default '[]'::jsonb,
  add column if not exists settings jsonb not null default '{}'::jsonb;

alter table public.training_logs
  add column if not exists session_type text,
  add column if not exists notes text;

-- A MIGRATION HAS TO BE SAFE IN A DATABASE THAT IS AHEAD OF IT.
--
-- This originally allowed only 'workout' and 'active_rest'. 0089 widens it to
-- include 'rest_day' a few lines later, the app has been writing rest_day ever
-- since, and re-running this file then failed outright:
--
--   ERROR: 23514: check constraint "training_logs_session_type_check" of
--   relation "training_logs" is violated by some row
--
-- Every statement in these files is written to be safe to run twice, and this
-- one was not — it narrowed the schema back to what it was before 0089, against
-- data written under 0089. So it states the final set rather than the interim
-- one, which makes the 0088 -> 0089 step a no-op and re-running either safe.
--
-- The clean-up above it is for the same reason from the other direction: a
-- value outside the set is legacy or hand-written and means nothing to the app,
-- which reads exactly these three. Nulling it is how every row before this
-- column existed already reads, and the alternative is a migration nobody can
-- apply at all.
update public.training_logs
   set session_type = null
 where session_type is not null
   and session_type <> all (array['workout', 'active_rest', 'rest_day']);

alter table public.training_logs drop constraint if exists training_logs_session_type_check;
alter table public.training_logs add constraint training_logs_session_type_check
  check (session_type is null or session_type = any (array['workout', 'active_rest', 'rest_day']));

comment on column public.profiles.goals is
  'Up to three ordered programme goals: [{type,priority}]. The first is the anchor.';
comment on column public.programs.settings is
  'Snapshot of the custom rotation and advanced controls used to build the block.';
comment on column public.training_logs.session_type is
  'active_rest counts toward attendance while its empty drills contribute no strength volume.';

-- ============================================================================
-- 0089_post_completion_preferences.sql
-- ============================================================================

-- Post-completion audit: precise run duration, explicit rest days, athlete
-- display preferences, custom nutrition targets and email controls.

alter table public.training_logs
  add column if not exists duration_seconds integer,
  add column if not exists distance_value numeric(8,3),
  add column if not exists distance_unit text,
  add column if not exists pace_seconds_per_km integer,
  add column if not exists avg_speed_kmh numeric(6,2);

alter table public.training_logs drop constraint if exists training_logs_duration_seconds_check;
alter table public.training_logs add constraint training_logs_duration_seconds_check
  check (duration_seconds is null or (duration_seconds >= 0 and duration_seconds <= 172800));

alter table public.training_logs drop constraint if exists training_logs_distance_unit_check;
alter table public.training_logs add constraint training_logs_distance_unit_check
  check (distance_unit is null or distance_unit = any (array['km', 'mi']));

alter table public.training_logs drop constraint if exists training_logs_session_type_check;
alter table public.training_logs add constraint training_logs_session_type_check
  check (session_type is null or session_type = any (array['workout', 'active_rest', 'rest_day']));

alter table public.profiles
  add column if not exists distance_unit text not null default 'km',
  add column if not exists calorie_target integer,
  add column if not exists protein_target integer,
  add column if not exists carbs_target integer,
  add column if not exists fats_target integer,
  add column if not exists email_weekly_summary boolean not null default true,
  add column if not exists email_checkin_reminders boolean not null default true,
  add column if not exists email_workout_reminders boolean not null default true,
  add column if not exists email_milestones boolean not null default true,
  add column if not exists email_program_reminders boolean not null default true;

-- The column is added with a default just above, so existing rows arrive as
-- 'km' — unless an earlier hand-edit put something else there. Same guard as
-- 0088 and 0091: a constraint added against live data has to say what happens
-- to the rows that do not fit, and kilometres is what the app assumed anyway.
update public.profiles set distance_unit = 'km'
 where distance_unit is null or distance_unit <> all (array['km', 'mi']);

alter table public.profiles drop constraint if exists profiles_distance_unit_check;
alter table public.profiles add constraint profiles_distance_unit_check
  check (distance_unit = any (array['km', 'mi']));

alter table public.profiles drop constraint if exists profiles_custom_nutrition_targets_check;
alter table public.profiles add constraint profiles_custom_nutrition_targets_check check (
  (calorie_target is null or calorie_target between 800 and 10000) and
  (protein_target is null or protein_target between 0 and 1000) and
  (carbs_target is null or carbs_target between 0 and 1500) and
  (fats_target is null or fats_target between 0 and 500)
);

comment on column public.training_logs.duration_seconds is
  'Exact elapsed run/session duration. total_minutes remains a rounded backwards-compatible summary.';
comment on column public.training_logs.session_type is
  'workout and active_rest count as activity; rest_day records an intentional recovery day.';

create table if not exists public.email_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  email_type text not null,
  provider_id text,
  status text not null,
  error_message text,
  created_at timestamptz not null default now()
);
alter table public.email_delivery_logs drop constraint if exists email_delivery_logs_status_check;
alter table public.email_delivery_logs add constraint email_delivery_logs_status_check
  check (status in ('attempted', 'sent', 'delivered', 'delayed', 'failed', 'bounced', 'complained', 'skipped'));
create index if not exists email_delivery_logs_user_created
  on public.email_delivery_logs (user_id, created_at desc);
create unique index if not exists email_delivery_logs_provider_id_unique
  on public.email_delivery_logs (provider_id) where provider_id is not null;
alter table public.email_delivery_logs enable row level security;
drop policy if exists "email delivery: read own" on public.email_delivery_logs;
create policy "email delivery: read own" on public.email_delivery_logs
  for select to authenticated using (user_id = auth.uid());

notify pgrst, 'reload schema';

-- ============================================================================
-- 0090_coach_conversation.sql
-- ============================================================================

-- Recent Ask Coach turns, so a follow-up is a follow-up after navigation,
-- refresh or another device. The model receives only the latest 12; the table
-- is the athlete's private record and cascades with account deletion.

create table if not exists public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists coach_messages_user_created_idx
  on public.coach_messages (user_id, created_at desc);

alter table public.coach_messages enable row level security;

drop policy if exists "coach messages: read own" on public.coach_messages;
create policy "coach messages: read own"
  on public.coach_messages for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "coach messages: insert own" on public.coach_messages;
create policy "coach messages: insert own"
  on public.coach_messages for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "coach messages: delete own" on public.coach_messages;
create policy "coach messages: delete own"
  on public.coach_messages for delete to authenticated
  using (user_id = auth.uid());

comment on table public.coach_messages is
  'Private recent Ask Coach conversation. Sent back as bounded context for follow-up questions.';

-- ============================================================================
-- 0091_notifications_trials_and_consent.sql
-- ============================================================================

-- =============================================================================
-- 0091 — one notification pipeline, trial-ending reminders and recorded health
-- consent.
--
-- Safe to paste into the Supabase SQL editor more than once.
-- =============================================================================

-- Notification choices --------------------------------------------------------

alter table public.profiles
  add column if not exists in_app_training_reminders boolean not null default true,
  add column if not exists health_data_consent_at timestamptz,
  add column if not exists health_data_consent_version text;

comment on column public.profiles.health_data_consent_at is
  'When the athlete made the separate, express health-data consent statement.';
comment on column public.profiles.health_data_consent_version is
  'Version of the health-data notice accepted by the athlete.';

alter table public.notifications
  add column if not exists dedupe_key text,
  add column if not exists show_in_app boolean not null default true,
  add column if not exists email_category text not null default 'none';

-- SAFE IN A DATABASE THAT ALREADY HAS DATA IN IT.
--
-- Same lesson as the session_type constraint in 0088, which failed outright on
-- a live database. Adding a check to a column that has been free text is a
-- promise about every row already in the table, and a notification whose kind
-- is not one of these can no longer be rendered anyway — 'general' is the
-- catch-all the list already carries, so it is where they go.
--
-- Idempotent by shape: the second run finds nothing left to move.
update public.notifications
   set kind = 'general'
 where kind is null
    or kind <> all (array[
      'program_assigned', 'coach_request', 'general',
      'check_in_reminder', 'workout_reminder', 'weekly_summary',
      'program_deadline', 'milestone', 'trial_ending', 'billing'
    ]);

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (
  kind in (
    'program_assigned', 'coach_request', 'general',
    'check_in_reminder', 'workout_reminder', 'weekly_summary',
    'program_deadline', 'milestone', 'trial_ending', 'billing'
  )
);

alter table public.notifications drop constraint if exists notifications_email_category_check;
alter table public.notifications add constraint notifications_email_category_check check (
  email_category in ('none', 'checkin', 'workout', 'weekly', 'milestone', 'program', 'essential')
);

-- A normal unique index still permits multiple NULL keys, which preserves old
-- and coach-created notifications while making scheduled jobs idempotent.
create unique index if not exists notifications_user_dedupe_unique
  on public.notifications (user_id, dedupe_key);

create index if not exists notifications_pending_email_idx
  on public.notifications (emailed_at, created_at)
  where emailed_at is null and email_category <> 'none';

-- The athlete may dismiss a row, but cannot turn an ordinary coach message into
-- an essential billing email or rewrite what the sender said.
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

drop policy if exists "notifications: coach notify" on public.notifications;
create policy "notifications: coach notify" on public.notifications
  for insert to authenticated with check (
    public.is_coach_of(user_id)
    and kind in ('program_assigned', 'coach_request', 'general')
    and (
      email_category = 'none'
      or (kind = 'program_assigned' and email_category = 'program')
    )
    and show_in_app
    and dedupe_key is null
  );

-- The Worker asks for ready-to-send rows. Optional training emails obey the
-- switches already shown on Profile; an essential billing notice is not
-- suppressed merely because its in-app copy was opened first.
drop function if exists public.pending_notification_emails();
create function public.pending_notification_emails()
returns table (
  id uuid,
  user_id uuid,
  title text,
  body text,
  href text,
  kind text,
  email_category text
)
language sql
stable
security definer
set search_path = public
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
       else false
     end
   order by n.created_at
   limit 200;
$$;

revoke execute on function public.pending_notification_emails() from public, anon, authenticated;
grant execute on function public.pending_notification_emails() to service_role;

-- Web push is a separate device-level opt-in, but it still obeys the global
-- app-reminder switch and never inspects check-in state after health consent is
-- withdrawn.
create or replace function public.push_targets_for_reminder(for_date date)
returns table (endpoint text, sub_id uuid)
language sql
security definer
set search_path = public, pg_temp
as $$
  select s.endpoint, s.id
    from public.push_subscriptions s
    join public.profiles p on p.id = s.user_id
   where s.failed_at is null
     and p.in_app_training_reminders
     and p.health_data_consent_at is not null
     and not exists (
       select 1 from public.daily_check_ins c
        where c.user_id = s.user_id and c.check_in_date = for_date
     );
$$;

revoke all on function public.push_targets_for_reminder(date) from public, anon, authenticated;
grant execute on function public.push_targets_for_reminder(date) to service_role;

-- Trial state -----------------------------------------------------------------

alter table public.subscriptions
  add column if not exists stripe_status text,
  add column if not exists trial_end timestamptz,
  add column if not exists trial_reminder_created_at timestamptz;

create index if not exists subscriptions_trial_reminder_due_idx
  on public.subscriptions (trial_end)
  where stripe_status = 'trialing'
    and trial_end is not null
    and trial_reminder_created_at is null;

-- The sold Pro plan and historic silver data value now grant identical access,
-- quota and retention. Keeping a hidden 60-day tier in this function made the
-- privacy policy and the product disagree.
create or replace function public.expired_video_paths()
returns table (id uuid, storage_path text)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.storage_path
    from public.videos v
    left join public.subscriptions s
      on s.user_id = v.user_id and s.status = 'active'
   where v.created_at < now() - (
           case coalesce(s.tier, 'bronze')
             when 'gold' then interval '180 days'
             when 'silver' then interval '180 days'
             else interval '14 days'
           end)
   limit 500;
$$;

revoke execute on function public.expired_video_paths() from public, anon, authenticated;
grant execute on function public.expired_video_paths() to service_role;

-- New-account consent ---------------------------------------------------------
--
-- This keeps the current first-touch referral ledger and signup funnel logic.
-- The timestamp is server generated; the browser supplies only the express
-- yes/no statement and the notice version it displayed.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  is_live boolean;
  v_meta text;
  v_code text;
  v_health_consent boolean;
  v_health_version text;
begin
  select coalesce(launched, false) into is_live from public.app_settings where id;

  v_meta := nullif(trim(new.raw_user_meta_data ->> 'referral_code'), '');
  if v_meta is not null then
    perform public.claim_referral(new.email, v_meta, 'signup');
  end if;
  v_code := public.referrer_for_email(new.email);

  v_health_consent := lower(coalesce(new.raw_user_meta_data ->> 'health_data_consent', 'false')) = 'true';
  v_health_version := nullif(trim(new.raw_user_meta_data ->> 'health_data_consent_version'), '');

  insert into public.profiles (
    id, full_name, avatar_url, beta, referral_code,
    health_data_consent_at, health_data_consent_version
  )
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url',
    not coalesce(is_live, false),
    v_code,
    case when v_health_consent then now() else null end,
    case when v_health_consent then coalesce(v_health_version, '2026-08-17') else null end
  )
  on conflict (id) do nothing;

  insert into public.funnel_events (user_id, event, meta)
  select new.id, 'signup',
         jsonb_build_object('since_signup_s', 0, 'referred', v_code is not null)
   where not exists (
     select 1 from public.funnel_events e
      where e.user_id = new.id and e.event = 'signup'
   );

  return new;
end;
$$;

notify pgrst, 'reload schema';

select
  'OK - migration 0091 applied' as result,
  count(*) filter (where stripe_status = 'trialing' and trial_end is not null) as tracked_trials
from public.subscriptions;

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

-- ============================================================================
-- 0096_drop_admin_bodyweight_read.sql
-- ============================================================================

-- Admins stop being able to read anybody's bodyweight.
--
-- 0095 granted `is_admin()` a blanket select on body_logs so an internal screen
-- could answer "my weight is wrong". The screen is gone (components/admin/
-- DataLogs.tsx) and this is the other half: a removed component with the grant
-- left in place is a privacy fix in appearance only — the rows are still one
-- PostgREST call away from any admin session, and nothing in the app would
-- notice if something started reading them again.
--
-- What survives: an athlete still reads and writes their own rows, and a coach
-- still reads the athletes they actually coach. Both predate 0095 and are the
-- relationships bodyweight is FOR. See 0011_body_and_coaching.sql.
--
-- daily_check_ins is deliberately untouched. Its admin visibility is not from
-- 0095 and it carries the support surface (soreness, sleep, load) that the
-- weight column merely sat next to; narrowing that is a separate decision with
-- separate consequences, and rolling it into a privacy fix nobody asked for
-- would be the same mistake in the other direction.

drop policy if exists "body logs: admin read" on public.body_logs;

-- ============================================================================
-- 0097_reminders_move_to_the_worker.sql
-- ============================================================================

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

-- ============================================================================
-- 0098_admin_last_logged.sql
-- ============================================================================

-- "Last seen" was the last sign-in, which says almost nothing.
--
-- A session refresh counts as a sign-in. So does opening the app, deciding
-- against it and closing it. An athlete who has not recorded anything in six
-- weeks but whose phone keeps the session alive reads as active, and the one
-- column an admin actually scans for "is this person using it" was answering a
-- different question in a convincing voice.
--
-- WHAT REPLACES IT is the last day they put something in: the later of a
-- check-in and a training log. Both count because both are the app working —
-- somebody logging sessions and skipping the morning questions is using it, and
-- so is somebody doing the reverse.
--
-- last_sign_in_at is kept in the return, because "signed up and never came
-- back" is still worth being able to see. It is just not the headline any more.
--
-- The return type gains a column, and `create or replace` cannot do that — so
-- this drops first. Nothing else calls it.

drop function if exists public.admin_users();

create function public.admin_users()
returns table (
  user_id uuid, email text, full_name text, role text, beta boolean,
  tier text, status text, referral_code text, affiliate_name text,
  created_at timestamptz, last_sign_in_at timestamptz, last_logged_on date,
  suspended_at timestamptz, comped boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select p.id, u.email::text, p.full_name, p.role,
         coalesce(p.beta, false),
         coalesce(s.tier, 'bronze')::text,
         coalesce(s.status, 'none')::text,
         p.referral_code,
         a.name,
         u.created_at,
         u.last_sign_in_at,
         -- greatest() ignores nulls and only returns null when every argument
         -- is, which is exactly the wanted behaviour for somebody who has done
         -- one of the two and not the other.
         greatest(
           (select max(c.check_in_date) from public.daily_check_ins c where c.user_id = p.id),
           (select max(t.log_date) from public.training_logs t where t.user_id = p.id)
         ),
         p.suspended_at,
         -- Comped = has access without paying Stripe. What you can revoke here.
         (s.user_id is not null and s.stripe_subscription_id is null and s.status = 'active')
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.subscriptions s on s.user_id = p.id
    left join public.affiliates a on lower(a.code) = lower(p.referral_code)
   order by u.created_at desc;
end;
$$;

revoke all on function public.admin_users() from public, anon;
grant execute on function public.admin_users() to authenticated;

-- The two lookups above are per-row, so they want the indexes that make them a
-- seek rather than a scan. Both are `if not exists`, and both almost certainly
-- exist already for the app's own queries.
create index if not exists daily_check_ins_user_date on public.daily_check_ins (user_id, check_in_date desc);
create index if not exists training_logs_user_date on public.training_logs (user_id, log_date desc);

notify pgrst, 'reload schema';

