-- =============================================================================
-- 0020: Wearable / health biometrics. Import HRV, resting HR and sleep from a
-- watch (Apple Health / Garmin / Whoop) via manual entry or CSV, so readiness
-- can be driven by real data instead of only self-report. Own-row only.
-- =============================================================================

create table if not exists public.biometrics (
  user_id uuid not null references public.profiles(id) on delete cascade,
  metric_date date not null,
  hrv_ms numeric,
  resting_hr int,
  sleep_hours numeric,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  primary key (user_id, metric_date)
);

create index if not exists idx_biometrics_user_date on public.biometrics (user_id, metric_date desc);

alter table public.biometrics enable row level security;

drop policy if exists "biometrics: own" on public.biometrics;
create policy "biometrics: own" on public.biometrics for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Coaches can read their accepted athletes' biometrics (read-only), like other data.
drop policy if exists "biometrics: coach read" on public.biometrics;
create policy "biometrics: coach read" on public.biometrics for select to authenticated
  using (public.is_coach_of(user_id));
