// =============================================================================
// How to do the thing in front of you — whatever kind of thing it is.
//
// THE HOLE THIS FILLS. A session's drills are drawn from three catalogues that
// were written separately and never introduced to each other:
//
//   lib/exercises.ts  the gym movements  — demo, description, cues
//   lib/skills.ts     the ball work      — setup, how[], coaching, progression
//   lib/running.ts    the runs           — purpose, howTo, watchFor
//
// Every screen that shows a session only ever asked the first one. So the
// guided session put "Tight cone weave · 8 runs" on the screen with no demo, no
// cue and no how-to, and tapping it in the plan did nothing — because
// getExerciseByName returned null and every caller treated null as "there is
// nothing to say about this". There was plenty to say. It was written, it was
// tested, and it was two modules away.
//
// Measured on six generated programs: 536 drills, of which 464 are library
// exercises, 66 are skill drills and 6 are runs. Thirteen per cent of the work
// an athlete is asked to do came with no instruction at all, and for a
// footballer — whose ball work is most of what makes the program theirs — it
// was a much larger share of the session than that average suggests.
//
// ORDER OF PREFERENCE: the exercise library first. Nine run labels and two
// skill drills also exist there as full entries with a demo and coaching cues,
// and those entries already say what the run type says — see "Long run", whose
// library description and RunType.howTo are the same coaching in two voices.
// Taking the library entry keeps one answer per movement instead of printing
// both.
//
// Pure + tested.
// =============================================================================

import {
  getExerciseByName, SPORTS, demoImplement,
  type DemoPattern, type Exercise, type Implement,
} from "./exercises";
import { findExercise } from "./exercise-match";
import { SKILL_DRILLS, type SkillDrill } from "./skills";
import { RUN_TYPES } from "./running";
import { exerciseMuscles } from "./muscle-volume";
import { equipBucket } from "./exercise-catalog";
import { guessDemo, guessImplement, guessMuscles } from "./exercise-guess";

export type HowToSource = "exercise" | "skill" | "run";

/**
 * Everything a screen needs to teach one drill, in one shape.
 *
 * Deliberately not a union. A component that has to switch on the source to
 * decide which fields exist is the same coupling this file was written to
 * remove — the caller wants "the steps", not "the steps if it's a skill drill,
 * or the description if it's an exercise, or howTo if it's a run".
 */
export interface HowTo {
  name: string;
  source: HowToSource;
  /** Short subtitle for a card: "Chest · Barbell", "Football · Dribbling". */
  tag: string;
  /** One line: why you are doing it at all. */
  why: string;
  /** Kit and space needed. Skill drills state it; the others rarely need to. */
  setup?: string;
  /** How to perform it. One paragraph, or a step per line. */
  steps: string[];
  /** Short coaching cues. */
  cues: string[];
  /** The mistake that ruins it. */
  watch?: string;
  /** How to make it harder once it's easy. */
  progression?: string;
  /**
   * Whether `steps` genuinely teaches the movement.
   *
   * The bulk gym import carries a one-line note on what a lift is FOR, and
   * printing that under a heading reading "How to perform it" promises a
   * step-by-step and delivers a sentence. The UI needs to be able to tell the
   * difference — see ExerciseDetailCard, which has always drawn it.
   */
  teaches: boolean;
  /** Who you need. Absent for anything you can always do alone. */
  needs?: SkillDrill["needs"];
  /** Which movement pose to draw, so every row has a picture. */
  demo: DemoPattern;
  implement: Implement;
  /** Primary mover first, then assisting muscles, for the anatomy visual. */
  muscles: string[];
}

const SKILL_BY_NAME = new Map(SKILL_DRILLS.map((d) => [d.name.trim().toLowerCase(), d]));
const RUN_BY_LABEL = new Map(RUN_TYPES.map((r) => [r.label.trim().toLowerCase(), r]));
const SPORT_LABEL = new Map(SPORTS.map((s) => [s.id, s.label]));

