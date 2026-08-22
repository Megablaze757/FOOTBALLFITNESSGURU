-- =============================================================================
-- 0096: A ceiling on what the WHOLE APP can spend on AI in a month.
--
-- 0035 capped spend per user per month, scaled to what that user pays. That is
-- the right control for one athlete and no control at all for the bill: every
-- new signup adds its own allowance, so the total is
--
--     users x TIER_BUDGET
--
-- which has no maximum. Five hundred silver subscribers can authorise $1,500 of
-- model spend a month without a single one of them going over their limit, and
-- nothing in the system would notice until the invoice arrived. Free accounts
-- are worse, not better: they bring $0.40 of allowance each and no revenue, so
-- a burst of signups — organic or not — is a bill with no income beside it.
--
-- The fix is one number the Worker can check before every call: what the app
-- has spent this month, across everybody. `check_ai_budget` already runs on
-- that path and already reads this table, so it returns the total too and the
-- ceiling costs no extra round trip.
--
-- The ceiling itself lives in the Worker (MONTHLY_BUDGET_USD), not here — it is
-- a business decision that changes with revenue, and changing it should be an
-- edit in the Cloudflare dashboard rather than a migration.
-- =============================================================================

-- The sum is over one month across all users, and the primary key is
-- (user_id, period) — leading with user_id, so it cannot serve this. Cheap now
-- and the difference between a scan and a lookup at ten thousand rows.
create index if not exists ai_spend_period_idx on public.ai_spend (period);

-- --- check before the call ---------------------------------------------------
-- Same contract as 0035 with one column added: `app_spent`, the whole app's
-- spend for the current month.
--
-- A NEW COLUMN AND NOT A NEW FUNCTION, so a Worker that has not been repasted
-- keeps working — it reads the fields it knows by name and ignores this one.
-- The reverse is also safe: a Worker deployed BEFORE this migration is applied
-- reads `app_spent` as undefined, which it treats as nothing spent, so the
-- app-wide ceiling simply does not bite yet. Both are deployed by hand here,
-- and in either order, so neither order may break the app.
--
-- Dropped first because the return type changes, and `create or replace` cannot
-- change a function's signature.
drop function if exists public.check_ai_budget(uuid, numeric, int);
create or replace function public.check_ai_budget(
  p_user uuid,
  p_budget numeric,
  p_daily_limit int
)
returns table (allowed boolean, spent numeric, calls_today int, app_spent numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spent numeric;
  v_today int;
  v_app numeric;
  v_period date := date_trunc('month', current_date)::date;
begin
  select coalesce(s.cost_usd, 0) into v_spent
    from public.ai_spend s
   where s.user_id = p_user and s.period = v_period;
  v_spent := coalesce(v_spent, 0);

  select coalesce(u.count, 0) into v_today
    from public.ai_usage u
   where u.user_id = p_user and u.usage_date = current_date;
  v_today := coalesce(v_today, 0);

  select coalesce(sum(s.cost_usd), 0) into v_app
    from public.ai_spend s
   where s.period = v_period;
  v_app := coalesce(v_app, 0);

  return query select
    (v_spent < p_budget and v_today < p_daily_limit),
    v_spent,
    v_today,
    v_app;
end;
$$;

-- Same lockdown as 0035: the default grant is to PUBLIC, which would let any
-- authenticated user bill another athlete's budget. Re-applied because the drop
-- above took the old grants with it.
revoke execute on function public.check_ai_budget(uuid, numeric, int) from public, anon, authenticated;
grant execute on function public.check_ai_budget(uuid, numeric, int) to service_role;

-- --- what the app has spent, for the admin page ------------------------------
-- admin_ai_spend() already lists spend per user and the total could be summed
-- from it. This exists because the number the ceiling acts on must be read from
-- the same expression the ceiling uses — a total the admin page computes its
-- own way is a total that can disagree with the one doing the enforcing.
create or replace function public.admin_app_ai_spend()
returns table (period date, cost_usd numeric, calls bigint, users bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select s.period,
         coalesce(sum(s.cost_usd), 0)::numeric,
         coalesce(sum(s.calls), 0)::bigint,
         count(*)::bigint
    from public.ai_spend s
   where s.period >= (date_trunc('month', current_date) - interval '5 months')::date
   group by s.period
   order by s.period desc;
end;
$$;

revoke execute on function public.admin_app_ai_spend() from public, anon;
grant execute on function public.admin_app_ai_spend() to authenticated;

notify pgrst, 'reload schema';
