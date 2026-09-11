import { captionLines, captionReadMs, MAX_LINE_CHARS, MAX_LINE_WORDS, MIN_CAPTION_MS } from "./caption-lines";
import { phrases } from "./speech-timing";
import { LEAD_MS } from "./narration";
import type { Move } from "./reel-moves";

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


/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE LAST FRAME OF A REEL WAS A SCREENSHOT OF NOTHING.
 *
 * Found by pulling the recorded MP4 and looking at it: the reel ends, the
 * caption clears, and the final ~1.8 seconds are the app sitting there with
 * no text on it at all. That is the frame a viewer is looking at when they
 * decide whether to do anything, and it was the only part of the reel asking
 * them for nothing.
 *
 * The trailing time already exists — it is the tail after the last line, and
 * it was silent and empty. This fills it. It does not lengthen the reel.
 *
 * NEVER OVER A CAPTION. The card is placed at the later of "the last caption
 * has finished" and "END_CARD_MS before the end", so a beat too short to fit
 * the whole card gets a shorter card rather than one drawn over the line
 * somebody is still reading.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const END_CARD_MS = 1_800;

export function endCardAt(beatEndMs: number, captions: readonly Caption[]): number {
  const lastCaption = captions.reduce((end, c) => Math.max(end, c.at + c.ms), 0);
  return Math.max(lastCaption, beatEndMs - END_CARD_MS);
}

