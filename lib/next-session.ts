// The next session an athlete hasn't ticked off.
//
// The Coach page computes the same thing inline in a different shape; this is
// extracted for the Journal, which needs today's drills to offer them for
// one-tap logging. Worth folding Coach onto this the next time that file is
// open — two implementations of "which session is today" will drift eventually.

import type { ProgramPlan } from "./coach";
import type { TrainingDrill } from "./types";

export interface NextSession {
  week: number;
  day: number;
  /** "w1d2" — the key stored in programs.completed_sessions. */
  id: string;
  title: string;
  drills: TrainingDrill[];
}

/**
 * The first session in the block that isn't already completed. Returns null once
 * every session is done — the caller shows "block complete" rather than looping
 * back to week 1.
 */
export function nextSession(plan: ProgramPlan | null | undefined, completed: string[] = []): NextSession | null {
  if (!plan?.weeks?.length) return null;
  const done = new Set(completed);
  for (const w of plan.weeks) {
    for (const s of w.sessions ?? []) {
      const id = `w${w.week}d${s.day}`;
      if (done.has(id)) continue;
      return {
        week: w.week,
        day: s.day,
        id,
        title: s.title,
        drills: (s.drills ?? []).map((d) => ({
          name: d.name,
          sets: d.sets,
          reps: d.reps,
          load_kg: null,
        })),
      };
    }
  }
  return null;
}
