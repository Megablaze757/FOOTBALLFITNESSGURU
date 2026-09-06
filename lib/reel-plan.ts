import { captionLines, captionReadMs } from "./caption-lines";

// =============================================================================
// A REEL AS A LIST OF INSTRUCTIONS, SO NOBODY HAS TO PERFORM IT.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS ALONGSIDE THE STUDIO.
//
// components/ReelRecorder.tsx films the app in a second window while a person
// reads a teleprompter. It works, and it still needs a person, a quiet room
// and a take that goes right the whole way through.
//
// Playwright can drive the app and record it — verified: 9:16, no share
// dialog, no window to keep out of shot, no human. So the same script that
// prompts a person can instead be a list of instructions, and the reel becomes
// something CI produces rather than something somebody makes time for.
//
// This module is the bridge: it turns a ReelScript (written for a human) into
// timed steps and timed captions (written for a machine). Pure, because the
// timing is the part with a wrong answer and a video is an expensive place to
// discover one.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 540x960, AND THE REASON IS A MISTAKE WORTH RECORDING.
 *
 * The first recording was made at 430x932 — the iPhone Pro Max CSS viewport —
 * and called 9:16 because it is phone-shaped. It is not: 430/932 is 0.461,
 * while 9:16 is 0.5625. Instagram, TikTok and YouTube Shorts all letterbox
 * anything narrower, so every one of those reels would have shipped with bars
 * down the sides for a reason nobody would have thought to check.
 *
 * 540x960 IS 9:16 exactly, and at deviceScaleFactor 2 it records at
 * 1080x1920 — the native size every platform wants, with no scaling at all.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const REEL_W = 540;
export const REEL_H = 960;
export const REEL_SCALE = 2;

/** 9:16, as a number, so a test can assert the two above rather than trust them. */
export const REEL_RATIO = 9 / 16;

/**
 * How long the hook card holds the screen.
 *
 * Short. It is the thing between somebody and the app, and the app is the
 * reason to keep watching — a hook that outstays this is the reel telling you
 * what it is about instead of showing you.
 */
export const HOOK_MS = 1_600;

export interface Caption {
  /** Milliseconds from the start of the recording. */
  at: number;
  ms: number;
  text: string;
}

export interface PlanStep {
  index: number;
  at: number;
  ms: number;
  route: string;
  /** The human-readable intent, kept for the run log. */
  action: string;
  /** Timed absolutely, so the driver never does arithmetic of its own. */
  captions: Caption[];
}

