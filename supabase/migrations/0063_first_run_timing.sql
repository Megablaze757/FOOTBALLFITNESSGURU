-- Time the first run, so nobody has to hold a stopwatch.
--
-- The roadmap's D7 target hangs on how long it takes a new account to reach a
-- program and then a first session, and that number was unknowable: the funnel
-- recorded signup, onboarded and first_check_in but nothing for "got a program"
-- or "trained once", and no event carried elapsed time. So the answer to "is
-- the first run too long?" was inference from reading the code.
--
-- Two new events, and every event now carries `since_signup_s` in meta — a
-- duration, not an identifier, consistent with 0045's rule that meta describes
-- the SHAPE of an event and never its content. That makes the whole funnel
-- timed, not just these two steps.

alter table public.funnel_events drop constraint if exists funnel_events_known;

alter table public.funnel_events add constraint funnel_events_known check (event in (
  'signup',
  'onboarded',
  'first_check_in',
  'paywall_hit',
  'plan_view',
  'plan_cta',
  'checkout_start',
  'checkout_complete',
  'team_enquiry',
  'cancelled',
  -- New. The two milestones that decide whether anyone ever sees the product
  -- work: a plan exists, and they trained from it once.
  'program_built',
  'first_session'
));

comment on column public.funnel_events.meta is
  'Shape of the event, never its content. Every event carries since_signup_s (seconds from account creation) so time-to-activate is measurable without a stopwatch — see 0063.';

-- Median seconds from signup to each milestone. AGGREGATE ONLY.
--
-- FunnelReport's own doc says it works from RPCs that "return aggregates and
-- nothing else, so there is no way to ask it who did what" — a deliberate
-- design that keeps this data non-identifying and therefore consent-banner-free.
-- Computing medians in the client would have meant selecting individual event
-- rows, which weakens that guarantee for no good reason. So the median is done
-- here, and only a median crosses the wire.
--
-- percentile_cont over a mean would be wrong: one person who signs up and comes
-- back three weeks later shifts an average into uselessness and a median not at
-- all.
create or replace function public.funnel_timing(p_days int default 30)
returns table (event text, median_seconds int, people int)
language sql
security definer
set search_path = public, pg_temp
as $$
  select e.event,
         percentile_cont(0.5) within group (
           order by (e.meta->>'since_signup_s')::numeric
         )::int                         as median_seconds,
         count(distinct e.user_id)::int as people
    from public.funnel_events e
   where e.created_at >= now() - make_interval(days => greatest(1, least(365, p_days)))
     and e.meta ? 'since_signup_s'
     -- Guards against a malformed value turning the cast into an error for the
     -- whole query rather than one row.
     and e.meta->>'since_signup_s' ~ '^[0-9]+$'
     and public.is_admin()
   group by e.event
$$;

revoke all on function public.funnel_timing(int) from public, anon;
grant execute on function public.funnel_timing(int) to authenticated;
