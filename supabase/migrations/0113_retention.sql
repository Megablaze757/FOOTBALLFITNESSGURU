-- =============================================================================
-- 0113: Retention — who came back, and when they stopped.
--
-- =============================================================================
-- THE APP COULD MEASURE EVERY STEP UP TO THE FRONT DOOR AND NOTHING AFTER IT.
--
-- 0045 added funnel_events and its twelve names are every one about arriving:
-- signup, onboarded, first_check_in, paywall_hit, checkout_complete. The last
-- thing this database knows about an athlete is the moment they first checked
-- in. Whether anybody was still there a fortnight later has never been a
-- question it could answer.
--
-- That is the wrong half to have instrumented. A funnel answers "why don't
-- more people arrive"; the answer to "why isn't this growing" is far more
-- often that the people who already arrived left.
--
-- NO NEW TABLE, AND THAT IS THE POINT. Retention is not a thing to start
-- recording from today — it is a question about what is already stored, and
-- the answer for every account that ever existed is sitting in daily_check_ins
-- and training_logs right now. A new events table would have answered it for
-- accounts created after this migration and left the existing ones, which are
-- the only ones there are, permanently unmeasurable.
--
-- WHAT COUNTS AS BEING HERE is settled and this does not get a second opinion.
-- 0098 replaced "last sign-in" with the later of a check-in and a training
-- log, because a session refresh counts as a sign-in and so does opening the
-- app and closing it again. The same definition is used here; a second one
-- would give two admin screens that disagree about who is active.
--
-- ADMIN ONLY, and not because the numbers are sensitive in aggregate — because
-- the rows are not aggregate. One row per account with every day that account
-- logged something is a training diary, and 0046 already had to close exactly
-- this hole on funnel_summary after it shipped readable by anyone signed in.
-- =============================================================================

drop function if exists public.retention_accounts();

create function public.retention_accounts()
returns table (
  user_id uuid,
  joined date,
  -- Sorted and de-duplicated: the app treats it as a set, and sending the same
  -- day twice because somebody logged two sessions would be pure noise on the
  -- wire. array_agg(distinct ... order by ...) does both in the database.
  active_days date[]
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
  select p.id,
         u.created_at::date,
         coalesce((
           select array_agg(distinct d order by d)
             from (
               select c.check_in_date as d
                 from public.daily_check_ins c
                where c.user_id = p.id
               union
               select t.log_date
                 from public.training_logs t
                where t.user_id = p.id
             ) days
         ), '{}'::date[])
    from public.profiles p
    join auth.users u on u.id = p.id
   order by u.created_at;
end;
$$;

revoke all on function public.retention_accounts() from public, anon;
grant execute on function public.retention_accounts() to authenticated;

-- -----------------------------------------------------------------------------
-- The same question in one row, for anything that cannot hold the whole set.
--
-- The Worker sends the weekly digest and has no room to pull every athlete's
-- training days across the wire to count them. This does the counting in the
-- database and hands back four numbers.
--
-- THE THIRTY-DAY LINE IS NOT ARBITRARY. lib/checkin-reminder.ts stops emailing
-- at thirty days of silence, and its reasoning is sound: nobody is brought
-- back by the thirtieth identical email, and continuing to send them is how a
-- domain earns a spam reputation. The consequence, never written down until
-- now, is that everybody past that line is out of contact permanently. This
-- counts them, which is the first step to that being a decision rather than an
-- accident.
-- -----------------------------------------------------------------------------
drop function if exists public.retention_standing();

create function public.retention_standing()
returns table (
  accounts bigint,
  active_7d bigint,
  slipping bigint,
  lapsed bigint,
  never_started bigint
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
  with last_seen as (
    select p.id,
           greatest(
             (select max(c.check_in_date) from public.daily_check_ins c where c.user_id = p.id),
             (select max(t.log_date) from public.training_logs t where t.user_id = p.id)
           ) as on_day
      from public.profiles p
  )
  select count(*)::bigint,
         count(*) filter (where on_day is not null and current_date - on_day <= 7)::bigint,
         count(*) filter (where on_day is not null
                            and current_date - on_day > 7
                            and current_date - on_day <= 30)::bigint,
         count(*) filter (where on_day is not null and current_date - on_day > 30)::bigint,
         count(*) filter (where on_day is null)::bigint
    from last_seen;
end;
$$;

revoke all on function public.retention_standing() from public, anon;
grant execute on function public.retention_standing() to authenticated;
