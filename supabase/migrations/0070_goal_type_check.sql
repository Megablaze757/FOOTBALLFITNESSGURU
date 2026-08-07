-- =============================================================================
-- 0070: Constrain the two enum-ish text columns the app indexes lookup tables by.
--
-- It was declared `goal_type text not null` in 0007 with the permitted values
-- written in a SQL COMMENT beside it, which is documentation, not a rule. The
-- app then does `programs.goal_type as GoalType` at the boundary — a cast, so
-- TypeScript stops checking and starts trusting.
--
-- What that bought: lib/nutrition.ts indexes PROTEIN_PER_KG and FAT_PER_KG by
-- that value. An unrecognised string yields `undefined` from both, and
-- `weightKg * undefined` is NaN — so protein, fats AND carbs all came out NaN
-- together, and the rationale sentence rendered literally as "with NaNg protein
-- (NaNg/kg)". A single unexpected row does that, and nothing anywhere fails
-- loudly enough to notice.
--
-- The application now falls back to a default rather than producing NaN, and
-- refuses to return a non-finite target at all. This is the other half: stop
-- the bad value getting in. Both halves are worth having — the constraint can
-- only protect a database it has actually been applied to, and the app talks to
-- whichever one it is pointed at.
--
-- NOT VALID deliberately. It enforces the rule on every new and updated row
-- immediately, without failing the migration if some historic row already
-- violates it — which would leave the constraint absent and the bug in place,
-- the worst of both. Validate separately once the existing rows are checked:
--
--   select distinct goal_type from public.programs
--     where goal_type not in ('speed','agility','strength','endurance','injury_recovery','skill');
--   alter table public.programs validate constraint programs_goal_type_check;
-- =============================================================================

alter table public.programs drop constraint if exists programs_goal_type_check;

alter table public.programs add constraint programs_goal_type_check
  check (goal_type = any (array['speed', 'agility', 'strength', 'endurance', 'injury_recovery', 'skill']))
  not valid;

comment on column public.programs.goal_type is
  'One of speed | agility | strength | endurance | injury_recovery | skill. '
  'Indexed directly into the protein and fat per-kg tables in lib/nutrition.ts, '
  'so an unlisted value produced NaN macros before this constraint existed.';

notify pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- profiles.training_focus — the same shape of bug, one column along.
--
-- Declared `training_focus text` in 0015 with the permitted values in a trailing
-- comment. lib/coach.ts looks the value up in FOCUS_LABEL to write the sentence
-- at the top of the athlete's program, so an unlisted one rendered literally as
-- "Weighted toward undefined." — in the line describing what the block is for.
--
-- The app no longer prints that whatever it reads. This stops the bad value
-- getting in, which is the other half.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.profiles drop constraint if exists profiles_training_focus_check;

alter table public.profiles add constraint profiles_training_focus_check
  check (training_focus is null or training_focus = any (array['performance', 'fitness', 'aesthetics', 'rehab']))
  not valid;

comment on column public.profiles.training_focus is
  'One of performance | fitness | aesthetics | rehab, or null. Indexed into '
  'FOCUS_LABEL in lib/coach.ts to describe the program, so an unlisted value '
  'used to print the word "undefined" into the athlete''s plan summary.';

notify pgrst, 'reload schema';
