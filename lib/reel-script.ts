// =============================================================================
// A REEL THAT IS A SCREEN RECORDING WITH A VOICE OVER IT.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE REELS WERE SLIDESHOWS, AND SLIDESHOWS DO NOT GET WATCHED.
//
// lib/reel.ts draws SVG cards onto a canvas and records the canvas. Every frame
// is generated, every figure is real, and the result is text sliding over a
// gradient — which is the format people scroll past fastest, because there is
// nothing to look at that could not have been a screenshot.
//
// The thing worth filming is the app. A readiness score dropping after a bad
// night, a shopping list pricing itself, a program rebuilding around a missed
// session: those are moving pictures of something happening, and no card can
// stand in for them.
//
// So this produces a SHOT LIST rather than frames: which screen, what to do on
// it, how long to stay, and the line to say over it. The recording is the real
// app, captured from the real screen; this is the thing that makes the capture
// worth starting.
//
// ─────────────────────────────────────────────────────────────────────────
// A BEAT MUST LAST LONGER THAN ITS LINE TAKES TO SAY.
//
// The one rule that decides whether it is watchable. A four-second shot with
// nine seconds of narration over it is either a voice racing a picture or a cut
// that lands mid-word, and both read as amateur immediately. Every beat's
// duration is therefore derived FROM its line — see holdFor in lib/reel.ts,
// which already knows how long words take — rather than chosen and hoped for.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

import { holdFor, MIN_SCENE_MS, MAX_REEL_MS, MS_PER_WORD } from "./reel";
import { hookText, HOOK_MAX_WORDS } from "./reel-kinds";
import { SKILL_DRILLS } from "./skills";
import { indexFacts, money, REFERENCE_PROTEIN } from "./protein-index";
import { standardPages } from "./standards-page";
import { sportLabel } from "./seo";
import type { SportId } from "./exercises";

export interface Beat {
  /** Milliseconds from the start of the recording. */
  at: number;
  ms: number;
  /**
   * The route to be on. Same-origin, so the recorder can drive it — but the
   * person is filming their own screen, so this is a cue as much as a command.
   */
  route: string;
  /** What to do once you are there, in the imperative. */
  action: string;
  /** The line to say over it. Empty means let the screen speak. */
  say: string;
}

export interface ReelScript {
  id: string;
  /** The first two seconds, which decide whether the rest is watched. */
  hook: string;
  beats: Beat[];
  totalMs: number;
  /** Words to be spoken, for a read-time estimate before recording. */
  words: number;
}

/**
 * The hook has to be on screen and said before anybody has decided to leave.
 *
 * Two seconds is the number that gets quoted and it is roughly right; what
 * matters here is that it is enforced rather than intended, because a hook that
 * arrives at 00:04 is a reel with no hook.
 */
export const HOOK_BY_MS = 2_000;

/** A shot nobody can read. Shorter than this and the eye has not landed yet. */
export const MIN_BEAT_MS = MIN_SCENE_MS;

/**
 * Turn lines into timed beats.
 *
 * Each beat lasts the longer of: how long its line takes to say, and how long
 * the eye needs on a screen it has not seen before. Absent a line, the second
 * one is all there is.
 */
function time(beats: Omit<Beat, "at" | "ms">[]): Beat[] {
  let at = 0;
  return beats.map((b) => {
    const ms = Math.max(MIN_BEAT_MS, b.say ? holdFor(b.say) : 0);
    const beat = { ...b, at, ms };
    at += ms;
    return beat;
  });
}

function build(id: string, hook: string, raw: Omit<Beat, "at" | "ms">[]): ReelScript {
  const beats = time(raw);
  return {
    id,
    hook: hookText(hook),
    beats,
    totalMs: beats.reduce((n, b) => n + b.ms, 0),
    words: beats.reduce((n, b) => n + (b.say ? b.say.trim().split(/\s+/).length : 0), 0),
  };
}

/**
 * READINESS IS THE ONE TO FILM.
 *
 * It is the only screen in the app where a number changes because of something
 * that happened to you, and watching it move is the entire pitch. Every other
 * demo is a list that could have been a screenshot.
 */
