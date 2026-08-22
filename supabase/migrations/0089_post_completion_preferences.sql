-- Post-completion audit: precise run duration, explicit rest days, athlete
-- display preferences, custom nutrition targets and email controls.

alter table public.training_logs
  add column if not exists duration_seconds integer,
  add column if not exists distance_value numeric(8,3),
  add column if not exists distance_unit text,
  add column if not exists pace_seconds_per_km integer,
  add column if not exists avg_speed_kmh numeric(6,2);

alter table public.training_logs drop constraint if exists training_logs_duration_seconds_check;
alter table public.training_logs add constraint training_logs_duration_seconds_check
  check (duration_seconds is null or (duration_seconds >= 0 and duration_seconds <= 172800));

alter table public.training_logs drop constraint if exists training_logs_distance_unit_check;
alter table public.training_logs add constraint training_logs_distance_unit_check
  check (distance_unit is null or distance_unit = any (array['km', 'mi']));

alter table public.training_logs drop constraint if exists training_logs_session_type_check;
alter table public.training_logs add constraint training_logs_session_type_check
  check (session_type is null or session_type = any (array['workout', 'active_rest', 'rest_day']));

alter table public.profiles
  add column if not exists distance_unit text not null default 'km',
  add column if not exists calorie_target integer,
  add column if not exists protein_target integer,
  add column if not exists carbs_target integer,
  add column if not exists fats_target integer,
  add column if not exists email_weekly_summary boolean not null default true,
  add column if not exists email_checkin_reminders boolean not null default true,
  add column if not exists email_workout_reminders boolean not null default true,
  add column if not exists email_milestones boolean not null default true,
  add column if not exists email_program_reminders boolean not null default true;

-- The column is added with a default just above, so existing rows arrive as
-- 'km' — unless an earlier hand-edit put something else there. Same guard as
-- 0088 and 0091: a constraint added against live data has to say what happens
-- to the rows that do not fit, and kilometres is what the app assumed anyway.
update public.profiles set distance_unit = 'km'
 where distance_unit is null or distance_unit <> all (array['km', 'mi']);

alter table public.profiles drop constraint if exists profiles_distance_unit_check;
alter table public.profiles add constraint profiles_distance_unit_check
  check (distance_unit = any (array['km', 'mi']));

alter table public.profiles drop constraint if exists profiles_custom_nutrition_targets_check;
alter table public.profiles add constraint profiles_custom_nutrition_targets_check check (
  (calorie_target is null or calorie_target between 800 and 10000) and
  (protein_target is null or protein_target between 0 and 1000) and
  (carbs_target is null or carbs_target between 0 and 1500) and
  (fats_target is null or fats_target between 0 and 500)
);

comment on column public.training_logs.duration_seconds is
  'Exact elapsed run/session duration. total_minutes remains a rounded backwards-compatible summary.';
comment on column public.training_logs.session_type is
  'workout and active_rest count as activity; rest_day records an intentional recovery day.';

create table if not exists public.email_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  email_type text not null,
  provider_id text,
  status text not null,
  error_message text,
  created_at timestamptz not null default now()
);
alter table public.email_delivery_logs drop constraint if exists email_delivery_logs_status_check;
alter table public.email_delivery_logs add constraint email_delivery_logs_status_check
  check (status in ('attempted', 'sent', 'delivered', 'delayed', 'failed', 'bounced', 'complained', 'skipped'));
create index if not exists email_delivery_logs_user_created
  on public.email_delivery_logs (user_id, created_at desc);
create unique index if not exists email_delivery_logs_provider_id_unique
  on public.email_delivery_logs (provider_id) where provider_id is not null;
alter table public.email_delivery_logs enable row level security;
drop policy if exists "email delivery: read own" on public.email_delivery_logs;
create policy "email delivery: read own" on public.email_delivery_logs
  for select to authenticated using (user_id = auth.uid());

notify pgrst, 'reload schema';