export interface ReelPlan {
  id: string;
  hook: string;
  hookMs: number;
  width: number;
  height: number;
  scale: number;
  steps: PlanStep[];
  totalMs: number;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CAPTIONS COME FROM lib/caption-lines.ts NOW.
 *
 * This used to cut every four words and count nothing else, which put
 * "builds you has a" and "costs £3.19 at the" into a finished reel. Four
 * consecutive words are not a phrase, and a caption ending on "the" makes the
 * reader carry an unfinished thought across the cut — at the exact moment a
 * reel is cheapest to scroll past.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export function captionsFor(beat: { at: number; ms: number; say: string }): Caption[] {
  const chunks = captionLines(beat.say);
  if (!chunks.length) return [];

  /**
   * TIME PROPORTIONAL TO LENGTH, not an equal share.
   *
   * An equal split gave "Same protein." and "Every recipe in here is priced"
   * the same time on screen — the short one loitering while the long one is
   * gone before it is read. Characters track how long a line takes both to say
   * and to read closely enough, and the two only have to agree with each other.
   */
  /**
   * EACH CAPTION GETS ITS READING TIME FIRST, and only the surplus is shared
   * out by length.
   *
   * A purely proportional split left four captions a few tens of milliseconds
   * short of what they needed — the beat was long enough overall, but rounding
   * took it from whichever caption the arithmetic happened to reach last. The
   * floor is not an average, so it cannot be met on average.
   *
   * beatFloorMs guarantees the beat is at least the sum of these, so the
   * surplus is never negative for a beat this module timed.
   */
  const floors = chunks.map((c) => captionReadMs(c));
  const needed = floors.reduce((a, b) => a + b, 0);
  const weights = chunks.map((c) => Math.max(1, c.length));
  const total = weights.reduce((a, b) => a + b, 0);

  /**
   * FILLING THE BEAT EXACTLY IS THE INVARIANT, and the floor is what it can
   * afford within it.
   *
   * A beat this module timed is at least the sum of the floors (beatFloorMs in
   * lib/caption-lines.ts), so every caption gets its reading time and the
   * surplus is shared by length. A beat that is SHORTER than that — one a
   * script wrote by hand, or a test — cannot have both, and the honest answer
   * is to divide what there is and let lib/reel-retention.ts report that the
   * captions are too fast. Silently overrunning the beat instead would leave a
   * caption still on screen after the shot has cut, which is a fault nothing
   * downstream could see.
   */
  /**
   * `>= 0` and NOT `> 0`. A beat timed by beatFloorMs is EXACTLY the sum of
   * the floors, so surplus is zero on the common path — and treating zero as
   * "cannot afford the floors" sent every well-timed beat down the fallback
   * and left captions tens of milliseconds short of their own reading time.
   */
  const surplus = beat.ms - needed;
  const affordable = surplus >= 0;
  const share = (i: number) => Math.floor(((affordable ? surplus : beat.ms) * weights[i]) / total);

  let at = beat.at;
  return chunks.map((text, i) => {
    // The last caption takes the remainder, so rounding can never leave a gap
    // or an overhang at the end of a beat.
    const ms = i === chunks.length - 1
      ? beat.at + beat.ms - at
      : (affordable ? floors[i] + share(i) : share(i));
    const caption = { at, ms, text };
    at += ms;
    return caption;
  });
}

export interface PlannableScript {
  id: string;
  hook: string;
  beats: { at: number; ms: number; route: string; action: string; say: string }[];
  totalMs: number;
}

/**
 * The whole reel as instructions.
 *
 * The hook is NOT a step. It is drawn over whatever the first step is showing,
 * because a hook card on its own is a title card — and a title card is the
 * thing people scroll past while waiting for the video to start.
 */
export function reelPlan(script: PlannableScript, hookMs = HOOK_MS): ReelPlan {
  const steps = script.beats.map((beat, index) => ({
    index,
    at: beat.at,
    ms: beat.ms,
    route: beat.route,
    action: beat.action,
    captions: captionsFor(beat),
  }));
  return {
    id: script.id,
    hook: script.hook,
    // A hook that outlasts the first beat would still be up when the second
    // screen arrives, hiding the cut that the hook exists to earn.
    hookMs: Math.min(hookMs, steps[0]?.ms ?? hookMs),
    width: REEL_W,
    height: REEL_H,
    scale: REEL_SCALE,
    steps,
    totalMs: script.totalMs,
  };
}

/** `00:00:01,234` — SRT's timecode, which is fussy in three ways at once. */
export function srtTime(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const h = Math.floor(total / 3_600_000);
  const m = Math.floor(total / 60_000) % 60;
  const s = Math.floor(total / 1_000) % 60;
  const milli = total % 1_000;
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  // A COMMA before the milliseconds, not a full stop — that is WebVTT, and a
  // player handed the wrong one shows no captions and reports nothing.
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(milli, 3)}`;
}

/**
 * A caption file to upload alongside the video.
 *
 * The captions are burnt into the picture already, so this is not how they get
 * on screen — it is what the platforms read to make the reel searchable, and
 * what somebody watching with their own captions on gets instead.
 */
export function srt(plan: ReelPlan): string {
  const all = plan.steps.flatMap((step) => step.captions);
  return all
    .map((c, i) => `${i + 1}\n${srtTime(c.at)} --> ${srtTime(c.at + c.ms)}\n${c.text}\n`)
    .join("\n");
}
