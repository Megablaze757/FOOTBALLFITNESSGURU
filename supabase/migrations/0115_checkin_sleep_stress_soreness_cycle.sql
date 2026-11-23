-- =============================================================================
-- 0115: What the check-in did not ask.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- FOUR THINGS, AND ONE OF THEM WAS ALREADY THERE.
--
-- The request was hours of sleep, sleep quality out of ten, current stress,
-- soreness, and cycle questions. `sleep_quality` has existed since 0001 and is
-- the "How did you sleep?" question the form already asks, so it is untouched.
-- The other three are new, and soreness is new DESPITE the overlap below.
--
-- SORENESS IS NOT FATIGUE, which is why it is its own column rather than a
-- rename. `fatigue_score` is the "How does the body feel?" question — Fresh to
-- Wrecked — and it has meant that since 0001. Muscle soreness and systemic
-- tiredness justify opposite changes to a session: sore but fresh is a day to
-- move and loosen up, wrecked but not sore is a day to rest. Merged into one
-- number, neither can be acted on. Renaming the old column would also silently
-- redefine every historical row and the readiness weighting tuned against it.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- NULL IS AN ANSWER HERE, AND IT IS THE COMMON ONE.
--
-- The check-in has a quick mode that exists, in its own words, to keep this a
-- "ten-second habit", and only hours-of-sleep joins it. Stress, soreness and
-- cycle are in the full form, so most rows will have them null — not because
-- anything failed, but because nobody was asked.
--
-- So every column here is nullable with NO default. A default would turn "not
-- asked" into "answered 5", which is worse than missing: lib/readiness.ts
-- renormalises its weights over the factors actually present, and a fabricated
-- middling answer would quietly drag every score toward the middle.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE CYCLE COLUMN, AND WHY IT IS A PHASE RATHER THAN A DIARY.
--
-- One nullable text column, constrained to four phases. It is not a cycle
-- tracker: there is no flow, no symptom list, no prediction, and no history
-- beyond the check-in row it sits on. An athlete picks a phase if they want
-- the coach to know, and nothing anywhere requires them to.
--
-- IT IS SPECIAL-CATEGORY DATA UNDER UK AND EU LAW, held on the same row as
-- everything else in the check-in, which means it inherits what already
-- protects that row and nothing new has to be invented:
--
--   * RLS. daily_check_ins is "own rows only" since 0001, and 0037's privilege
--     guard tightened the profile read that sits beside it. No admin policy
--     reaches this table — 0096 exists because an admin read of body_logs was
--     added for a screen and had to be taken away again.
--   * Deletion. The row cascades with the account (0001's `on delete cascade`).
--   * Consent. profiles.health_data_consent_at gates the notification pipeline
--     that reads check-in data; see 0091.
--
-- WHAT IT MUST NOT DO is move the readiness score. The phase informs the
-- ADVICE and nothing else. Individual response across a cycle varies enough
-- that a blanket penalty would be this project inventing a physiological law
-- and docking somebody's score with it — and a score that drops for a reason
-- the athlete cannot act on is a score they stop trusting.
-- lib/checkin-questions.test.ts has a test that the phase changes no number.
-- ═══════════════════════════════════════════════════════════════════════════
-- =============================================================================

alter table public.daily_check_ins
  -- Hours, not minutes: nobody knows their sleep to the minute, and 7.5 is the
  -- finest anybody answers. numeric(3,1) holds 0.0 to 24.0.
  add column if not exists sleep_hours numeric(3,1),
  add column if not exists stress_score integer,
  add column if not exists soreness_score integer,
  add column if not exists cycle_phase text;

-- A MIGRATION HAS TO BE SAFE IN A DATABASE THAT IS AHEAD OF IT, and safe to
-- run twice: drop before add, and state the final set rather than an interim
-- one. 0088 records what happens otherwise — a constraint narrowed back to a
-- state earlier than the data written under the next migration, and a file
-- nobody could apply.
alter table public.daily_check_ins drop constraint if exists daily_check_ins_sleep_hours_check;
alter table public.daily_check_ins add constraint daily_check_ins_sleep_hours_check
  check (sleep_hours is null or (sleep_hours >= 0 and sleep_hours <= 24));

alter table public.daily_check_ins drop constraint if exists daily_check_ins_stress_score_check;
alter table public.daily_check_ins add constraint daily_check_ins_stress_score_check
  check (stress_score is null or stress_score between 1 and 10);

alter table public.daily_check_ins drop constraint if exists daily_check_ins_soreness_score_check;
alter table public.daily_check_ins add constraint daily_check_ins_soreness_score_check
  check (soreness_score is null or soreness_score between 1 and 10);

/**
 * The phases, and nothing else allowed.
 *
 * A free-text column would accept anything the UI sent, which is how a typo
 * becomes a phase nobody can query for. Four values, lower case, matching
 * CYCLE_PHASES in lib/cycle.ts — kept in step by lib/checkin-questions.test.ts,
 * the same arrangement
 * lib/win-back.ts has with 0114.
 */
alter table public.daily_check_ins drop constraint if exists daily_check_ins_cycle_phase_check;
alter table public.daily_check_ins add constraint daily_check_ins_cycle_phase_check
  check (cycle_phase is null or cycle_phase = any (array['period', 'follicular', 'ovulation', 'luteal']));

comment on column public.daily_check_ins.sleep_hours is
  'Hours slept last night, as answered. Null means not asked, which is most quick check-ins.';
comment on column public.daily_check_ins.stress_score is
  '1 calm to 10 overwhelmed. Null means not asked — never defaulted, see 0115.';
comment on column public.daily_check_ins.soreness_score is
  '1 not sore to 10 very sore. Distinct from fatigue_score: soreness and tiredness need opposite sessions.';
comment on column public.daily_check_ins.cycle_phase is
  'Optional, athlete-selected. Special-category data: informs coaching advice and never the readiness score.';

-- The last statement reports the verdict, which is what
-- .github/workflows/apply-sql.yml prints back.
select
  'OK - migration 0115 applied' as result,
  count(*) filter (where column_name = 'sleep_hours') as sleep_hours,
  count(*) filter (where column_name = 'stress_score') as stress_score,
  count(*) filter (where column_name = 'soreness_score') as soreness_score,
  count(*) filter (where column_name = 'cycle_phase') as cycle_phase
from information_schema.columns
where table_schema = 'public' and table_name = 'daily_check_ins';
