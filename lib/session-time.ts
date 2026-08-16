// =============================================================================
// How long a session will actually take.
//
// WHY IT MATTERS ENOUGH TO COMPUTE. "Day 2 · Lower — quads, hamstrings, glutes"
// with nine exercises under it tells you everything except the one thing that
// decides whether you train today: whether it fits. An athlete with forty
// minutes and a session that needs seventy will either start it and abandon it
// half way, or skip it — and both of those look identical to the app, which
// records a missed session and nothing about why.
//
// The engine already knows every number this needs. Sets are prescribed, rest
// is prescribed (see drillFrom in lib/hypertrophy.ts), and reps times a tempo
// gives the working time. It was simply never added up.
//
// AN ESTIMATE, AND HONEST ABOUT IT. Nobody's session lands on the minute: they
// talk to someone, the rack is busy, a set goes badly and gets repeated. The
// number is there to answer "roughly, does this fit" — so it is rounded to five
// minutes and shown as a single figure rather than a false range.
//
// Pure + tested.
// =============================================================================

import type { ProgramSession, ProgramDrill } from "./engine";

/**
 * Seconds per rep under load.
 *
 * Three, which is a controlled rep with an eccentric worth the name — the tempo
 * this app's cues ask for throughout ("control the lowering", "slow and
 * controlled"). Counting a rep as one second would price the session as if
 * everybody trained like they were late for something.
 */
const SECONDS_PER_REP = 3;

/** Rest to assume when a drill carries none, e.g. an older saved plan. */
const DEFAULT_REST = 90;

/**
 * Setup between one exercise and the next — finding the rack, changing the
 * plates, adjusting the bench. Small per exercise and quietly enormous across a
 * nine-movement session, which is exactly the kind of time athletes are
 * surprised by.
 */
const CHANGEOVER = 60;

/** How long one drill takes, in seconds. */
export function drillSeconds(drill: ProgramDrill): number {
  const sets = Math.max(1, Math.round(Number(drill.sets) || 1));
  const reps = Math.max(0, Math.round(Number(drill.reps) || 0));

  const rest = drill.rest != null && drill.rest > 0 ? drill.rest : DEFAULT_REST;

  /**
   * CONDITIONING IS PRESCRIBED IN ITS OWN UNITS, AND THEY ARE NOT REPS.
   *
   * "1 × 75 minutes" and "6 × 100 metres" both arrive here as sets and reps.
   * Multiplying the number by three seconds a rep prices a seventy-five-minute
   * long run at under four minutes, and a six-by-hundred tempo set at thirty —
   * one wildly under, one wildly over, and both silently wrong in the number
   * the athlete is meant to plan their evening around.
   *
   * So read the unit the engine actually wrote. Both of these were found by
   * adding sessions up and looking at the answers.
   */
  const dose = drill.prescription ?? "";
  const minutes = /(\d{1,3})\s*min/i.exec(dose);
  if (minutes) {
    // A duration is the whole thing, rests included.
    return sets * Number(minutes[1]) * 60 + CHANGEOVER;
  }
  const metres = /(\d{1,4})\s*(m\b|metres|meters)/i.exec(dose);
  if (metres) {
    // Five metres a second — a tempo run or a repeat, not a sprint PB and not a
    // jog. Good enough to tell a twelve-minute interval set from an hour.
    const work = sets * (Number(metres[1]) / 5);
    return work + Math.max(0, sets - 1) * rest + CHANGEOVER;
  }
  const seconds = /(\d{1,3})\s*(s\b|secs?|seconds?)/i.exec(dose);
  if (seconds) {
    return sets * Number(seconds[1]) + Math.max(0, sets - 1) * rest + CHANGEOVER;
  }

  const work = sets * reps * SECONDS_PER_REP;
  // Rest happens BETWEEN sets, so a three-set drill has two rests, not three.
  // Counting the last one adds a rest period at the end of every exercise in
  // the session, which on a nine-movement day is a fictional quarter of an hour.
  const resting = Math.max(0, sets - 1) * rest;
  return work + resting + CHANGEOVER;
}

/** How long the whole session takes, in whole minutes. */
export function sessionSeconds(session: Pick<ProgramSession, "drills">): number {
  return (session.drills ?? []).reduce((n, d) => n + drillSeconds(d), 0);
}

/**
 * The figure to put on the card: minutes, rounded to the nearest five.
 *
 * Rounded because the precision would be a lie — "63 min" claims a confidence
 * this estimate does not have, and "about 65" is the same information without
 * the false accuracy.
 */
export function sessionMinutes(session: Pick<ProgramSession, "drills">): number {
  const minutes = sessionSeconds(session) / 60;
  return Math.max(5, Math.round(minutes / 5) * 5);
}

/** "~55 min" — the label itself, so every screen phrases it the same way. */
export function sessionLength(session: Pick<ProgramSession, "drills">): string {
  return `~${sessionMinutes(session)} min`;
}
