import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TARGET_PEAK_DBFS,
  blockAlign,
  durationMs,
  layTrack,
  normalised,
  offsetOf,
  peakOf,
  readWav,
  speechEdges,
  trimmedToSpeech,
  writeWav,
  EDGE_KEEP_MS,
  type WavFormat,
} from "./wav";

/** What Piper writes. */
const PIPER: WavFormat = { sampleRate: 22_050, channels: 1, bitsPerSample: 16 };
const STEREO: WavFormat = { sampleRate: 48_000, channels: 2, bitsPerSample: 16 };

const tone = (format: WavFormat, ms: number, value = 0x20) =>
  new Uint8Array(offsetOf(format, ms)).fill(value);

test("a file this wrote reads back as what went in", () => {
  for (const format of [PIPER, STEREO]) {
    const data = tone(format, 500);
    const round = readWav(writeWav(format, data));
    assert.ok(round, "a file it wrote is one it cannot read");
    assert.deepEqual(round.format, format);
    assert.deepEqual(round.data, data);
    assert.ok(Math.abs(durationMs(round.format, round.data.length) - 500) < 1);
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE DATA DOES NOT ALWAYS START AT BYTE 44.
 *
 * Encoders write LIST, fact and other chunks between the header and the
 * payload. Reading from a fixed offset treats that metadata as audio — a burst
 * of noise at the start of every line, and a track longer than it should be by
 * however many bytes the metadata was. It is heard rather than seen, so it
 * survives every check that looks at the video.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a file with chunks before the audio is read correctly", () => {
  const data = tone(PIPER, 250);
  const plain = writeWav(PIPER, data);

  // Splice a LIST chunk in between "fmt " and "data".
  const list = new Uint8Array(8 + 10);
  for (let i = 0; i < 4; i++) list[i] = "LIST".charCodeAt(i);
  new DataView(list.buffer).setUint32(4, 10, true);
  const spliced = new Uint8Array(plain.length + list.length);
  spliced.set(plain.subarray(0, 36), 0);
  spliced.set(list, 36);
  spliced.set(plain.subarray(36), 36 + list.length);
  new DataView(spliced.buffer).setUint32(4, spliced.length - 8, true);

  const read = readWav(spliced);
  assert.ok(read, "a wav with a LIST chunk was rejected outright");
  assert.deepEqual(read.data, data, "metadata was read as audio");
});

/** An odd-sized chunk is followed by a pad byte the size does not count.
 *  Ignoring it walks into the middle of the next header. */
test("an odd-sized chunk does not derail the walk", () => {
  const data = tone(PIPER, 120);
  const plain = writeWav(PIPER, data);
  const odd = new Uint8Array(8 + 5 + 1);
  for (let i = 0; i < 4; i++) odd[i] = "fact".charCodeAt(i);
  new DataView(odd.buffer).setUint32(4, 5, true);
  const spliced = new Uint8Array(plain.length + odd.length);
  spliced.set(plain.subarray(0, 36), 0);
  spliced.set(odd, 36);
  spliced.set(plain.subarray(36), 36 + odd.length);
  assert.deepEqual(readWav(spliced)?.data, data);
});

test("anything that is not a PCM wav is refused rather than played as noise", () => {
  assert.equal(readWav(new Uint8Array(0)), null);
  assert.equal(readWav(new Uint8Array(64)), null);
  assert.equal(readWav(new TextEncoder().encode("RIFFxxxxWAVE")), null, "no fmt and no data");

  // Compressed: copying these bytes around as samples produces noise.
  const compressed = writeWav(PIPER, tone(PIPER, 50));
  new DataView(compressed.buffer).setUint16(20, 3, true); // IEEE float, not PCM
  assert.equal(readWav(compressed), null);
});

/** A truncated recording is worth taking as far as it goes. */
test("a data chunk longer than the file is read to the end of the file", () => {
  const full = writeWav(PIPER, tone(PIPER, 400));
  const cut = full.subarray(0, full.length - 1_000);
  const read = readWav(cut);
  assert.ok(read);
  assert.equal(read.data.length, cut.length - 44);
});

// --- laying the track --------------------------------------------------------

test("every clip lands at its own moment", () => {
  const format = PIPER;
  const clips = [
    { atMs: 0, data: tone(format, 300, 0x11) },
    { atMs: 1_000, data: tone(format, 300, 0x22) },
    { atMs: 5_000, data: tone(format, 300, 0x33) },
  ];
  const track = layTrack(format, clips, 6_000);
  assert.equal(track.length, offsetOf(format, 6_000));
  for (const clip of clips) {
    const at = offsetOf(format, clip.atMs);
    assert.equal(track[at], clip.data[0], `nothing at ${clip.atMs}ms`);
    assert.equal(track[at + clip.data.length - 1], clip.data[0], `${clip.atMs}ms ends early`);
  }
  // Silence between them, which for signed PCM is zeroes.
  assert.equal(track[offsetOf(format, 700)], 0);
  assert.equal(track[offsetOf(format, 3_000)], 0);
});

/**
 * A track a few thousand bytes out of place is a voice that drifts further
 * behind the picture with every line. Offsets must land on a whole sample or
 * the channels swap and every following byte is out by one.
 */
test("clips are aligned to whole samples, in every format", () => {
  for (const format of [PIPER, STEREO]) {
    const align = blockAlign(format);
    for (const ms of [0, 1, 7, 33.3, 1_000, 1_234.5678]) {
      assert.equal(offsetOf(format, ms) % align, 0, `${ms}ms in ${format.channels}ch`);
    }
    const track = layTrack(format, [{ atMs: 33.3, data: tone(format, 100, 0x44) }], 1_000);
    assert.equal(track.length % align, 0);
  }
});

/** The video is a fixed length. A narration longer than the picture is a file
 *  the platforms reject, not a slightly long reel. */
test("a clip that would run past the end is cut, not allowed to extend the track", () => {
  const track = layTrack(PIPER, [{ atMs: 900, data: tone(PIPER, 5_000, 0x55) }], 1_000);
  assert.equal(track.length, offsetOf(PIPER, 1_000));
  assert.equal(track[offsetOf(PIPER, 950)], 0x55, "the part that fits was dropped too");
});

test("a clip starting after the end is dropped rather than throwing", () => {
  assert.doesNotThrow(() => layTrack(PIPER, [{ atMs: 9_000, data: tone(PIPER, 100) }], 1_000));
  const track = layTrack(PIPER, [{ atMs: 9_000, data: tone(PIPER, 100, 0x66) }], 1_000);
  assert.ok(!track.includes(0x66));
});

test("no clips is silence, not a crash", () => {
  const track = layTrack(PIPER, [], 2_000);
  assert.equal(track.length, offsetOf(PIPER, 2_000));
  assert.ok(track.every((b) => b === 0));
});

test("a degenerate format never divides by zero", () => {
  const broken = { sampleRate: 0, channels: 0, bitsPerSample: 0 };
  assert.equal(blockAlign(broken), 1);
  assert.equal(durationMs(broken, 1_000), 0);
  assert.doesNotThrow(() => layTrack(broken, [], 1_000));
});

// ═══════════════════════════════════════════════════════════════════════════
// LOUDNESS: CUTTING A LINE, AND BRINGING THE FINISHED TRACK BACK TO LEVEL.
// ═══════════════════════════════════════════════════════════════════════════

/** A 16-bit mono clip of `samples`, each at the given amplitude. */
function pcm16(values: readonly number[]): Uint8Array {
  const out = new Uint8Array(values.length * 2);
  const view = new DataView(out.buffer);
  values.forEach((v, i) => view.setInt16(i * 2, v, true));
  return out;
}

const samplesOf = (bytes: Uint8Array): number[] => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: bytes.length / 2 }, (_, i) => view.getInt16(i * 2, true));
};

