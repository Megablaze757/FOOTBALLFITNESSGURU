// =============================================================================
// WHERE A CUT COULD GO, AND HOW MANY THAT WOULD BE.
//
// ═══════════════════════════════════════════════════════════════════════════
// EVERY REEL THIS PROJECT HAS MADE HAS ZERO CUTS. THAT IS MEASURED.
//
// scripts/measure-motion.py, run over every finished file:
//
//                                dur   cuts/s   motion   still   longest
//   a reel this account admires 12.9s    1.94   0.0643     15%      0.8s
//   demo-cost                   27.1s    0.00   0.0048     90%      6.0s
//   demo-readiness              27.8s    0.00   0.0046     94%      4.3s
//   drill                       28.4s    0.00   0.0035     94%      5.6s
//   standards                   27.7s    0.00   0.0041     93%     10.4s
//
// Not few cuts. None. The recorder films one continuous slow drift per screen,
// which was a deliberate improvement on holding a still frame — and against a
// feed cutting twice a second it is still, measurably, a screen recording.
//
// ───────────────────────────────────────────────────────────────────────────
// THIS MODULE DECIDES NOTHING ABOUT PIXELS, ON PURPOSE.
//
// The blank-frame problem in this project has been guessed at three times and
// two of those guesses shipped before being measured. A visual change cannot
// be verified without recording, recording needs the demo account, and a
// change to what the reels LOOK like is not something to push untested on the
// strength of an argument.
//
// So this is the arithmetic only: given a plan, where would cuts fall, how
// many would there be, and does that reach the rate the comparison implies.
// It answers "is this worth recording once to find out" without recording.
// The recorder does not read it yet, and the test says so rather than leaving
// that to be discovered.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

import type { PlanStep, ReelPlan } from "./reel-plan";

/**
 * The rate to aim at, taken from the one reel this account has measured
 * against rather than from a blog post: 25 cuts in 12.9 seconds.
 *
 * A TARGET, NOT A RULE. Nothing enforces it and nothing should — a reel forced
 * to cut on a schedule cuts in the middle of a sentence. It is here so a
 * predicted count has something to be compared with.
 */
export const CUT_TARGET_PER_S = 1.9;

/** Below this a reel is closer to a screen recording than to an edit. */
export const CUT_FLOOR_PER_S = 0.8;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A CUT LANDS ON A PHRASE BOUNDARY AND NOWHERE ELSE.
 *
 * Every other candidate is worse. On a fixed clock it cuts mid-word. On a
 * frame count it drifts against the narration. The phrase boundaries are
 * already measured from the synthesised audio and already carried on the step
 * as `clips` — the captions are cut there, so the picture changing there is
 * the picture agreeing with the words instead of fighting them.
 *
 * NOT THE FIRST PHRASE OF A BEAT. A beat that changes route already produces
 * the biggest visual change available to this recorder, and a cut on top of a
 * navigation is one shot nobody sees.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export interface CutPoint {
  /** Milliseconds from the start of the reel. */
  at: number;
  beat: number;
  /** Which phrase of that beat this cut opens. */
  phrase: number;
}

export interface CutPlan {
  points: CutPoint[];
  /** Cuts plus one for every route change, which is a cut by any measure. */
  cuts: number;
  perSecond: number;
  seconds: number;
  /** Beats skipped, and why — the interesting half of the output. */
  skipped: { beat: number; why: string }[];
  reachesFloor: boolean;
  reachesTarget: boolean;
}

/**
 * Why a beat is left alone.
 *
 * TWO REASONS, BOTH OF THEM BUGS THIS PROJECT HAS ALREADY HAD.
 *
 * A beat that aims a spotlight must not move under it. scripts/record-reel.mts
 * records what happens: the spotlight is position:fixed and computed once, the
 * drift scrolled the page out from under it, and "the reveal frame had a gold
 * ring, correctly drawn, around 'Turkey breast mince £1.06' while the caption
 * said 'Cheapest: £0.31'" — worse than no spotlight, because it pointed
 * confidently at the wrong row. A snap does that instantly instead of gradually.
 *
 * And the closing beat glides back to the top so the last frame matches the
 * first, which is the whole of the loop argument in lib/reel-scroll.ts. A cut
 * in the middle of that arrival throws the framing away.
 */
export function cutsAllowed(step: PlanStep, isClosing: boolean): string | null {
  if (isClosing) return "the closing beat glides back for the loop";
  if (step.focus) return "the beat aims a spotlight, which must not move";
  return null;
}

export function cutPlan(plan: ReelPlan): CutPlan {
  const steps = plan?.steps ?? [];
  const seconds = (plan?.totalMs ?? 0) / 1000;
  const points: CutPoint[] = [];
  const skipped: { beat: number; why: string }[] = [];

  let onRoute: string | null = null;
  let navigations = 0;
  for (const step of steps) {
    if (step.route !== onRoute) {
      onRoute = step.route;
      navigations += 1;
    }

    const why = cutsAllowed(step, step === steps[steps.length - 1]);
    if (why) {
      skipped.push({ beat: step.index, why });
      continue;
    }

    const clips = step.clips ?? [];
    // From the SECOND phrase. The first one opens the beat, which already
    // looks different from whatever preceded it.
    for (let i = 1; i < clips.length; i++) {
      points.push({ at: Math.round(step.at + clips[i].atMs), beat: step.index, phrase: i });
    }
  }

  // A navigation is a cut whether or not anything here asks for one — the
  // whole screen is replaced. Counting them is the difference between what
  // this module would ADD and what the reel would then measure.
  const cuts = points.length + navigations;
  const perSecond = seconds > 0 ? cuts / seconds : 0;
  return {
    points,
    cuts,
    perSecond,
    seconds,
    skipped,
    reachesFloor: perSecond >= CUT_FLOOR_PER_S,
    reachesTarget: perSecond >= CUT_TARGET_PER_S,
  };
}

/** The whole thing as lines, for whoever has to decide whether to record it. */
export function cutReport(plans: readonly ReelPlan[]): string[] {
  const lines = [
    `A cut per phrase boundary would give, against a measured ${CUT_TARGET_PER_S}/s:`,
  ];
  for (const plan of plans) {
    const out = cutPlan(plan);
    const verdict = out.reachesTarget ? "reaches it"
      : out.reachesFloor ? "short of it, clear of a screen recording"
      : "still a screen recording";
    lines.push(
      `  ${plan.id.padEnd(24)} ${out.seconds.toFixed(1)}s  `
      + `${String(out.cuts).padStart(2)} cuts  ${out.perSecond.toFixed(2)}/s  ${verdict}`,
    );
    for (const s of out.skipped) lines.push(`      beat ${s.beat} left alone: ${s.why}`);
  }
  lines.push("");
  lines.push("Measured today, every one of these reels is 0.00/s.");
  return lines;
}
