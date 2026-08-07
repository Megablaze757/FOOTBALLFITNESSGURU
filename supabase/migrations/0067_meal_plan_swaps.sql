-- =============================================================================
-- 0067: Remember the meals an athlete picked by hand.
--
-- The plan is rebuilt from `meal_plan_seed` on every visit — buildWeek is pure,
-- so the same seed gives back the same week. That is deliberate: it means the
-- shopping list someone started buying against on Sunday is still the plan on
-- Wednesday.
--
-- It also means a swap has nowhere to live. Changing Thursday's dinner in the
-- UI lasted until the page reloaded and the seed rebuilt over it. So the swaps
-- are stored beside the seed, and applied on top of it.
--
-- Keyed by POSITION ("2:Dinner:0"), not by the meal being replaced — see
-- MealSwaps in lib/meal-plan.ts. Cleared whenever the week is regenerated,
-- because a new seed is a new plan and the old positions mean nothing in it.
-- =============================================================================

alter table public.profiles add column if not exists meal_plan_swaps jsonb;

comment on column public.profiles.meal_plan_swaps is
  'Hand-picked meal overrides for the current plan, keyed "dayIndex:Slot:nth" -> meal id. '
  'Applied on top of the week rebuilt from meal_plan_seed. Cleared on regenerate.';

notify pgrst, 'reload schema';
