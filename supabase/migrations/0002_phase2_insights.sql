-- =============================================================================
-- PHASE 2: AI insights — daily_insights, recovery_correlations
-- Writes to these tables happen via the service role (Edge Function calling the
-- Python AI worker). Athletes can only read their own rows.
-- =============================================================================

create table if not exists public.daily_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  check_in_id uuid not null references public.daily_check_ins(id) on delete cascade,

  risk_score numeric(3,2) check (risk_score between 0 and 1), -- 0 safe .. 1 critical
  fatigue_trend text check (fatigue_trend in ('improving', 'stable', 'declining')),
  ai_summary_text text,
  recommended_action text,
  focus_body_part text,

  created_at timestamptz not null default now(),
  constraint unique_daily_insight unique (user_id, check_in_id)
);

create index if not exists idx_daily_insights_user_date
  on public.daily_insights (user_id, created_at desc);

create table if not exists public.recovery_correlations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,

  trigger_metric text not null,       -- e.g. 'sleep_quality'
  trigger_value text not null,         -- e.g. 'low' (or a numeric bucket)
  resulting_risk_score numeric(3,2) check (resulting_risk_score between 0 and 1),

  sample_size integer not null default 0 check (sample_size >= 0),
  last_updated timestamptz not null default now()
);

create index if not exists idx_recovery_correlations_user
  on public.recovery_correlations (user_id);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
alter table public.daily_insights        enable row level security;
alter table public.recovery_correlations  enable row level security;

-- Athletes read their own insights; INSERT/UPDATE are left to the service role
-- (which bypasses RLS), matching the Phase 2 architecture.
drop policy if exists "insights: select own" on public.daily_insights;
create policy "insights: select own"
  on public.daily_insights for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "correlations: select own" on public.recovery_correlations;
create policy "correlations: select own"
  on public.recovery_correlations for select
  to authenticated
  using (auth.uid() = user_id);
