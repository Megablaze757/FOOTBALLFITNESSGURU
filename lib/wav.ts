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
export function layTrack(format: WavFormat, clips: readonly Clip[], totalMs: number): Uint8Array {
  const align = blockAlign(format);
  const length = offsetOf(format, Math.max(0, totalMs));
  const track = new Uint8Array(length);

  for (const clip of clips) {
    const start = offsetOf(format, clip.atMs);
    if (start >= length) continue;
    const room = length - start;
    const slice = clip.data.length > room ? clip.data.subarray(0, room - (room % align)) : clip.data;
    track.set(slice, start);
  }
  return track;
}
