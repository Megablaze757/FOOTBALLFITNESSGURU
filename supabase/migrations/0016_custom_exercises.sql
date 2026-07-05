-- =============================================================================
-- 0016: Coach-authored team exercises. A coach can add their own drills; their
-- accepted athletes see them in the library alongside the built-in catalog.
-- =============================================================================

create table if not exists public.custom_exercises (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  category text not null default 'Strength',
  sport text,                       -- null = all sports
  demo text not null default 'squat',
  equipment text,
  muscles text[] not null default '{}',
  cues text[] not null default '{}',
  why text,
  description text,
  created_at timestamptz not null default now()
);

create index if not exists idx_custom_exercises_coach on public.custom_exercises (coach_id);

alter table public.custom_exercises enable row level security;

-- Coach manages their own; their accepted athletes can read them.
drop policy if exists "custom_ex: coach write" on public.custom_exercises;
create policy "custom_ex: coach write" on public.custom_exercises for all to authenticated
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

drop policy if exists "custom_ex: athlete read" on public.custom_exercises;
create policy "custom_ex: athlete read" on public.custom_exercises for select to authenticated
  using (
    coach_id = auth.uid()
    or exists (
      select 1 from public.coach_athletes ca
      where ca.coach_id = custom_exercises.coach_id
        and ca.athlete_id = auth.uid()
        and ca.status = 'accepted'
    )
  );
