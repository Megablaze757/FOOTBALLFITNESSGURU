/**
 * =============================================================================
 * RECORD A REEL. NO PERSON, NO SCREEN SHARE, NO TAKE THAT GOES WRONG.
 *
 *   node --import tsx scripts/record-reel.mts <script-id> [--base http://…] [--out dir]
 *
 * Playwright drives the app at 540x960 with deviceScaleFactor 2 — which
 * records at 1080x1920, the native size every platform wants, in 9:16 exactly
 * (see lib/reel-plan.ts for why that number and not the phone viewport).
 *
 * The captions are drawn INTO THE PAGE rather than burnt on afterwards. That
 * is not a shortcut: Playwright's bundled ffmpeg is a VP8-only build with no
 * text filters and no audio, so burning them would need a full ffmpeg that
 * exists on a CI runner and not necessarily on anybody's laptop. Injected
 * captions need nothing but the browser, so this runs anywhere.
 *
 * WHAT COMES OUT: a .webm (VP8) and a .srt. The WebM is the master. Converting
 * to H.264 MP4 for the platforms needs a full ffmpeg and belongs in CI, where
 * one is already installed.
 * =============================================================================
 */
import { chromium } from "playwright";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { reelScript, type ScriptId } from "../lib/reel-script";
import { reelPlan, srt, REEL_W, REEL_H, REEL_SCALE } from "../lib/reel-plan";
import { retentionProblems } from "../lib/reel-retention";
import { phrases } from "../lib/speech-timing";
import { beatAudio, retime, trackClips, type BeatAudio } from "../lib/narration";
import { layTrack, readWav, writeWav, type Wav } from "../lib/wav";
import { secretValue } from "../lib/env-value";

const audioFiles: string[] = [];

const args = process.argv.slice(2);
const id = (args[0] ?? "demo-cost") as ScriptId;
const flag = (name: string, fallback: string) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};
const base = flag("base", "http://localhost:8899").replace(/\/$/, "");
const outDir = flag("out", "reels");

const script = reelScript(id, flag("subject", "Five-spot shooting"));
if (!script) { console.error(`No script called "${id}".`); process.exit(1); }

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE VOICEOVER, IF ONE IS ASKED FOR.
 *
 * Synthesise FIRST, then decide how long each shot is — see lib/narration.ts.
 * The beats in lib/reel-script.ts are sized at about 340 words a minute and
 * nobody speaks at 340 words a minute, so a picture cut to the written timings
 * would be permanently a beat ahead of the voice describing it.
 *
 * Free and offline: Kokoro, no key, no per-use cost, no network at record
 * time once the model is on disk.
 * ═══════════════════════════════════════════════════════════════════════════
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SIGNING IN, FOR THE FOOTAGE THAT IS WORTH FILMING.
 *
 * The reels that matter are of the signed-in app — a readiness score moving
 * because of a bad night is the whole pitch, and no public page can show it.
 *
 * THE CREDENTIALS COME FROM THE ENVIRONMENT AND NOWHERE ELSE. Never a default,
 * never a fallback, never a file in this repository. A demo account's password
 * in source is a password in every clone, every fork and every log of every
 * build, forever — and lib/no-secrets.test.ts fails the build if one appears.
 *
 * A DEDICATED DEMO ACCOUNT, not a real one, and that is a feature rather than
 * a precaution: seeded with data chosen to film well, and no athlete's real
 * training, food or body data ever goes near a video.
 */
async function signIn(page: import("playwright").Page, at: string): Promise<void> {
  // Through secretValue, because these are pasted into a settings box: a
  // trailing newline on the Supabase URL variable cost three runs, and the
  // secrets beside it were pasted the same way. A newline cannot be typed into
  // a password field, so removing one never removes a real character.
  const email = secretValue(process.env.REEL_EMAIL);
  const password = secretValue(process.env.REEL_PASSWORD);
  if (!email || !password) return;

  await page.goto(`${at}/login`, { waitUntil: "load" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');

  /**
   * Waited for by its RESULT, not by a timer.
   *
   * The app redirects to /home once the session lands. A fixed sleep here is
   * either too short — and the whole reel films a login screen — or long
   * enough to be wrong on a fast connection every time.
   */
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 })
    .catch(() => { throw new Error("Sign-in did not complete — check REEL_EMAIL and REEL_PASSWORD."); });
}

