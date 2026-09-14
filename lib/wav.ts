// =============================================================================
// LAYING A NARRATION TRACK, SO THE VOICE LANDS ON THE BEAT IT BELONGS TO.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS RATHER THAN AN ffmpeg CALL.
//
// The reel recorder runs anywhere: Playwright bundles a VP8-only ffmpeg with
// no audio support at all, and a full one exists on a CI runner and not
// necessarily on anybody's laptop. Building the narration track is arithmetic
// on PCM bytes, so doing it here means the voiceover works with nothing
// installed and ffmpeg is needed only for the final mux.
//
// It is also the part with a wrong answer. A track assembled a few thousand
// bytes out of place is a voice that drifts further behind the picture with
// every line — and it is heard, not seen, so it survives every check that
// looks at the video.
//
// PIPER WRITES 22.05kHz, 16-bit, MONO. Nothing here assumes that: the format
// is read from the file, because a voice model with different settings would
// otherwise produce a track that plays at the wrong speed.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

export interface WavFormat {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
}

export interface Wav {
  format: WavFormat;
  /** The PCM payload, without the header. */
  data: Uint8Array;
}

/** Bytes for one sample across every channel. Never zero — see readWav. */
export function blockAlign(format: WavFormat): number {
  return Math.max(1, format.channels * Math.ceil(format.bitsPerSample / 8));
}

export function durationMs(format: WavFormat, byteLength: number): number {
  const bytesPerSecond = blockAlign(format) * format.sampleRate;
  return bytesPerSecond > 0 ? (byteLength / bytesPerSecond) * 1000 : 0;
}

/**
 * Byte offset of a moment in time, on a whole sample.
 *
 * Alignment falls out of the arithmetic: a whole number of SAMPLES multiplied
 * by the block size is a multiple of the block size. A `- (bytes % align)`
 * was written here to enforce it and could never fire, which is a claim that
 * something is being checked when nothing is.
 */
export function offsetOf(format: WavFormat, ms: number): number {
  return Math.round((Math.max(0, ms) / 1000) * format.sampleRate) * blockAlign(format);
}

const ascii = (bytes: Uint8Array, at: number) =>
  String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);

/**
 * Read a PCM wav.
 *
 * CHUNKS ARE WALKED, not assumed. The data does not always begin at byte 44:
 * encoders write LIST, fact and other chunks between the header and the
 * payload, and reading from a fixed offset then treats metadata as audio —
 * which is a burst of noise at the start of every line, and a track that is
 * long by however many bytes that metadata was.
 *
 * Null rather than a throw for anything it does not recognise: the caller is a
 * build script, and "this file is not a wav I can lay" is a message, not a
 * crash.
 */
export function readWav(bytes: Uint8Array): Wav | null {
  if (bytes.length < 12 || ascii(bytes, 0) !== "RIFF" || ascii(bytes, 8) !== "WAVE") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let format: WavFormat | null = null;
  let at = 12;
  while (at + 8 <= bytes.length) {
    const id = ascii(bytes, at);
    const size = view.getUint32(at + 4, true);
    const body = at + 8;

    if (id === "fmt " && size >= 16) {
      // 1 is PCM. Anything else here is compressed, and copying its bytes
      // around as though they were samples produces noise.
      if (view.getUint16(body, true) !== 1) return null;
      format = {
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bitsPerSample: view.getUint16(body + 14, true),
      };
    } else if (id === "data") {
      if (!format || !format.sampleRate || !format.channels) return null;
      /**
       * A size field longer than the file is a truncated recording, and this
       * takes it as far as it goes rather than refusing outright — which
       * subarray already does by clamping to the end of the buffer. An
       * explicit Math.min was here and could not change the result.
       */
      return { format, data: bytes.subarray(body, body + size) };
    }

    // Chunks are word-aligned: an odd size is followed by a pad byte that the
    // size does not count. Ignoring it walks into the middle of the next
    // chunk header and the rest of the file reads as garbage.
    at = body + size + (size % 2);
  }
  return null;
}

