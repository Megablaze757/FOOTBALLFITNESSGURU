-- =============================================================================
-- 0114: The one message after the app has stopped talking.
--
-- =============================================================================
-- PAST THIRTY DAYS NOTHING REACHES ANYBODY, AND THAT WAS NEVER A DECISION.
--
-- lib/checkin-reminder.ts stops at thirty days of silence and its reasoning is
-- right: nobody is brought back by the thirtieth identical email, and
-- continuing to send them is how a domain earns a spam reputation. Every
-- sender in the app inherits that line.
--
-- What follows from it was never written down anywhere. Everybody past thirty
-- days is out of contact permanently — not mailed less, never mailed again by
-- anything. 0113 made them countable. This is the one message they get.
--
-- NOT A RESTARTED REMINDER. The reminder was right to stop because it had
-- nothing to say; a thirty-first "you have not checked in" is the same email
-- that already failed thirty times. The rule in lib/win-back.ts is that if
-- there is no specific statistic about that athlete worth a sentence, nothing
-- is sent at all.
--
-- ONCE, ENFORCED WHERE IT CANNOT BE BYPASSED. 0091 put a unique index on
-- (user_id, dedupe_key), so a win-back row written with the key 'win_back'
-- can only exist once per athlete. A sender with a bug, a job that runs twice,
-- or a future second implementation all hit the same constraint. The rule
-- lives in the database rather than in the caller's good intentions.
--
-- ITS OWN CONSENT SWITCH, not a reused one. This is a different thing from a
-- check-in reminder: it goes to somebody who has already stopped, and the
-- honest thing is to let them refuse it without also refusing the reminders
-- they may want if they come back. Default true, like every other category —
-- an athlete who never touched the settings gets the same treatment they get
-- for the weekly summary.
-- =============================================================================

alter table public.profiles
  add column if not exists email_win_back boolean not null default true;

-- -----------------------------------------------------------------------------
-- The kind, and the bucket it unsubscribes under.
--
-- BOTH, OR IT SILENTLY NEVER SENDS. pending_notification_emails() ends its
-- consent case with `else false`, so a category added to the constraint and
-- not to the function produces rows that are valid, queued, and never picked
-- up — a feature that looks shipped and does nothing.
-- -----------------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (
  kind in (
    'program_assigned', 'coach_request', 'general',
    'check_in_reminder', 'workout_reminder', 'weekly_summary',
    'program_deadline', 'milestone', 'trial_ending', 'billing',
    'win_back'
  )
);

alter table public.notifications drop constraint if exists notifications_email_category_check;
alter table public.notifications add constraint notifications_email_category_check check (
  email_category in (
    'none', 'checkin', 'workout', 'weekly', 'milestone', 'program',
    'recovery', 'meal_plan', 'essential', 'win_back'
  )
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
       when 'win_back' then p.email_win_back
       else false
     end
   order by n.created_at
   limit 200;
$$;

revoke execute on function public.pending_notification_emails() from public, anon, authenticated;
grant execute on function public.pending_notification_emails() to service_role;

-- -----------------------------------------------------------------------------
-- Who is eligible, and the facts about them the message is made of.
--
-- THE NUMBERS COME OUT OF THE DATABASE, THE SENTENCE IS DECIDED IN CODE. Same
-- split as lib/growth-digest.ts: which line to lead with, whether an athlete
-- has a story at all, and how "nearly fifty" is phrased are decisions worth
-- testing, and they are tested in lib/win-back.test.ts. This does the counting,
-- which SQL is better at and which no test can get wrong.
--
-- THE BEST LIFT IS A MAXIMUM OVER JSONB, one key at a time. metrics is a bag
-- of whatever was measured — `{"squat_1rm": 100, "sprint_10m": 1.75}` — and
-- the two are not comparable: bigger is better for one and worse for the
-- other. Only the keys ending in _1rm are considered, because those are the
-- ones where "your best is still X" is a sentence that means something.
--
-- SERVICE ROLE ONLY. It returns one athlete's training history per row, which
-- is the shape 0046 had to close on funnel_summary after it shipped readable
-- by anybody signed in.
-- -----------------------------------------------------------------------------
drop function if exists public.win_back_candidates(int, int);

create function public.win_back_candidates(p_after int default 35, p_until int default 180)
returns table (
  user_id uuid,
  full_name text,
  last_active date,
  sessions bigint,
  longest_streak int,
  best_metric text,
  best_value numeric,
  best_on date,
  wants_email boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with seen as (
    select p.id,
           p.full_name,
           p.email_win_back,
           greatest(
             (select max(c.check_in_date) from public.daily_check_ins c where c.user_id = p.id),
             (select max(t.log_date) from public.training_logs t where t.user_id = p.id)
           ) as on_day
      from public.profiles p
     where not exists (
       -- The unique index makes a second insert impossible; this makes the
       -- query not bother offering one.
       select 1 from public.notifications n
        where n.user_id = p.id and n.dedupe_key = 'win_back'
     )
  ),
  bests as (
    select b.user_id,
           m.key as metric,
           (m.value)::text::numeric as value,
           b.test_date,
           row_number() over (
             partition by b.user_id
             order by (m.value)::text::numeric desc, b.test_date desc
           ) as rank
      from public.strength_benchmarks b
      cross join lateral jsonb_each(b.metrics) as m(key, value)
     where m.key like '%\_1rm'
       and jsonb_typeof(m.value) = 'number'
       and (m.value)::text::numeric > 0
  ),
  streaks as (
    -- The longest run of consecutive check-in days: number the days, subtract
    -- the row number, and every unbroken run shares one value to group on.
    select user_id, max(run) as longest
      from (
        select user_id, count(*) as run
          from (
            select c.user_id,
                   c.check_in_date
                     - (row_number() over (partition by c.user_id order by c.check_in_date))::int as grp
              from (select distinct user_id, check_in_date from public.daily_check_ins) c
          ) marked
         group by user_id, grp
      ) runs
     group by user_id
  )
  select s.id,
         s.full_name,
         s.on_day,
         (select count(*) from public.training_logs t where t.user_id = s.id),
         coalesce(st.longest, 0)::int,
         bt.metric,
         bt.value,
         bt.test_date,
         s.email_win_back
    from seen s
    left join bests bt on bt.user_id = s.id and bt.rank = 1
    left join streaks st on st.user_id = s.id
   where s.on_day is not null
     and current_date - s.on_day >= p_after
     and current_date - s.on_day <= p_until
   order by s.on_day desc;
end;
$$;

revoke execute on function public.win_back_candidates(int, int) from public, anon, authenticated;
grant execute on function public.win_back_candidates(int, int) to service_role;

notify pgrst, 'reload schema';
