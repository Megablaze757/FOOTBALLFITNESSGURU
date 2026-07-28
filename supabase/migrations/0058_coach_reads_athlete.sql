-- =============================================================================
-- 0058: Let a coach actually see their athletes.
--
-- THE PROBLEM. The squad page queries daily_check_ins, training_logs, programs
-- and strength_benchmarks for every athlete a coach has accepted — and there
-- was no policy on any of those tables granting a coach anything. RLS did
-- exactly what it should and returned nothing, so the whole coach dashboard has
-- been showing empty readiness, zero sessions and no progress for every athlete
-- since it was built. It looked like a working feature returning bad data. It
-- was a working boundary refusing a request nobody had authorised.
--
-- WHAT IS GRANTED, AND WHY THIS LIST. The athlete is told exactly one thing
-- when they accept a coach request (see components/CoachRequests.tsx):
--
--     "They'll be able to view your readiness & training."
--
-- So that is precisely what this grants: readiness, training, the program and
-- benchmark tests. Nothing else.
--
-- Deliberately NOT granted:
--   * body_logs   — progress photos. Nobody agreed to that.
--   * videos      — the same, plus they're the most sensitive thing here.
--   * nutrition_logs — food and weight logs go beyond "readiness & training".
--
-- If any of those are wanted later, the consent text has to change FIRST and
-- existing athletes have to re-accept. Widening access to data people already
-- handed over under a narrower promise is not a migration, it's a betrayal.
--
-- Read-only, and only for links the athlete has ACCEPTED. A pending request
-- grants nothing, which is what stops someone typing an email address and
-- reading a stranger's training history.
-- =============================================================================

create or replace function public.coaches_athlete(p_athlete uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.coach_athletes ca
     where ca.coach_id = auth.uid()
       and ca.athlete_id = p_athlete
       and ca.status = 'accepted'
  );
$$;

revoke all on function public.coaches_athlete(uuid) from public, anon;
grant execute on function public.coaches_athlete(uuid) to authenticated;

-- Readiness: the daily check-in.
drop policy if exists "coach reads athlete check-ins" on public.daily_check_ins;
create policy "coach reads athlete check-ins" on public.daily_check_ins
  for select to authenticated using (public.coaches_athlete(user_id));

-- Training: what they actually did.
drop policy if exists "coach reads athlete training" on public.training_logs;
create policy "coach reads athlete training" on public.training_logs
  for select to authenticated using (public.coaches_athlete(user_id));

-- The program, so a coach can see whether their own assignment is being followed.
drop policy if exists "coach reads athlete programs" on public.programs;
create policy "coach reads athlete programs" on public.programs
  for select to authenticated using (public.coaches_athlete(user_id));

-- Benchmark tests — the objective half of "are they improving".
drop policy if exists "coach reads athlete benchmarks" on public.strength_benchmarks;
create policy "coach reads athlete benchmarks" on public.strength_benchmarks
  for select to authenticated using (public.coaches_athlete(user_id));

notify pgrst, 'reload schema';
