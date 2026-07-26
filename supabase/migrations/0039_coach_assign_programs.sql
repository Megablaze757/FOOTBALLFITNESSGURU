-- =============================================================================
-- 0039: Let a coach build and assign a program to one of their athletes.
--
-- `programs` was insert-own only, so a coach physically could not create work
-- for the people they coach — the squad page could watch an athlete's adherence
-- but not do anything about it.
--
-- The permission is deliberately narrow:
--   * only for athletes who have ACCEPTED the coaching relationship, which
--     is_coach_of() has enforced since 0012 — a coach cannot add an email and
--     start writing into that person's account;
--   * insert and update only. A coach cannot DELETE an athlete's program,
--     because a program carries the athlete's completed sessions and therefore
--     their training history. Removing it is the athlete's call.
--
-- Assigned programs are marked so the athlete can see the difference between a
-- plan they generated and one their coach set.
-- =============================================================================

alter table public.programs
  add column if not exists assigned_by uuid references public.profiles(id) on delete set null;

create index if not exists idx_programs_assigned_by on public.programs (assigned_by);

-- A coach may create a program for an accepted athlete. The with-check pins
-- assigned_by to the caller so a coach cannot attribute the assignment to
-- someone else, and cannot quietly create a program that looks self-made.
drop policy if exists "programs: coach assign" on public.programs;
create policy "programs: coach assign"
  on public.programs for insert to authenticated
  with check (
    public.is_coach_of(user_id)
    and assigned_by = auth.uid()
  );

-- And may keep editing what they assigned — but only that. A program the
-- athlete built for themselves stays theirs alone.
drop policy if exists "programs: coach update assigned" on public.programs;
create policy "programs: coach update assigned"
  on public.programs for update to authenticated
  using (public.is_coach_of(user_id) and assigned_by = auth.uid())
  with check (public.is_coach_of(user_id) and assigned_by = auth.uid());

notify pgrst, 'reload schema';
