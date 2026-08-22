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

-- A MIGRATION HAS TO BE SAFE IN A DATABASE THAT IS AHEAD OF IT.
--
-- This originally allowed only 'workout' and 'active_rest'. 0089 widens it to
-- include 'rest_day' a few lines later, the app has been writing rest_day ever
-- since, and re-running this file then failed outright:
--
--   ERROR: 23514: check constraint "training_logs_session_type_check" of
--   relation "training_logs" is violated by some row
--
-- Every statement in these files is written to be safe to run twice, and this
-- one was not — it narrowed the schema back to what it was before 0089, against
-- data written under 0089. So it states the final set rather than the interim
-- one, which makes the 0088 -> 0089 step a no-op and re-running either safe.
--
-- The clean-up above it is for the same reason from the other direction: a
-- value outside the set is legacy or hand-written and means nothing to the app,
-- which reads exactly these three. Nulling it is how every row before this
-- column existed already reads, and the alternative is a migration nobody can
-- apply at all.
update public.training_logs
   set session_type = null
 where session_type is not null
   and session_type <> all (array['workout', 'active_rest', 'rest_day']);

alter table public.training_logs drop constraint if exists training_logs_session_type_check;
alter table public.training_logs add constraint training_logs_session_type_check
  check (session_type is null or session_type = any (array['workout', 'active_rest', 'rest_day']));

comment on column public.profiles.goals is
  'Up to three ordered programme goals: [{type,priority}]. The first is the anchor.';
comment on column public.programs.settings is
  'Snapshot of the custom rotation and advanced controls used to build the block.';
comment on column public.training_logs.session_type is
  'active_rest counts toward attendance while its empty drills contribute no strength volume.';
