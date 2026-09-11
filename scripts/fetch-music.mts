/**
 * Fetch a bed from lib/stock-audio.ts and prove it is still the right track.
 *
 * A URL is a promise somebody else keeps. This re-runs the niche check on what
 * actually arrived rather than trusting the numbers recorded in the manifest —
 * those were measured once, and a CDN quietly serving something else is exactly
 * the failure that would otherwise reach a published video.
 *
 *   node --import tsx scripts/fetch-music.mts <track-id> <out.wav>
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { trackById, STOCK_TRACKS } from "../lib/stock-audio";

const [id, out] = process.argv.slice(2);
const track = trackById(id ?? "");
if (!track) {
  console.error(`"${id}" is not a track. Known: ${STOCK_TRACKS.map((t) => t.id).join(", ")}`);
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), "bed-"));
const raw = join(dir, "raw");
const res = await fetch(track.url);
if (!res.ok) {
  console.error(`${track.url} returned ${res.status}`);
  process.exit(1);
}
writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", raw,
  "-ac", "1", "-ar", "24000", out ?? "bed.wav"]);

/**
 * CHECKED AGAIN, ON WHAT ARRIVED. The manifest's numbers are a record of a
 * past measurement, not a guarantee about this download.
 */
execFileSync("python3", ["scripts/check-music.py", out ?? "bed.wav"], { stdio: "inherit" });
console.log(`${track.title} — ${track.licence}, ${track.creator}, via ${track.via}`);
