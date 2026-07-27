-- =============================================================================
-- 0046: Make the funnel RPCs refuse non-admins outright.
--
-- 0045 gated them with `and public.is_admin()` inside the query, which leaks
-- nothing — a non-admin got no rows from funnel_summary and a row of zeros per
-- day from funnel_daily. But "zero" and "not allowed" are different answers,
-- and a caller can't tell them apart. The first time that matters is the first
-- time someone reads an empty funnel as "nobody signed up" rather than "you
-- aren't an admin".
--
-- Refuse loudly instead, the way leaderboard_stats already refuses anon.
-- =============================================================================

create or replace function public.funnel_summary(p_days int default 30)
returns table (event text, people int, occurrences int)
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
  select e.event,
         count(distinct e.user_id)::int,
         count(*)::int
    from public.funnel_events e
   where e.created_at >= now() - make_interval(days => greatest(1, least(365, p_days)))
   group by e.event;
end;
$$;

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
    left join public.funnel_events e on e.created_at::date = d::date
   group by d
   order by d;
end;
$$;

revoke all on function public.funnel_summary(int) from public, anon;
revoke all on function public.funnel_daily(int) from public, anon;
grant execute on function public.funnel_summary(int) to authenticated;
grant execute on function public.funnel_daily(int) to authenticated;

notify pgrst, 'reload schema';
