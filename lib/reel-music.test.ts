import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  bedFilter, bedProblems, BED_DB, DUCK_RELEASE_MS, FADE_OUT_S, MUSIC_GUIDANCE,
  NICHE_BPM_MIN, NICHE_BPM_MAX, NICHE_MIN_BASS_SHARE, NICHE_GENRES,
} from "./reel-music";
import { GAP } from "./speech-timing";

test("a well-formed request has nothing wrong with it", () => {
  assert.deepEqual(bedProblems({ totalMs: 20_000 }), []);
});

test("a bed that would drown the voice is refused", () => {
  assert.ok(bedProblems({ totalMs: 20_000, bedDb: 3 }).some((p) => p.includes("above the voice")));
  assert.ok(bedProblems({ totalMs: 20_000, bedDb: -2 }).some((p) => p.includes("inside the voice")));
  assert.ok(bedProblems({ totalMs: 20_000, bedDb: -60 }).some((p) => p.includes("may as well be silence")));
  assert.ok(bedProblems({ totalMs: 0 }).some((p) => p.includes("how long the reel is")));
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE VOICE IS READ TWICE AND A GRAPH MAY NOT DO THAT.
 *
 * It is mixed, and it is also the key the duck listens to. Without asplit the
 * graph is invalid — and the failure mode of getting this wrong is not a
 * crash, it is ffmpeg mixing whatever label it finds.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the narration is split before being used as both a source and a key", () => {
  const f = bedFilter("0:a", "1:a", "mix", { totalMs: 20_000 });
  assert.ok(f.includes("asplit=2[vmix][vkey]"), "the voice is read twice without being split");
  assert.ok(f.includes("[bed][vkey]sidechaincompress"), "the duck is not keyed off the voice");
  assert.ok(f.includes("[ducked][vmix]amix"), "the ducked bed is not mixed with the voice");
});

test("amix does not quietly halve the narration", () => {
  const f = bedFilter("0:a", "1:a", "mix", { totalMs: 20_000 });
  assert.ok(f.includes("normalize=0"),
    "amix divides by the input count, which would drop the voice 6dB under the loudness chain");
});

test("a short track is looped rather than running out mid-reel", () => {
  const f = bedFilter("0:a", "1:a", "mix", { totalMs: 25_000 });
  assert.ok(f.includes("aloop=loop=-1"), "a track shorter than the reel would end in silence");
  assert.ok(f.includes("atrim=0:25.000"), "the bed is not cut to the reel's length");
});

test("the bed fades rather than starting and stopping flat", () => {
  const f = bedFilter("0:a", "1:a", "mix", { totalMs: 20_000 });
  assert.ok(f.includes("afade=t=in:st=0"), "no fade in");
  assert.ok(f.includes(`afade=t=out:st=${(20 - FADE_OUT_S).toFixed(3)}`), "the fade out is mistimed");
});

/** A reel shorter than the fade cannot fade out before it starts. */
test("a very short reel does not ask for a negative fade", () => {
  const f = bedFilter("0:a", "1:a", "mix", { totalMs: 500 });
  assert.ok(!/st=-/.test(f), `negative fade start in: ${f}`);
});

test("the inputs are named, not assumed to be the first two", () => {
  const f = bedFilter("voice", "track", "out", { totalMs: 10_000 });
  assert.ok(f.startsWith("[voice]"), "the voice input is not the one it was given");
  assert.ok(f.includes("[track]aloop"), "the music input is not the one it was given");
  assert.ok(f.includes("[out]"), "the output label is not the one it was asked for");
});

/**
 * The bed exists to carry the pauses. A release longer than the pauses would
 * hold the music down through the very gaps it is there to fill.
 */
test("the duck recovers faster than the pauses it has to carry", () => {
  assert.ok(DUCK_RELEASE_MS < GAP.payoff,
    `a ${DUCK_RELEASE_MS}ms release is still ducking through a ${GAP.payoff}ms payoff pause`);
  assert.ok(DUCK_RELEASE_MS < GAP.reveal, "the reveal pause would be held down");
});

test("the default bed sits under a voice rather than beside it", () => {
  assert.ok(BED_DB <= -12, `${BED_DB}dB is not under a narration`);
  assert.deepEqual(bedProblems({ totalMs: 20_000, bedDb: BED_DB }), []);
});

/** The half of the answer a machine cannot carry out is written down. */
test("the guidance says what this cannot do", () => {
  const all = MUSIC_GUIDANCE.join(" ");
  assert.ok(/right to use/i.test(all), "nothing warns that the track must be licensed");
  assert.ok(/trending/i.test(all), "the larger lever is not mentioned");
  assert.ok(MUSIC_GUIDANCE.length >= 3);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE CHECKER AND THE PROFILE MUST AGREE.
 *
 * scripts/check-music.py holds the same three numbers in Python. The drift
 * that put bf_alice and 0.94 in kokoro-say.py for two engines and three voices
 * is the same shape of bug: a second copy of a setting that nobody reads.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the music checker uses the profile this file defines", () => {
  const py = readFileSync("scripts/check-music.py", "utf8");
  const num = (name: string) => {
    const m = py.match(new RegExp(`^${name} = ([0-9.]+)`, "m"));
    assert.ok(m, `check-music.py no longer defines ${name}`);
    return Number(m![1]);
  };
  assert.equal(num("BPM_MIN"), NICHE_BPM_MIN, "the checker and the profile disagree on tempo");
  assert.equal(num("BPM_MAX"), NICHE_BPM_MAX, "the checker and the profile disagree on tempo");
  assert.equal(num("MIN_BASS_SHARE"), NICHE_MIN_BASS_SHARE,
    "the checker and the profile disagree on how bass-led this niche is");
});

test("the profile describes the music this audience actually listens to", () => {
  // Reported: 120-150 for fitness, 140+ for hype sports edits, ~129 steady.
  assert.ok(NICHE_BPM_MIN <= 129 && NICHE_BPM_MAX >= 140,
    `${NICHE_BPM_MIN}-${NICHE_BPM_MAX} excludes the tempos this niche is reported to use`);
  assert.ok(NICHE_GENRES.includes("phonk"), "phonk is the dominant gym sound and is not listed");
  assert.ok(NICHE_GENRES.length >= 3, "one genre is not a profile");
});
