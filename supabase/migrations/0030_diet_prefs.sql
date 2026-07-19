-- Meal preferences. Without these the planner handed a vegetarian a chicken
-- traybake and someone with a nut allergy a peanut butter breakfast.

alter table profiles add column if not exists diet_pattern text default 'omnivore';
alter table profiles add column if not exists diet_avoid text[] default '{}';
alter table profiles add column if not exists meals_per_day int default 4;

alter table profiles drop constraint if exists profiles_diet_pattern_check;
alter table profiles add constraint profiles_diet_pattern_check
  check (diet_pattern is null or diet_pattern = any (
    array['omnivore', 'pescatarian', 'vegetarian', 'vegan']));

alter table profiles drop constraint if exists profiles_meals_per_day_check;
alter table profiles add constraint profiles_meals_per_day_check
  check (meals_per_day is null or meals_per_day between 3 and 5);

notify pgrst, 'reload schema';
