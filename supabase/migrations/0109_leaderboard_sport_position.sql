-- =============================================================================
-- 0109 — leaderboards you can actually win, and a streak that agrees with the
-- one on your own screen.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- A GLOBAL BOARD IS A BOARD ALMOST NOBODY IS ON.
--
-- Every board here is world-or-squad. World means one list for everybody, so
-- the top ten is the same ten people every week and the other ninety percent
-- are looking at strangers they will never catch. Squad means the athletes who
-- share a coach with you, which is empty for anyone who does not have one.
--
-- The interesting boards are the ones where the field is people like you:
-- other centre backs, other footballers. They are smaller, so a normal person
-- can be near the top of one — and being near the top of something is the
-- entire mechanism a leaderboard runs on.
--
-- Filtered in the app rather than here, because the same fetch then serves
-- world, sport and position: switching between them is instant, and it is one
-- round trip on a screen people open daily rather than three.
--
-- WHAT THIS DISCLOSES. Sport and position, for athletes who are already on a
-- leaderboard by their own choice — leaderboard_opt_out is checked in the same
-- query. It is the field they are being ranked against, which is the one piece
-- of context that makes a rank mean anything.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- AND THE STREAK COLUMN, which exists for the reason migration 0105 added xp.
--
-- Streaks now survive one missed day if the athlete has earned a rest day
-- (lib/load.ts). That rule is in the app, and reimplementing it in plpgsql
-- would put two copies of a scoring rule in the product — the exact mistake
-- 0105 refused to make with XP, which is how a badge and a rewards screen end
-- up disagreeing. So the athlete's own client publishes the number, the same
-- way and in the same write.
--
-- The old SQL computation stays as the fallback for anybody who has not
-- published yet. It is the strict rule, so it can only ever UNDERSTATE the
-- streak — never invent one. A board showing a slightly short streak until the
-- next visit is a much smaller problem than a board showing zero for everybody
-- who has not opened Rewards since this shipped.
-- =============================================================================

alter table public.profiles
  add column if not exists streak int;

comment on column public.profiles.streak is
  'Published by the athlete''s own client — see lib/xp-publish.ts. Null means '
  'never published, which is NOT zero: leaderboard_stats falls back to the '
  'strict SQL count, which can understate but never overstate.';

-- The return type gains three columns, and a return type cannot be replaced in
-- place. Same reason 0105 dropped it.
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
  xp int,
  sport text,
  -- QUOTED, AND IT HAS TO BE.
  --
  -- `position` is a reserved word in Postgres — POSITION(x IN y) is SQL
  -- standard function syntax — so an unquoted `position text` in a RETURNS
  -- TABLE list is a syntax error, not a column. It fails at CREATE FUNCTION
  -- time with `42601: syntax error at or near "position"`, which is a paste
  -- that stops halfway rather than a database that quietly behaves oddly.
  --
  -- Quoted lowercase is the SAME identifier as unquoted lowercase, so
  -- PostgREST still exposes it as `position` and the client's select is
  -- unchanged. lib/sql-reserved.test.ts now checks every migration for this.
  "position" text
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
           p.xp as lifetime_xp,
           p.streak as published_streak,
           p.sport as sport,
           p.position as "position"
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
    -- Published if we have it, the strict count if we do not. See the note at
    -- the top: the fallback understates and never overstates, which is the only
    -- direction a streak is allowed to be wrong in.
    coalesce(pe.published_streak, (
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
    -- than the Iron one migration 0105 exists to stop.
    pe.lifetime_xp,
    pe.sport::text,
    pe."position"::text
  from people pe;
end;
$$;

revoke execute on function public.leaderboard_stats(text) from public, anon;
grant execute on function public.leaderboard_stats(text) to authenticated;

notify pgrst, 'reload schema';
