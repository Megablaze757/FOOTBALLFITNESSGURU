-- =============================================================================
-- 0079 — make the funnel answer the question it is asked.
--
-- Three separate problems, all of which made the report misleading rather than
-- merely incomplete.
--
-- 1. IT WAS NOT A FUNNEL. funnel_summary counted events inside a time window and
--    grouped by event. So "signup" was people who signed up in the last 30 days
--    and "onboarded" was people who onboarded in the last 30 days — different
--    groups. Someone who signed up in April and onboarded today counted toward
--    onboarded with no signup behind them; someone who signed up yesterday and
--    onboards tomorrow counts as a loss forever. Dividing one by the other, which
--    is exactly what the report does, compares two different populations and can
--    exceed 100%. Now it is a cohort: the people who SIGNED UP in the window, and
--    how far each of them subsequently got.
--
-- 2. BETA TESTERS PADDED IT. handle_new_user() sets profiles.beta = NOT launched,
--    so every pre-launch account carries the flag, and 0078 backfilled a signup
--    event for all of them. They were let in by hand, already knew the product,
--    and several were never going to walk the onboarding flow at all. Same call
--    as 0077 made for the revenue tiles: real people, worth counting, but not
--    inside a measurement of how strangers behave.
--
-- 3. "NEVER CONFIRMED" WAS INVISIBLE, and it is the whole question right now.
--    0078 started counting accounts that are created but never email-confirmed —
--    deliberately, because they are a real leak. But they sit inside Signed up ->
--    Onboarded and cannot possibly onboard, so that one number silently merges
--    two unrelated failures with opposite fixes: confirmation mail not arriving,
--    versus an onboarding flow people abandon. Splitting them is the difference
--    between fixing deliverability and redesigning a screen.
--
-- Nothing is deleted. This changes what the three admin RPCs count, so it is all
-- reversible and no history is lost.
-- =============================================================================

-- --- The cohort funnel -----------------------------------------------------------

create or replace function public.funnel_summary(p_days int default 30)
returns table (event text, people int, occurrences int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(1, least(365, p_days)));
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with cohort as (
    -- Everyone who signed up in the window and is not a tester. This is the
    -- denominator for every row below, which is what makes the percentages on
    -- the report mean something.
    select distinct e.user_id, min(e.created_at) as signed_up_at
      from public.funnel_events e
      join public.profiles p on p.id = e.user_id
     where e.event = 'signup'
       and e.created_at >= v_since
       -- coalesce because the column is nullable on rows predating it; null
       -- there means "not flagged as a tester", the safe reading.
       and not coalesce(p.beta, false)
     group by e.user_id
  ),
  -- A DERIVED STEP, not a tracked one. Nothing inserts 'confirmed_email' — it is
  -- read from auth.users, because confirming an email happens on Supabase's
  -- side and the app never sees the moment it does.
  confirmed as (
    select c.user_id
      from cohort c
      join auth.users u on u.id = c.user_id
     where u.email_confirmed_at is not null
  ),
  -- Steps the cohort actually reached. Bounded to at-or-after their own signup
  -- so a stray earlier row cannot credit somebody with a step they took in a
  -- previous life.
  reached as (
    select e.event, e.user_id, e.id
      from public.funnel_events e
      join cohort c on c.user_id = e.user_id
     where e.created_at >= c.signed_up_at
       and e.event <> 'signup'
  )
  -- EVERY STEP GETS A ROW, INCLUDING THE ZEROS.
  --
  -- Grouping alone omits steps nobody reached, which leaves the client unable to
  -- tell "nobody got here" from "this database is too old to know". Those need
  -- different handling — the first is a finding, the second is a gap — and
  -- worstStep now relies on the difference, so the honesty has to start here.
  select st.event,
         coalesce(v.people, 0)::int,
         coalesce(v.occurrences, 0)::int
    from (values
            ('signup'), ('confirmed_email'), ('onboarded'), ('first_check_in'),
            ('paywall_hit'), ('plan_view'), ('plan_cta'), ('checkout_start'),
            ('checkout_complete'), ('program_built'), ('first_session'),
            ('team_enquiry'), ('cancelled')
         ) as st(event)
    left join (
      select 'signup'::text as event, count(*)::int as people, count(*)::int as occurrences from cohort
      union all
      select 'confirmed_email'::text, count(*)::int, count(*)::int from confirmed
      union all
      select r.event, count(distinct r.user_id)::int, count(*)::int
        from reached r
       group by r.event
    ) v on v.event = st.event;
end;
$$;

-- --- The daily chart -------------------------------------------------------------
-- Still a per-day event count rather than a cohort — that is the right shape for
-- a trend line. Only the beta exclusion changes.

