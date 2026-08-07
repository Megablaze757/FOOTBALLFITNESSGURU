-- =============================================================================
-- 0068: Remember what last week's plan actually served.
--
-- "Regenerate week" had never once worked. `buildWeek` took a seed and the seed
-- shifted a tie-break worth a tenth of a penny against scoring terms weighted
-- 4, 8 and 35 — so it decided nothing, and every seed from 0 to 997 produced
-- the byte-identical week. An earlier attempt at the same complaint widened the
-- random seed range from 3 to 997, which changed nothing, because the range was
-- never the problem.
--
-- Raising the rotation's weight isn't the fix either: swept to £14 a slot it
-- still moved only 6% of the week, because the top-scoring meal for a given
-- athlete and slot genuinely is the best one, by a wide margin, and that margin
-- is the entire point of the portion-size and protein terms.
--
-- So the planner remembers instead. Week-on-week variety is day-on-day variety
-- one level up, and it takes the same mechanism: last week's meals arrive
-- already carrying repeat cost, and this week reaches past them when something
-- equally good is available. Average week-on-week change went from 0% to 55%.
--
-- Stored rather than derived because the seeds are random, not sequential —
-- there is no "seed minus one" to rebuild the previous week from.
-- =============================================================================

alter table public.profiles add column if not exists meal_plan_recent jsonb;

comment on column public.profiles.meal_plan_recent is
  'Meal ids served by the previous plan, as a flat array. Fed to buildWeek so the '
  'next plan reaches past them where an equally good meal exists. Never a ban — a '
  'narrow diet with nothing else available repeats rather than coming back short.';

notify pgrst, 'reload schema';
