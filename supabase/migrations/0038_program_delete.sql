-- =============================================================================
-- 0038: Let athletes delete a program.
--
-- Same gap as videos in 0036: there was no DELETE policy on public.programs, so
-- RLS refused every attempt. "New goal" only flipped status to 'archived', which
-- means abandoned programs pile up invisibly forever — and someone who built a
-- program by mistake had no way to be rid of it.
-- =============================================================================

drop policy if exists "programs: delete own" on public.programs;
create policy "programs: delete own"
  on public.programs for delete to authenticated
  using (auth.uid() = user_id);

notify pgrst, 'reload schema';
