-- =============================================================================
-- PHASE 3: Video analysis & training plans — storage, videos, ai_plans
-- =============================================================================

-- Private storage bucket for uploaded videos.
insert into storage.buckets (id, name, public)
values ('videos', 'videos', false)
on conflict (id) do nothing;

-- Storage RLS: users only touch their own objects in the videos bucket.
drop policy if exists "videos bucket: insert own" on storage.objects;
create policy "videos bucket: insert own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'videos' and owner = auth.uid());

drop policy if exists "videos bucket: read own" on storage.objects;
create policy "videos bucket: read own"
  on storage.objects for select to authenticated
  using (bucket_id = 'videos' and owner = auth.uid());

drop policy if exists "videos bucket: delete own" on storage.objects;
create policy "videos bucket: delete own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'videos' and owner = auth.uid());

-- -----------------------------------------------------------------------------
create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  check_in_id uuid references public.daily_check_ins(id) on delete set null,

  storage_path text not null,
  duration_seconds integer check (duration_seconds >= 0),
  session_type text check (session_type in ('match', 'training', 'recovery')),
  is_in_season boolean not null default true,

  status text not null default 'uploading'
    check (status in ('uploading', 'processing', 'ready', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists idx_videos_user_status
  on public.videos (user_id, status);

create table if not exists public.ai_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade unique,

  analysis_json jsonb not null,   -- heatmap coords, symmetry, root-cause alert
  drill_program jsonb,            -- selected drills
  focus_area text,                -- 'explosiveness' | 'endurance' | ...
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_plans_user_video
  on public.ai_plans (user_id, video_id);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
alter table public.videos enable row level security;
alter table public.ai_plans enable row level security;

-- videos: own rows, any tier (uploading + tracking status is free).
drop policy if exists "videos: select own" on public.videos;
create policy "videos: select own"
  on public.videos for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "videos: insert own" on public.videos;
create policy "videos: insert own"
  on public.videos for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "videos: update own" on public.videos;
create policy "videos: update own"
  on public.videos for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ai_plans (biomechanics + heatmaps): gold-only read. Inserts via service role.
drop policy if exists "ai_plans: select own (gold)" on public.ai_plans;
create policy "ai_plans: select own (gold)"
  on public.ai_plans for select to authenticated
  using (auth.uid() = user_id and public.current_tier() = 'gold');
