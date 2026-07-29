-- Rehab plans were never saved anywhere.
--
-- InjuryPlanner held the generated plan in React state and nothing else. It
-- runs as a background job, so navigating away didn't kill the *request* — but
-- the result landed in a component that had unmounted, and there was no row
-- anywhere. So an athlete described an injury, waited the best part of a minute
-- for a graded loading plan, switched tab, and it was gone with no way back.
-- The most valuable single output in the app and the only one not persisted.
--
-- Deliberately NOT readable by coaches, unlike body_logs and biometrics. A
-- description of what hurts and how long it's been going on is the most
-- sensitive thing an athlete types into this app, and nobody asked for it to be
-- shared. If team rehab visibility is ever wanted it should be an explicit,
-- separate opt-in.

create table if not exists public.rehab_plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  -- What they told us, kept so the plan can be shown in context and so
  -- "start again" can prefill rather than asking twice.
  description text not null,
  area        text,
  weeks       integer,
  sport       text,
  -- True when it had been going on 6+ weeks; drives the "get this looked at"
  -- emphasis, and worth keeping rather than recomputing from `weeks`.
  chronic     boolean not null default false,
  plan        jsonb not null
);

alter table public.rehab_plans enable row level security;

-- Own rows only, all four verbs. No coach clause, no admin clause.
drop policy if exists "own rehab plans" on public.rehab_plans;
create policy "own rehab plans" on public.rehab_plans
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- The component loads the newest plan on mount.
create index if not exists rehab_plans_user_recent_idx
  on public.rehab_plans (user_id, created_at desc);

comment on table public.rehab_plans is
  'Generated graded loading plans. Private to the athlete by design — see 0061.';
