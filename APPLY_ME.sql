-- PocketAthlete — pending schema (migrations 0066-0070).
-- Supabase Dashboard > SQL Editor > New query > paste > Run.
-- Idempotent: safe to run more than once.

-- 0066: the athlete's timezone, so the morning sync files sleep against the
-- right day. Without it a 7am Sydney sync lands on the previous UTC date.
alter table public.profiles add column if not exists timezone text;

-- 0067: hand-picked meal overrides, keyed "dayIndex:Slot:nth" -> meal id.
-- Applied on top of the week rebuilt from meal_plan_seed. Cleared on regenerate.
alter table public.profiles add column if not exists meal_plan_swaps jsonb;

-- 0068: meal ids the PREVIOUS plan served, so the next one reaches past them.
-- This is what makes "Regenerate week" actually produce a different week.
alter table public.profiles add column if not exists meal_plan_recent jsonb;

-- 0069: meal ids the athlete starred. Heavily favoured by the planner and
-- exempt from the week-on-week variety rule. Survives regeneration.
alter table public.profiles add column if not exists meal_plan_starred jsonb;

-- 0070: constrain programs.goal_type. It was `text not null` with the allowed
-- values only in a comment, and the app indexes its protein/fat per-kg tables
-- by that value — an unlisted one produced NaN protein, fats AND carbs.
-- NOT VALID so it binds new writes without failing on any historic row.
alter table public.programs drop constraint if exists programs_goal_type_check;
alter table public.programs add constraint programs_goal_type_check
  check (goal_type = any (array['speed','agility','strength','endurance','injury_recovery','skill']))
  not valid;

notify pgrst, 'reload schema';

-- Verify: this should return 4 rows.
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'profiles'
   and column_name in ('timezone','meal_plan_swaps','meal_plan_recent','meal_plan_starred');
