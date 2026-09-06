/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THE REEL WILL ACTUALLY BE, BEFORE SPENDING THREE MINUTES FINDING OUT.
 *
 * lib/reel.ts estimates speech from a word count, and an estimate is what it
 * is. A trim that the studio said was clean was refused by the recorder for
 * spending 60% of the reel on one route — the estimate and the real audio
 * disagreed about the PROPORTIONS, not just the total, so the check that
 * matters passed locally and failed in CI.
 *
 * This synthesises the real phrases with the real voice at the real per-phrase
 * rates and reports what the recorder will see: total length, and the share of
 * the reel each route takes. Same arithmetic as lib/narration.ts.
 *
 * Needs the voice model — see docs/REELS.md:
 *   node --import tsx scripts/measure-reel.mts
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SCRIPTS, reelScript, type ScriptId } from "../lib/reel-script";
import { phrases } from "../lib/speech-timing";
import { spokenForm } from "../lib/spoken-numbers";
import { BASE_SPEED, VOICE, shapeRates } from "../lib/speech-prosody";
import { beatFloorMs } from "../lib/caption-lines";
import { LEAD_MS, TAIL_MS, SILENT_BEAT_MS } from "../lib/narration";
import { MAX_ONE_ROUTE_SHARE, MAX_REEL_MS } from "../lib/reel-retention";

const model = process.env.KOKORO_MODEL ?? ".voice/kokoro-v1.0.onnx";
const voices = process.env.KOKORO_VOICES ?? ".voice/voices-v1.0.bin";

const plan = SCRIPTS.flatMap((meta) => {
  const script = reelScript(meta.id as ScriptId, "");
  if (!script) return [];
  const perBeat = script.beats.map((b) => phrases(spokenForm(b.say)));
  const rates = shapeRates(perBeat.flat().map((p) => p.text), BASE_SPEED);
  let i = 0;
  return [{
    id: meta.id,
    beats: script.beats.map((beat, bi) => ({
      route: beat.route,
      hold: beat.hold ?? 0,
      floor: beatFloorMs(beat.say),
      phrases: perBeat[bi].map((p) => ({ text: p.text, rate: rates[i++], gap: p.gapMs })),
    })),
  }];
});

const dir = mkdtempSync(join(tmpdir(), "reel-measure-"));
const file = join(dir, "plan.json");
writeFileSync(file, JSON.stringify({
  model, voices, voice: VOICE, plan,
  lead: LEAD_MS, tail: TAIL_MS, silent: SILENT_BEAT_MS,
  maxMs: MAX_REEL_MS, maxShare: MAX_ONE_ROUTE_SHARE,
}));

const child = spawn("python3", ["scripts/measure-reel.py", file], { stdio: "inherit" });
child.on("close", (code) => process.exit(code ?? 1));
