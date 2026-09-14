// =============================================================================
// A BED UNDER THE VOICE, AND WHY IT IS NOT JUST amix.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE REELS ARE BETWEEN A THIRD AND A HALF SILENCE.
//
// Measured on the finished files with scripts/measure-excitement.py: 29% to
// 47% of each reel is under the silence floor. Some of that is the deliberate
// pause before a reveal and some is a page loading, and ALL of it is currently
// nothing at all — no bed, no room tone, no sound. On a phone, in public, that
// reads as a video that has stopped.
//
// Two things a bed does that are worth having:
//
//   * It carries the gaps. The pause before a number lands is a device when
//     there is music under it and a fault when there is not.
//   * It sets a register before the first word. A feed decides in about half a
//     second, and half a second is not enough to hear a sentence but is plenty
//     to hear that something is playing.
//
// ─────────────────────────────────────────────────────────────────────────
// DUCKED, NOT JUST QUIET.
//
// A bed mixed at a fixed level is either loud enough to fight the voice in the
// gaps or quiet enough to be pointless under it. Sidechain compression keyed
// off the narration solves both: the music drops while a word is being said
// and comes back up between phrases, which is exactly where the silence is.
//
// ─────────────────────────────────────────────────────────────────────────
// AND THE BIGGEST AUDIO LEVER IS NOT THIS ONE.
//
// Worth writing down so nobody mistakes this for the whole answer: a trending
// sound chosen IN the platform's own editor is reported to carry a post to
// around 68% more views, because it files the video with an audience already
// listening to that sound. Nothing in this repository can do that — it is
// chosen at posting time, from that week's list, by a person.
//
// So this is the bed for a reel whose VOICE carries it, and the trending sound
// is a separate decision made at the point of posting. See docs in
// MUSIC_GUIDANCE below, which the studio shows rather than hiding in a file.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

/**
 * How far under the narration the bed sits, in decibels.
 *
 * Broadcast practice for music under speech is 15-20dB down, and short-form is
 * mixed hotter than broadcast because it is heard on a phone speaker in a
 * noisy room. This is the top of that range rather than the middle: the voice
 * is the content, and a bed that has to be turned down to hear a word is a bed
 * that was too loud.
 */
export const BED_DB = -18;

/** Where the duck starts. Low, because speech should always win. */
export const DUCK_THRESHOLD = 0.03;

/** How hard it ducks once it starts. */
export const DUCK_RATIO = 8;

/** Milliseconds. Fast enough not to clip the first syllable. */
export const DUCK_ATTACK_MS = 5;

/**
 * Milliseconds back up after a word.
 *
 * The gaps this exists to fill are 150-1150ms (lib/speech-timing.ts), so a
 * release much longer than this would hold the music down through the very
 * pauses it is meant to carry, and the bed would be inaudible exactly when it
 * is needed.
 */
export const DUCK_RELEASE_MS = 260;

/** Seconds of fade at each end. A bed that starts at full level is a jolt. */
export const FADE_IN_S = 0.4;
export const FADE_OUT_S = 1.2;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS NICHE'S MUSIC ACTUALLY SOUNDS LIKE, AS NUMBERS.
 *
 * "Make sure music is actually trendy with our target niche." Two halves, and
 * only one of them can live in a repository.
 *
 * THE HALF THAT CANNOT. A track that is trending this week is trending because
 * of a chart nothing here can read, and putting a commercial record under a
 * brand's video is the documented way to get it claimed or muted — "a
 * copyrighted pump-up song will get your highlight reel claimed", and a brand
 * account needs a licence for commercial use. So nothing here picks music, and
 * nothing here ships music. The genuinely trending route is the platform's own
 * licensed library, chosen when you post, which is also the route that carries
 * the reach — see MUSIC_GUIDANCE.
 *
 * THE HALF THAT CAN. What gym and UK football short-form sounds like is not a
 * mystery and it is measurable. Phonk dominates gym content — aggressive, dark,
 * 808-heavy — alongside hard trap, UK drill and hip-hop. Reported tempos: 120
 * to 150 for fitness, 140 and up for hype sports edits, around 129 for a steady
 * workout beat.
 *
 * So a supplied track is CHECKED against that profile rather than trusted. An
 * acoustic ballad at 80bpm under a reel about a 100kg bench is wrong in a way
 * nobody would notice until it was posted, and scripts/check-music.py refuses
 * it. This is the same rule as everywhere else here: the pipeline runs on a
 * machine nobody is watching, so the wrong input fails in the studio.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const NICHE_BPM_MIN = 120;