export function writeWav(format: WavFormat, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(44 + data.length);
  const view = new DataView(out.buffer);
  const tag = (at: number, text: string) => {
    for (let i = 0; i < 4; i++) out[at + i] = text.charCodeAt(i);
  };
  const align = blockAlign(format);

  tag(0, "RIFF");
  view.setUint32(4, 36 + data.length, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, format.channels, true);
  view.setUint32(24, format.sampleRate, true);
  view.setUint32(28, format.sampleRate * align, true);
  view.setUint16(32, align, true);
  view.setUint16(34, format.bitsPerSample, true);
  tag(36, "data");
  view.setUint32(40, data.length, true);
  out.set(data, 44);
  return out;
}

export interface Clip {
  /** Where this line starts in the finished reel. */
  atMs: number;
  data: Uint8Array;
  /**
   * Loudness for this line, in decibels relative to how it was spoken.
   *
   * A voice that never changes volume sounds flat however much its pitch
   * moves. Measured on a finished reel before this existed: 3.93 dB of
   * variation across the whole thing, where ordinary read speech is 4-6 and
   * animated delivery is 8-12. Pitch was already at the model's ceiling; this
   * is the dimension that was missing.
   *
   * Which line gets what is decided by its ROLE in lib/speech-prosody.ts —
   * the payoff leans in, connective material steps back.
   */
  gainDb?: number;
}

/**
 * One track, with each line at its own moment and silence in between.
 *
 * Silence is zeroes, which is what 16-bit signed PCM silence is — so the
 * buffer starts correct and only the clips have to be placed.
 *
 * A clip that would run past the end is TRUNCATED rather than extending the
 * track: the video is a fixed length, and a narration longer than the picture
 * is a file the platforms reject rather than a slightly long reel.
 */
/**
 * A line at a different volume from the one it was spoken at.
 *
 * SIXTEEN-BIT ONLY, and it says so rather than guessing: every other depth is
 * returned untouched. Silently misreading 24-bit samples as 16 would not throw
 * — it would produce noise, in a file nobody listens to until it is a reel.
 *
 * Clamped, because the gains are relative and a line already near full scale
 * would otherwise wrap from loud to loud-in-the-other-direction, which is the
 * ugliest sound a sample can make.
 */
