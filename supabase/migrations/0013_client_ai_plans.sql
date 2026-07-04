-- =============================================================================
-- 0013: Allow gold users to persist their OWN in-browser video analysis.
-- Video analysis now runs client-side (MediaPipe pose estimation on GitHub
-- Pages, no CV worker), so the browser writes the resulting ai_plan directly.
-- Still fully scoped: only your own plan, for your own video, gold tier only.
-- Service-role inserts (edge function) are unaffected.
-- =============================================================================

drop policy if exists "ai_plans: insert own (gold)" on public.ai_plans;
create policy "ai_plans: insert own (gold)"
  on public.ai_plans for insert to authenticated
  with check (
    auth.uid() = user_id
    and public.current_tier() = 'gold'
    and exists (
      select 1 from public.videos v
      where v.id = video_id and v.user_id = auth.uid()
    )
  );

-- Allow re-analysis to overwrite a prior client plan (video_id is unique).
drop policy if exists "ai_plans: update own (gold)" on public.ai_plans;
create policy "ai_plans: update own (gold)"
  on public.ai_plans for update to authenticated
  using (auth.uid() = user_id and public.current_tier() = 'gold')
  with check (auth.uid() = user_id and public.current_tier() = 'gold');
