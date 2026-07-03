-- =============================================================================
-- TRAINING LOGS — drills/training logged with the daily entry, for history &
-- so the AI can see progression over time.
-- =============================================================================

create table if not exists public.training_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  log_date date not null default current_date,

  -- [{ "name": "Single-leg RDL", "sets": 3, "reps": 12, "load_kg": 40, "notes": "" }]
  drills jsonb not null default '[]'::jsonb,
  total_minutes integer check (total_minutes >= 0),
  intensity integer check (intensity between 1 and 10),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unique_training_day unique (user_id, log_date)
);

create index if not exists idx_training_logs_user_date
  on public.training_logs (user_id, log_date desc);

drop trigger if exists trg_training_logs_updated_at on public.training_logs;
create trigger trg_training_logs_updated_at
  before update on public.training_logs
  for each row execute function public.set_updated_at();

alter table public.training_logs enable row level security;

drop policy if exists "training: select own" on public.training_logs;
create policy "training: select own"
  on public.training_logs for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "training: insert own" on public.training_logs;
create policy "training: insert own"
  on public.training_logs for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "training: update own" on public.training_logs;
create policy "training: update own"
  on public.training_logs for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Admins can read all (for the back-office).
drop policy if exists "training: admin read all" on public.training_logs;
create policy "training: admin read all"
  on public.training_logs for select to authenticated
  using (public.is_admin());
