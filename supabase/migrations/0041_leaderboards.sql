-- =============================================================================
-- 0041: Leaderboard data.
--
-- RLS correctly stops one athlete reading another's check-ins, so a leaderboard
-- can't be assembled client-side. This returns ONLY what a board needs —
-- a display name and a handful of counts — never the underlying health data.
--
-- PRIVACY: a global board shows your first name and your activity to strangers,
-- which nobody agreed to when they signed up. So:
--   * first name only, never the full name or email;
--   * profiles.leaderboard_opt_out lets anyone remove themselves;
--   * nothing about pain, injuries, weight or body composition is exposed —
--     the boards rank consistency and work done, which are not sensitive.
-- =============================================================================

alter table public.profiles
  add column if not exists leaderboard_opt_out boolean not null default false;

create or replace function public.leaderboard_stats(p_scope text default 'world')
returns table (
  user_id uuid,
  name text,
  check_ins_7 int,
  avg_sleep numeric,
  sessions_7 int,
  minutes_7 int,
  completed_7 int,
  streak int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_since date := current_date - 6;
begin
  if auth.uid() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with people as (
    select p.id, coalesce(split_part(nullif(trim(p.full_name), ''), ' ', 1), 'Athlete') as first_name
      from public.profiles p
     where p.leaderboard_opt_out = false
       and (
         p_scope <> 'squad'
         -- Squad = people who share an accepted coach with you, plus you.
         or p.id = auth.uid()
         or exists (
           select 1 from public.coach_athletes a
             join public.coach_athletes b on b.coach_id = a.coach_id and b.status = 'accepted'
            where a.athlete_id = auth.uid() and a.status = 'accepted' and b.athlete_id = p.id
         )
         or exists (
           select 1 from public.coach_athletes c
            where c.coach_id = auth.uid() and c.athlete_id = p.id and c.status = 'accepted'
         )
       )
  )
  select
    pe.id,
    pe.first_name::text,
    coalesce((select count(*)::int from public.daily_check_ins d
               where d.user_id = pe.id and d.check_in_date >= v_since), 0),
    (select round(avg(d.sleep_quality), 2) from public.daily_check_ins d
      where d.user_id = pe.id and d.check_in_date >= v_since and d.sleep_quality is not null),
    coalesce((select count(*)::int from public.training_logs t
               where t.user_id = pe.id and t.log_date >= v_since), 0),
    coalesce((select sum(t.total_minutes)::int from public.training_logs t
               where t.user_id = pe.id and t.log_date >= v_since), 0),
    -- Sessions ticked off recently. completed_sessions has no timestamps, so
    -- this counts the whole active block rather than inventing a weekly figure.
    coalesce((select cardinality(pr.completed_sessions) from public.programs pr
               where pr.user_id = pe.id and pr.status = 'active' limit 1), 0),
    -- Streak: consecutive days back from today.
    coalesce((
      select count(*)::int from (
        select d.check_in_date,
               row_number() over (order by d.check_in_date desc) as rn
          from public.daily_check_ins d
         where d.user_id = pe.id and d.check_in_date <= current_date
      ) s
      where s.check_in_date = current_date - (s.rn - 1)
    ), 0)
  from people pe;
end;
$$;

revoke execute on function public.leaderboard_stats(text) from public, anon;
grant execute on function public.leaderboard_stats(text) to authenticated;

notify pgrst, 'reload schema';
