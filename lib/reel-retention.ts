// =============================================================================
// WHAT MAKES A SHORT VIDEO GET WATCHED, ENFORCED RATHER THAN HOPED FOR.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE NUMBERS THESE RULES COME FROM.
//
// Every threshold below is a published figure, not a preference. They are
// written here with what they are so that changing one is an argument with the
// data rather than a tweak.
//
//   THE FIRST THREE SECONDS DECIDE.
//   71% of TikTok viewers decide whether to keep watching inside three
//   seconds; 65% who drop off do so in that window; on Shorts, 50-60% of all
//   drop-off happens there. Past it, 65% reach ten seconds and 45% of those
//   reach thirty — retention cascades from one moment.
//     — animoto.com/blog/video-marketing/why-first-3-seconds-matter
//     — opus.pro/blog/youtube-shorts-hook-formulas
//
//   MOST PEOPLE CANNOT HEAR IT.
//   85% of Facebook video is watched with sound off; 75% of mobile video
//   across Facebook, Instagram and LinkedIn is. Captions retain viewers 33%
//   longer, lift view time ~12%, and 80% of people say captions make them more
//   likely to finish. A silent stretch is a stretch most of the audience gets
//   nothing from at all.
//     — storyblocks.com/resources/blog/video-captioning
//     — rev.com/blog/ultimate-roundup-closed-captions-statistics
//     — forbes.com/sites/tjmccue/2019/07/31 (Verizon Media, 69% in public)
//
//   COMPLETION IS THE SIGNAL, AND LENGTH IS ITS ENEMY.
//   Shorts under thirty seconds should clear 60% completion; below ~70% early
//   retention, YouTube stops promoting a video organically within an hour or
//   two. Every second past the point is a second of people leaving.
//     — opus.pro/blog/ideal-youtube-shorts-length-format-retention
//
// WHY THIS IS CODE AND NOT A CHECKLIST. A checklist is consulted by whoever
// remembers it exists. These run before a reel is recorded — in the studio and
// in the automated pipeline — because every one of these mistakes costs a
// reshoot, and the automated pipeline has nobody watching to catch them.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

import type { ReelPlan } from "./reel-plan";

/** The hook must be readable before the decision is made. */
export const HOOK_DEADLINE_MS = 3_000;

/**
 * Words in a hook.
 *
 * It has to be READ, in a second and a half, by somebody who has not decided
 * to pay attention yet. Ten words is about the limit at that size; past it the
 * hook is a sentence, and a sentence is skipped.
 */
export const HOOK_MAX_WORDS = 10;

/**
 * The reading-speed rule lives with the captions it measures, in
 * lib/caption-lines.ts. Re-exported here because this is where the retention
 * rules are read, and a reader looking for the caption floor looks here first.
 */
import { captionReadMs } from "./caption-lines";
export { CAPTION_ACQUIRE_MS, CAPTION_CPS, MIN_CAPTION_MS, captionReadMs } from "./caption-lines";


/**
 * The longest the screen may go with no caption on it.
 *
 * Three quarters of the audience has the sound off, so an uncaptioned stretch
 * is a stretch where most viewers are watching a silent screen recording with
 * no idea what it is showing them.
 */
export const MAX_SILENT_MS = 2_500;

/**
 * The longest a SINGLE beat may run.
 *
 * One beat is one action and one caption, so a long one is genuinely a static
 * screen. The first version of this accumulated consecutive beats on the same
 * route and reported "nothing changing" — which was false: opening the check-in
 * and then filling it in are two different pieces of footage that happen to
 * share a URL. It flagged the one script whose whole point is a number moving.
 */
export const MAX_HOLD_MS = 5_000;

/**
 * How much of a reel may happen on one screen.
 *
 * A reel that never leaves a single route is a screenshot with captions over
 * it, whatever its beats say. This is the rule the accumulation above was
 * reaching for and getting wrong.
 */
export const MAX_ONE_ROUTE_SHARE = 0.6;

/** Past this, completion falls away and the algorithm stops promoting. */
export const MAX_REEL_MS = 30_000;

/**
 * Below this there is nothing to watch.
 *
 * Not a retention rule — a reel this short is a mistake in the script rather
 * than a stylistic choice, and it is worth saying so before it is filmed.
 */
export const MIN_REEL_MS = 6_000;

