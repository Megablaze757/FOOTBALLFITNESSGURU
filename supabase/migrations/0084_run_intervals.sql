-- An interval session, logged as the session it was.
--
-- 0064 gave a run a type and a zone. What it still could not record is the
-- SHAPE of the session, and for the half of the run types that are intervals
-- the shape is the session: 6 x 45s and 12 x 90s are both "hill repeats", and
-- one of them is four times the work.
--
-- Two consequences, both of which these columns fix:
--
--   INTENSITY WAS A GUESS. The athlete dragged a 1-10 slider by feel, and people
--   answer it with how hard the REPS felt because that is what they remember. A
--   50-minute session with 12 minutes of efforts in it got rated a 9, so it
--   scored higher than a 90-minute long run. It should not have. Session load is
--   duration x intensity, so a wrong intensity is a wrong load is a wrong ACWR --
--   which is the number that tells someone when to back off.
--
--   THE 80/20 SPLIT WAS AN AVERAGE OF THE KIND, NOT A MEASUREMENT OF THE
--   SESSION. lib/running.ts carries a hardFraction per run type: 0.2 for hills,
--   0.45 for a tempo. Fine as an estimate, and it cannot tell those two hill
--   sessions apart.
--
-- With the efforts recorded, both become arithmetic. See `intervalEffort` in
-- lib/running.ts, which weights the reps, the jog recovery and the warm-up by
-- their own minutes -- the way a coach does it on paper.
--
-- All three are optional. Existing rows keep working, every consumer already
-- handles nulls, and a runner who does not want to count anything can go on
-- logging a duration.

alter table public.training_logs add column if not exists intervals smallint;
alter table public.training_logs add column if not exists interval_seconds integer;
alter table public.training_logs add column if not exists recovery_seconds integer;

do $$
begin
  -- 100 efforts is beyond any session anyone runs; the point is to catch a
  -- mis-keyed value, not to have an opinion about hard training.
  if not exists (select 1 from pg_constraint where conname = 'training_logs_intervals_check') then
    alter table public.training_logs
      add constraint training_logs_intervals_check
      check (intervals is null or (intervals > 0 and intervals <= 100));
  end if;

  -- Two hours. The dangerous typo is a minutes value in a seconds field --
  -- "90" meaning 90 minutes would report 8 x 90 minutes of threshold work and
  -- hand ACWR a number twenty times the athlete's real week.
  if not exists (select 1 from pg_constraint where conname = 'training_logs_interval_seconds_check') then
    alter table public.training_logs
      add constraint training_logs_interval_seconds_check
      check (interval_seconds is null or (interval_seconds > 0 and interval_seconds <= 7200));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'training_logs_recovery_seconds_check') then
    alter table public.training_logs
      add constraint training_logs_recovery_seconds_check
      check (recovery_seconds is null or (recovery_seconds >= 0 and recovery_seconds <= 7200));
  end if;
end $$;

comment on column public.training_logs.intervals is
  'How many efforts. With interval_seconds this replaces the guessed intensity slider - see intervalEffort in lib/running.ts.';
comment on column public.training_logs.interval_seconds is
  'Length of ONE effort, in seconds. Not the total: 8 x 90s stores 90.';
comment on column public.training_logs.recovery_seconds is
  'Jog or walk between efforts, in seconds. Optional. Shorter than the effort means incomplete recovery, which is scored higher.';

-- ---------------------------------------------------------------------------
-- A FIX THAT BELONGS WITH IT: the run_type constraint has been rejecting a run
-- type the app offers.
--
-- 'incline' (the incline treadmill walk) was added to RunTypeId and to
-- RUN_TYPES in lib/running.ts, which is what populates the "Did you run?"
-- dropdown -- so it has been selectable on the check-in this whole time. The
-- CHECK constraint from 0064 enumerates fourteen ids and that is not one of
-- them, so picking it and saving fails on a constraint violation.
--
-- The list is deliberately an explicit enumeration rather than free text, for
-- the reason 0064 gives: this column drives the hard/easy split and a typo
-- would silently move a session across it. The cost of that choice is exactly
-- this -- the two lists have to be changed together. lib/running.test.ts now
-- asserts the ids, so the next one cannot slip through.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'training_logs_run_type_check') then
    alter table public.training_logs drop constraint training_logs_run_type_check;
  end if;

  alter table public.training_logs
    add constraint training_logs_run_type_check
    check (run_type is null or run_type in (
      'recovery', 'easy', 'long', 'steady', 'progression',
      'tempo', 'cruise', 'vo2', 'reps', 'fartlek',
      'hills', 'strides', 'shakeout', 'timetrial',
      'incline'
    ));
end $$;
