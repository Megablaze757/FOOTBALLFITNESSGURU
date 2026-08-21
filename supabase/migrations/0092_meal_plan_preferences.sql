-- =============================================================================
-- Two meal-plan preferences that were only ever held in React state.
--
-- "KEEP IT CHEAP" WAS NEVER SAVED. The tick box has existed for as long as the
-- planner has, and nothing wrote it anywhere. That is worse than a setting that
-- forgets itself: the nutrition page rebuilds the same week from the saved seed
-- and the saved preferences, so a plan generated in budget mode was re-rendered
-- WITHOUT it — the same seed, a different set of meals, in two places at once.
--
-- COOKING LEVEL IS NEW. Recipes are rated Easy / Medium / Involved from their
-- own contents (see lib/recipe-difficulty.ts), and somebody who says they can't
-- face cooking should get the simple ones first all week rather than having to
-- swap dinner every night.
--
-- Both default to today's behaviour, so an existing athlete's plan does not
-- change under them when this runs.
-- =============================================================================

alter table public.profiles add column if not exists diet_budget boolean not null default false;
alter table public.profiles add column if not exists diet_cook_level text;

-- 'any' and 'easy' only. Written as a check rather than an enum so adding a
-- third option later is one migration and not a type rewrite.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_diet_cook_level_check'
  ) then
    alter table public.profiles
      add constraint profiles_diet_cook_level_check
      check (diet_cook_level is null or diet_cook_level in ('any', 'easy'));
  end if;
end $$;

comment on column public.profiles.diet_budget is 'Prefer cheaper staples when building a meal plan.';
comment on column public.profiles.diet_cook_level is 'any | easy — how much cooking the athlete is up for.';

-- New columns are invisible to PostgREST until it reloads its schema cache.
-- It polls, but a plan saved in the same minute as the migration would fail
-- with "column does not exist" on a column that does.
notify pgrst, 'reload schema';
