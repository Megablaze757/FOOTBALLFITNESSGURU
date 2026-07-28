-- =============================================================================
-- 0056: Cancelling, pausing, and finding out why.
--
-- Stripe's hosted portal cancels a subscription and tells us nothing. For a
-- seasonal sports app that's the wrong shape: most people who cancel in
-- November are injured or out of season, and what they actually want is to come
-- back in February. Offering that instead of a cancel button is worth more than
-- every other retention feature combined.
--
-- Three things here:
--   1. a `paused` subscription state, because Stripe keeps a paused
--      subscription "active" and we must not keep granting Pro to someone we
--      have stopped billing
--   2. `pause_until`, so the app can say when they're coming back
--   3. cancellation_feedback, so the reason someone left is data rather than a
--      dropdown that went nowhere
--
-- NOTE ON THE LAW. Cancelling must never be harder than subscribing (UK
-- DMCCA 2024; the FTC's click-to-cancel rule says the same). The save offer is
-- ONE screen with "cancel anyway" visible on it. Nothing in this schema — and
-- nothing in the UI built on it — may add a step to that path.
-- =============================================================================

-- --- 1. A paused subscription is not an active one --------------------------

alter table public.subscriptions drop constraint if exists subscriptions_status_check;
alter table public.subscriptions add constraint subscriptions_status_check
  check (status in ('active', 'canceled', 'past_due', 'incomplete', 'paused'));

-- When billing resumes. Null unless paused.
alter table public.subscriptions add column if not exists pause_until timestamptz;

-- --- 2. Why people leave ------------------------------------------------------

create table if not exists public.cancellation_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,

  -- Kept as free text rather than an enum: the reason list will change as we
  -- learn what people actually say, and a migration per wording change is a
  -- tax on finding that out.
  reason text not null,
  detail text,

  -- What happened in the end. The whole point is measuring whether the offer
  -- works — 'saved' means they took it and stayed.
  outcome text not null check (outcome in ('cancelled', 'paused', 'saved')),

  created_at timestamptz not null default now()
);

create index if not exists idx_cancellation_feedback_created
  on public.cancellation_feedback (created_at desc);

alter table public.cancellation_feedback enable row level security;

-- An athlete may record their own reason, and read it back. Nobody reads
-- anybody else's except through the admin function below.
drop policy if exists "own feedback insert" on public.cancellation_feedback;
create policy "own feedback insert" on public.cancellation_feedback
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "own feedback select" on public.cancellation_feedback;
create policy "own feedback select" on public.cancellation_feedback
  for select to authenticated using (auth.uid() = user_id);

-- --- 3. What the admin panel reads -------------------------------------------

/**
 * Why people left, most recent first. Admin only.
 *
 * Deliberately returns no user id or email: this is for spotting a pattern in
 * the reasons, not for chasing individuals who cancelled.
 */
create or replace function public.cancellation_reasons(p_days int default 90)
returns table (reason text, outcome text, detail text, created_at timestamptz)
language sql
security definer
set search_path = public, pg_temp
as $$
  select f.reason, f.outcome, f.detail, f.created_at
    from public.cancellation_feedback f
   where public.is_admin()
     and f.created_at >= now() - make_interval(days => greatest(1, p_days))
   order by f.created_at desc
   limit 500;
$$;

revoke all on function public.cancellation_reasons(int) from public, anon;
grant execute on function public.cancellation_reasons(int) to authenticated;

/** Counts per reason, so the admin panel can show what actually drives churn. */
create or replace function public.cancellation_summary(p_days int default 90)
returns table (reason text, total bigint, cancelled bigint, paused bigint, saved bigint)
language sql
security definer
set search_path = public, pg_temp
as $$
  select f.reason,
         count(*)                                              as total,
         count(*) filter (where f.outcome = 'cancelled')        as cancelled,
         count(*) filter (where f.outcome = 'paused')           as paused,
         count(*) filter (where f.outcome = 'saved')            as saved
    from public.cancellation_feedback f
   where public.is_admin()
     and f.created_at >= now() - make_interval(days => greatest(1, p_days))
   group by f.reason
   order by total desc;
$$;

revoke all on function public.cancellation_summary(int) from public, anon;
grant execute on function public.cancellation_summary(int) to authenticated;

notify pgrst, 'reload schema';
