-- =============================================================================
-- PHASE 4: Monetization — subscriptions, nutrition_logs, tier-gated RLS
--
-- Tiers: bronze (free baseline) < silver < gold.
-- Writes to `subscriptions` happen via the Stripe webhook (service role); the
-- frontend can only read its own row.
-- =============================================================================

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,

  tier text not null check (tier in ('bronze', 'silver', 'gold')),
  status text not null check (status in ('active', 'canceled', 'past_due', 'incomplete')),

  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,

  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_subscriptions_updated_at on public.subscriptions;
create trigger trg_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

create table if not exists public.nutrition_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  log_date date not null default current_date,

  daily_calorie_target integer check (daily_calorie_target >= 0),
  macros jsonb not null default '{}'::jsonb, -- {protein, carbs, fats}
  daily_water_intake_ml integer check (daily_water_intake_ml >= 0),

  created_at timestamptz not null default now(),
  constraint unique_nutrition_day unique (user_id, log_date)
);

create index if not exists idx_nutrition_logs_user_date
  on public.nutrition_logs (user_id, log_date desc);

-- -----------------------------------------------------------------------------
-- current_tier(): the active tier for the calling user, defaulting to 'bronze'.
-- SECURITY DEFINER + STABLE so RLS policies can call it once per statement
-- instead of running a correlated subquery per row.
-- -----------------------------------------------------------------------------
create or replace function public.current_tier()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select tier from public.subscriptions
      where user_id = auth.uid() and status = 'active'
      limit 1
    ),
    'bronze'
  );
$$;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
alter table public.subscriptions enable row level security;
alter table public.nutrition_logs enable row level security;

-- subscriptions: read your own; writes are service-role only (Stripe webhook).
drop policy if exists "subscriptions: select own" on public.subscriptions;
create policy "subscriptions: select own"
  on public.subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

-- nutrition_logs: silver+ only (read & write).
drop policy if exists "nutrition: select own (silver+)" on public.nutrition_logs;
create policy "nutrition: select own (silver+)"
  on public.nutrition_logs for select
  to authenticated
  using (auth.uid() = user_id and public.current_tier() in ('silver', 'gold'));

drop policy if exists "nutrition: insert own (silver+)" on public.nutrition_logs;
create policy "nutrition: insert own (silver+)"
  on public.nutrition_logs for insert
  to authenticated
  with check (auth.uid() = user_id and public.current_tier() in ('silver', 'gold'));

drop policy if exists "nutrition: update own (silver+)" on public.nutrition_logs;
create policy "nutrition: update own (silver+)"
  on public.nutrition_logs for update
  to authenticated
  using (auth.uid() = user_id and public.current_tier() in ('silver', 'gold'))
  with check (auth.uid() = user_id and public.current_tier() in ('silver', 'gold'));

-- -----------------------------------------------------------------------------
-- Tier-gate existing tables (the paywall).
-- -----------------------------------------------------------------------------

-- daily_insights: AI insights are a silver/gold feature. Free/bronze users still
-- get the locally-computed estimate in the app (lib/trends.ts), so the UI keeps
-- working — it just won't show the AI narrative.
drop policy if exists "insights: select own" on public.daily_insights;
drop policy if exists "insights: select own (silver+)" on public.daily_insights;
create policy "insights: select own (silver+)"
  on public.daily_insights for select
  to authenticated
  using (auth.uid() = user_id and public.current_tier() in ('silver', 'gold'));

-- strength_benchmarks: everyone sees the last 30 days; gold unlocks full history.
drop policy if exists "benchmarks: select own" on public.strength_benchmarks;
drop policy if exists "benchmarks: select own (recent or gold)" on public.strength_benchmarks;
create policy "benchmarks: select own (recent or gold)"
  on public.strength_benchmarks for select
  to authenticated
  using (
    auth.uid() = user_id
    and (test_date >= current_date - interval '30 days' or public.current_tier() = 'gold')
  );
