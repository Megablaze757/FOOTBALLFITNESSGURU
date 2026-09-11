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
import { LEAD_MS } from "../lib/narration";

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
if (!path) throw new Error("usage: check-sync.mts <reel.sync.json>");
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