function readinessScript(): ReelScript {
  return build("demo-readiness", "Your app does not know you slept badly.", [
    {
      route: "/journal",
      action: "Open the check-in. Do not fill it in yet — let the empty form show.",
      say: "Every training app gives you the session it planned last week.",
    },
    {
      route: "/journal",
      action: "Log a bad night: sleep 3, fatigue 8, tap two sore areas on the body map.",
      say: "This one asks how you actually slept, and how sore you actually are. Sixty seconds.",
    },
    {
      route: "/home",
      action: "Show the readiness score. Let it sit — the number is the point.",
      say: "The score is worked out on the phone, and it changes what you are told to do today.",
    },
    {
      route: "/home",
      action: "Scroll to today's session so the adjusted work is visible.",
      say: "Not a warning you can ignore. The session itself is different.",
    },
    { route: "/", action: "Land on the front page so the address is on screen.", say: "" },
  ]);
}

/** The costed shopping list, which is the thing no other app can show. */
function costScript(): ReelScript {
  const facts = indexFacts();
  const cheap = facts ? `${money(facts.cheapest.cost)} from ${facts.cheapest.name.toLowerCase()}` : "under a pound";
  const dear = facts ? `${money(facts.dearest.cost)}` : "over three pounds";
  return build("demo-cost", `${REFERENCE_PROTEIN}g of protein: ${cheap}.`, [
    {
      route: "/cheapest-protein/",
      action: "Show the top of the ranked table.",
      say: `${REFERENCE_PROTEIN} grams of protein costs ${cheap}.`,
    },
    {
      route: "/cheapest-protein/",
      action: "Scroll slowly to the bottom of the table.",
      say: `The same ${REFERENCE_PROTEIN} grams costs ${dear} at the other end. Same protein.`,
    },
    {
      route: "/recipes/",
      action: "Open any recipe and show the costed ingredient list.",
      say: "Every recipe in here is priced to the ingredient, from real pack sizes.",
    },
    {
      route: "/nutrition",
      action: "Show a meal plan with its weekly cost.",
      say: "So the plan it builds you has a number on it before you shop.",
    },
    { route: "/", action: "Front page. Hold two seconds.", say: "" },
  ]);
}

/** A drill, filmed on the page that teaches it. */
function drillScript(drillId: string): ReelScript | null {
  const drill = SKILL_DRILLS.find((d) => d.id === drillId) ?? SKILL_DRILLS[0];
  if (!drill) return null;
  const sport = sportLabel(drill.sport as SportId);
  return build(`drill-${drill.id}`, `Most people do ${drill.name.toLowerCase()} wrong.`, [
    {
      route: `/drills/${drill.sport}/`,
      action: `Find ${drill.name} in the list and open it.`,
      say: `${drill.name}, for ${sport.toLowerCase()}.`,
    },
    {
      route: `/drills/${drill.sport}/`,
      action: "Show the setup section.",
      say: drill.setup,
    },
    {
      route: `/drills/${drill.sport}/`,
      action: "Show the numbered steps, scrolling at reading pace.",
      say: drill.reps,
    },
    {
      route: `/drills/${drill.sport}/`,
      action: "Stop on the coaching cue and hold it.",
      say: `The bit that matters: ${drill.coaching}`,
    },
    { route: "/drills/", action: "The drill index, so the breadth shows.", say: "" },
  ]);
}

/** What a lift is worth, which is the question people actually ask. */
function standardsScript(): ReelScript | null {
  const page = standardPages().find((p) => p.slug === "bench-press") ?? standardPages()[0];
  if (!page) return null;
  return build(`standards-${page.slug}`, `Is your ${page.lift.label.toLowerCase()} any good?`, [
    {
      route: "/standards/",
      action: "Show the list of lifts.",
      say: `"Is my ${page.lift.label.toLowerCase()} good" has no answer without your bodyweight.`,
    },
    {
      route: `/standards/${page.slug}/`,
      action: "Open the table and stop on the middle rows.",
      say: "So here it is as a multiple of bodyweight, from untrained to world class.",
    },
    {
      route: "/benchmarks",
      action: "Show a logged lift with its tier beside it.",
      say: "Log a lift in the app and it tells you which tier you are in, at your weight.",
    },
    { route: "/", action: "Front page.", say: "" },
  ]);
}

export type ScriptId = "demo-readiness" | "demo-cost" | "drill" | "standards";

