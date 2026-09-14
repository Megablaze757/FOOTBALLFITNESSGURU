/**
 * Does every caption start when its phrase is spoken?
 *
 * Reads the sync report the recorder writes beside the MP4 and subtracts. This
 * replaces three attempts to answer the same question by finding voice onsets
 * in the muxed audio, all of which were wrong in different ways — see the note
 * above the report in scripts/record-reel.mts. The recorder knows both numbers
 * exactly; there is nothing here to estimate.
 *
 *   node --import tsx scripts/check-sync.mts reels/demo-readiness.sync.json
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { LEAD_MS } from "../lib/narration";
import { EDGE_KEEP_MS, SPEECH_FLOOR_DB } from "../lib/wav";
import { MAX_OPENING_SILENCE_MS } from "../lib/reel-retention";

interface Report {
  id: string;
  totalMs: number;
  steps: {
    index: number; route: string; at: number;
    clips: { atMs: number; ms: number }[];
    captions: { at: number; ms: number; text: string }[];
  }[];
}

const path = process.argv[2];
if (!path) throw new Error("usage: check-sync.mts <reel.sync.json> [reel.mp4]");
const film = process.argv[3];
const report = JSON.parse(readFileSync(path, "utf8")) as Report;

let worst = 0;
let checked = 0;
console.log(`${report.id} — ${(report.totalMs / 1000).toFixed(1)}s`);
console.log(`${"phrase spoken".padStart(15)}${"caption at".padStart(12)}${"error".padStart(9)}   text`);

for (const step of report.steps) {
  if (!step.clips.length) continue;
  /**
   * Which caption opens each phrase. The captions of a beat run in order and
   * every phrase has at least one, so the first caption at or after a phrase's
   * start is that phrase's — except the first, which deliberately reclaims
   * LEAD_MS of dead air so it opens with the beat.
   */
  let cursor = 0;
  step.clips.forEach((clip, i) => {
    const spoken = step.at + clip.atMs;
    const expected = i === 0 ? spoken - LEAD_MS : spoken;
    const caption = step.captions[cursor];
    if (!caption) return;
    const error = caption.at - expected;
    worst = Math.max(worst, Math.abs(error));
    checked += 1;
    console.log(
      `${(spoken / 1000).toFixed(2).padStart(15)}${(caption.at / 1000).toFixed(2).padStart(12)}`
      + `${`${error >= 0 ? "+" : ""}${(error / 1000).toFixed(2)}`.padStart(9)}   ${caption.text.slice(0, 44)}`,
    );
    // Advance past every caption belonging to this phrase.
    const until = step.at + (i + 1 < step.clips.length ? step.clips[i + 1].atMs : Infinity);
    while (cursor < step.captions.length && step.captions[cursor].at < until) cursor += 1;
  });
}

console.log(`\n${checked} phrases   worst |error| ${(worst / 1000).toFixed(3)}s`);
if (worst > 60) {
  console.error(`::error::captions are ${(worst / 1000).toFixed(2)}s out of step with the voice`);
  process.exit(1);
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AND ONE NUMBER THAT IS NOT ARITHMETIC ON THE REPORT.
 *
 * Everything above subtracts the recorder's own numbers from each other, and
 * the note at the top explains why: three attempts to find voice onsets in
 * the muxed audio were each wrong in a different way, and all three failures
 * were about PAIRING — which onset belongs to which caption. That reasoning
 * is still right, and it left a hole the size of the whole file: a track
 * where every word arrives 150ms after the schedule says it does reports zero
 * error here, because both sides of the subtraction came from the schedule.
 * It did, on three finished reels, and nothing in this pipeline noticed.
 *
 * THE FIRST ONSET HAS NO PAIRING PROBLEM. There is exactly one candidate —
 * the first moment the file is louder than its own floor — and exactly one
 * thing it should be, which is the first clip's place on the timeline. So
 * this measures that one number and nothing else, and it is the number the
 * opening rule is about: what a viewer hears in the second where the measured
 * curve loses half of them.
 *
 * Skipped rather than failed when there is no film to read or no ffmpeg to
 * read it with — this runs after a mux that may not have happened, and a
 * check that cannot run must not look like a check that passed.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const firstClip = report.steps[0]?.clips?.[0];
if (film && firstClip) {
  const RATE = 16_000;
  const WINDOW_MS = 10;
  let pcm: Buffer | null = null;
  try {
    pcm = execFileSync("ffmpeg", [
      "-v", "quiet", "-i", film, "-map", "0:a:0",
      "-f", "s16le", "-ac", "1", "-ar", String(RATE), "-",
    ], { maxBuffer: 1 << 28 });
  } catch (e) {
    console.log(`\nno audio read out of ${film} (${e instanceof Error ? e.message : e}) — opening not measured`);
  }

  if (pcm && pcm.length > RATE) {
    const per = (WINDOW_MS / 1000) * RATE;
    const windows: number[] = [];
    for (let at = 0; at + per * 2 <= pcm.length; at += per * 2) {
      let sum = 0;
      for (let i = at; i < at + per * 2; i += 2) {
        const sample = pcm.readInt16LE(i) / 32768;
        sum += sample * sample;
      }
      windows.push(10 * Math.log10(sum / per + 1e-24));
    }
    const floor = Math.max(...windows) + SPEECH_FLOOR_DB;
    const firstAbove = windows.findIndex((db) => db > floor);
    /**
     * The clip keeps EDGE_KEEP_MS of room tone in front of its first word (see
     * lib/wav.ts), so the sound starts that much after the clip is laid. Taken
     * off rather than absorbed into a tolerance, because a tolerance wide
     * enough to hide it is wide enough to hide a fault.
     */
    const heard = firstAbove < 0 ? Infinity : firstAbove * WINDOW_MS + EDGE_KEEP_MS;
    const scheduled = (report.steps[0].at ?? 0) + firstClip.atMs;
    console.log(
      `\nfirst word scheduled ${Math.round(scheduled)}ms, heard ${
        Number.isFinite(heard) ? `${Math.round(heard)}ms` : "not at all"}`,
    );
    if (heard > MAX_OPENING_SILENCE_MS) {
      console.error(
        `::error::the reel opens on ${Number.isFinite(heard) ? `${Math.round(heard)}ms` : "nothing but"} `
        + `silence, over the ${MAX_OPENING_SILENCE_MS}ms allowance — half the audience is gone by 1000ms`,
      );
      process.exit(1);
    }
  }
}