async function narrate(beats: readonly { say: string }[]): Promise<BeatAudio[]> {
  const model = process.env.KOKORO_MODEL;
  const voices = process.env.KOKORO_VOICES;
  if (!model || !voices) {
    throw new Error(
      "Set KOKORO_MODEL and KOKORO_VOICES to the kokoro-v1.0.onnx and voices-v1.0.bin paths. "
      + "Both are free downloads — see docs/REELS.md.",
    );
  }

  const tmp = mkdtempSync(join(tmpdir(), "reel-vo-"));
  // One process for the whole reel: loading a 325MB model per phrase is most
  // of the run time and all of it is avoidable.
  const perBeat = beats.map((b) => phrases(b.say));
  const flat = perBeat.flat();
  if (!flat.length) return beats.map(() => beatAudio([]));

  const job = {
    model, voices, out: tmp,
    voice: process.env.KOKORO_VOICE || "bf_emma",
    speed: Number(process.env.KOKORO_SPEED || "1.05"),
    phrases: flat.map((p) => p.text),
  };

  const said = await new Promise<{ index: number; path: string; ms: number }[]>((resolve, reject) => {
    const child = spawn("python3", ["scripts/kokoro-say.py"], { stdio: ["pipe", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`kokoro-say.py exited ${code}`));
      resolve(out.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)));
    });
    child.stdin.end(JSON.stringify(job));
  });

  if (said.length !== flat.length) {
    throw new Error(`asked for ${flat.length} phrases and got ${said.length} back`);
  }

  let cursor = 0;
  return perBeat.map((list) => {
    const spoken = list.map((phrase) => {
      const audio = said[cursor];
      audioFiles.push(audio.path);
      cursor += 1;
      return { text: phrase.text, gapMs: phrase.gapMs, audioMs: audio.ms };
    });
    return beatAudio(spoken);
  });
}

/**
 * WITH A VOICE, the beats are re-timed from the audio that came out. Without
 * one, the written timings stand — which is fine for a silent reel with
 * captions, and is what a run with no model on disk falls back to.
 */
const withVoice = args.includes("--voice");
const spoken: BeatAudio[] = withVoice ? await narrate(script.beats) : [];
const timed = withVoice ? retime(script.beats, spoken) : { beats: script.beats, totalMs: script.totalMs };
const plan = reelPlan({ ...script, beats: timed.beats, totalMs: timed.totalMs });

/**
 * REFUSED BEFORE IT IS FILMED, NOT AFTER.
 *
 * Every rule in lib/reel-retention.ts is a mistake that costs a reshoot, and
 * this pipeline has nobody watching to catch one. A reel the research says
 * will not be watched should not consume a CI run and a publish slot.
 */
