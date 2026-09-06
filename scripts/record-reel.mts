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
import { driftTarget } from "../lib/reel-scroll";
import { phrases } from "../lib/speech-timing";
import { spokenForm } from "../lib/spoken-numbers";
import { BASE_SPEED, VOICE, shapeRates } from "../lib/speech-prosody";
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
async function signIn(page: import("playwright").Page, at: string): Promise<boolean> {
  // Through secretValue, because these are pasted into a settings box: a
  // trailing newline on the Supabase URL variable cost three runs, and the
  // secrets beside it were pasted the same way. A newline cannot be typed into
  // a password field, so removing one never removes a real character.
  const email = secretValue(process.env.REEL_EMAIL);
  const password = secretValue(process.env.REEL_PASSWORD);
  if (!email || !password) return false;

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
  return true;
}

async function narrate(beats: readonly { say: string; hold?: number }[]): Promise<BeatAudio[]> {
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
  /**
   * THROUGH spokenForm FIRST.
   *
   * The model was handed "£0.31" and "30g" verbatim and said "pound zero point
   * three one" and "thirty gee". Every price in this app is written that way,
   * so it happened in every reel, on the exact words the reel is about. The
   * caption still shows the numeral — that is faster to scan — and only the
   * voice gets the words. See lib/spoken-numbers.ts.
   */
  const perBeat = beats.map((b) => phrases(spokenForm(b.say)));
  const flat = perBeat.flat();
  if (!flat.length) return beats.map(() => beatAudio([]));

  const job = {
    model, voices, out: tmp,
    /**
     * MEASURED, NOT CHOSEN. bf_emma — what this used — came LAST of the eight
     * British voices for pitch variability at 2.20 semitones, which is inside
     * the range speech research calls monotone. bf_alice reaches 3.96 on the
     * same line and carries the most energy in the band a phone speaker can
     * reproduce. scripts/measure-voice.py is the measurement, checked in.
     */
    voice: process.env.KOKORO_VOICE || VOICE,
    /**
     * A RATE PER PHRASE, not one for the whole reel.
     *
     * The base is still under natural pace — this was 1.05, deliberately sped
     * up, on a model that already reads briskly. But a constant rate is heard
     * as flat even when the pitch contour is fine, because tempo is the other
     * half of prosody: the hook is given room, connective material moves, a
     * figure is slowed so it lands as a number, and the payoff is the slowest
     * thing in the reel. See lib/speech-prosody.ts.
     */
    speeds: shapeRates(flat.map((p) => p.text), Number(process.env.KOKORO_SPEED || BASE_SPEED)),
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
  return perBeat.map((list, beatIndex) => {
    const spoken = list.map((phrase) => {
      const audio = said[cursor];
      audioFiles.push(audio.path);
      cursor += 1;
      return { text: phrase.text, gapMs: phrase.gapMs, audioMs: audio.ms };
    });
    // The script's own suspense pause, at the beat boundary where the shot
    // changes to the thing being revealed. See lib/narration.ts.
    return beatAudio(spoken, beats[beatIndex]?.hold ?? 0);
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
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE SIGN-IN HAPPENS IN A CONTEXT THAT IS NOT BEING FILMED.
 *
 * It used to happen in the recorded one, "before the clock" — but the clock
 * was started after it, while the RECORDING starts the moment the page is
 * created. So the lead handed to ffmpeg measured only the last navigation, and
 * the finished reel opened on a login form with the demo account's email
 * address typed into it, in focus, for the first second.
 *
 * A separate context cannot get this wrong by a fraction: the camera does not
 * exist yet. The session is carried across as storage state, which is where
 * Supabase keeps it anyway.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const doorway = await browser.newContext({
  viewport: { width: REEL_W * REEL_SCALE, height: REEL_H * REEL_SCALE },
  deviceScaleFactor: 1,
  colorScheme: "dark",
});
const signedIn = await signIn(await doorway.newPage(), base);
const storageState = await doorway.storageState();
await doorway.close();
console.log(signedIn ? "Signed in off camera." : "No credentials — filming the public pages only.");

const context = await browser.newContext({
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * CAPTURED AT 1080x1920, NOT UPSCALED TO IT. "The videos feel low quality."
   *
   * They were: a 540x960 capture stretched 2x by ffmpeg. deviceScaleFactor
   * was 2, which looks like it should have helped and does nothing here —
   * Playwright's screencast records CSS PIXELS, so the extra device pixels
   * were rendered and thrown away.
   *
   * So the viewport is the real frame size and the page is zoomed instead.
   * The app still LAYS OUT at 540 CSS px — measured: 540 wide either way, so
   * it is the same mobile layout — but every pixel is rendered rather than
   * interpolated.
   *
   * Measured on this machine against a page of small text and prices, mean
   * absolute Laplacian (how much fine detail survives): upscaled 6.76,
   * native 11.08. 1.64x sharper, and text is exactly what an upscale smears.
   * ═══════════════════════════════════════════════════════════════════════
   */
  viewport: { width: REEL_W * REEL_SCALE, height: REEL_H * REEL_SCALE },
  deviceScaleFactor: 1,
  storageState,
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * DARK, WHICH IS WHAT THE APP ACTUALLY IS.
   *
   * Every reel so far filmed a light app, and that was never a choice
   * anybody made. app/globals.css says it plainly: "Dark is the default
   * because it always was" — light is opt-in through
   * `prefers-color-scheme: light`. Playwright's default colorScheme is
   * `light`, so Chromium reported a preference nobody has and the recorder
   * filmed a version of the product most athletes never see.
   *
   * It is also the better reel. A dark 9:16 video stands out in a feed of
   * white ones, and the app's own accent colours were picked against a dark
   * ground.
   * ═══════════════════════════════════════════════════════════════════════
   */
  colorScheme: "dark",
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
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * THE SAME SIZE AS THE VIEWPORT, AND NOT THE FINISHED SIZE.
   *
   * This asked for 1080x1920 while the viewport was 540x960. Playwright's
   * screencast captures CSS pixels and pastes the result into the requested
   * canvas WITHOUT SCALING IT UP — so the app sat in the top-left quadrant
   * and three quarters of every frame was empty. Measured on this machine,
   * red-page against black canvas: mismatched sizes cover 25% of the frame,
   * matched sizes cover 99%.
   *
   * The upscale to 1080x1920 belongs to ffmpeg, which can actually resample.
   * See the mux step in .github/workflows/record-reels.yml.
   * ═══════════════════════════════════════════════════════════════════════
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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE INSTALL PROMPT IS NOT PART OF THE PRODUCT SHOT.
 *
 * "Add PocketAthlete to your home screen" sat across the bottom of the app for
 * the ENTIRE nineteen seconds of the last reel, over the table the reel was
 * about. It is a good prompt and it is addressed to somebody already using the
 * app — which the viewer of a reel is not.
 *
 * Dismissed the way a person dismisses it, through the flag components/PWA.tsx
 * already reads, rather than by hiding it with a selector this would have to
 * keep in step with the markup.
 */
await context.addInitScript(() => {
  try { localStorage.setItem("pa:install-dismissed", "1"); } catch { /* no storage, no prompt */ }
});

/**
 * THE ZOOM THAT KEEPS IT A PHONE.
 *
 * The viewport is 1080x1920 so the recording is native, and this puts the
 * layout back to 540 CSS px — the app renders its mobile layout at twice the
 * pixel density rather than its desktop one.
 *
 * On documentElement rather than body: the app has a fixed bottom nav, and a
 * fixed element inside a zoomed BODY is positioned against the unzoomed
 * viewport — it would render at half scale while everything around it doubled.
 */
await context.addInitScript((zoom) => {
  const apply = () => { document.documentElement.style.zoom = String(zoom); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", apply);
  else apply();
}, REEL_SCALE);

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
/**
 * MEASURED FROM HERE, where the recording actually begins.
 *
 * This was read after the sign-in, which is why nineteen seconds of reel
 * opened on a login screen: everything between the page being created and this
 * line is in the file, and only what this measures gets trimmed off.
 */
const videoStart = Date.now();

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EVERY ROUTE VISITED ONCE BEFORE THE CLOCK STARTS.
 *
 * The app is a static export that fetches its data in the browser, so `load`
 * fires on an empty shell and the screen is a spinner for a moment afterwards.
 * Mid-reel that moment lands wherever it lands — the last reel spent its final
 * two seconds on a spinner, under the closing line of the voiceover.
 *
 * The timeline cannot wait for it: the audio is a fixed track, so a beat that
 * pauses to load puts the voice permanently ahead of the picture. Warming the
 * routes first is the version that costs nothing at all — it happens before
 * the trim point, so none of it is in the finished file.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const settle = async () => {
  await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
};
for (const route of [...new Set(plan.steps.map((b) => b.route))]) {
  await page.goto(`${base}${route}`, { waitUntil: "load" }).catch(() => {});
  await settle();
}

await page.goto(`${base}${plan.steps[0]?.route ?? "/"}`, { waitUntil: "load" }).catch(() => {});
await settle();
const started = Date.now();
const leadMs = started - videoStart;
const elapsed = () => Date.now() - started;
let onRoute = plan.steps[0]?.route ?? "";
/** How far down the current screen the drift has reached. */
let driftFrom = 0;

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
    // A new screen starts at the top of it, not wherever the last one ended.
    driftFrom = 0;
    await page.goto(`${base}${step.route}`, { waitUntil: "load" }).catch((e) => {
      console.warn(`  ${step.route}: ${e instanceof Error ? e.message : e}`);
    });
  }

  /**
   * A slow drift down the page rather than a static shot.
   *
   * Measured, not assumed: a page with nothing to scroll is left alone, which
   * is why this reads the document rather than scrolling a fixed amount and
   * bouncing off the bottom of a short one.
   */
  const page_ = await page.evaluate(() => ({
    scrollable: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
    viewport: window.innerHeight,
  })).catch(() => ({ scrollable: 0, viewport: 0 }));

  if (!hookShown) {
    hookShown = true;
    await page.evaluate((t) => (window as never as { __reelHook: (s: string) => void }).__reelHook(t), plan.hook);
    /**
     * MOVING FROM THE FIRST FRAME.
     *
     * The hook used to hold a still image for 1.6 seconds. A frame that does
     * not move is a frame a scroller has already finished reading, and the
     * only thing left to do with it is swipe. The drift starts under the hook
     * now, so the first second of the reel is the app doing something.
     */
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "smooth" }), Math.round(page_.viewport * 0.28)).catch(() => {});
    driftFrom = Math.round(page_.viewport * 0.28);
    // Held from the first frame, because the decision is made in three seconds
    // and the hook has to be readable inside them.
    await sleep(Math.max(0, plan.hookMs - elapsed()));
    await page.evaluate(() => (window as never as { __reelHook: (s: string) => void }).__reelHook(""));
  }

  /**
   * MEASURED AGAINST THE SCREEN, and carried over between beats on one route.
   * See lib/reel-scroll.ts — both halves of that were wrong and both were
   * visible in the finished file.
   */
  /**
   * POINT AT THE THING THE BEAT IS ABOUT, before its first caption.
   *
   * Cleared on every beat, then set if this one names something — otherwise a
   * spotlight from three beats ago is still dimming the screen. A beat whose
   * words are not on screen says so rather than dimming everything, because
   * that would be invisible until somebody watched the finished reel.
   */
  const want = step.focus ?? "";
  const aimed = await page.evaluate(
    (t) => (window as never as { __reelFocus: (s: string) => boolean }).__reelFocus(t),
    want,
  ).catch(() => false);
  if (want && !aimed) console.warn(`  focus "${want}" is not on ${step.route} — no spotlight for that beat`);

  for (const [i, caption] of step.captions.entries()) {
    await sleep(Math.max(0, caption.at - elapsed()));
    await page.evaluate((t) => (window as never as { __reelCaption: (s: string) => void }).__reelCaption(t), caption.text);
    const to = driftTarget({
      ...page_, from: driftFrom, step: i + 1, steps: step.captions.length,
    });
    if (to !== driftFrom || i === 0) {
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: "smooth" }), to).catch(() => {});
    }
    if (i === step.captions.length - 1) driftFrom = to;
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
