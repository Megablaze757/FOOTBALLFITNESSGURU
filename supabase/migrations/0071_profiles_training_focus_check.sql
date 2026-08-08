-- The half of migration 0070 that never landed.
--
-- 0070 was written to add two CHECK constraints NOT VALID. Only one of them is
-- present in the live database: programs_goal_type_check exists, and there is
-- no constraint on profiles.training_focus at all — verified by listing every
-- contype='c' constraint on public.profiles, which returns eight, none of them
-- this one. So the guard the handover describes as protecting new writes has
-- not been protecting anything.
--
-- Added VALID rather than NOT VALID, deliberately. NOT VALID exists to avoid a
-- blocking scan of a big table with dirty rows; neither applies here. Every
-- existing value was checked first and they are all legal (performance 12,
-- aesthetics 4, fitness 1, NULL 9, nothing else), and the table is 26 rows.
-- Adding it NOT VALID would only recreate the same unvalidated-constraint
-- cleanup this migration exists to finish.
--
-- NULL is permitted, matching every sibling constraint on this table
-- (profiles_sex_check, profiles_diet_goal_check, profiles_activity_check and
-- the rest all spell out `IS NULL OR`). This matters beyond consistency: nine
-- profiles currently have a NULL training_focus, and a constraint that rejected
-- NULL could not be added at all without first inventing a value for them.
--
-- NOTE for whoever owns the program-copy code: this constraint does NOT fix
-- "Weighted toward undefined." or the NaN macros. The handover attributes both
-- to rows violating these constraints, and there are none — every value in
-- both columns is legal. Those nine NULLs are the far likelier source, and no
-- CHECK constraint will ever catch a NULL the schema deliberately allows. The
-- fix belongs in whatever formats that string, which is not in this branch.
alter table public.profiles
  add constraint profiles_training_focus_check
  check (
    training_focus is null
    or training_focus in ('performance', 'fitness', 'aesthetics', 'rehab')
  );
