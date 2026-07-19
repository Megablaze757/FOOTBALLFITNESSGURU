-- Body stats for calorie targets. Weight alone can't drive a resting-metabolic
-- -rate estimate — Mifflin-St Jeor needs height, age and sex too.

alter table profiles add column if not exists height_cm numeric;
alter table profiles add column if not exists birth_year int;
alter table profiles add column if not exists sex text;
alter table profiles add column if not exists activity_level text;
alter table profiles add column if not exists diet_goal text;

alter table profiles drop constraint if exists profiles_sex_check;
alter table profiles add constraint profiles_sex_check
  check (sex is null or sex = any (array['male', 'female']));

alter table profiles drop constraint if exists profiles_activity_check;
alter table profiles add constraint profiles_activity_check
  check (activity_level is null or activity_level = any (
    array['sedentary', 'light', 'moderate', 'high', 'athlete']));

alter table profiles drop constraint if exists profiles_diet_goal_check;
alter table profiles add constraint profiles_diet_goal_check
  check (diet_goal is null or diet_goal = any (array['cut', 'maintain', 'build']));

notify pgrst, 'reload schema';
