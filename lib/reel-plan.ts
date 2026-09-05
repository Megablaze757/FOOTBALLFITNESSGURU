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

/** Words per caption group. Four reads in a glance; seven does not. */
export const CHUNK_WORDS = 4;

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
 * Split a line into caption groups.
 *
 * Most people watch these on mute, so the caption IS the voiceover. A whole
 * sentence appearing at once is read in half a second and then sits there for
 * four; groups arriving in step with the speaking is what holds an eye. Groups
 * rather than single words because one word at a time is the style that reads
 * as a bot, and because a group can be read in a glance while a word cannot be
 * read at all.
 *
 * Never orphans a single trailing word: a lone word on screen for a quarter of
 * a second reads as a glitch. The last two groups are merged instead, even
 * though that makes one longer than CHUNK_WORDS — slightly too long is read; a
 * group of one is noticed.
 */
export function captionChunks(say: string, size = CHUNK_WORDS): string[] {
  const words = String(say ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  if (size < 1) return [words.join(" ")];

  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += size) chunks.push(words.slice(i, i + size).join(" "));

  if (chunks.length > 1 && chunks[chunks.length - 1].split(" ").length === 1) {
    const orphan = chunks.pop() as string;
    chunks[chunks.length - 1] += ` ${orphan}`;
  }
  return chunks;
}

/**
 * The caption groups for one beat, timed to fill it exactly.
 *
 * The LAST group takes the remainder rather than its share, so rounding never
 * leaves a gap at the end of a beat — a blank frame between two captions reads
 * as the video stalling.
 */
export function captionsFor(beat: { at: number; ms: number; say: string }, size = CHUNK_WORDS): Caption[] {
  const chunks = captionChunks(beat.say, size);
  if (!chunks.length) return [];
  const each = Math.floor(beat.ms / chunks.length);
  return chunks.map((text, i) => ({
    at: beat.at + each * i,
    ms: i === chunks.length - 1 ? beat.ms - each * i : each,
    text,
  }));
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