export const SCRIPTS: { id: ScriptId; label: string; note: string }[] = [
  { id: "demo-readiness", label: "Readiness changes the session", note: "The one screen where a number moves because of you" },
  { id: "demo-cost", label: "What protein actually costs", note: "The table, then a recipe, then a priced plan" },
  { id: "drill", label: "One drill, done properly", note: "Setup, volume, and the cue that separates them" },
  { id: "standards", label: "Is your lift any good?", note: "The table, then your own lift ranked against it" },
];

export function reelScript(id: ScriptId, subject?: string): ReelScript | null {
  if (id === "demo-readiness") return readinessScript();
  if (id === "demo-cost") return costScript();
  if (id === "drill") return drillScript(subject ?? "");
  if (id === "standards") return standardsScript();
  return null;
}

export interface ScriptProblem {
  beat: number;
  problem: string;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT MAKES A REEL UNWATCHABLE, CHECKED BEFORE IT IS RECORDED.
 *
 * Every one of these is a mistake that cannot be fixed afterwards without
 * filming it again — which is why they are worth catching while the script is
 * still text. A voiceover that overruns its shot is not an edit, it is a
 * reshoot.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function scriptProblems(script: ReelScript): ScriptProblem[] {
  const problems: ScriptProblem[] = [];

  if (script.hook.split(/\s+/).length > HOOK_MAX_WORDS) {
    problems.push({ beat: 0, problem: `the hook is ${script.hook.split(/\s+/).length} words — nobody reads past ${HOOK_MAX_WORDS}` });
  }
  if (script.beats.length === 0) {
    problems.push({ beat: 0, problem: "there is nothing to film" });
    return problems;
  }
  if (script.beats[0].at > HOOK_BY_MS) {
    problems.push({ beat: 0, problem: "the first beat starts after the hook window" });
  }
  if (script.totalMs > MAX_REEL_MS) {
    problems.push({ beat: 0, problem: `${Math.round(script.totalMs / 1000)}s — over the ${MAX_REEL_MS / 1000}s ceiling` });
  }

  script.beats.forEach((beat, i) => {
    if (!beat.route.startsWith("/")) {
      problems.push({ beat: i, problem: `"${beat.route}" is not a route` });
    }
    if (!beat.action.trim()) {
      problems.push({ beat: i, problem: "no action — the camera does not know what to point at" });
    }
    if (beat.say && beat.ms < holdFor(beat.say)) {
      problems.push({ beat: i, problem: "the line does not fit in the shot" });
    }
    if (beat.ms < MIN_BEAT_MS) {
      problems.push({ beat: i, problem: `${beat.ms}ms — too short to read` });
    }
  });

  return problems;
}

/** Roughly how long the narration takes, for the person about to read it. */
export function readTimeMs(script: ReelScript): number {
  return script.words * MS_PER_WORD;
}

export interface BeatCursor {
  beat: Beat;
  index: number;
  /** 0 to 1 through this beat. */
  progress: number;
  /** True once the clock is past the last beat — the take has overrun. */
  overrun: boolean;
}

/**
 * Which beat the clock is inside.
 *
 * Lived in the component and was therefore untested, which is a poor place for
 * the one function the teleprompter is. Two edges matter and neither is
 * obvious from reading it: time zero must land on the FIRST beat rather than
 * on nothing, and running past the end must hold the last beat rather than
 * return null — a prompter that goes blank at the end reads as a crash, at the
 * exact moment somebody is still talking.
 */
export function beatAt(script: ReelScript, ms: number): BeatCursor | null {
  if (script.beats.length === 0) return null;
  const at = Math.max(0, ms);
  for (const [index, beat] of script.beats.entries()) {
    if (at < beat.at + beat.ms) {
      /**
       * No clamp, because the loop already bounds this and a clamp that cannot
       * fire is a claim that it can. `at` is at least this beat's start — every
       * earlier beat was skipped for ending before it — and less than its end
       * by the condition above. Both halves rest on beats being CONTIGUOUS,
       * which `time()` guarantees by construction and a test asserts.
       */
      return { beat, index, progress: (at - beat.at) / beat.ms, overrun: false };
    }
  }
  const index = script.beats.length - 1;
  return { beat: script.beats[index], index, progress: 1, overrun: true };
}
