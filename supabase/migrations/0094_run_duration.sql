-- =============================================================================
-- A run's own duration, separate from the session it sat inside.
--
-- THE TWO ARE NOT THE SAME NUMBER and the app only had one of them. A
-- footballer's Tuesday is a 90-minute session with a 20-minute run in it; a
-- lifter's Saturday is 70 minutes of squats and a 12-minute cool-down jog. Pace
-- computed from the session duration reads 4:30/km as 20:00/km, which is not a
-- rounding error — it is a different sport.
--
-- Runners were the exception that hid it: for them the run IS the session, so
-- one field looked like enough.
--
-- distance_km widens at the same time. It was numeric(6,2) while the check-in
-- accepts and canonicalises three decimals, so a 5.666km run came back as 5.67
-- — small, and exactly the kind of silent edit that makes somebody stop
-- trusting what they typed. A GPS watch reports metres; store metres.
-- =============================================================================

alter table public.training_logs
  add column if not exists run_seconds integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'training_logs_run_seconds_check') then
    alter table public.training_logs
      add constraint training_logs_run_seconds_check
      check (run_seconds is null or (run_seconds >= 0 and run_seconds <= 86400));
  end if;
end $$;

alter table public.training_logs
  alter column distance_km type numeric(7,3);

comment on column public.training_logs.run_seconds is
  'Time spent running, which is not the session duration — pace is computed from this and distance_km.';
comment on column public.training_logs.distance_km is
  'Distance in kilometres to the metre. Widened from numeric(6,2), which silently rounded a 5.666km run to 5.67.';

notify pgrst, 'reload schema';