test("a line laid quieter is quieter, by the decibels asked for", () => {
  // -6dB is half the amplitude, which is the one decibel figure worth knowing.
  const track = layTrack(PIPER, [{ atMs: 0, data: pcm16([10_000, -10_000]), gainDb: -6 }], 100);
  const [a, b] = samplesOf(track.subarray(0, 4));
  assert.ok(Math.abs(a - 5_012) <= 2, `${a} is not 10000 cut by 6dB`);
  assert.ok(Math.abs(b + 5_012) <= 2, `${b} is not -10000 cut by 6dB`);
});

test("a line with no gain asked for is laid byte for byte", () => {
  const data = pcm16([1, -2, 32_767, -32_768]);
  const track = layTrack(PIPER, [{ atMs: 0, data }], 100);
  assert.deepEqual(samplesOf(track.subarray(0, data.length)), [1, -2, 32_767, -32_768]);
});

/**
 * Boosting is refused by lib/speech-prosody.ts rather than here, because a
 * gain of the wrong sign should be caught where it is written down. If one
 * ever gets this far it must saturate, not wrap: a sample that wraps goes from
 * loudest-positive to loudest-negative in one step, which is a crack.
 */
test("a boost that will not fit saturates instead of wrapping", () => {
  const track = layTrack(PIPER, [{ atMs: 0, data: pcm16([30_000, -30_000]), gainDb: 12 }], 100);
  assert.deepEqual(samplesOf(track.subarray(0, 4)), [32_767, -32_768]);
});

