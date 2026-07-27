-- =============================================================================
-- 0051: Remember which meal plan someone is on.
--
-- The planner already saved the inputs — stats, diet pattern, exclusions,
-- notes — but not the plan. Tap away from the page and the week vanished; come
-- back and you had to press Generate again, and because the UI seeded
-- buildWeek() with Math.random() you got a DIFFERENT week. So the shopping
-- list you'd half-bought against stopped matching the plan.
--
-- Storing the seed rather than the plan itself. buildWeek(targets, seed, prefs,
-- schedule) is pure, and every other argument is already persisted, so one
-- integer reproduces the exact week. A stored JSON blob would be bigger, and
-- would go stale the moment the generator or the food database changed —
-- silently showing a plan the app can no longer explain.
-- =============================================================================

alter table public.profiles
  add column if not exists meal_plan_seed smallint;

comment on column public.profiles.meal_plan_seed is
  'Seed for buildWeek(). NULL means no plan generated yet. Re-derives the exact same week from the diet columns alongside it.';

notify pgrst, 'reload schema';
