-- =============================================================================
-- 0045: Funnel events.
--
-- You cannot fix a funnel you can't see. Right now the only numbers are "22
-- users, 0 paying" — which says something is wrong but nothing about where.
--
-- PRIVACY IS THE DESIGN CONSTRAINT, not an afterthought:
--
--   * Only SIGNED-IN events are recorded. No anonymous visitor ID, no device
--     fingerprint, no cookie. That's deliberate: storing an identifier on
--     someone's device to track them is exactly what needs consent under
--     ePrivacy/PECR, and a consent banner would cost more conversions than
--     this table could ever explain. Anonymous traffic is measured in
--     aggregate by the host instead.
--   * No third party. No Google Analytics, no Meta pixel, no Segment. Nothing
--     leaves the database, so there is no transfer to disclose and no data
--     sold on.
--   * `meta` is for the shape of an event (which plan, which feature), never
--     for its content. No free text, no health data, no email addresses.
--   * Rows cascade on account deletion like everything else, so "delete my
--     account" really does mean all of it.
-- =============================================================================

create table if not exists public.funnel_events (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  -- A short, known event name. Free-form strings would turn this into a dump
  -- of whatever the client felt like sending.
  event      text not null,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint funnel_events_known check (event in (
    'signup',            -- profile row first created
    'onboarded',         -- finished the sport/position quiz
    'first_check_in',    -- the activation moment
    'paywall_hit',       -- saw a locked feature
    'plan_view',         -- opened the plans page
    'plan_cta',          -- tapped a plan's button
    'checkout_start',    -- Stripe Checkout opened
    'checkout_complete', -- webhook confirmed payment
    'team_enquiry',
    'cancelled'
  ))
);

create index if not exists funnel_events_event_idx on public.funnel_events(event, created_at desc);
create index if not exists funnel_events_user_idx on public.funnel_events(user_id, created_at desc);

alter table public.funnel_events enable row level security;

-- You may record your own events and read your own history. You may not read
-- anyone else's — a funnel table with a permissive read policy is a list of who
-- looked at what and when.
drop policy if exists funnel_own_insert on public.funnel_events;
create policy funnel_own_insert on public.funnel_events
  for insert with check (auth.uid() = user_id);

drop policy if exists funnel_own_select on public.funnel_events;
create policy funnel_own_select on public.funnel_events
  for select using (auth.uid() = user_id);

-- --- The funnel, as counts ---------------------------------------------------
--
-- Returns aggregates only. An admin gets "how many people reached checkout",
-- never "which athlete looked at Gold on Tuesday" — the question a founder
-- actually needs answered doesn't require identifying anyone.
create or replace function public.funnel_summary(p_days int default 30)
returns table (event text, people int, occurrences int)
language sql
security definer
set search_path = public, pg_temp
as $$
  select e.event,
         count(distinct e.user_id)::int as people,
         count(*)::int                  as occurrences
    from public.funnel_events e
   where e.created_at >= now() - make_interval(days => greatest(1, least(365, p_days)))
     and public.is_admin()
   group by e.event
$$;

revoke all on function public.funnel_summary(int) from public, anon;
grant execute on function public.funnel_summary(int) to authenticated;

-- Signups per day, for a trend line. Aggregate only, same reasoning.
create or replace function public.funnel_daily(p_days int default 30)
returns table (day date, signups int, activated int, paid int)
language sql
security definer
set search_path = public, pg_temp
as $$
  select d::date,
         count(*) filter (where e.event = 'signup')::int,
         count(*) filter (where e.event = 'first_check_in')::int,
         count(*) filter (where e.event = 'checkout_complete')::int
    from generate_series(
           current_date - (greatest(1, least(365, p_days)) - 1),
           current_date,
           interval '1 day') d
    left join public.funnel_events e
      on e.created_at::date = d::date and public.is_admin()
   group by d
   order by d
$$;

revoke all on function public.funnel_daily(int) from public, anon;
grant execute on function public.funnel_daily(int) to authenticated;

notify pgrst, 'reload schema';