test("the peak is read as a fraction of full scale", () => {
  assert.equal(peakOf(PIPER, pcm16([0, 16_384, -8_000])), 0.5);
  assert.equal(peakOf(PIPER, pcm16([0, 0, 0])), 0);
  assert.equal(peakOf(PIPER, new Uint8Array(0)), 0);
  // The negative end of the range is the longer one, and full scale is 32768.
  assert.equal(peakOf(PIPER, pcm16([-32_768])), 1);
});

/** Reading 24-bit bytes as 16-bit pairs returns a number computed from nonsense. */
test("a depth this cannot read reports no peak rather than a plausible one", () => {
  const wide: WavFormat = { sampleRate: 22_050, channels: 1, bitsPerSample: 24 };
  assert.equal(peakOf(wide, pcm16([16_384, -20_000])), 0);
  const data = pcm16([16_384, -20_000]);
  assert.deepEqual(normalised(wide, data), data, "24-bit audio was rescaled by 16-bit arithmetic");
});

test("normalising puts the loudest sample on the target and nothing above it", () => {
  const target = 10 ** (TARGET_PEAK_DBFS / 20);
  for (const quiet of [8_000, 16_384, 30_000, 100]) {
    const out = normalised(PIPER, pcm16([quiet, -Math.round(quiet / 2), 0]));
    const peak = peakOf(PIPER, out);
    assert.ok(Math.abs(peak - target) < 0.001, `peak ${peak.toFixed(4)} is not ${target.toFixed(4)}`);
    assert.ok(peak < 1, "normalised to full scale, which the AAC encoder will overshoot");
  }
});

test("normalising keeps the shape, only the level", () => {
  const out = samplesOf(normalised(PIPER, pcm16([4_000, -2_000, 1_000])));
  assert.ok(Math.abs(out[0] / out[1] + 2) < 0.01, "the ratio between samples moved");
  assert.ok(Math.abs(out[0] / out[2] - 4) < 0.01, "the ratio between samples moved");
});

/**
 * The target is a CONSTANT below full scale, and this asserts the constant
 * because no output can. Normalising to 0 dBFS lands on 32767 of 32768 after
 * the clamp, which every peak assertion here accepts — the reason for the
 * headroom is what the AAC encoder does to the samples afterwards, and that
 * happens outside this file.
 */
test("the target leaves headroom for the encoder to overshoot into", () => {
  assert.ok(TARGET_PEAK_DBFS < 0, "normalised to full scale, and AAC overshoots what it is given");
  assert.ok(TARGET_PEAK_DBFS >= -3, `${TARGET_PEAK_DBFS}dBFS throws away level for headroom nothing needs`);
});

/** Silence stays silence. The guard for it is documented as unable to matter. */
test("normalising silence returns silence rather than dividing by nothing", () => {
  const silence = pcm16([0, 0, 0, 0]);
  assert.deepEqual(samplesOf(normalised(PIPER, silence)), [0, 0, 0, 0]);
  assert.deepEqual(samplesOf(normalised(PIPER, new Uint8Array(0))), []);
});

