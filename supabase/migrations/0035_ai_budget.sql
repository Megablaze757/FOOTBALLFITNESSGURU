-- =============================================================================
-- 0035: Cap AI spend in MONEY, per user per month.
--
-- 0017 capped calls per day, which protects against nothing that matters:
--   * 40 calls/day is 40 calls/day whether each costs $0.0004 or $0.08. Swap
--     OPENROUTER_MODEL for a frontier model and the bill goes up 20x with the
--     cap unchanged.
--   * A free bronze user got exactly the same allowance as a £20 gold user, so
--     the worst case was unbounded by revenue.
--   * There was no monthly ceiling at all — 40/day is ~1,240 calls a month.
--
-- Cost is now recorded per request from the provider's own token counts, and
-- checked against a per-tier monthly budget before each call. The daily call
-- cap stays as a rate limiter: a cost cap alone still permits tens of thousands
-- of tiny requests, which is a denial-of-service on your account rather than a
-- bill.
-- =============================================================================

create table if not exists public.ai_spend (
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- First day of the month, so a row is one billing period.
  period date not null,
  calls int not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, period)
);

alter table public.ai_spend enable row level security;

-- Users may see their own spend; only the service role writes it.
drop policy if exists "ai_spend: read own" on public.ai_spend;
create policy "ai_spend: read own" on public.ai_spend for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "ai_spend: admin read" on public.ai_spend;
create policy "ai_spend: admin read" on public.ai_spend for select to authenticated
  using (public.is_admin());

-- --- check before the call ---------------------------------------------------
-- Returns whether the user is under budget AND under the daily call cap, plus
-- the numbers behind that decision so the caller can report them.
--
-- Deliberately does NOT increment: the cost isn't known until the provider
-- answers. A user can therefore exceed the budget by at most one request, which
-- is bounded and tiny — versus reserving an estimate up front, which would
-- overcharge every short request.
create or replace function public.check_ai_budget(
  p_user uuid,
  p_budget numeric,
  p_daily_limit int
)
returns table (allowed boolean, spent numeric, calls_today int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spent numeric;
  v_today int;
begin
  select coalesce(s.cost_usd, 0) into v_spent
    from public.ai_spend s
   where s.user_id = p_user and s.period = date_trunc('month', current_date)::date;
  v_spent := coalesce(v_spent, 0);

  select coalesce(u.count, 0) into v_today
    from public.ai_usage u
   where u.user_id = p_user and u.usage_date = current_date;
  v_today := coalesce(v_today, 0);

  return query select
    (v_spent < p_budget and v_today < p_daily_limit),
    v_spent,
    v_today;
end;
$$;

-- --- record after the call ---------------------------------------------------
-- Called with the ACTUAL cost once the provider has answered. Free-tier models
-- record a zero cost but still count toward the daily call cap, which is what
-- stops "it's free" becoming "it's unlimited".
create or replace function public.record_ai_spend(p_user uuid, p_cost numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ai_spend (user_id, period, calls, cost_usd, updated_at)
       values (p_user, date_trunc('month', current_date)::date, 1, greatest(coalesce(p_cost, 0), 0), now())
  on conflict (user_id, period) do update
      set calls = ai_spend.calls + 1,
          cost_usd = ai_spend.cost_usd + greatest(coalesce(p_cost, 0), 0),
          updated_at = now();

  insert into public.ai_usage (user_id, usage_date, count)
       values (p_user, current_date, 1)
  on conflict (user_id, usage_date) do update set count = ai_usage.count + 1;
end;
$$;

-- Same lockdown as 0019: the default grant is to PUBLIC, which would let any
-- authenticated user bill another athlete's budget or clear their own.
revoke execute on function public.check_ai_budget(uuid, numeric, int) from public, anon, authenticated;
grant execute on function public.check_ai_budget(uuid, numeric, int) to service_role;
revoke execute on function public.record_ai_spend(uuid, numeric) from public, anon, authenticated;
grant execute on function public.record_ai_spend(uuid, numeric) to service_role;

-- --- admin view --------------------------------------------------------------
-- What the AI is actually costing, per user, this month.
drop function if exists public.admin_ai_spend();
create or replace function public.admin_ai_spend()
returns table (user_id uuid, email text, tier text, calls int, cost_usd numeric)
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
  select s.user_id, u.email::text,
    coalesce(case when sub.status = 'active' then sub.tier else 'bronze' end, 'bronze')::text,
    s.calls, s.cost_usd
  from public.ai_spend s
  join auth.users u on u.id = s.user_id
  left join public.subscriptions sub on sub.user_id = s.user_id
  where s.period = date_trunc('month', current_date)::date
  order by s.cost_usd desc;
end;
$$;

revoke execute on function public.admin_ai_spend() from public, anon;
grant execute on function public.admin_ai_spend() to authenticated;

notify pgrst, 'reload schema';