export const NICHE_BPM_MAX = 155;

/**
 * How much of the track's energy sits under 250Hz.
 *
 * The niche's sound is 808-led: phonk, drill and trap are built on the bass.
 * A track with almost nothing down there is a different kind of music however
 * fast it is — and under a voice it also leaves the bed competing in exactly
 * the band the narration occupies.
 */
export const NICHE_MIN_BASS_SHARE = 0.25;

/** Genres this profile describes, for whoever is choosing the track. */
export const NICHE_GENRES = ["phonk", "hard trap", "UK drill", "hip-hop", "EDM"];

export interface BedOptions {
  /** Length of the finished reel, in milliseconds. */
  totalMs: number;
  /** How far under the voice, in dB. Negative. */
  bedDb?: number;
}

/**
 * Everything wrong with a request for a bed, or an empty list.
 *
 * A bed is mixed on a runner nobody is watching, and the ways this goes wrong
 * are silent: a track shorter than the reel ends halfway through, and a
 * positive gain puts the music over the narration.
 */
export function bedProblems(options: BedOptions): string[] {
  const problems: string[] = [];
  const db = options.bedDb ?? BED_DB;
  if (!(options.totalMs > 0)) problems.push("a bed needs to know how long the reel is");
  if (db > 0) problems.push(`${db}dB puts the music above the voice`);
  /**
   * Above about -6dB the duck cannot save it: the music is inside the voice's
   * own range and every gap becomes a swell.
   */
  if (db > -6) problems.push(`${db}dB is inside the voice's range, and ducking will not fix it`);
  if (db < -40) problems.push(`${db}dB is quieter than the room and may as well be silence`);
  return problems;
}

/**
 * The ffmpeg filter graph that puts a bed under a narration.
 *
 * Named inputs rather than positional, because the mux this joins already has
 * several and a graph that assumes [1:a] is the music breaks silently — it
 * mixes whatever happens to be there — the first time an input is added ahead
 * of it.
 */
export function bedFilter(
  voice: string,
  music: string,
  out: string,
  options: BedOptions,
): string {
  const db = options.bedDb ?? BED_DB;
  const seconds = options.totalMs / 1000;
  const fadeOutAt = Math.max(0, seconds - FADE_OUT_S);
  /**
   * THE VOICE IS USED TWICE — once as the thing to mix and once as the key the
   * duck listens to — and a filter graph may not read a label twice. asplit is
   * the whole reason this is a graph rather than one filter.
   */
  return [
    `[${voice}]asplit=2[vmix][vkey]`,
    /**
     * LOOPED, THEN CUT. A track shorter than the reel would otherwise end
     * mid-reel and leave the silence this exists to fix, which is the failure
     * that looks most like it worked.
     */
    `[${music}]aloop=loop=-1:size=2e9,atrim=0:${seconds.toFixed(3)},asetpts=N/SR/TB,`
      + `volume=${db}dB,afade=t=in:st=0:d=${FADE_IN_S},`
      + `afade=t=out:st=${fadeOutAt.toFixed(3)}:d=${FADE_OUT_S}[bed]`,
    `[bed][vkey]sidechaincompress=threshold=${DUCK_THRESHOLD}:ratio=${DUCK_RATIO}`
      + `:attack=${DUCK_ATTACK_MS}:release=${DUCK_RELEASE_MS}[ducked]`,
    /**
     * `normalize=0` because amix otherwise divides every input by the number
     * of inputs, which would quietly drop the narration 6dB and undo the
     * loudness chain that took three passes to get right.
     */
    `[ducked][vmix]amix=inputs=2:duration=first:normalize=0[${out}]`,
  ].join(";");
}

/**
 * What a person should do about audio that this cannot do for them.
 *
 * Shown in the studio rather than left in a source file, because it is the
 * larger half of the answer and the half a machine cannot carry out.
 */
export const MUSIC_GUIDANCE = [
  `Gym and UK football short-form runs on ${NICHE_GENRES.join(", ")} — `
    + `${NICHE_BPM_MIN}-${NICHE_BPM_MAX}bpm and bass-led. `
    + "scripts/check-music.py measures a track against that and refuses one that is not.",
  "A bed is mixed in only when you supply a track you have the right to use. "
    + "Nothing here picks music for you.",
  "The bigger lever is the platform's own trending sound, chosen when you post: "
    + "it files the video with an audience already listening to that sound, and is "
    + "reported to carry a post to around 68% more views.",
  "Those two fight each other. A reel whose voice carries it wants the bed; a reel "
    + "you would rather file under a trending sound wants no bed at all.",
];