/** The point of the pass: the same level whatever mix of roles a reel has. */
test("two reels cut by different amounts come out at the same level", () => {
  const target = 10 ** (TARGET_PEAK_DBFS / 20);
  const mostlyQuiet = layTrack(PIPER, [
    { atMs: 0, data: pcm16([20_000, -20_000]), gainDb: -7 },
    { atMs: 50, data: pcm16([20_000, -20_000]), gainDb: -7 },
  ], 200);
  const mostlyLoud = layTrack(PIPER, [
    { atMs: 0, data: pcm16([20_000, -20_000]), gainDb: 0 },
    { atMs: 50, data: pcm16([20_000, -20_000]), gainDb: -1 },
  ], 200);
  for (const track of [mostlyQuiet, mostlyLoud]) {
    assert.ok(Math.abs(peakOf(PIPER, normalised(PIPER, track)) - target) < 0.001);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// THE SILENCE THE VOICE MODEL SHIPS INSIDE EVERY LINE.
//
// Built to the shape the real clips have, measured at 5ms resolution on three
// finished reels: a little hard zero, then a FLAT floor about 60dB under the
// speech — room tone, not a breath — and then the words. See lib/wav.ts.
// ═══════════════════════════════════════════════════════════════════════════

const SPEECH = 20_000;
/** 60dB under SPEECH, which is where the model's floor actually sits. */
const FLOOR = Math.round(SPEECH * 10 ** (-60 / 20));

/**
 * Edges land on a window boundary, and the window is 10ms. Asserting to the
 * millisecond would be asserting the window size, which is an implementation
 * detail this file has no opinion about.
 */
const EDGE_WINDOW_TOLERANCE = 15;

function clip(
  format: WavFormat,
  parts: readonly { ms: number; amplitude: number }[],
): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + offsetOf(format, p.ms), 0));
  const view = new DataView(out.buffer);
  let at = 0;
  for (const part of parts) {
    const end = at + offsetOf(format, part.ms);
    for (let i = at; i + 1 < end; i += 2) {
      view.setInt16(i, i % 4 === 0 ? part.amplitude : -part.amplitude, true);
    }
    at = end;
  }
  return out;
}

const voiced = (format: WavFormat, leadMs: number, sayMs: number, trailMs: number) => clip(format, [
  { ms: 20, amplitude: 0 },
  { ms: leadMs - 20, amplitude: FLOOR },
  { ms: sayMs, amplitude: SPEECH },
  { ms: trailMs - 20, amplitude: FLOOR },
  { ms: 20, amplitude: 0 },
]);

test("the edges of the speech are found through the model's own room tone", () => {
  const edges = speechEdges(PIPER, voiced(PIPER, 160, 1_200, 150));
  assert.ok(edges, "no speech found in a clip that is mostly speech");
  assert.ok(Math.abs(edges.startMs - 160) <= EDGE_WINDOW_TOLERANCE, `starts at ${edges.startMs}ms`);
  assert.ok(Math.abs(edges.endMs - 1_360) <= EDGE_WINDOW_TOLERANCE, `ends at ${edges.endMs}ms`);
});

/**
 * THE PROPERTY THAT MATTERS: a trim that eats a word is worse than the silence
 * it was removing. Asserted as "every loud sample survived", not as a length.
 */
test("trimming never takes a sample of the speech with it", () => {
  for (const [lead, say, trail] of [[160, 1_200, 150], [20, 400, 20], [500, 90, 500]]) {
    const original = voiced(PIPER, lead, say, trail);
    const kept = trimmedToSpeech(PIPER, original);
    const loud = (bytes: Uint8Array) => samplesOf(bytes).filter((s) => Math.abs(s) > FLOOR).length;
    assert.equal(loud(kept), loud(original), `${lead}/${say}/${trail} lost speech`);
  }
});

