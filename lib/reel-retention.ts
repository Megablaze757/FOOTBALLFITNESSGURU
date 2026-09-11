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
import { APP_NAME } from "./signup-link";

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
import { captionReadMs, MIN_CAPTION_MS } from "./caption-lines";
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
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT A REEL OF THIS LENGTH HAS TO CLEAR, AND WHY LENGTH IS A CHOICE.
 *
 * "I'm not a social media expert, I'm asking you to research and become one."
 * Fair. This is the part of that which belongs in code rather than in a
 * message, because a figure in a message is read once.
 *
 * Retention is graded against LENGTH, not in absolute terms — a 45-second
 * video holding 45% is doing better than a 12-second one holding 55%. The
 * published bands, measured across TikTok:
 *
 *              aim above   strong
 *   under 15s      60%       75%
 *   15-30s         50%       65%
 *   30-60s         40%       55%
 *   1-3min         30%       45%
 *
 * And by niche: educational content 50%+ under thirty seconds; fitness
 * instruction 55%+; motivational 65-75%.
 *   — retensis.com/blog/tiktok-retention-rate-benchmarks-2026
 *
 * SHORTER IS NOT AUTOMATICALLY BETTER, which is why this is a table and not a
 * smaller MAX_REEL_MS. A reel that drops a beat to get under fifteen seconds
 * buys a higher bar for itself and loses the footage that earns it.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const RETENTION_BANDS = [
  { underMs: 15_000, aim: 0.6, strong: 0.75 },
  { underMs: 30_000, aim: 0.5, strong: 0.65 },
  { underMs: 60_000, aim: 0.4, strong: 0.55 },
  { underMs: Infinity, aim: 0.3, strong: 0.45 },
];

