/**
 * Print the ffmpeg filter graph that puts a music bed under a narration.
 *
 * A SCRIPT SO THE WORKFLOW HAS ONE LINE, and a module so the graph is unit
 * tested — scripts/loudnorm-args.py records what happens otherwise: the first
 * version of that chain was a python -c inside a shell $() inside a YAML block
 * scalar, and the quoting ate itself before it ever ran.
 *
 *   node --import tsx scripts/bed-args.mts <voiceLabel> <musicLabel> <out> <ms>
 */
import { bedFilter, bedProblems } from "../lib/reel-music";

const [voice, music, out, ms] = process.argv.slice(2);
const totalMs = Number(ms);
const problems = bedProblems({ totalMs });
if (problems.length) {
  console.error(`cannot mix a bed: ${problems.join("; ")}`);
  process.exit(1);
}
console.log(bedFilter(voice, music, out, { totalMs }));
