-- =============================================================================
-- 0080 — what it costs, and who the users actually are.
--
-- Two questions the admin screen could not answer.
--
-- COST. ai_spend already records cost_usd per user per month, written by the
-- service role as calls are made, so the largest variable cost in this system is
-- measured and was simply never displayed. Everything else is a subscription
-- fee, which no database can observe — those live in lib/costs.ts as clearly
-- labelled estimates. This function returns only the parts that are real.
--
-- WHO. total_users is one number that answers nothing. Which sports people
-- picked decides which programs are worth deepening; how many never finished
-- onboarding decides whether that flow needs work; how many have gone quiet
-- decides whether retention or acquisition is the problem this month.
--
-- Both are aggregates only, admin-gated, and neither can return anything that
-- identifies a person — same rule as 0046 set for the funnel.
-- =============================================================================

-- --- The measured part of the bill ------------------------------------------------

create or replace function public.admin_costs()
returns table (
  ai_spend_usd numeric,
  ai_calls int,
  paid_subs int,
  videos_this_month int,
  emails_sent int
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
  select
    -- date_trunc rather than "last 30 days": ai_spend.period is the first of the
    -- month by construction, so anything else would silently match nothing.
    coalesce((select sum(s.cost_usd) from public.ai_spend s
               where s.period = date_trunc('month', current_date)::date), 0)::numeric,
    coalesce((select sum(s.calls)::int from public.ai_spend s
               where s.period = date_trunc('month', current_date)::date), 0),
    -- Stripe-backed only. A comped account is not a card charge, so counting it
    -- here would invent a fee that nobody is paying.
    coalesce((select count(*)::int from public.subscriptions
               where status = 'active' and stripe_subscription_id is not null), 0),
    coalesce((select count(*)::int from public.videos
               where created_at >= date_trunc('month', current_date)), 0),
    coalesce((select count(*)::int from public.waitlist
               where launch_emailed_at >= date_trunc('month', current_date)), 0);
end;
$$;

-- --- Who the users are --------------------------------------------------------------

create or replace function public.admin_user_breakdown()
returns table (dimension text, label text, people int)
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
  -- BY SPORT. Decides which programs are worth deepening. 'Not set' is kept as
  -- its own row rather than dropped: a large one means people are getting past
  -- signup without ever telling us what they play, which is a finding.
  select 'sport'::text,
         coalesce(nullif(trim(p.sport), ''), 'Not set')::text,
         count(*)::int
    from public.profiles p
   where not coalesce(p.beta, false)
   group by 1, 2

  union all

  -- BY PLAN. The revenue mix, and how much of the base is free.
  select 'plan'::text,
         case
           when s.stripe_subscription_id is not null and s.tier = 'gold'   then 'Gold'
           when s.stripe_subscription_id is not null and s.tier = 'silver' then 'Silver'
           when s.id is not null                                           then 'Comped'
           else 'Free'
         end::text,
         count(*)::int
    from public.profiles p
    left join public.subscriptions s
           on s.user_id = p.id and s.status = 'active'
   where not coalesce(p.beta, false)
   group by 2

  union all

  -- BY LIFE SIGNS. Acquisition and retention are different problems with
  -- different fixes, and "total users" cannot tell them apart. Buckets are on
  -- last check-in because that is the habit the product is trying to build.
  select 'activity'::text,
         case
           when c.last_seen is null                              then 'Never checked in'
           when c.last_seen >= current_date - 7                  then 'Active this week'
           when c.last_seen >= current_date - 30                 then 'Active this month'
           else 'Gone quiet'
         end::text,
         count(*)::int
    from public.profiles p
    left join (
      select user_id, max(check_in_date) as last_seen
        from public.daily_check_ins group by user_id
    ) c on c.user_id = p.id
   where not coalesce(p.beta, false)
   group by 2;
end;
$$;

revoke all on function public.admin_costs()          from public, anon;
revoke all on function public.admin_user_breakdown() from public, anon;
grant execute on function public.admin_costs()          to authenticated;
grant execute on function public.admin_user_breakdown() to authenticated;

notify pgrst, 'reload schema';

-- --- Did it take? -------------------------------------------------------------------
-- Always returns one row. Reads only.

select 'OK - admin_costs and admin_user_breakdown installed' as result,
       (select count(*) from public.profiles where not coalesce(beta, false)) as real_users;
