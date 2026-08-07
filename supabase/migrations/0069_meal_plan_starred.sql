-- =============================================================================
-- 0069: Dishes the athlete starred.
--
-- Distinct from the ingredient preferences inferred out of `diet_notes`. That
-- reads a sentence like "I like eggs" and guesses at a whole class of food;
-- this is a specific dish somebody tapped a star on, which is about as
-- unambiguous as preference data gets. It is scored much harder as a result —
-- see STARRED_BONUS in lib/meal-plan.ts — and it overrides the week-on-week
-- variety rule, because "you had this last week" is the reason someone starred
-- a dish, not a reason to withhold it.
--
-- Survives regeneration, unlike meal_plan_swaps. A swap is positional and means
-- nothing once the plan changes; a star is about the dish itself and should
-- follow the athlete around until they unstar it.
-- =============================================================================

alter table public.profiles add column if not exists meal_plan_starred jsonb;

comment on column public.profiles.meal_plan_starred is
  'Meal ids the athlete starred, as a flat array. Heavily favoured by the planner '
  'and exempt from the had-it-last-week variety rule. Kept across regenerations.';

notify pgrst, 'reload schema';
