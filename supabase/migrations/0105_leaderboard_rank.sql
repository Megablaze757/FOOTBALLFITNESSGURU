-- =============================================================================
-- The rank badge on the leaderboard said Iron for everybody.
--
-- WHAT WAS WRONG. Leaderboards.tsx builds an ActivityStats out of what
-- leaderboard_stats() returns — which is SEVEN DAYS of activity — and runs
-- computeXp() on it. That is a week's XP, a few hundred at most, and a few
-- hundred XP is level 1. So every athlete on the board wore an Iron badge
-- regardless of what they had actually done, including the ones who are Gold.
--
-- WHY NOT COMPUTE IT IN SQL. The XP sum has ten terms and nine of them are
-- counts this function could do. The tenth is strengthTiers at 60 XP each,
-- which comes out of the bodyweight-relative strength standards in
-- lib/strength-standards.ts — a table of tiers per lift per bodyweight that
-- would have to be duplicated here and kept in step forever. Two copies of a
-- scoring rule is how the badge and the rewards screen end up disagreeing,
-- which is a worse bug than the one being fixed.
--
-- SO THE ATHLETE'S OWN CLIENT WRITES IT. The rewards screen already computes
-- the real number, from the real lifetime stats, with the one implementation.
-- It now stores it, and the leaderboard reads it back.
--
-- NULL IS NOT ZERO. An athlete who has not opened Rewards since this shipped
-- has no stored XP, and that is different from having none. The column is
-- nullable and the app draws NO badge rather than an Iron one — the same
-- mistake in the other direction is what this migration exists to undo.
-- =============================================================================

alter table public.profiles
  add column if not exists xp integer check (xp is null or xp >= 0);

comment on column public.profiles.xp is
  'Lifetime XP, computed by the athlete''s own client (see computeXp in lib/gamification.ts). Null means never computed — not zero.';

-- --- Give the leaderboard the number ------------------------------------------
--
-- Added to the existing return type rather than a second round trip: the board
-- already asks for every athlete once, and a badge that needs its own query per
-- row is a badge that will not render.

drop function if exists public.leaderboard_stats(text);

create function public.leaderboard_stats(p_scope text default 'world')
returns table (
  user_id uuid,
  name text,
  check_ins_7 int,
  avg_sleep numeric,
  sessions_7 int,
  minutes_7 int,
  completed_7 int,
  streak int,
  xp int
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
    select p.id,
           coalesce(
             nullif(trim(p.username), ''),
             split_part(nullif(trim(p.full_name), ''), ' ', 1),
             'Athlete'
           ) as display_name,
           p.xp as lifetime_xp
      from public.profiles p
     where p.leaderboard_opt_out = false
       and (
         p_scope <> 'squad'
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
    pe.display_name::text,
    coalesce((select count(*)::int from public.daily_check_ins d
               where d.user_id = pe.id and d.check_in_date >= v_since), 0),
    (select round(avg(d.sleep_quality), 2) from public.daily_check_ins d
      where d.user_id = pe.id and d.check_in_date >= v_since and d.sleep_quality is not null),
    coalesce((select count(*)::int from public.training_logs t
               where t.user_id = pe.id and t.log_date >= v_since), 0),
    coalesce((select sum(t.total_minutes)::int from public.training_logs t
               where t.user_id = pe.id and t.log_date >= v_since), 0),
    coalesce((select case
                       when jsonb_typeof(pr.completed_sessions) = 'array'
                         then jsonb_array_length(pr.completed_sessions)
                       else 0
                     end
                from public.programs pr
               where pr.user_id = pe.id and pr.status = 'active' limit 1), 0),
    coalesce((
      select count(*)::int from (
        select d.check_in_date,
               row_number() over (order by d.check_in_date desc) as rn
          from public.daily_check_ins d
         where d.user_id = pe.id and d.check_in_date <= current_date
      ) s
      where s.check_in_date = current_date - ((s.rn - 1))::int
    ), 0),
    -- NOT coalesced to zero. Null means nobody has ever told us, which is a
    -- different thing from no XP, and the app draws no badge for it rather
    -- than the Iron one this migration exists to stop.
    pe.lifetime_xp
  from people pe;
end;
$$;

revoke execute on function public.leaderboard_stats(text) from public, anon;
grant execute on function public.leaderboard_stats(text) to authenticated;

notify pgrst, 'reload schema';