test("the clip comes back shorter by the silence, less the room kept either side", () => {
  const kept = trimmedToSpeech(PIPER, voiced(PIPER, 160, 1_200, 150));
  const was = durationMs(PIPER, offsetOf(PIPER, 160 + 1_200 + 150));
  const now = durationMs(PIPER, kept.length);
  const expected = was - (160 - EDGE_KEEP_MS) - (150 - EDGE_KEEP_MS);
  assert.ok(Math.abs(now - expected) <= 2 * EDGE_WINDOW_TOLERANCE, `${now}ms, wanted about ${expected}ms`);
});

/** The room is kept ON PURPOSE — a line starting on its own attack is a splice. */
test("room tone is left in front of the first word", () => {
  const kept = trimmedToSpeech(PIPER, voiced(PIPER, 300, 800, 300));
  const before = samplesOf(kept).findIndex((s) => Math.abs(s) > FLOOR);
  const ms = durationMs(PIPER, before * 2);
  assert.ok(ms >= EDGE_KEEP_MS - 10, `only ${ms}ms of room left in front of the voice`);
});

/**
 * A failed generation is implausibleAudio's to catch, and it measures the
 * clip. So a clip with no words in it has to come back the length it went in
 * rather than being trimmed down to nothing and reported as plausible.
 *
 * The threshold is relative to the clip's OWN loudest moment, so a clip that
 * is nothing but room tone is uniformly "above the floor" and no edge is
 * found to cut at. That arrives at the same place from the other direction.
 */
test("a clip with no speech in it comes back the length it went in", () => {
  for (const amplitude of [0, FLOOR]) {
    const nothing = clip(PIPER, [{ ms: 500, amplitude }]);
    assert.equal(trimmedToSpeech(PIPER, nothing).length, nothing.length, `amplitude ${amplitude}`);
  }
});

/** Shorter than the measurement itself: there is no answer, and it says so. */
test("a clip too short to measure reports no edges rather than a guess", () => {
  assert.equal(speechEdges(PIPER, new Uint8Array(0)), null);
  assert.equal(speechEdges(PIPER, clip(PIPER, [{ ms: 5, amplitude: SPEECH }])), null);
});

/** Reading 24-bit bytes as 16-bit pairs would trim a real line to nonsense. */
test("a depth this cannot read a sample out of is left alone", () => {
  const deep: WavFormat = { sampleRate: 22_050, channels: 1, bitsPerSample: 24 };
  const data = voiced(PIPER, 200, 600, 200);
  assert.equal(speechEdges(deep, data), null);
  assert.equal(trimmedToSpeech(deep, data).length, data.length);
});

/**
 * ONE WINDOW OVER THE FLOOR IS NOT A WORD, and the limit of that claim is
 * worth writing down: the floor sits 60dB under the speech and the threshold
 * 45dB under it, so ANY full-amplitude artefact clears the threshold in every
 * window it touches. A spike of one sample touches one window and is ignored;
 * anything longer straddles two and will anchor the line early.
 *
 * That is a cost of a few milliseconds of trim, never a cut into speech — the
 * edge can only move OUTWARD from a stray sample, which is the direction that
 * leaves the clip as it was.
 */
test("a single-sample spike does not start the line early", () => {
  const withSpike = clip(PIPER, [
    { ms: 20, amplitude: 0 },
    { ms: 300, amplitude: FLOOR },
    { ms: 600, amplitude: SPEECH },
    { ms: 100, amplitude: FLOOR },
  ]);
  new DataView(withSpike.buffer).setInt16(offsetOf(PIPER, 120), SPEECH, true);
  const edges = speechEdges(PIPER, withSpike);
  assert.ok(edges, "no speech found");
  assert.ok(edges.startMs >= 300, `the spike at 120ms started the line, at ${edges.startMs}ms`);
});

/** Stereo, because a trim off a half-sample boundary is noise rather than a trim. */
test("a trim lands on a whole sample across every channel", () => {
  const kept = trimmedToSpeech(STEREO, voiced(STEREO, 170, 900, 170));
  assert.equal(kept.length % blockAlign(STEREO), 0);
  assert.equal(kept.byteOffset % blockAlign(STEREO), 0);
});
