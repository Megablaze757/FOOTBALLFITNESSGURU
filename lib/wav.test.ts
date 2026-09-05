import { test } from "node:test";
import assert from "node:assert/strict";
import { blockAlign, durationMs, layTrack, offsetOf, readWav, writeWav, type WavFormat } from "./wav";

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
