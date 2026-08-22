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
