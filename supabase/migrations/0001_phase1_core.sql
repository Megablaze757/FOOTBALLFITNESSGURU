-- =============================================================================
-- PHASE 1: Core schema — profiles, daily check-ins, strength benchmarks
-- Idempotent where practical so it is safe to re-run during development.
-- =============================================================================

-- Shared helper: keep updated_at columns current on UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Profiles (extends auth.users)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  role text not null default 'athlete' check (role in ('athlete', 'coach', 'admin')),
  experience_years integer check (experience_years >= 0),
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row when a new auth user signs up, so the frontend
-- never hits a missing-row state. SECURITY DEFINER so it can write to public.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 2. Daily check-ins (the "Trader's Journal")
-- -----------------------------------------------------------------------------
create table if not exists public.daily_check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  check_in_date date not null default current_date,

  -- e.g. {"knee_left": 7, "hamstring_right": 3, "ankle": 0}
  pain_map jsonb not null default '{}'::jsonb,

  fatigue_score integer check (fatigue_score between 1 and 10),
  sleep_quality integer check (sleep_quality between 1 and 10),
  nutrition_quality integer check (nutrition_quality between 1 and 10),
  weight_kg numeric(5,2) check (weight_kg > 0),

  is_match_day boolean not null default false,
  match_minutes_played integer not null default 0 check (match_minutes_played >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint unique_daily_checkin unique (user_id, check_in_date)
);

drop trigger if exists trg_daily_check_ins_updated_at on public.daily_check_ins;
create trigger trg_daily_check_ins_updated_at
  before update on public.daily_check_ins
  for each row execute function public.set_updated_at();

-- Hot path: "give me this user's recent journal history" (Phase 2 reads 14 days).
create index if not exists idx_daily_checkins_user_date
  on public.daily_check_ins (user_id, check_in_date desc);

-- -----------------------------------------------------------------------------
-- 3. Strength benchmarks (the "Market Data")
-- -----------------------------------------------------------------------------
create table if not exists public.strength_benchmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  test_date date not null default current_date,

  -- e.g. {"squat_1rm": 100, "sprint_10m": 1.75, "vertical_jump_cm": 65}
  metrics jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_strength_benchmarks_user_date
  on public.strength_benchmarks (user_id, test_date desc);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
alter table public.profiles            enable row level security;
alter table public.daily_check_ins     enable row level security;
alter table public.strength_benchmarks enable row level security;

-- --- profiles ---------------------------------------------------------------
-- Anyone authenticated can read profiles (public coach/athlete directory).
drop policy if exists "profiles: read all (authenticated)" on public.profiles;
create policy "profiles: read all (authenticated)"
  on public.profiles for select
  to authenticated
  using (true);

-- A user may only update their own profile.
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- --- daily_check_ins --------------------------------------------------------
drop policy if exists "check_ins: select own" on public.daily_check_ins;
create policy "check_ins: select own"
  on public.daily_check_ins for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "check_ins: insert own" on public.daily_check_ins;
create policy "check_ins: insert own"
  on public.daily_check_ins for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "check_ins: update own" on public.daily_check_ins;
create policy "check_ins: update own"
  on public.daily_check_ins for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- --- strength_benchmarks ----------------------------------------------------
drop policy if exists "benchmarks: select own" on public.strength_benchmarks;
create policy "benchmarks: select own"
  on public.strength_benchmarks for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "benchmarks: insert own" on public.strength_benchmarks;
create policy "benchmarks: insert own"
  on public.strength_benchmarks for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "benchmarks: update own" on public.strength_benchmarks;
create policy "benchmarks: update own"
  on public.strength_benchmarks for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
