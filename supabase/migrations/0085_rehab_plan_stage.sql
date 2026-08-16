-- A rehab plan you are actually ON, rather than one you once generated.
--
-- 0061 saved the plan. What it could not record is where in it the athlete is,
-- and without that the plan could only ever be a document to read: nothing else
-- in the app could act on it, because "which exercises should be in today's
-- session" has no answer until you know which stage is current.
--
-- So an athlete generated a graded loading plan for a hamstring, and then their
-- programme carried on prescribing Nordic curls and sprint work as though
-- nothing had happened, and Ask Coach could not answer a question about the
-- plan it had just written for them.
--
--   current_stage — 1-based index into plan->'stages'.
--   active        — still following it. A plan you have recovered from should
--                   stop rewriting your sessions, and deleting the row would
--                   lose the history of what you did about it.
--
-- WHY THE STAGE IS NOT DERIVED FROM THE DATE.
--
-- Every stage in these plans carries a timeframe ("Week 0-2") AND a criterion
-- ("Pain-free walking, no swelling"). It is tempting to work the stage out from
-- how long ago the plan was created, and it would be wrong in the one direction
-- that matters: rehab stages advance on CRITERIA, not on the calendar. An
-- athlete whose hamstring is still sore at week three does not become ready for
-- stage-three loading because three weeks have passed, and a system that moves
-- them there is prescribing sprint work for a healing tear.
--
-- So this defaults to 1 and only ever moves because the athlete said so. Time
-- may prompt — "you have been on this stage a while, here is what it takes to
-- move on" — and may not decide.

alter table public.rehab_plans add column if not exists current_stage smallint not null default 1;
alter table public.rehab_plans add column if not exists active boolean not null default true;

do $$
begin
  -- 1-based, and no plan in this app has more than a handful of stages. The
  -- upper bound is loose on purpose: it is here to catch a 0 or a negative,
  -- not to have an opinion about how long a rehab plan should be.
  if not exists (select 1 from pg_constraint where conname = 'rehab_plans_current_stage_check') then
    alter table public.rehab_plans
      add constraint rehab_plans_current_stage_check
      check (current_stage >= 1 and current_stage <= 20);
  end if;
end $$;

-- The app asks one question of this table on nearly every screen: "is there an
-- active plan, and which is the newest". Partial, because an inactive plan is
-- history and is only ever read from the injury page itself.
create index if not exists rehab_plans_active_idx
  on public.rehab_plans (user_id, created_at desc)
  where active;

comment on column public.rehab_plans.current_stage is
  'Which stage of the plan the athlete is on, 1-based. Advanced by the athlete against the stage criteria, NEVER by elapsed time - see 0085.';
comment on column public.rehab_plans.active is
  'Still following this plan. Drives whether it rewrites sessions and appears in the coach briefing.';
