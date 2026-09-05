import { test } from "node:test";
import assert from "node:assert/strict";
import { LEAD_MS, SILENT_BEAT_MS, TAIL_MS, beatAudio, retime, trackClips, type SpokenPhrase } from "./narration";
import { GAP } from "./speech-timing";

const said = (audioMs: number, gapMs = 0): SpokenPhrase => ({ text: "x", gapMs, audioMs });

test("a beat is long enough for its speech, its pauses and its edges", () => {
  const audio = beatAudio([said(1_000, GAP.sentence), said(800)]);
  assert.equal(audio.ms, LEAD_MS + 1_000 + GAP.sentence + 800 + TAIL_MS);
  assert.deepEqual(audio.clips.map((c) => c.atMs), [LEAD_MS, LEAD_MS + 1_000 + GAP.sentence]);
});

/** The cut should land fractionally before the voice, or the word sounds
 *  clipped — the ear expects the room before the speech. */
test("nothing starts on the very first frame", () => {
  assert.equal(beatAudio([said(500)]).clips[0].atMs, LEAD_MS);
  assert.ok(LEAD_MS > 0);
});

test("a silent beat is still long enough to look at", () => {
  const audio = beatAudio([]);
  assert.equal(audio.ms, SILENT_BEAT_MS);
  assert.deepEqual(audio.clips, []);
  assert.ok(SILENT_BEAT_MS > 500, "a shot nobody can register is not a shot");
});

/** The last phrase's gap is zero by construction; adding TAIL as well would
 *  leave two silences at the end of every shot. */
test("the end of a beat has one silence, not two", () => {
  const audio = beatAudio([said(1_000, GAP.payoff), said(500, 0)]);
  assert.equal(audio.ms - (audio.clips[1].atMs + 500), TAIL_MS);
});

test("negative or nonsense durations do not shorten a beat", () => {
  const audio = beatAudio([said(-500, -200), said(300)]);
  assert.ok(audio.ms >= LEAD_MS + TAIL_MS + 300, `${audio.ms}ms`);
  assert.ok(audio.clips.every((c) => c.atMs >= 0));
});

// --- laying the beats out ----------------------------------------------------

const beats = [
  { route: "/a", action: "one", say: "first" },
  { route: "/b", action: "two", say: "" },
  { route: "/c", action: "three", say: "third" },
];

/**
 * CONTIGUOUS, with no holes. beatAt() in lib/reel-script.ts reads the beats as
 * a timeline and a gap in it puts the teleprompter and every caption on the
 * wrong beat for the rest of the reel.
 */
test("re-timed beats run end to end with no gaps", () => {
  const audio = [beatAudio([said(1_000)]), beatAudio([]), beatAudio([said(2_000)])];
  const { beats: out, totalMs } = retime(beats, audio);

  let at = 0;
  for (const [i, b] of out.entries()) {
    assert.equal(b.at, at, `beat ${i + 1} does not start where the previous one ended`);
    assert.equal(b.ms, audio[i].ms);
    at += b.ms;
  }
  assert.equal(totalMs, at);
  assert.deepEqual(out.map((b) => b.route), ["/a", "/b", "/c"]);
});

test("a beat with no measured audio still gets a length", () => {
  const { beats: out } = retime(beats, []);
  assert.ok(out.every((b) => b.ms === SILENT_BEAT_MS));
  assert.equal(out[2].at, SILENT_BEAT_MS * 2);
});

/**
 * The one place beat-relative and reel-absolute offsets are combined. Getting
 * this wrong is a voice that drifts further behind the picture with every
 * line — heard rather than seen, so it survives every check on the video.
 */
test("every clip knows where it sits in the finished reel", () => {
  const audio = [beatAudio([said(1_000, GAP.sentence), said(500)]), beatAudio([]), beatAudio([said(800)])];
  const { beats: out } = retime(beats, audio);
  const clips = trackClips(out, audio);

  assert.equal(clips.length, 3, "a clip went missing");
  assert.equal(clips[0].atMs, LEAD_MS);
  assert.equal(clips[1].atMs, LEAD_MS + 1_000 + GAP.sentence);
  assert.equal(clips[2].atMs, out[2].at + LEAD_MS);
  // Strictly increasing: two clips at the same moment is two voices at once.
  for (let i = 1; i < clips.length; i++) {
    assert.ok(clips[i].atMs > clips[i - 1].atMs, `clip ${i} starts before clip ${i - 1} ends`);
  }
});

test("no audio at all produces no clips rather than throwing", () => {
  assert.deepEqual(trackClips(retime(beats, []).beats, []), []);
  assert.deepEqual(trackClips([], []), []);
});
