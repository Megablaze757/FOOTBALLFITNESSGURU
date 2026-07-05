-- =============================================================================
-- 0015: Onboarding quiz fields. A centre-back needs different work to a striker,
-- and "get fit" differs from "build muscle" — so capture the athlete's position
-- and training focus. Both live on the profile (users update their own row via
-- the existing "profiles: update own" policy). Nullable — no backfill needed.
-- =============================================================================

alter table public.profiles
  add column if not exists position text,
  add column if not exists training_focus text; -- performance | fitness | aesthetics | rehab