/**
 * The coaching for a drill named in a program, from whichever catalogue holds
 * it. A non-empty custom name receives an honest fallback card; null is only
 * for a blank name that cannot label a card.
 */
export function howToFor(name: string): HowTo | null {
  const key = name.trim().toLowerCase();
  if (!key) return null;

  const ex = getExerciseByName(name);
  if (ex) return exerciseHowTo(ex);

  const skill = SKILL_BY_NAME.get(key);
  if (skill) {
    return {
      name: skill.name,
      source: "skill",
      tag: [SPORT_LABEL.get(skill.sport) ?? skill.sport, skill.skill].join(" · "),
      // A skill drill has no one-line "why" of its own. Its coaching point is
      // the closest thing — it is the reason the drill is worth doing.
      why: skill.coaching,
      setup: skill.setup,
      steps: skill.how,
      // `coaching` is already the why; repeating it as a cue would print the
      // same sentence twice on one card.
      cues: [],
      progression: skill.progression,
      teaches: true,
      needs: skill.needs,
      demo: "ball",
      implement: "none",
      muscles: ["Quads", "Glutes", "Calves", "Core"],
    };
  }

  const run = RUN_BY_LABEL.get(key);
  if (run) {
    return {
      name: run.label,
      source: "run",
      tag: `Running · Zone ${run.primaryZone}`,
      why: run.purpose,
      steps: [run.howTo],
      cues: [],
      watch: run.watchFor,
      teaches: true,
      demo: "run",
      implement: "none",
      muscles: ["Quads", "Hamstrings", "Glutes", "Calves", "Core"],
    };
  }

  // PROGRAM NAMES ARE NOT ALWAYS CATALOGUE NAMES. An older saved programme, a
  // coach-written session or an AI variation can say "DB incline chest press"
  // while the library says "Incline dumbbell press". The exact-only lookup
  // gave those rows a dot instead of a figure and made them impossible to tap.
  // Reuse the cautious matcher already used by rehab and swaps before falling
  // back to a clearly labelled custom card.
  const close = findExercise(name);
  if (close) return exerciseHowTo(close, name.trim());

  return fallbackHowTo(name.trim());
}

function exerciseHowTo(ex: Exercise, displayName = ex.name): HowTo {
  const { primary, secondary } = exerciseMuscles(ex.name, ex.muscles);
  return {
    name: displayName,
    source: "exercise",
    tag: [primary ?? ex.category, equipBucket(ex.equipment)].filter(Boolean).join(" · "),
    why: ex.why,
    // `description` falls back to `why` when nothing was written for the
    // movement, and repeating one line as both the summary and the method is
    // worse than showing the summary once.
    steps: ex.hasHowTo && ex.description ? [ex.description] : [],
    cues: ex.cues,
    teaches: !!ex.hasHowTo,
    demo: ex.demo,
    implement: demoImplement(ex),
    muscles: [primary, ...secondary].filter((m): m is string => !!m),
  };
}

/** A useful, honest card for a coach-entered movement the catalogue has never seen. */
function fallbackHowTo(name: string): HowTo {
  // The same guesser the check-in uses when it saves one of these names as a
  // real exercise, so the card drawn here and the card drawn from the saved row
  // are the same card. This file used to carry its own copy of these patterns.
  const muscles = guessMuscles(name);
  return {
    name,
    source: "exercise",
    tag: [muscles[0] ?? "Full body", "Custom exercise"].join(" · "),
    why: "This movement was added to your session outside the exercise library, so its exact coaching notes are not available yet.",
    steps: ["Follow the setup and range your coach prescribed. Use a controlled tempo, stop before technique changes, and record a note if this name needs clarifying."],
    cues: ["Controlled reps", "Use a pain-free range", "Stop when form changes"],
    teaches: false,
    demo: guessDemo(name),
    implement: guessImplement(name),
    muscles,
  };
}

/** True when there is something worth opening a detail sheet for. */
export function hasHowTo(name: string): boolean {
  return howToFor(name) !== null;
}