const problems = retentionProblems(plan);
if (problems.length) {
  console.error(`"${script.hook}" would not be watched:`);
  for (const p of problems) console.error(`  ${p.beat < 0 ? "reel" : `beat ${p.beat + 1}`}: ${p.problem}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const rawDir = mkdtempSync(join(tmpdir(), "reel-raw-"));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A proxy if the environment has one.
 *
 * Chromium does not read HTTPS_PROXY on its own — Playwright has to be told —
 * so a sandboxed or corporate runner gets ERR_CONNECTION_RESET on every
 * navigation with nothing to say why. Harmless where there is no proxy.
 */
const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  ...(proxy ? { proxy: { server: proxy } } : {}),
});
const context = await browser.newContext({
  viewport: { width: REEL_W, height: REEL_H },
  deviceScaleFactor: REEL_SCALE,
  /**
   * A SCRATCH DIRECTORY, not the output one.
   *
   * saveAs copies the recording to its proper name and leaves the original
   * behind under an internal hash — so the output directory ended up with two
   * .webm files, and anything globbing for one (the mux step in
   * .github/workflows/record-reels.yml) picked whichever the shell listed
   * first. Recording elsewhere means the output directory holds exactly the
   * files this script names.
   */
  recordVideo: { dir: rawDir, size: { width: REEL_W * REEL_SCALE, height: REEL_H * REEL_SCALE } },
  // The reel is a demo, and a demo that plays an animation twice as fast as
  // the athlete will see it is a lie about the product.
  reducedMotion: "no-preference",
});
/**
 * From a FILE, not from a function in this module.
 *
 * tsx transpiles this file before Node runs it, and esbuild wraps named
 * functions in a `__name(...)` helper defined in the module scope — which does
 * not exist inside the page. An inline overlay therefore threw
 * "__name is not defined" before its first line ran, and surfaced one step
 * later as "window.__reelHook is not a function", which points nowhere near
 * the cause. A plain .js file is never transpiled. See scripts/reel-overlay.js.
 */
await context.addInitScript({ path: new URL("./reel-overlay.js", import.meta.url).pathname });

const page = await context.newPage();
// Loud, because an overlay that fails to install produces a video that
// looks fine and has no captions on it at all.
page.on("pageerror", (e) => console.error(`  page error: ${e.message}`));
// Captured before the context is closed — the handle is gone afterwards, and
// the file it names does not exist until then.
const video = page.video();

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE CLOCK STARTS WHEN THE FIRST SCREEN IS UP, NOT WHEN THE BROWSER OPENS.
 *
 * Recording begins the moment the page exists, so the first page load is in
 * the video — a blank frame, then a flash of loading, and the voiceover's
 * first words playing over it. The timeline has to start after that.
 *
 * The lead is measured rather than guessed, and handed to ffmpeg as `-ss` so
 * the finished file begins on the first real frame with the audio still in
 * sync. Guessing here is a voiceover permanently ahead of its picture, which
 * is heard rather than seen and survives every check on the video.
 * ═══════════════════════════════════════════════════════════════════════════
 */
// BEFORE the clock: a sign-in in the video is a reel of a login form.
await signIn(page, base);

const videoStart = Date.now();
await page.goto(`${base}${plan.steps[0]?.route ?? "/"}`, { waitUntil: "load" }).catch(() => {});
const started = Date.now();
const leadMs = started - videoStart;
const elapsed = () => Date.now() - started;
let onRoute = plan.steps[0]?.route ?? "";

console.log(`Recording "${script.hook}" — ${Math.round(plan.totalMs / 1000)}s, ${plan.steps.length} beats`);

let hookShown = false;
for (const step of plan.steps) {
  /**
   * ONLY WHEN THE ROUTE CHANGES.
   *
   * This navigated on every beat, so three consecutive beats on one page
   * reloaded it twice mid-shot — a white flash and the scroll position thrown
   * away, in the middle of the slow drift the shot exists for. Most scripts
   * hold a screen for two or three beats, so this was most beats.
   */
  if (step.route !== onRoute) {
    onRoute = step.route;
    await page.goto(`${base}${step.route}`, { waitUntil: "load" }).catch((e) => {
      console.warn(`  ${step.route}: ${e instanceof Error ? e.message : e}`);
    });
  }

  if (!hookShown) {
    hookShown = true;
    await page.evaluate((t) => (window as never as { __reelHook: (s: string) => void }).__reelHook(t), plan.hook);
    // Held from the first frame, because the decision is made in three seconds
    // and the hook has to be readable inside them.
    await sleep(Math.max(0, plan.hookMs - elapsed()));
    await page.evaluate(() => (window as never as { __reelHook: (s: string) => void }).__reelHook(""));
  }

  /**
   * A slow drift down the page rather than a static shot.
   *
   * Measured, not assumed: a page with nothing to scroll is left alone, which
   * is why this reads the document rather than scrolling a fixed amount and
   * bouncing off the bottom of a short one.
   */
  const scrollable = await page.evaluate(
    () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
  ).catch(() => 0);

  for (const caption of step.captions) {
    await sleep(Math.max(0, caption.at - elapsed()));
    await page.evaluate((t) => (window as never as { __reelCaption: (s: string) => void }).__reelCaption(t), caption.text);
    if (scrollable > 0) {
      const to = Math.min(scrollable, (scrollable / Math.max(1, step.captions.length)) * (step.captions.indexOf(caption) + 1));
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: "smooth" }), to).catch(() => {});
    }
  }
  await sleep(Math.max(0, step.at + step.ms - elapsed()));
  await page.evaluate(() => (window as never as { __reelCaption: (s: string) => void }).__reelCaption("")).catch(() => {});
}

// ORDER MATTERS AND IS NOT OBVIOUS. The video file is only finished when the
// CONTEXT closes, and the handle to it dies with the BROWSER — so saveAs has
// to happen between the two. Closing both first gives
// "Target page, context or browser has been closed", from a run that recorded
// perfectly well.
await context.close();

/**
 * saveAs, not a rename.
 *
 * Playwright names the file after an internal hash and only finishes writing
 * it when the context closes. The first version of this globbed the directory
 * for *.webm and took the last entry — which is directory order, not time, so
 * with two recordings in one folder it would have published the wrong one.
 */
await video?.saveAs(join(outDir, `${script.id}.webm`));
await browser.close();
writeFileSync(join(outDir, `${script.id}.srt`), srt(plan));
/**
 * The lead, on disk, because the mux needs it and the mux is a separate step.
 *
 * Recording starts when the page is created and the timeline starts when the
 * first screen is up, so the video leads the audio by however long that took.
 * Printing it for a human to copy is how it ends up wrong; a file is how the
 * workflow gets the number that was actually measured.
 */
writeFileSync(join(outDir, `${script.id}.lead`), (leadMs / 1000).toFixed(3));

if (withVoice) {
  /**
   * ONE TRACK, laid to the same timeline as the picture.
   *
   * trackClips returns the clips in the order they were synthesised, which is
   * the order the files were written in — so they zip by index. Built here
   * rather than by ffmpeg because Playwright's bundled ffmpeg has no audio
   * support at all, so this way the voiceover works with nothing installed.
   */
  const clips = trackClips(timed.beats, spoken);
  const read: (Wav | null)[] = audioFiles.map((file) => readWav(new Uint8Array(readFileSync(file))));
  const first = read.find((w): w is Wav => !!w);
  if (!first) throw new Error("none of the synthesised audio could be read back");

  const track = layTrack(
    first.format,
    clips.map((clip, i) => ({ atMs: clip.atMs, data: read[i]?.data ?? new Uint8Array(0) })),
    plan.totalMs,
  );
  writeFileSync(join(outDir, `${script.id}.wav`), writeWav(first.format, track));
  console.log(`  ${outDir}/${script.id}.wav`);
  console.log(
    // "CI runners have one" was the claim here and it is false: ubuntu-latest
    // ships no ffmpeg, and the workflow installs it. Playwright's bundled
    // build is VP8-only with no audio support, so it cannot do this either.
    `\n  Mux (needs a full ffmpeg — apt-get install ffmpeg):\n`
    + `  ffmpeg -ss ${(leadMs / 1000).toFixed(3)} -i ${outDir}/${script.id}.webm -i ${outDir}/${script.id}.wav \\\n`
    + `    -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -c:a aac -b:a 128k \\\n`
    + `    -shortest ${outDir}/${script.id}.mp4`,
  );
}

console.log(`  ${outDir}/${script.id}.webm`);
console.log(`  ${outDir}/${script.id}.srt`);
