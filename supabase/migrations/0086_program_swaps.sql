-- Swapping a prescribed exercise for one you can actually do.
--
-- The programme picked movements from a catalogue without knowing which rack
-- was free, what the athlete's gym owns, or that their shoulder hates overhead
-- pressing this month. The only options were to do it anyway, skip it, or
-- regenerate the whole block — and regenerating throws away three weeks of
-- progression to fix one exercise.
--
-- AN OVERLAY, NOT A REWRITE. This is a map from the prescribed exercise name to
-- the one they are doing instead:
--
--   {"Barbell back squat": "Goblet squat", "Overhead press": "Dumbbell shoulder press"}
--
-- Rewriting plan->weeks in place would have been fewer moving parts and is the
-- wrong shape for three reasons:
--
--   Reverting is free. "Put my squat back" is deleting a key rather than
--   regenerating a block.
--   The original prescription survives, so the coach can still see what was
--   asked for and say whether the substitute is holding up.
--   One entry fixes every week at once. A swap is a standing decision about
--   equipment or a joint, not a note about Tuesday, and applying it per-session
--   would have the athlete making the same choice twelve times.
--
-- Keyed by NAME rather than by session and index, for the same reason: the
-- athlete means "I do goblet squats instead", not "swap the third drill in week
-- two day one".

alter table public.programs add column if not exists swaps jsonb not null default '{}'::jsonb;

do $$
begin
  -- An object, not an array or a scalar. Without this a client bug could store
  -- a string here and every session render in the app would throw.
  if not exists (select 1 from pg_constraint where conname = 'programs_swaps_object_check') then
    alter table public.programs
      add constraint programs_swaps_object_check
      check (jsonb_typeof(swaps) = 'object');
  end if;
end $$;

comment on column public.programs.swaps is
  'Prescribed exercise name -> the substitute the athlete is doing instead. An overlay: the original plan is never rewritten, so a swap can be undone by deleting a key. See lib/exercise-match.ts for how substitutes are chosen.';
