-- =============================================================================
-- AI COACH PROGRAMS — goal-driven training programs the athlete logs against.
-- =============================================================================

create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,

  goal_type text not null,        -- 'speed' | 'agility' | 'strength' | 'endurance' | 'injury_recovery' | 'skill'
  goal_notes text,
  plan jsonb not null,            -- ProgramPlan (weeks/sessions/drills)
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  start_date date not null default current_date,
  completed_sessions jsonb not null default '[]'::jsonb, -- ["w1d1", ...]

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_programs_user_status
  on public.programs (user_id, status, created_at desc);

drop trigger if exists trg_programs_updated_at on public.programs;
create trigger trg_programs_updated_at
  before update on public.programs
  for each row execute function public.set_updated_at();

alter table public.programs enable row level security;

drop policy if exists "programs: select own" on public.programs;
create policy "programs: select own"
  on public.programs for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "programs: insert own" on public.programs;
create policy "programs: insert own"
  on public.programs for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "programs: update own" on public.programs;
create policy "programs: update own"
  on public.programs for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
