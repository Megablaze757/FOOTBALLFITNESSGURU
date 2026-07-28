-- =============================================================================
-- 0059: Undo 0058. It solved a problem that did not exist.
--
-- 0058 added coach-read policies to daily_check_ins, training_logs, programs and
-- strength_benchmarks, on the finding that a coach had no access to any of
-- them and the squad dashboard was therefore showing zeros.
--
-- That finding was wrong. Coach access already existed on all four — and on
-- profiles, daily_insights, biometrics and body_logs — through is_coach_of(),
-- which correctly requires an ACCEPTED link. The audit that missed it searched
-- policy expressions for "coach_athletes" and "coach_id"; is_coach_of(user_id)
-- contains neither string, so a working mechanism read as an absent one.
--
-- The added policies were harmless — permissive SELECT policies OR together, so
-- the effect was identical — but two policies granting the same thing is how a
-- future audit reaches a wrong conclusion in the other direction. One
-- mechanism, one place to read it.
--
-- Reverting rather than leaving it: a migration that did nothing should not
-- survive as though it did something.
-- =============================================================================

drop policy if exists "coach reads athlete check-ins" on public.daily_check_ins;
drop policy if exists "coach reads athlete training" on public.training_logs;
drop policy if exists "coach reads athlete programs" on public.programs;
drop policy if exists "coach reads athlete benchmarks" on public.strength_benchmarks;

-- The helper 0058 introduced. is_coach_of() already did exactly this.
drop function if exists public.coaches_athlete(uuid);

-- =============================================================================
-- WHAT IS ACTUALLY WRONG HERE, and it isn't the policies.
--
-- A coach can read: profiles, daily_check_ins, daily_insights, training_logs,
-- programs, strength_benchmarks, biometrics AND body_logs.
--
-- What the athlete is told when they accept a coach request is:
--
--     "They'll be able to view your readiness & training."
--
-- Body logs are progress photos and measurements. Biometrics are HRV, resting
-- heart rate and sleep. The check-in itself carries body WEIGHT. None of that
-- is "readiness & training" by any ordinary reading, and consent obtained
-- against a narrower description isn't consent to the wider thing.
--
-- Worth recording for whoever reads this next: there is no separate "journal
-- notes" table. The journal IS the daily check-in, so every field in it —
-- sleep, fatigue, the pain map, weight — is visible to an accepted coach.
--
-- Not fixed in SQL on purpose. Narrowing the policies would silently break the
-- coach features already built on them, and widening the disclosure is a
-- product decision about what a coach should see — not one to make inside a
-- migration. The consent text is corrected in components/CoachRequests.tsx so
-- that what athletes agree to from now on is at least accurate, and the choice
-- of whether to narrow access is left where it belongs.
-- =============================================================================

notify pgrst, 'reload schema';
