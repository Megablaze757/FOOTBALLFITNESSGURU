-- Audit follow-up: additive programme preferences and explicit active-rest logs.
-- Existing goal_type and JSON plan rows remain valid; nothing is rewritten.

alter table public.profiles
  add column if not exists goals jsonb not null default '[]'::jsonb,
  add column if not exists saved_exercises text[] not null default '{}';

alter table public.programs
  add column if not exists goals jsonb not null default '[]'::jsonb,
  add column if not exists settings jsonb not null default '{}'::jsonb;

alter table public.training_logs
  add column if not exists session_type text,
  add column if not exists notes text;

alter table public.training_logs drop constraint if exists training_logs_session_type_check;
alter table public.training_logs add constraint training_logs_session_type_check
  check (session_type is null or session_type = any (array['workout', 'active_rest']));

comment on column public.profiles.goals is
  'Up to three ordered programme goals: [{type,priority}]. The first is the anchor.';
comment on column public.programs.settings is
  'Snapshot of the custom rotation and advanced controls used to build the block.';
comment on column public.training_logs.session_type is
  'active_rest counts toward attendance while its empty drills contribute no strength volume.';
