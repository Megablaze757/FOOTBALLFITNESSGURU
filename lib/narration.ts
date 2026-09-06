import { beatFloorMs } from "./caption-lines";
// =============================================================================
// FITTING THE PICTURE TO THE VOICE, RATHER THAN THE OTHER WAY ROUND.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE BEATS WERE SIZED FOR A READER, NOT A SPEAKER.
//
// lib/reel.ts sizes a beat from its word count at MS_PER_WORD — 175ms, which
// is about 340 words a minute. Nobody speaks at 340 words a minute. Narration
// research puts conversational delivery at 140-160, and high-energy
// promotional work up to about 170; TED averages 163. So every beat in every
// script is roughly HALF the time its own line needs to be said.
//
// That was invisible while a person read the lines aloud — they simply ran
// over, and the teleprompter moved on while they were still talking. With a
// generated voiceover it is not invisible: the audio is a fixed length, and a
// picture that cuts before the sentence finishes is a reel where the voice is
// permanently a beat behind what it is describing.
//
// So the beats are RE-TIMED from the audio that was actually produced.
// Synthesise first, measure, then decide how long each shot is. The captions
// come from the same timings, so they stay in step with the voice for free.
//
// The consequence, which is worth knowing before it surprises anybody: reels
// roughly double in length. An 11-second script becomes about 22. That is
// still inside the 30-second ceiling in lib/reel-retention.ts, but not by
// much, and a script that grows will now fail that check rather than quietly
// producing something nobody finishes.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

/**
 * Silence before the first word of a beat.
 *
 * The cut should land fractionally before the voice starts. A word that begins
 * on the same frame as the picture changes sounds clipped, because the ear
 * expects the room before the speech.
 */
export const LEAD_MS = 140;

/** Silence after the last word, so the cut does not clip the ending. */
export const TAIL_MS = 220;

/** A beat with nothing said still has to be long enough to look at. */
export const SILENT_BEAT_MS = 1_400;

export interface SpokenPhrase {
  text: string;
  /** Silence AFTER this phrase — from lib/speech-timing.ts. */
  gapMs: number;
  /** How long the synthesised audio actually is. Measured, never estimated. */
  audioMs: number;
}

export interface Placed {
  /** Offset from the start of the BEAT, not the reel. */
  atMs: number;
  phrase: SpokenPhrase;
}

export interface BeatAudio {
  /** How long this beat has to be to hold the speech and its pauses. */
  ms: number;
  clips: Placed[];
}

/**
 * Where each phrase sits inside its beat, and how long the beat must be.
 *
 * The trailing gap of the last phrase is deliberately NOT added: it is zero by
 * construction (see speech-timing) and adding TAIL_MS as well would leave two
 * silences at the end of every shot.
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SILENCE BEFORE A BEAT, WHICH IS WHERE SUSPENSE LIVES.
 *
 * lib/speech-timing.ts can put a pause between two phrases, but only inside
 * one beat — and the interesting pause in a reel is almost always at a beat
 * BOUNDARY, because that is where the shot changes. So the moment the script
 * builds to got LEAD_MS + TAIL_MS, about a third of a second, the same as any
 * other cut.
 *
 * `hold` is the script saying "wait here". Used at the reveal and nowhere
 * else: a reel that pauses everywhere is a reel that drags.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const SUSPENSE_MS = 900;

export function beatAudio(phrases: readonly SpokenPhrase[], holdMs = 0): BeatAudio {
  if (!phrases.length) return { ms: SILENT_BEAT_MS, clips: [] };

  const clips: Placed[] = [];
  let at = LEAD_MS + Math.max(0, holdMs);
  for (const phrase of phrases) {
    clips.push({ atMs: at, phrase });
    at += Math.max(0, phrase.audioMs) + Math.max(0, phrase.gapMs);
  }
  return { ms: Math.round(at + TAIL_MS), clips };
}

/**
 * A beat with its real timing, and EVERYTHING ELSE IT CAME WITH.
 *
 * The index signature is deliberate. This used to name five fields, and a beat
 * that carried a sixth — `focus`, which aims the spotlight — lost it here
 * without a word. Typing the extras loosely is worth it to make the type stop
 * being a list somebody has to remember to extend.
 */
export interface RetimedBeat {
  at: number;
  ms: number;
  route: string;
  action: string;
  say: string;
  hold?: number;
  focus?: string;
}

/**
 * Lay the beats end to end at the lengths the audio actually needs.
 *
 * `at` is recomputed from scratch rather than adjusted, because the beats have
 * to stay contiguous — lib/reel-script.ts's beatAt() reads them as a timeline
 * with no gaps, and a plan with a hole in it puts the teleprompter and the
 * captions on the wrong beat for the rest of the reel.
 */
export function retime<T extends { route: string; action: string; say: string; hold?: number; focus?: string }>(
  beats: readonly T[],
  audio: readonly BeatAudio[],
): { beats: RetimedBeat[]; totalMs: number } {
  let at = 0;
  const out = beats.map((beat, i) => {
    /**
     * The LONGER of what it takes to say and what it takes to read.
     *
     * Timed to the speech alone, a beat gave its captions exactly as long as
     * the voice needed — and the voice reads faster than an eye does on a
     * screen it has never seen. See beatFloorMs in lib/caption-lines.ts.
     */
    const ms = Math.max(audio[i]?.ms ?? SILENT_BEAT_MS, beatFloorMs(beat.say));
    /**
     * ═══════════════════════════════════════════════════════════════════════
     * SPREAD THE BEAT. Do not list its fields.
     *
     * This built `{ at, ms, route, action, say }` by hand, so anything else a
     * beat carried was silently dropped here — and every narrated reel goes
     * through this function. `focus` was added to Beat, wired through the
     * plan, tested end to end in a unit test, and then thrown away on this
     * line: the spotlight never appeared in a single recording, and the
     * warning that would have said so never fired either, because the value
     * was empty rather than wrong.
     *
     * That is twice now that a new field on a beat has died in transit. A
     * spread cannot forget the next one.
     * ═══════════════════════════════════════════════════════════════════════
     */
    const placed = { ...beat, at, ms };
    at += ms;
    return placed;
  });
  return { beats: out, totalMs: at };
}

/**
 * Every clip's offset in the FINISHED REEL, for laying one narration track.
 *
 * Beat-relative offsets are what beatAudio produces because a beat's own
 * length is decided before its position is; this is the one place the two are
 * combined, so nothing else has to add them up and get it wrong.
 */
export function trackClips(
  retimed: readonly RetimedBeat[],
  audio: readonly BeatAudio[],
): { atMs: number; phrase: SpokenPhrase }[] {
  const out: { atMs: number; phrase: SpokenPhrase }[] = [];
  retimed.forEach((beat, i) => {
    for (const clip of audio[i]?.clips ?? []) out.push({ atMs: beat.at + clip.atMs, phrase: clip.phrase });
  });
  return out;
}
