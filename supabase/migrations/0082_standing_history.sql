-- =============================================================================
-- 0082 — how long someone has held a standing, and who is not competing.
--
-- Elite and Apex are held rather than reached, so the badges for them count
-- days. That needs a record: a standing is computed fresh on every page load
-- and forgotten, which cannot answer "was this athlete number one for a week?"
--
-- ONE ROW PER PERSON PER DAY. Not a log of every check — the question is which
-- days they held it, so a second visit on the same day is the same fact.
--
-- THE OWNER IS NOT COMPETING. An admin account sits on the ladder by accident:
-- it exists to run the business, it is the first account on the system, and on
-- a small ladder it would hold "no. 1 in the world" permanently by default —
-- which makes the title worthless for everybody else. Admins are removed from
-- both the population count and the ranking, so 100 athletes means 100 real
-- athletes and the top spot belongs to whoever actually earned it.
--
-- They still gain XP and levels exactly as before. Levels are climbed alone;
-- only the two standings compare people, and only those are affected.
-- =============================================================================

create table if not exists public.ladder_standing_log (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day     date not null default current_date,
  -- `standing_tier`, not `tier`: plain `tier` invites confusion with
  -- subscriptions.tier, which is a plan and not a rank.
  standing_tier text not null check (standing_tier in ('Elite', 'Apex')),
  primary key (user_id, day)
);

alter table public.ladder_standing_log enable row level security;

drop policy if exists "standing log: read own" on public.ladder_standing_log;
create policy "standing log: read own" on public.ladder_standing_log
  for select to authenticated using (user_id = auth.uid());

-- No insert policy on purpose. Rows arrive only through the function below,
-- which decides for itself whether the standing is real — a client that could
-- write here could award itself a week at number one.

-- --- Recording today ---------------------------------------------------------------

create or replace function public.record_ladder_standing()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id      uuid := auth.uid();
  v_total   int;
  v_place   int;
  v_onepct  int;
  v_tier    text;
begin
  if v_id is null then
    raise exception 'sign in' using errcode = '42501';
  end if;

  -- THE STANDING IS RECOMPUTED HERE, not taken from the caller. The client
  -- already knows its own standing, but a badge worth having cannot be awarded
  -- on the client's say-so.
  select athletes, place into v_total, v_place from public.ladder_standing();

  -- Same floor as the client applies, for the same reason: "top 1%" of a dozen
  -- people is not a percentile. Below it nothing is recorded at all, so no
  -- badge can accrue days it did not earn.
  if v_total is null or v_total < 100 or v_place is null or v_place < 1 then
    return 'none';
  end if;

  v_onepct := greatest(1, ceil(v_total * 0.01)::int);
  v_tier := case when v_place = 1 then 'Apex'
                 when v_place <= v_onepct then 'Elite'
                 else null end;
  if v_tier is null then
    return 'none';
  end if;

  -- A day can only improve. Someone who was Elite this morning and number one
  -- by the evening held the top spot today; the reverse should not demote a day
  -- already earned, because they did hold it.
  insert into public.ladder_standing_log (user_id, day, standing_tier)
  values (v_id, current_date, v_tier)
  on conflict (user_id, day) do update
    set standing_tier = case
      when public.ladder_standing_log.standing_tier = 'Apex' then 'Apex'
      else excluded.standing_tier
    end;

  return v_tier;
end;
$$;

-- --- Counting the days -------------------------------------------------------------

create or replace function public.ladder_tier_days()
returns table (standing_tier text, days int, best_run int)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- Gaps and islands. `day - row_number()` is constant across consecutive days,
  -- so grouping on it yields each unbroken run — which is what "held Apex for a
  -- week" means. Total days is reported alongside, because seven days spread
  -- over three months is a different achievement and gets its own badge rather
  -- than being quietly counted as the same one.
  with runs as (
    select l.standing_tier,
           l.day,
           l.day - (row_number() over (partition by l.standing_tier order by l.day))::int as grp
      from public.ladder_standing_log l
     where l.user_id = auth.uid()
  ),
  islands as (
    select standing_tier, grp, count(*)::int as run_len
      from runs group by standing_tier, grp
  )
  select i.standing_tier,
         sum(i.run_len)::int as days,
         max(i.run_len)::int as best_run
    from islands i
   group by i.standing_tier
$$;

revoke all on function public.record_ladder_standing() from public, anon;
revoke all on function public.ladder_tier_days()       from public, anon;
grant execute on function public.record_ladder_standing() to authenticated;
grant execute on function public.ladder_tier_days()       to authenticated;

-- --- The owner is not on the ladder --------------------------------------------------
--
-- Replaces 0081. Admins are excluded from the population AND from the ranking,
-- so the count means "real athletes" and the top spot is somebody's to win.

create or replace function public.ladder_standing()
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
    select p.id,
           count(d.id)::int as score
      from public.profiles p
      left join public.daily_check_ins d on d.user_id = p.id
     where not coalesce(p.beta, false)
       -- Not competing: the account that runs the business would otherwise hold
       -- the top spot by default on a small ladder.
       and coalesce(p.role, '') <> 'admin'
     group by p.id
  ),
  ranked as (
    -- rank(), not row_number(): people on the same score share a position, so
    -- two athletes who are genuinely level are not ordered by whichever row
    -- came back first.
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

-- --- Did it take? ---------------------------------------------------------------------
-- Always returns one row. Reads only.

select (select count(*) from public.profiles
         where not coalesce(beta, false) and coalesce(role, '') <> 'admin') as athletes_competing,
       (select count(*) from public.profiles where coalesce(role, '') = 'admin') as admins_excluded,
       'OK - standing history installed, admins are off the ladder but keep their XP' as result;