function gained(format: WavFormat, data: Uint8Array, gainDb: number | undefined): Uint8Array {
  if (!gainDb || format.bitsPerSample !== 16) return data;
  const factor = 10 ** (gainDb / 20);
  const out = new Uint8Array(data.length - (data.length % 2));
  const src = new DataView(data.buffer, data.byteOffset, out.length);
  const dst = new DataView(out.buffer);
  for (let i = 0; i + 1 < out.length; i += 2) {
    const scaled = Math.round(src.getInt16(i, true) * factor);
    dst.setInt16(i, Math.max(-32768, Math.min(32767, scaled)), true);
  }
  return out;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BRINGING THE FINISHED TRACK BACK UP TO LEVEL.
 *
 * The loudness shaping in lib/speech-prosody.ts can only cut, because the
 * voice already peaks at 1.02 of full scale and there is nowhere above that to
 * go. Cutting alone would ship a reel several decibels quieter than the last
 * one, and by a different amount each time depending on which lines it happens
 * to contain.
 *
 * So the shape is made by attenuation and the level is set once, here, on the
 * assembled track. One multiply, chosen so the loudest sample lands on the
 * target: it cannot clip by construction, and every reel comes out at the same
 * level whatever its mix of roles.
 *
 * A LITTLE UNDER FULL SCALE rather than at it. The mux re-encodes to AAC, and
 * a lossy encoder overshoots the samples it was given — a track normalised to
 * exactly 0 dBFS comes back out of the encoder above it.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const TARGET_PEAK_DBFS = -1;

/** Full scale for a signed 16-bit sample. The negative end is the longer one. */
const FULL_SCALE = 32768;

/**
 * The loudest sample in a track, as a fraction of full scale.
 *
 * Zero for anything that is not 16-bit, which is the one depth this file knows
 * how to read a sample out of. Reading 24-bit bytes as 16-bit pairs would
 * return a plausible-looking number computed from nonsense.
 */
export function peakOf(format: WavFormat, data: Uint8Array): number {
  if (format.bitsPerSample !== 16 || data.length < 2) return 0;
  const view = new DataView(data.buffer, data.byteOffset, data.length - (data.length % 2));
  let peak = 0;
  for (let i = 0; i + 1 < view.byteLength; i += 2) {
    const magnitude = Math.abs(view.getInt16(i, true));
    if (magnitude > peak) peak = magnitude;
  }
  return peak / FULL_SCALE;
}

/**
 * A track scaled so its loudest sample sits at `targetDbFs`.
 *
 * The early return on silence CANNOT CHANGE THE RESULT and is here to be read,
 * not to catch anything: a track whose peak is zero is all zeroes, and the
 * arithmetic below takes it through a gain of Infinity to a sample of NaN,
 * which setInt16 coerces back to zero. It arrives at silence either way. The
 * guard is so nobody has to work that out, and removing it is safe.
 */
export function normalised(
  format: WavFormat,
  data: Uint8Array,
  targetDbFs: number = TARGET_PEAK_DBFS,
): Uint8Array {
  const peak = peakOf(format, data);
  if (peak <= 0) return data;
  return gained(format, data, targetDbFs - 20 * Math.log10(peak));
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE SILENCE THE VOICE MODEL SHIPS INSIDE EVERY LINE.
 *
 * lib/narration.ts puts LEAD_MS of room in front of a line and TAIL_MS behind
 * it, and says in as many words that a cut is "about a third of a second".
 * Measured on three finished reels, every cut was about two thirds. Each
 * synthesised clip arrives with its own silence at both ends and the pipeline
 * was laying that as though it were speech:
 *
 *   demo-readiness          lead 160ms  trail 112ms   2.38s of 25.3s
 *   standards-bench-press   lead 150ms  trail 145ms   3.11s of 29.1s
 *   card-cheapest-protein   lead 200ms  trail 232ms   1.55s of 19.9s
 *
 * (medians per clip, and the total across the reel)
 *
 * The one that costs something is the first. A reel opens on LEAD_MS plus
 * whatever the model put in front of the first word — about 300ms of nothing
 * — inside the second where the measured curve in lib/reel-retention.ts loses
 * half the audience.
 *
 * NOTHING DOWNSTREAM COULD SEE THIS. scripts/check-sync.mts subtracts the
 * caption times from the clip times, and both come from the same schedule, so
 * a track where every word arrives 150ms after the schedule says it does
 * reports zero error. It took decoding the finished audio to find.
 *
 * WHAT THE EDGES LOOK LIKE, at 5ms resolution and relative to the clip's own
 * peak: 15-30ms of hard zero, then a FLAT floor at -53 to -64dB with no
 * structure in it — room tone, not a breath — and then speech, which crosses
 * -45dB and reaches -20 within about 15ms. The two are far enough apart that
 * the threshold between them is not a judgement call.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const SPEECH_FLOOR_DB = -45;

/**
 * Room tone kept either side of the speech.
 *
 * Trimming to the first loud sample would start the line on its own attack,
 * which sounds like a tape splice. This leaves the model's own floor either
 * side, so LEAD_MS lands on quiet rather than on a word.
 */
export const EDGE_KEEP_MS = 40;

const EDGE_WINDOW_MS = 10;

/** Windows that have to clear the floor together, so one click is not a word. */
const EDGE_RUN = 2;

/** Per-window loudness, in dB relative to full scale. Empty for anything but 16-bit. */
function windowsDb(format: WavFormat, data: Uint8Array): number[] {
  if (format.bitsPerSample !== 16) return [];
  const align = blockAlign(format);
  const per = Math.max(align, Math.round((EDGE_WINDOW_MS / 1000) * format.sampleRate) * align);
  const usable = data.byteLength - (data.byteLength % 2);
  const view = new DataView(data.buffer, data.byteOffset, usable);
  const out: number[] = [];
  for (let at = 0; at + per <= usable; at += per) {
    let sum = 0;
    let count = 0;
    for (let i = at; i + 1 < at + per; i += 2) {
      const sample = view.getInt16(i, true) / FULL_SCALE;
      sum += sample * sample;
      count += 1;
    }
    // 10log10 of the mean square is 20log10 of the RMS, without the square root.
    out.push(count ? 10 * Math.log10(sum / count + 1e-24) : -Infinity);
  }
  return out;
}

export interface SpeechEdges {
  /** Offset of the first word, in ms from the start of the clip. */
  startMs: number;
  /** End of the last word, in ms from the start of the clip. */
  endMs: number;
}

/**
 * Where the speech in a clip begins and ends.
 *
 * Null rather than a throw for a clip this cannot read — a depth it does not
 * understand, or one with nothing above the floor anywhere in it. The caller
 * then leaves the clip exactly as the model produced it, which is the safe
 * direction: a clip that is all silence is a failed generation, and catching
 * that is implausibleAudio's job, not this one's.
 */
export function speechEdges(format: WavFormat, data: Uint8Array): SpeechEdges | null {
  const dbs = windowsDb(format, data);
  if (dbs.length < EDGE_RUN) return null;

  const floor = Math.max(...dbs) + SPEECH_FLOOR_DB;
  const clears = (from: number, step: number) => {
    for (let k = 0; k < EDGE_RUN; k++) {
      const at = from + k * step;
      if (at < 0 || at >= dbs.length || dbs[at] <= floor) return false;
    }
    return true;
  };

  let first = -1;
  for (let i = 0; i < dbs.length; i++) {
    if (clears(i, 1)) { first = i; break; }
  }
  if (first < 0) return null;

  let last = first;
  for (let i = dbs.length - 1; i > first; i--) {
    if (clears(i, -1)) { last = i; break; }
  }

  return { startMs: first * EDGE_WINDOW_MS, endMs: (last + 1) * EDGE_WINDOW_MS };
}

/**
 * The same clip with the model's own silence taken off both ends.
 *
 * A VIEW, not a copy: subarray shares the buffer, and layTrack only reads it.
 *
 * The clip is returned untouched whenever the edges cannot be found, so the
 * failure mode of this whole idea is the timing the pipeline had before it.
 */
export function trimmedToSpeech(format: WavFormat, data: Uint8Array): Uint8Array {
  const edges = speechEdges(format, data);
  if (!edges) return data;
  const align = blockAlign(format);
  const usable = data.length - (data.length % align);
  const start = Math.min(offsetOf(format, Math.max(0, edges.startMs - EDGE_KEEP_MS)), usable);
  const end = Math.max(start, Math.min(offsetOf(format, edges.endMs + EDGE_KEEP_MS), usable));
  return data.subarray(start, end);
}

export function layTrack(format: WavFormat, clips: readonly Clip[], totalMs: number): Uint8Array {
  const align = blockAlign(format);
  const length = offsetOf(format, Math.max(0, totalMs));
  const track = new Uint8Array(length);

  for (const clip of clips) {
    const start = offsetOf(format, clip.atMs);
    if (start >= length) continue;
    const room = length - start;
    const slice = clip.data.length > room ? clip.data.subarray(0, room - (room % align)) : clip.data;
    track.set(gained(format, slice, clip.gainDb), start);
  }
  return track;
}
