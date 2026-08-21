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

const TOTAL_MINUTES = /(\d{1,3})\s*(?:min\b|mins\b|minutes?\b)\s+total\b/i;
const DISTANCE_WITH_MINUTES = /^\s*(\d+(?:\.\d+)?)\s*km\b\s*·\s*(\d{1,3})\s*(?:min\b|mins\b|minutes?\b)/i;
const LEADING_MINUTES = /^(\s*(?:\d+\s*[×x]\s*)?)(\d{1,3})(\s*(?:min\b|mins\b|minutes?\b))/i;

/**
 * The real timed dose written in a prescription, when it has one.
 *
 * A shaped running session puts the complete session first in importance even
 * though the interval itself appears first in the text: "6 × 3 min · 50 min
 * total" is a fifty-minute workout, not a three-minute one. Distance sessions
 * carry their engine-calculated duration alongside the kilometres for the same
 * reason — a distance alone cannot be turned into time without inventing pace.
 */
export function prescribedDurationMinutes(drill: ProgramDrill): number | null {
  const dose = drill.prescription ?? "";
  const total = TOTAL_MINUTES.exec(dose);
  if (total) return Number(total[1]);
  const distance = DISTANCE_WITH_MINUTES.exec(dose);
  if (distance) return Number(distance[2]);
  const leading = LEADING_MINUTES.exec(dose);
  if (leading) return Math.max(1, Math.round(Number(drill.sets) || 1)) * Number(leading[2]);
  return null;
}

/** Rewrite a timed dose while preserving the useful shape/zone copy around it. */
export function withPrescribedDurationMinutes(drill: ProgramDrill, minutes: number): ProgramDrill {
  const next = Math.max(1, Math.floor(minutes));
  const dose = drill.prescription ?? "";

  if (TOTAL_MINUTES.test(dose)) {
    return { ...drill, prescription: dose.replace(TOTAL_MINUTES, `${next} min total`) };
  }

  const distance = DISTANCE_WITH_MINUTES.exec(dose);
  if (distance) {
    const previousMinutes = Number(distance[2]);
    const previousKm = Number(distance[1]);
    const nextKm = previousMinutes > 0
      ? Math.max(0.5, Math.round((previousKm * next / previousMinutes) * 10) / 10)
      : previousKm;
    return {
      ...drill,
      prescription: dose.replace(DISTANCE_WITH_MINUTES, `${nextKm}km · ${next} min`),
    };
  }

  const leading = LEADING_MINUTES.exec(dose);
  if (!leading) return drill;
  const sets = Math.max(1, Math.round(Number(drill.sets) || 1));
  const perSet = Math.max(1, Math.floor(next / sets));
  const priorPerSet = Number(leading[2]);
  return {
    ...drill,
    reps: sets === 1 && Number(drill.reps) === priorPerSet ? perSet : drill.reps,
    prescription: dose.replace(LEADING_MINUTES, `$1${perSet}$3`),
  };
}

/** How long one drill takes, in seconds. */
/**
 * Setup between one WARM-UP drill and the next.
 *
 * A warm-up flows: you finish band pull-aparts and start shoulder dislocates
 * without racking anything, finding anything or adjusting anything. Charging
 * the full sixty was a real modelling error and it had a real consequence —
 * once the checklist began guaranteeing a warm-up on every session, three
 * minutes of imaginary changeover per session was enough, against a hard 90
 * minute cap, to make the fit pass drop a working set to pay for it. Muscles
 * reaching the productive band fell from 88% to 79% for want of time nobody
 * actually spends.
 */
const PREP_CHANGEOVER = 15;

export function drillSeconds(drill: ProgramDrill): number {
  const sets = Math.max(1, Math.round(Number(drill.sets) || 1));
  const reps = Math.max(0, Math.round(Number(drill.reps) || 0));

  const rest = drill.rest != null && drill.rest > 0 ? drill.rest : DEFAULT_REST;
  const changeover = drill.slot === "warmup" || drill.slot === "cooldown" ? PREP_CHANGEOVER : CHANGEOVER;

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
  /**
   * A duration has to be the DOSE at the start of the prescription.
   *
   * The old loose search found any number followed by "minutes" anywhere in
   * the sentence. That priced the coaching note "Every long run over 90
   * minutes" as another ninety-minute exercise, turning a real 95-minute
   * session into a displayed 185-minute one. Anchoring still recognises
   * "40 min" and "1 × 40 minutes", while ordinary coaching prose stays prose.
   */
  const minutes = prescribedDurationMinutes(drill);
  if (minutes != null) {
    // A duration is the whole thing, rests included.
    return minutes * 60 + CHANGEOVER;
  }
  const metres = /(\d{1,4})\s*(m\b|metres|meters)/i.exec(dose);
  if (metres) {
    // Five metres a second — a tempo run or a repeat, not a sprint PB and not a
    // jog. Good enough to tell a twelve-minute interval set from an hour.
    const work = sets * (Number(metres[1]) / 5);
    return work + Math.max(0, sets - 1) * rest + changeover;
  }
  const seconds = /(\d{1,3})\s*(s\b|secs?|seconds?)/i.exec(dose);
  if (seconds) {
    return sets * Number(seconds[1]) + Math.max(0, sets - 1) * rest + changeover;
  }

  const work = sets * reps * SECONDS_PER_REP;
  // Rest happens BETWEEN sets, so a three-set drill has two rests, not three.
  // Counting the last one adds a rest period at the end of every exercise in
  // the session, which on a nine-movement day is a fictional quarter of an hour.
  const resting = Math.max(0, sets - 1) * rest;
  return work + resting + changeover;
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