/** The completion a reel of this length has to clear to be worth posting. */
export function retentionBand(totalMs: number): { aim: number; strong: number } {
  const band = RETENTION_BANDS.find((b) => totalMs < b.underMs) ?? RETENTION_BANDS[RETENTION_BANDS.length - 1];
  return { aim: band.aim, strong: band.strong };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE SIGNAL NOTHING HERE WAS DESIGNED FOR: BEING WATCHED TWICE.
 *
 * Replay rate is total plays over unique viewers. Above 1.2, distribution is
 * reported as substantially stronger — and a reel that loops cleanly plays
 * again before the viewer has consciously decided to replay it, which is how
 * a watch-time percentage goes over 100%.
 *   — retensis.com/blog/tiktok-retention-rate-benchmarks-2026
 *   — ondigitals.com/how-to-make-looping-content-for-tiktok
 *
 * Two things carry a loop, and this project currently has neither. The PICTURE
 * loops when the last shot matches the framing of the first. The WORDS loop
 * when the closing line is the setup for the opening line.
 *
 * These reels do the opposite: they end on a static card, held for END_CARD_MS
 * in silence, on a screen that looks nothing like the opening shot. That is
 * the least loopable ending available, and it is also the frame a viewer is
 * looking at when they decide whether to do anything.
 *
 * NOT ENFORCED, DELIBERATELY. A rule that failed every reel for not looping
 * would be a rule that gets switched off. It is written down here because the
 * fix is a script decision — a closing line that hands back to the hook — and
 * the person making that decision should find the reason next to the numbers.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const REPLAY_RATE_TARGET = 1.2;

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

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * TWO DIFFERENT FLOORS, BECAUSE A NARRATED REEL IS A DIFFERENT THING TO READ.
   *
   * captionReadMs is a COLD-READING rate — Netflix's 17 characters a second
   * pulled back to 15 on the stated grounds that "most of the audience has the
   * sound off, the caption is not an aid to the audio, it IS the content".
   * That is exactly right for a silent reel.
   *
   * It is not right for a narrated one, and the measurement that showed it was
   * the runner refusing a reel whose captions were finally in sync: this voice
   * says "Every other training app hands you the session it planned on Sunday"
   * in 3.92 seconds, and reading its captions cold takes 5.07. There is no
   * timing that satisfies both — a caption cannot both start when the words
   * are spoken and stay up longer than the speaking.
   *
   * So one of them has to give, and the honest choice is the cold-reading
   * rate, for a reason rather than because it was in the way. These captions
   * are drawn word by word with the spoken word lit (lib/caption-karaoke.ts).
   * A muted viewer is not reading a static block and deciding when to look
   * away; they are following a sweep, and the sweep's pace IS the speaking
   * pace. The thing the Netflix figure measures is not what is happening.
   *
   * WHAT SURVIVES IS THE ACQUISITION FLOOR. MIN_CAPTION_MS is not a reading
   * rate — it is the time an eye needs to find new text on screen at all, and
   * that does not care whether anybody is talking. A caption under it is a
   * flash, narrated or not.
   *
   * A SILENT REEL KEEPS THE FULL RATE. There is no voice to follow and the
   * caption really is the whole content, which is the case captionReadMs was
   * written for.
   * ═══════════════════════════════════════════════════════════════════════
   */
  const narrated = plan.steps.some((step) => (step.clips?.length ?? 0) > 0);

  const onRoute = new Map<string, number>();
  for (const step of plan.steps) {
    for (const caption of step.captions) {
      const needs = narrated ? MIN_CAPTION_MS : captionReadMs(caption.text);
      if (caption.ms < needs) {
        say(
          narrated
            ? `"${caption.text}" is on screen for ${caption.ms}ms — under ${needs}ms the eye does not land on it at all`
            : `"${caption.text}" is on screen for ${caption.ms}ms — too brief to read, it needs ${needs}ms`,
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
    /**
     * NAMED, NOT JUST COUNTED. This said "6s on one screen doing one thing"
     * and nothing else — true, and it cost a recording run and a round of
     * guesswork to find out WHICH of a beat's captions was the six seconds.
     * A diagnostic that makes you go and look is half a diagnostic.
     */
    const longest = step.captions.length
      ? step.captions.reduce((worst, c) => (c.ms > worst.ms ? c : worst))
      : null;
    const stillFor = longest ? longest.ms : step.ms;
    if (stillFor > MAX_HOLD_MS) {
      say(
        longest
          ? `"${longest.text}" holds the screen for ${(stillFor / 1000).toFixed(1)}s`
          : `${(stillFor / 1000).toFixed(1)}s on one screen with nothing on it`,
        step.index,
      );
    }
    onRoute.set(step.route, (onRoute.get(step.route) ?? 0) + step.ms);
  }

  // A reel that never leaves one screen is a screenshot with captions on it.
  for (const [route, ms] of onRoute) {
    if (plan.totalMs > 0 && ms / plan.totalMs > MAX_ONE_ROUTE_SHARE) {
      say(`${Math.round((ms / plan.totalMs) * 100)}% of the reel is on ${route} — there is nothing to watch`);
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * A PRONOUN NEEDS AN ANTECEDENT.
   *
   * "Script is incoherent." Read aloud as one block, the fault in all four
   * reels was every demonstrative in them: "THIS ONE asks first" — this one
   * WHAT? — then "THAT's today's body talking", pointing at a number the voice
   * never names, then "SO today's session got rebuilt", a consequence of a
   * cause the listener was never given. The product was named once, in the
   * last two seconds, so nothing before it had anything to refer to.
   *
   * The published guidance for short-form informational content is one idea
   * per video, each beat making one point and moving on. A reel cannot be
   * about one thing while declining to say what the thing is.
   *   — teleprompter.com/blog/short-form-video-strategy
   *   — captions.ai/blog/how-to-write-short-form-video-scripts
   *
   * NOT IN THE SIGN-OFF. Every reel ends by naming the app — that rule already
   * exists in lib/reel-script.ts — so counting the last beat would make this
   * check pass on every script including the incoherent ones it is for.
   * ═══════════════════════════════════════════════════════════════════════
   */
  const before = plan.steps.slice(0, -1).flatMap((step) => step.captions.map((c) => c.text));
  if (before.length && !before.some((text) => text.includes(APP_NAME))) {
    say(`the reel never says "${APP_NAME}" until the sign-off, so every "it" and "this one" before it refers to nothing`);
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