/** Openings that spend the deciding second saying nothing. */
const DEAD_OPENERS = [
  /^(hi|hey|hello|yo)\b/i,
  /^(so|ok|okay|right|well|um|erm)\b/i,
  /^(welcome|introducing|today (i|we))\b/i,
  /^(in this (video|reel|short))\b/i,
  /^(let'?s (talk|look|dive))\b/i,
  /^(this is (a|the|my) (app|video|reel))\b/i,
];

export interface RetentionProblem {
  /** The beat it belongs to, or -1 for the reel as a whole. */
  beat: number;
  problem: string;
}

/**
 * Is this hook doing the one job a hook has?
 *
 * A hook earns the next two seconds. The checks are for the failures that are
 * mechanical — too long to read, a greeting where the point should be, no
 * specific claim — because those are the ones a rule can catch. Whether the
 * claim is INTERESTING is not something code can judge, and pretending
 * otherwise would be worse than checking nothing.
 */
export function hookProblems(hook: string): string[] {
  const text = String(hook ?? "").trim();
  const problems: string[] = [];

  if (!text) return ["there is no hook — the first three seconds decide, and this spends them on nothing"];

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > HOOK_MAX_WORDS) {
    problems.push(`${words.length} words — a hook has to be READ in the deciding second, so ${HOOK_MAX_WORDS} is the ceiling`);
  }
  if (words.length < 3) problems.push("too short to say anything specific");

  for (const opener of DEAD_OPENERS) {
    if (opener.test(text)) {
      problems.push(`"${words[0]}" spends the deciding second on a greeting`);
      break;
    }
  }

  /**
   * SPECIFIC, one way or another.
   *
   * A number, a question, or something addressed to the viewer. This is a
   * blunt proxy for the thing that actually works — a claim somebody wants
   * settled — but a hook with none of the three is almost always a label.
   */
  const hasNumber = /\d/.test(text);
  const asksSomething = text.includes("?");
  const addressesYou = /\b(you|your|you're|youre)\b/i.test(text);
  if (!hasNumber && !asksSomething && !addressesYou) {
    problems.push("no number, no question and nothing addressed to the viewer — it labels the video rather than starting it");
  }

  return problems;
}

/**
 * Everything about the reel that a rule can catch before it is made.
 *
 * Takes the PLAN rather than the script, because the captions are what the
 * silent-viewer rules are about and the plan is where they are timed.
 */
export function retentionProblems(plan: ReelPlan): RetentionProblem[] {
  const problems: RetentionProblem[] = [];
  const say = (problem: string, beat = -1) => problems.push({ beat, problem });

  for (const problem of hookProblems(plan.hook)) say(problem);

  if (plan.hookMs > HOOK_DEADLINE_MS) {
    say(`the hook is still going at ${plan.hookMs}ms — the decision is made by ${HOOK_DEADLINE_MS}ms`);
  }

  if (plan.totalMs > MAX_REEL_MS) {
    say(`${Math.round(plan.totalMs / 1000)}s — completion falls away past ${MAX_REEL_MS / 1000}s and the algorithm stops promoting it`);
  }
  if (plan.totalMs < MIN_REEL_MS) {
    say(`${Math.round(plan.totalMs / 1000)}s is not long enough to show anything`);
  }

  const onRoute = new Map<string, number>();
  for (const step of plan.steps) {
    for (const caption of step.captions) {
      const needs = captionReadMs(caption.text);
      if (caption.ms < needs) {
        say(
          `"${caption.text}" is on screen for ${caption.ms}ms — too brief to read, it needs ${needs}ms`,
          step.index,
        );
      }
    }
    /**
     * PER CAPTION, not per beat.
     *
     * This measured the beat, which stopped meaning "one screen doing one
     * thing" the moment beats grew to fit their reading time: a five-second
     * beat with two captions changing on it is not a static shot, and flagging
     * it pushed toward cutting the reading time back down — the exact thing
     * that made the reel too fast in the first place.
     *
     * A single caption sitting still for this long is the real fault, and it
     * is what the rule was always trying to describe.
     */
    /**
     * THE LONGEST STRETCH WITH NOTHING CHANGING, which is what this rule was
     * always trying to measure.
     *
     * It used to measure the whole beat, and that stopped meaning the same
     * thing once beats grew to fit their reading time: a five-second beat with
     * two captions changing on it is not a static shot, and flagging it pushed
     * toward cutting the reading time back down — the exact thing that made
     * the reel too fast in the first place.
     *
     * A beat with no captions at all is the original case and still counts:
     * nothing changes for its entire length.
     */
    const stillFor = step.captions.length
      ? Math.max(...step.captions.map((c) => c.ms))
      : step.ms;
    if (stillFor > MAX_HOLD_MS) {
      say(`${Math.round(stillFor / 1000)}s on one screen doing one thing`, step.index);
    }
    onRoute.set(step.route, (onRoute.get(step.route) ?? 0) + step.ms);
  }

  // A reel that never leaves one screen is a screenshot with captions on it.
  for (const [route, ms] of onRoute) {
    if (plan.totalMs > 0 && ms / plan.totalMs > MAX_ONE_ROUTE_SHARE) {
      say(`${Math.round((ms / plan.totalMs) * 100)}% of the reel is on ${route} — there is nothing to watch`);
    }
  }

  for (const gap of silentGaps(plan)) {
    say(`${Math.round(gap.ms / 1000)}s with no caption on screen — most of the audience has the sound off`, gap.beat);
  }

  return problems;
}

/**
 * Stretches with nothing to read.
 *
 * Built from the captions' own timings rather than from which beats have a
 * line, because two captioned beats separated by a silent one is the same
 * problem as one long silent beat and would otherwise be missed.
 */
export function silentGaps(plan: ReelPlan): { beat: number; at: number; ms: number }[] {
  const captions = plan.steps
    .flatMap((step) => step.captions.map((c) => ({ ...c, beat: step.index })))
    .sort((a, b) => a.at - b.at);

  const gaps: { beat: number; at: number; ms: number }[] = [];
  let cursor = 0;
  let beat = 0;
  for (const caption of captions) {
    if (caption.at - cursor > MAX_SILENT_MS) gaps.push({ beat, at: cursor, ms: caption.at - cursor });
    cursor = Math.max(cursor, caption.at + caption.ms);
    beat = caption.beat;
  }
  if (plan.totalMs - cursor > MAX_SILENT_MS) {
    gaps.push({ beat, at: cursor, ms: plan.totalMs - cursor });
  }
  return gaps;
}
