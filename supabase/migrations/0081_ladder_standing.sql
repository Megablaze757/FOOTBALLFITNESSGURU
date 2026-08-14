-- =============================================================================
-- 0081 — where an athlete stands against everybody else.
--
-- The two ranks above Legend — Elite ("top 1%") and Apex ("no. 1 in the world")
-- — are the only ones that make a claim about other people. They cannot be
-- computed from one athlete's XP, so the client needs two numbers it has no
-- other way to get: how many athletes are on the ladder, and where this one
-- sits.
--
-- NOTHING IDENTIFYING COMES BACK. Two integers. Not a name, not an id, not the
-- person above or below — a rank badge does not need to know who anybody else
-- is, and an endpoint that returns a sorted list of everyone is a leaderboard
-- scrape waiting to happen. Same rule 0046 set for the funnel.
--
-- THE FLOOR IS ENFORCED IN THE CLIENT, NOT HERE, and deliberately: this returns
-- the honest population and lets lib/gamification.ts decide what it entitles
-- anyone to. Putting the threshold in both places is how they drift apart.
-- =============================================================================

create or replace function public.ladder_standing()
-- `place`, not `position`. position() is a built-in function in Postgres and a
-- column of that name is a syntax error at CREATE time — the same reserved-word
-- trap that 0075 hit with `window`. The client maps it back to `position`.
returns table (athletes int, place int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := auth.uid();
begin
  if v_id is null then
    raise exception 'sign in' using errcode = '42501';
  end if;

  return query
  with scored as (
    -- XP is derived on the client from activity, and duplicating that formula
    -- in SQL would give two answers to one question. Total check-ins is the
    -- closest thing the database owns to the same ordering, and it is the
    -- measure the leaderboards already rank on.
    select p.id,
           count(d.id)::int as score
      from public.profiles p
      left join public.daily_check_ins d on d.user_id = p.id
     where not coalesce(p.beta, false)
     group by p.id
  ),
  ranked as (
    -- rank(), not row_number(): people on the same score share a position, so
    -- two athletes who are genuinely level are not silently ordered by whose
    -- row came back first. Someone tied for first is tied for first.
    select s.id, rank() over (order by s.score desc) as pos
      from scored s
  )
  select (select count(*)::int from scored),
         coalesce((select r.pos::int from ranked r where r.id = v_id), 0);
end;
$$;

revoke all on function public.ladder_standing() from public, anon;
grant execute on function public.ladder_standing() to authenticated;

notify pgrst, 'reload schema';

-- --- Did it take? -----------------------------------------------------------------
-- Always returns one row. Reads only.

select (select count(*) from public.profiles where not coalesce(beta, false)) as athletes_on_ladder,
       case
         when (select count(*) from public.profiles where not coalesce(beta, false)) >= 100
           then 'OK - installed, and there are enough athletes for the top 1% to mean something'
         else 'OK - installed. Below 100 athletes the top two ranks stay unawarded, by design'
       end as result;