create or replace function public.funnel_daily(p_days int default 30)
returns table (day date, signups int, activated int, paid int)
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
  select d::date,
         count(*) filter (where e.event = 'signup')::int,
         count(*) filter (where e.event = 'first_check_in')::int,
         count(*) filter (where e.event = 'checkout_complete')::int
    from generate_series(
           current_date - (greatest(1, least(365, p_days)) - 1),
           current_date,
           interval '1 day') d
    -- The tester test lives in the JOIN, not a WHERE. In a WHERE it would turn
    -- this into an inner join and drop every day with no events, leaving holes
    -- in the chart instead of zeros.
    left join public.funnel_events e
           on e.created_at::date = d::date
          and exists (
                select 1 from public.profiles p
                 where p.id = e.user_id and not coalesce(p.beta, false)
              )
   group by d
   order by d;
end;
$$;

-- --- The first-run timings --------------------------------------------------------

create or replace function public.funnel_timing(p_days int default 30)
returns table (event text, median_seconds int, people int)
language sql
security definer
set search_path = public, pg_temp
as $$
  select e.event,
         percentile_cont(0.5) within group (
           order by (e.meta->>'since_signup_s')::numeric
         )::int                         as median_seconds,
         count(distinct e.user_id)::int as people
    from public.funnel_events e
    join public.profiles p on p.id = e.user_id
   where e.created_at >= now() - make_interval(days => greatest(1, least(365, p_days)))
     and e.meta ? 'since_signup_s'
     -- Guards against a malformed value turning the cast into an error for the
     -- whole query rather than one row.
     and e.meta->>'since_signup_s' ~ '^[0-9]+$'
     -- Backfilled rows are all since_signup_s = 0 by construction. Leaving them
     -- in would drag every median toward zero and make the first run look
     -- instant, which is worse than having no number at all.
     and not coalesce((e.meta->>'backfilled')::boolean, false)
     and not coalesce(p.beta, false)
   group by e.event
$$;

-- --- Where the losses actually are -------------------------------------------------
--
-- The report can already say "the biggest drop is here". What it could not say is
-- WHY, and for the first step the two causes need opposite fixes: an account that
-- never confirmed its email is a deliverability problem, one that confirmed and
-- stopped is a screen problem. This splits them, and counts how many are simply
-- still in flight — a signup from an hour ago is not a loss yet, and counting it
-- as one makes every rate look worse than it is.

create or replace function public.funnel_signup_breakdown(p_days int default 30)
returns table (bucket text, people int, note text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(1, least(365, p_days)));
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with cohort as (
    select e.user_id, min(e.created_at) as signed_up_at
      from public.funnel_events e
      join public.profiles p on p.id = e.user_id
     where e.event = 'signup' and e.created_at >= v_since
       and not coalesce(p.beta, false)
     group by e.user_id
  ),
  state as (
    select c.user_id,
           c.signed_up_at,
           (u.email_confirmed_at is not null) as confirmed,
           exists (
             select 1 from public.funnel_events e2
              where e2.user_id = c.user_id and e2.event = 'onboarded'
           ) as onboarded
      from cohort c
      left join auth.users u on u.id = c.user_id
  )
  select 'Onboarded'::text,
         count(*) filter (where onboarded)::int,
         'Got through the sport and position questions'::text
    from state
  union all
  select 'Never confirmed their email'::text,
         count(*) filter (where not confirmed)::int,
         'Cannot reach onboarding at all — this is a deliverability problem, not a UX one'::text
    from state
  union all
  select 'Confirmed, did not onboard'::text,
         count(*) filter (where confirmed and not onboarded and signed_up_at < now() - interval '24 hours')::int,
         'Reached the app and stopped. This is the one the onboarding screen owns'::text
    from state
  union all
  select 'Still in flight'::text,
         count(*) filter (where not onboarded and signed_up_at >= now() - interval '24 hours')::int,
         'Signed up in the last 24 hours — too early to call a loss'::text
    from state;
end;
$$;

revoke all on function public.funnel_summary(int)           from public, anon;
revoke all on function public.funnel_daily(int)             from public, anon;
revoke all on function public.funnel_timing(int)            from public, anon;
revoke all on function public.funnel_signup_breakdown(int)  from public, anon;
grant execute on function public.funnel_summary(int)          to authenticated;
grant execute on function public.funnel_daily(int)            to authenticated;
grant execute on function public.funnel_timing(int)           to authenticated;
grant execute on function public.funnel_signup_breakdown(int) to authenticated;

notify pgrst, 'reload schema';

-- --- Did it take? -----------------------------------------------------------------
-- Always returns one row. Reads only.

select (select count(*) from public.profiles)                                 as profiles,
       (select count(*) from public.profiles where coalesce(beta, false))     as beta_testers,
       (select count(*) from public.profiles where not coalesce(beta, false)) as real_users,
       'OK - funnel is cohort-based, excludes testers, and splits the first drop' as result;