export interface PlanStep {
  index: number;
  at: number;
  ms: number;
  route: string;
  /** Words on screen this beat is about — the recorder spotlights them. */
  focus?: string;
  /** What to DO on this screen, performed on camera. See lib/reel-moves.ts. */
  moves?: Move[];
  /** The human-readable intent, kept for the run log. */
  action: string;
  /** Timed absolutely, so the driver never does arithmetic of its own. */
  captions: Caption[];
  /**
   * Where the spoken phrases landed, when there were any.
   *
   * Carried onto the step so lib/reel-retention.ts can tell a NARRATED reel
   * from a silent one — they are read differently and are held to different
   * floors. See the note there.
   */
  clips?: readonly Clip[];
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

/** One spoken phrase's real place inside its beat, measured from the audio. */
export interface Clip {
  /** Milliseconds from the start of the BEAT. */
  atMs: number;
  ms: number;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE CAPTIONS WERE TIMED BY CHARACTER ARITHMETIC AND THE VOICE WAS NOT.
 *
 * "Captions aren't in sync." Measured on a recorded reel by finding the voice
 * onsets in the muxed audio and comparing them with the reel's own SRT: ten of
 * twelve captions more than 0.25s out, worst 2.54s.
 *
 * The cause is in the two splits, and it is structural rather than a rounding
 * error. captionLines cuts at 42 characters and seven words and at commas;
 * `phrases` in lib/speech-timing.ts cuts at SENTENCES, because that is where a
 * voice actually stops. On demo-readiness that is twelve captions over six
 * spoken phrases — "This one asks first — bad night, wrecked legs, ten
 * seconds." is one continuous utterance and three captions.
 *
 * So three captions were spread across one unbroken phrase by how many
 * characters each had, while the audio simply played. Nothing could have kept
 * them together, and no amount of adjusting the reading floors would have.
 *
 * THE FIX IS TO ANCHOR EACH CAPTION TO THE PHRASE IT BELONGS TO. Every caption
 * of a phrase lives inside that phrase's real measured span — captionLines
 * never merges across a sentence, so the grouping is exact — and the worst
 * error left is a fraction of one phrase rather than seconds.
 *
 * WITHOUT CLIPS NOTHING CHANGES. A silent reel and the studio preview have no
 * audio to anchor to, and the old arithmetic is the right answer there.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function captionsFor(
  beat: { at: number; ms: number; say: string; tail?: number },
  clips?: readonly Clip[],
): Caption[] {
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * THE TAIL IS NOT THE CAPTIONS' TO SPEND.
   *
   * endCardAt below places the card at the later of "the last caption has
   * finished" and "END_CARD_MS before the end" — and the captions here fill
   * the beat EXACTLY, by construction, because the last one takes whatever
   * remains. So a last beat that speaks had its card placed at its own final
   * millisecond and drawn for none of them.
   *
   * Giving the beat a tail in lib/reel-script.ts does nothing on its own: the
   * tail lands inside beat.ms, and the captions would simply stretch over it.
   * The budget has to shrink here, which is the one place that knows the
   * captions are what fills a beat.
   * ═══════════════════════════════════════════════════════════════════════
   */
  const budget = Math.max(0, beat.ms - (beat.tail ?? 0));

  if (clips && clips.length) {
    const spoken = phrases(beat.say);
    /**
     * COUNTS MUST AGREE OR THE ANCHORING IS GUESSWORK. The recorder speaks
     * `spokenForm(say)` and this splits the original, so a change that made
     * the two disagree about sentence boundaries would silently pair caption
     * three with phrase two. Verified across all four reels that spokenForm
     * never changes the count; if it ever does, fall back rather than lie.
     */
    if (spoken.length === clips.length) {
      /**
       * ═══════════════════════════════════════════════════════════════════
       * TWO BRIEF PHRASES SHARE A CARD, BECAUSE ONE OF THEM CANNOT HAVE ONE.
       *
       * A caption runs from its phrase's onset to the NEXT phrase's onset, so
       * its length is that phrase's speaking time plus the gap after it, and
       * neither is under this function's control. Speed the voice up and short
       * lines stop clearing the time an eye needs: the runner refused a reel
       * over "Same bar." at 967ms against a 1000ms minimum. That is the right
       * refusal, and not a span this could stretch — the next phrase is
       * already speaking.
       *
       * What a subtitler does with two rapid short lines is put them on one
       * card, and it works here for a reason particular to this renderer: the
       * words are drawn one at a time with the spoken one lit, so a card
       * holding two phrases still tracks the voice through both.
       *
       * FORWARD FIRST, THEN BACKWARD FOR THE TAIL. A phrase whose span is too
       * short absorbs the one after it. The LAST phrase has nothing after it
       * to absorb — which is exactly the "Same bar." case, a short line ending
       * a beat — so a final group still under the minimum merges into the one
       * before it instead. Merging backward leaves the reel's length alone,
       * where padding the beat would put back the dead air this pass removed.
       * ═══════════════════════════════════════════════════════════════════
       */
      const groups: { texts: string[]; from: number; until: number }[] = [];
      spoken.forEach((phrase, i) => {
        /**
         * ═══════════════════════════════════════════════════════════════════
         * A CAPTION STARTS WITH ITS PHRASE AND MAY OUTLAST IT.
         *
         * The first version of this gave each phrase's captions exactly that
         * phrase's SPEAKING time, and the runner refused the reel: ten
         * captions too brief to read, "Not a warning —" on screen for 920ms
         * needing 1300. Correct, and the right thing to refuse — a voice is
         * faster than an eye, and Chatterbox is faster than Kokoro.
         *
         * Sync is about when a caption APPEARS. When it LEAVES is free, so
         * each phrase's captions run until the NEXT phrase starts rather than
         * stopping dead with the audio — which reclaims every gap between
         * phrases and whatever slack the beat has at its end.
         *
         * THE LEAD, BUT NEVER THE HOLD. clips[0] sits at LEAD_MS + hold, and
         * the hold is a deliberate silence before a reveal — starting the
         * caption inside it would put the words on screen before the shot
         * that earns them. Reclaiming exactly LEAD_MS takes the dead air and
         * leaves the suspense alone.
         * ═══════════════════════════════════════════════════════════════════
         */
        const from = beat.at + (i === 0 ? Math.max(0, clips[0].atMs - LEAD_MS) : clips[i].atMs);
        const until = beat.at + (i + 1 < clips.length ? clips[i + 1].atMs : budget);
        const open = groups[groups.length - 1];
        if (open && open.until - open.from < MIN_CAPTION_MS) {
          open.texts.push(phrase.text);
          open.until = until;
        } else {
          groups.push({ texts: [phrase.text], from, until });
        }
      });

      const last = groups[groups.length - 1];
      if (groups.length > 1 && last.until - last.from < MIN_CAPTION_MS) {
        const before = groups[groups.length - 2];
        before.texts.push(...last.texts);
        before.until = last.until;
        groups.pop();
      }

      const out: Caption[] = [];
      for (const group of groups) {
        const span = Math.max(1, group.until - group.from);
        out.push(...spread(fitToSpan(group.texts.join(" "), span), group.from, span));
      }
      if (out.length) return out;
    }
  }

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
  return spread(chunks, beat.at, budget);
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS MANY CAPTIONS AS THE PHRASE HAS TIME FOR.
 *
 * captionLines cuts by LENGTH — 42 characters, seven words, punctuation. That
 * is the right shape for a line and says nothing about how long the phrase
 * takes to say, and once the captions are anchored to real audio the two have
 * to agree. Two failures on one recording, from the same mismatch:
 *
 *   "next to you." on screen for 792ms — three captions sharing a phrase
 *   that is spoken in two and a half seconds, so the short one flashes
 *
 *   "5s on one screen doing one thing" — one caption holding a phrase for
 *   longer than anything should sit still
 *
 * So the count is bracketed by the time available. At least enough that none
 * of them lingers, at most as many as can each be seen — and the text is
 * re-cut to hit it rather than the timing being bent to fit the text.
 *
 * MERGING IS SAFE AND SPLITTING IS THE GUESS, which is why splitting narrows
 * the width and lets captionLines decide again rather than chopping at a word
 * count: the sticky-word and orphan rules in there are the whole reason the
 * lines read as phrases.
 * ═══════════════════════════════════════════════════════════════════════════
 */
function fitToSpan(text: string, span: number): string[] {
  const base = captionLines(text);
  /**
   * THE EARLY RETURN HAS TO CHECK BOTH ENDS. This asked only whether the span
   * was long enough, so a phrase that fits on one line was handed back
   * whatever the span — and "100kg at 60kg bodyweight is exceptional." held
   * the screen for 6.2 seconds, because a caption stays up through the pause
   * that follows its phrase rather than blinking off into silence.
   *
   * Forty characters is one line by width and two by TIME. Length decided
   * here and duration decided elsewhere is the whole class of bug this
   * function exists for, and the shortcut reintroduced it.
   */
  if (base.length < 2 && span >= MIN_CAPTION_MS && span <= MAX_CAPTION_MS) return base;

  /**
   * CANDIDATE CUTS, WIDEST FIRST, THEN MERGED DOWN.
   *
   * Re-cutting at a narrower width rather than chopping at a word count,
   * because the sticky-word and orphan rules in captionLines are the whole
   * reason the lines read as phrases rather than as slices.
   */
  const candidates: string[][] = [];
  const add = (cut: string[]) => {
    if (cut.length && !candidates.some((c) => c.length === cut.length)) candidates.push(cut);
  };
  for (let width = MAX_LINE_CHARS; width >= 12; width -= 4) add(captionLines(text, width, MAX_LINE_WORDS));

  let merged = candidates[0] ?? base;
  while (merged.length > 1) {
    let at = 0;
    for (let i = 1; i < merged.length - 1; i += 1) {
      if (merged[i].length + merged[i + 1].length < merged[at].length + merged[at + 1].length) at = i;
    }
    merged = [...merged.slice(0, at), `${merged[at]} ${merged[at + 1]}`, ...merged.slice(at + 2)];
    add(merged);
  }

  /**
   * MEASURED, NOT PREDICTED. The first version computed how many captions the
   * span "should" hold from span/MAX and span/MIN — and three captions over
   * twelve seconds satisfies that arithmetic while still putting one on screen
   * for 5.09s, because spread shares the time by LENGTH and the shares are
   * uneven. Laying them out and looking is the only thing that knows.
   */
  const fits = (cut: string[]) =>
    spread(cut, 0, span).every((c) => c.ms >= MIN_CAPTION_MS && c.ms <= MAX_CAPTION_MS);

  /** Nothing fits when the span itself is impossible — say so downstream. */
  return candidates.find(fits) ?? base;
}

/**
 * The longest one caption may sit still.
 *
 * MAX_HOLD_MS in lib/reel-retention.ts is the rule this serves; it is repeated
 * rather than imported because that module imports this one for its types, and
 * a runtime import back would be a cycle for one number. A test asserts they
 * are the same number.
 */
export const MAX_CAPTION_MS = 5_000;

/**
 * Lay a run of captions end to end across one span of time.
 *
 * FACTORED OUT so the anchored path above and the unanchored one below share
 * it exactly. They differ only in what the span IS — one phrase's measured
 * audio, or the whole beat — and having two copies of this arithmetic is how
 * one of them quietly acquires an off-by-one.
 *
 * The floors, the surplus and the remainder rule are unchanged; the comments
 * that earned each of them are above.
 */
function spread(chunks: readonly string[], from: number, span: number): Caption[] {
  if (!chunks.length) return [];
  const floors = chunks.map((c) => captionReadMs(c));
  const needed = floors.reduce((a, b) => a + b, 0);
  const weights = chunks.map((c) => Math.max(1, c.length));
  const total = weights.reduce((a, b) => a + b, 0);

  const surplus = span - needed;
  const affordable = surplus >= 0;
  const share = (i: number) => Math.floor(((affordable ? surplus : span) * weights[i]) / total);

  let at = from;
  return chunks.map((text, i) => {
    // The last caption takes the remainder, so rounding can never leave a gap
    // or an overhang at the end of the span.
    const ms = i === chunks.length - 1 ? from + span - at : (affordable ? floors[i] + share(i) : share(i));
    const caption = { at, ms, text };
    at += ms;
    return caption;
  });
}

export interface PlannableScript {
  id: string;
  hook: string;
  beats: {
    at: number; ms: number; route: string; action: string; say: string;
    /** Silence after the line, kept clear of the captions for the end card. */
    tail?: number;
    /**
     * Where this beat's spoken phrases actually landed, measured from the
     * synthesised audio. Absent on a silent reel and in the studio preview,
     * and the captions fall back to arithmetic — see captionsFor.
     */
    clips?: readonly Clip[];
    /** Words on screen this beat is about. Optional — most beats have none. */
    focus?: string;
  /** What to DO on this screen, performed on camera. See lib/reel-moves.ts. */
  moves?: Move[];
  }[];
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
    /**
     * CARRIED THROUGH, not cast to. The recorder reads this to aim the
     * spotlight, and the first version read `focus` off a PlanStep that never
     * had one — a cast made it typecheck and it would have been undefined on
     * every beat, so the feature would have shipped doing nothing at all.
     */
    focus: beat.focus,
    moves: beat.moves,
    clips: beat.clips,
    captions: captionsFor(beat, beat.clips),
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
