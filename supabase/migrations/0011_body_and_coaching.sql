-- =============================================================================
-- Body composition + progress photos, and coach ↔ athlete relationships so a
-- coach can view their squad's dashboards.
-- =============================================================================

-- --- Body composition + progress photos -------------------------------------
create table if not exists public.body_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  log_date date not null default current_date,
  weight_kg numeric(5,2) check (weight_kg > 0),
  body_fat_pct numeric(4,1) check (body_fat_pct >= 0 and body_fat_pct <= 70),
  photo_path text,
  notes text,
  created_at timestamptz not null default now(),
  constraint unique_body_day unique (user_id, log_date)
);

create index if not exists idx_body_logs_user_date on public.body_logs (user_id, log_date desc);

-- Private storage for progress photos.
insert into storage.buckets (id, name, public) values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists "photos: insert own" on storage.objects;
create policy "photos: insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and owner = auth.uid());
drop policy if exists "photos: read own" on storage.objects;
create policy "photos: read own" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and owner = auth.uid());
drop policy if exists "photos: delete own" on storage.objects;
create policy "photos: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and owner = auth.uid());

-- --- Coach ↔ athlete --------------------------------------------------------
create table if not exists public.coach_athletes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint unique_coach_athlete unique (coach_id, athlete_id)
);
create index if not exists idx_coach_athletes_coach on public.coach_athletes (coach_id);

-- True if the caller coaches the given athlete. SECURITY DEFINER so it can back
-- cheap coach-read RLS policies on the athlete's tables.
create or replace function public.is_coach_of(athlete uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.coach_athletes where coach_id = auth.uid() and athlete_id = athlete);
$$;

-- Add an athlete to the caller's squad by email (coach/admin only).
create or replace function public.add_athlete_by_email(p_email text)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare aid uuid;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role in ('coach', 'admin')) then
    raise exception 'only coaches can add athletes' using errcode = '42501';
  end if;
  select id into aid from auth.users where lower(email) = lower(p_email);
  if aid is null then raise exception 'no athlete with that email'; end if;
  if aid = auth.uid() then raise exception 'that is you'; end if;
  insert into public.coach_athletes (coach_id, athlete_id) values (auth.uid(), aid) on conflict do nothing;
  return aid;
end;
$$;

alter table public.body_logs enable row level security;
alter table public.coach_athletes enable row level security;

-- body_logs: own + coach-read.
drop policy if exists "body: all own" on public.body_logs;
create policy "body: all own" on public.body_logs for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "body: coach read" on public.body_logs;
create policy "body: coach read" on public.body_logs for select to authenticated
  using (public.is_coach_of(user_id));

-- coach_athletes: coach manages their roster; athlete can see who coaches them.
drop policy if exists "coach_athletes: select" on public.coach_athletes;
create policy "coach_athletes: select" on public.coach_athletes for select to authenticated
  using (coach_id = auth.uid() or athlete_id = auth.uid());
drop policy if exists "coach_athletes: coach write" on public.coach_athletes;
create policy "coach_athletes: coach write" on public.coach_athletes for all to authenticated
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());

-- Coach-read policies on athlete data (additive with the existing own-policies).
drop policy if exists "profiles: coach read" on public.profiles;
create policy "profiles: coach read" on public.profiles for select to authenticated using (public.is_coach_of(id));

drop policy if exists "check_ins: coach read" on public.daily_check_ins;
create policy "check_ins: coach read" on public.daily_check_ins for select to authenticated using (public.is_coach_of(user_id));

drop policy if exists "training: coach read" on public.training_logs;
create policy "training: coach read" on public.training_logs for select to authenticated using (public.is_coach_of(user_id));

drop policy if exists "programs: coach read" on public.programs;
create policy "programs: coach read" on public.programs for select to authenticated using (public.is_coach_of(user_id));

drop policy if exists "benchmarks: coach read" on public.strength_benchmarks;
create policy "benchmarks: coach read" on public.strength_benchmarks for select to authenticated using (public.is_coach_of(user_id));

drop policy if exists "insights: coach read" on public.daily_insights;
create policy "insights: coach read" on public.daily_insights for select to authenticated using (public.is_coach_of(user_id));
