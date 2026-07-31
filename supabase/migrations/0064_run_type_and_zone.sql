-- Distance told us how far. It never told us how hard.
--
-- 0062 gave training_logs a distance, which was the first half of making the
-- app understand running. This is the other half: 10km on Tuesday and 10km on
-- Saturday still scored identically, because nothing recorded that one was a
-- recovery jog and the other was threshold work. That is THE distinction the
-- sport is built on — the 80/20 rule, the hard-day spacing and every zone
-- prescription in lib/running.ts are all expressed in it.
--
-- Three columns, all optional, all additive. Existing rows keep working and
-- every consumer already handles nulls:
--
--   run_type — which of the fourteen runs this was. The catalogue lives in
--     lib/running.ts; the CHECK below is the same list, and the two must be
--     changed together (lib/running.test.ts asserts the ids it knows about).
--
--   zone — what the athlete ACTUALLY spent the run in, which is not always
--     what the run type implies. An easy run at Zone 3 is the single most
--     common training error there is, and it cannot be reported if the only
--     thing stored is the label the athlete chose.
--
--   avg_hr — straight off a watch. Turns "I think that was easy" into a fact,
--     and is what lib/running.ts's zoneForHr reads.

alter table public.training_logs add column if not exists run_type text;
alter table public.training_logs add column if not exists zone smallint;
alter table public.training_logs add column if not exists avg_hr integer;

do $$
begin
  -- Kept as an explicit list rather than free text: this column drives the
  -- hard/easy split, and a typo would silently move a session from one side of
  -- the 80/20 report to the other.
  if not exists (select 1 from pg_constraint where conname = 'training_logs_run_type_check') then
    alter table public.training_logs
      add constraint training_logs_run_type_check
      check (run_type is null or run_type in (
        'recovery', 'easy', 'long', 'steady', 'progression',
        'tempo', 'cruise', 'vo2', 'reps', 'fartlek',
        'hills', 'strides', 'shakeout', 'timetrial'
      ));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'training_logs_zone_check') then
    alter table public.training_logs
      add constraint training_logs_zone_check
      check (zone is null or (zone >= 1 and zone <= 5));
  end if;

  -- 250 is above any human maximum; the point is to reject a mis-keyed 1500,
  -- not to police what someone's watch reported.
  if not exists (select 1 from pg_constraint where conname = 'training_logs_avg_hr_check') then
    alter table public.training_logs
      add constraint training_logs_avg_hr_check
      check (avg_hr is null or (avg_hr >= 30 and avg_hr <= 250));
  end if;
end $$;

-- The 80/20 report reads a rolling window of runs per athlete, so it filters on
-- (user_id, log_date) and then on run_type. Partial: only a minority of rows in
-- a mixed-sport table are runs, and there is no reason to index the nulls.
create index if not exists training_logs_run_type_idx
  on public.training_logs (user_id, log_date desc)
  where run_type is not null;

comment on column public.training_logs.run_type is
  'Which of the fourteen run types this was. Drives the hard/easy split — see lib/running.ts RUN_TYPES.';
comment on column public.training_logs.zone is
  'The zone actually run, 1-5. May differ from the zone the run type prescribes, which is the point.';
comment on column public.training_logs.avg_hr is
  'Average heart rate from a watch. Lets zoneForHr confirm the zone rather than trusting the label.';
