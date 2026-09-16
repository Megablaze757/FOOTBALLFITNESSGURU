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
import { reelPlan, srt, endCardAt, REEL_W, REEL_H, REEL_SCALE } from "../lib/reel-plan";
import { MAX_CAPTION_LATE_MS, retentionProblems, revealAudience } from "../lib/reel-retention";
import { closingDrift, driftTarget, openingScroll } from "../lib/reel-scroll";
import { implausibleAudio } from "../lib/reel";
import { outsideSafeZone, MAX_CAPTION_LINES } from "../lib/safe-zone";
import { MOVE_GAP_MS, MOVE_POLL_MS, MOVE_WAIT_MS } from "../lib/reel-moves";
import { SIGNUP_CTA } from "../lib/signup-link";
import { reelCaption, renderCaption, captionProblems } from "../lib/caption";
import { karaokeWords } from "../lib/caption-karaoke";
import { phrases } from "../lib/speech-timing";
import { spokenForm } from "../lib/spoken-numbers";
import {
  BASE_SPEED, VOICE, shapeGains, shapeRates,
  shapeExpression, EXAGGERATION_BASE, CFG_BASE, REFERENCE_WAV,
  pitchRatioFor, shelfDbFor, SHELF_HZ, CHATTERBOX_TEMPO,
} from "../lib/speech-prosody";
import { beatAudio, retime, trackClips, type BeatAudio } from "../lib/narration";
import { durationMs, layTrack, normalised, readWav, trimmedToSpeech, writeWav, type Wav } from "../lib/wav";
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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WHICH ENGINE SAYS THE WORDS.
 *
 * "The voice is still not good, feels robotic... it needs to feel excited,
 * grab the audience's attention, not just talking at you like it's reading off
 * a script."
 *
 * Kokoro has no expression control and its pitch variability tops out around
 * 4.35 semitones however it is tuned — measured, see lib/speech-prosody.ts.
 * Chatterbox has one, clears that ceiling on every setting, and is free and
 * offline too; it is bigger, slower, and needs weights cached.
 *
 * Chatterbox was the DEFAULT, and it was not until it had been listened to
 * and measured on a finished recording rather than on a sample:
 *
 *   bf_alice, Kokoro, as it shipped   F0 SD 3.94 st   median 222 Hz
 *   bm_lewis through Chatterbox       F0 SD 5.27 st   median 124 Hz
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AND KOKORO IS THE DEFAULT AGAIN, BECAUSE PITCH WAS NOT THE PROBLEM.
 *
 * "The voice is putting me to sleep it needs to be exciting." Every line of
 * the comparison above is about pitch, because pitch was the only thing
 * measured. Chatterbox has no SPEED control at all — the note below about
 * cfg_weight being "the equivalent lever" is the assumption that broke — and
 * it turns out to regress to about 155 words a minute of articulation
 * whatever reference it is given and whatever cfg it is handed. Measured
 * across all four finished reels:
 *
 *                          dead%   wpm   artic   F0 SD   dyn    length
 *   Chatterbox bm_lewis      35    122    187     4.92   9.8    23.4s
 *   Kokoro bm_fable 1.42     19    164    201     4.87   9.8    17.4s
 *
 * Same pitch variability, same dynamic contrast, nearly half the dead air,
 * a third more pace, and six seconds given back inside a thirty-second
 * format. Kokoro's speed drives its duration predictor rather than resampling,
 * so this is a person talking faster and not a tape running fast.
 *
 * Chatterbox stays behind REEL_VOICE=chatterbox, with its reference clip and
 * its expression shaping intact. It is the better engine on the axis it was
 * chosen for, and that axis was already fine.
 * ═══════════════════════════════════════════════════════════════════════════
 */
/**
 * ─────────────────────────────────────────────────────────────────────────
 * AND BACK TO CHATTERBOX, WITH THE THING THAT WAS MISSING.
 *
 * Kokoro was made the default because Chatterbox had no speed control and sat
 * at 122 words a minute — correct at the time, and it fixed "putting me to
 * sleep". Five rounds of "still robotic" later, every axis Kokoro exposes has
 * been tuned and every one of them measures in range, which means the axes
 * were not the problem.
 *
 * Chatterbox was never slow because it had to be. It is slow because nothing
 * had tried stretching it, on the strength of a note in chatterbox-say.py that
 * called the idea "a phase vocoder smearing a voice" without measuring it.
 * Stretched 1.18x through rubberband it articulates at 177 words a minute
 * against Kokoro's 138 on the same script, with 6.09 semitones of pitch
 * variability against 4.82 and twice the rate of upward pitch movement.
 *
 * It costs about 22 seconds a phrase against Kokoro's one, so a recording goes
 * from four minutes to eight. Kokoro stays one word away for a smoke test.
 * ─────────────────────────────────────────────────────────────────────────
 */
const ENGINE = (process.env.REEL_VOICE || "chatterbox").toLowerCase();

async function narrate(beats: readonly { say: string; hold?: number }[]): Promise<BeatAudio[]> {
  const model = process.env.KOKORO_MODEL;
  const voices = process.env.KOKORO_VOICES;
  if (ENGINE === "kokoro" && (!model || !voices)) {
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
  /**
   * The loudness each line is laid at. A voice that never changes volume
   * sounds flat however much its pitch moves, and pitch is already at this
   * model's ceiling — see lib/speech-prosody.ts.
   */
  const gains = shapeGains(flat.map((p) => p.text));
  if (!flat.length) return beats.map(() => beatAudio([]));

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * THE SAME ROLES, A DIFFERENT SET OF KNOBS.
   *
   * Chatterbox has no `speed`, so the per-phrase RATE shaping does not reach
   * it. cfg_weight is the equivalent — lower is looser and quicker — and both
   * it and `exaggeration` are shaped by the same Role table, so tempo and
   * emphasis still change four times across a reel rather than never.
   *
   * The BASE level is an environment variable because it is a judgement about
   * how hot the read should be, and that belongs to whoever is publishing the
   * reels rather than to this file.
   */
  const expression = shapeExpression(
    flat.map((p) => p.text),
    Number(process.env.CHATTERBOX_EXAGGERATION || EXAGGERATION_BASE),
    Number(process.env.CHATTERBOX_CFG || CFG_BASE),
  );

  const chatterboxJob = {
    out: tmp,
    /**
     * The committed reference: Kokoro's British male bm_lewis, performed by
     * Chatterbox. A recorded human clip set in REEL_VOICE_PROMPT beats it and
     * is checked first. See lib/speech-prosody.ts and REFERENCE_WAV.
     */
    prompt: process.env.REEL_VOICE_PROMPT || REFERENCE_WAV,
    phrases: flat.map((p) => p.text),
    exaggerations: expression.map((e) => e.exaggeration),
    cfgs: expression.map((e) => e.cfg),
    /**
     * The three things Chatterbox will not do for itself: come down in pitch,
     * keep the phone-band energy that costs, and get to a pace a feed will sit
     * through. See lib/speech-prosody.ts.
     */
    pitch: pitchRatioFor(ENGINE),
    shelf_hz: SHELF_HZ,
    shelf_db: shelfDbFor(ENGINE),
    tempo: CHATTERBOX_TEMPO,
  };

  const job = {
    model, voices, out: tmp,
    /**
     * MEASURED, NOT CHOSEN. bf_emma — what this used — came LAST of the eight
     * British voices for pitch variability at 2.20 semitones, which is inside
     * the range speech research calls monotone. bf_alice reaches 3.96 on the
     * same line and carries the most energy in the band a phone speaker can
     * reproduce. scripts/measure-voice.py is the measurement, checked in.
     *
     * It is bm_fable now, and picking on that one line is how it got missed:
     * across all four whole narrations it leaves less than half the dead air
     * of any other voice here at the same pitch variability. See VOICE in
     * lib/speech-prosody.ts and scripts/measure-excitement.py.
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
    /**
     * Lower, and not thinner. The shift is formant-preserved and measured at
     * 0.0ms of drift, so captions stay in sync; the shelf puts back the
     * phone-band energy the shift moves out of reach. See lib/speech-prosody.ts.
     */
    pitch: pitchRatioFor(ENGINE),
    shelf_hz: SHELF_HZ,
    shelf_db: shelfDbFor(ENGINE),
    phrases: flat.map((p) => p.text),
  };

  const say = ENGINE === "chatterbox" ? "scripts/chatterbox-say.py" : "scripts/kokoro-say.py";
  const said = await new Promise<{ index: number; path: string; ms: number }[]>((resolve, reject) => {
    const child = spawn("python3", [say], { stdio: ["pipe", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`${say} exited ${code}`));
      /**
       * ═══════════════════════════════════════════════════════════════════
       * SAY WHICH LINE WAS NOT JSON.
       *
       * This was a bare JSON.parse over every line, and the first Chatterbox
       * run died on `SyntaxError: Unexpected token 'l', "loaded Per"... is
       * not valid JSON` — a message that names neither the script, nor the
       * line, nor the fact that a library had printed to a channel reserved
       * for answers. Three minutes of recording to learn that a letter was
       * unexpected.
       *
       * The cause is fixed in the script. This is so the NEXT thing that
       * prints where it should not is one look rather than five runs.
       * ═══════════════════════════════════════════════════════════════════
       */
      const lines = out.trim().split("\n").filter(Boolean);
      const parsed = [];
      for (const line of lines) {
        try {
          parsed.push(JSON.parse(line));
        } catch {
          return reject(new Error(
            `${say} printed something that is not JSON on the answer channel: ${JSON.stringify(line.slice(0, 200))}\n`
            + "Everything but the per-phrase answers belongs on stderr — see the note in scripts/chatterbox-say.py.",
          ));
        }
      }
      /**
       * ═══════════════════════════════════════════════════════════════════
       * AND WHETHER THE ANSWER IS POSSIBLE.
       *
       * "Script cuts out at some point." It did: "So log it." came back as
       * 236ms — three words at 12.7 a second — and this resolved it, laid it
       * into the track and carried on. Every downstream check passed, because
       * the captions were in sync with a phrase that was not there and a reel
       * missing one line is exactly as loud as a reel.
       *
       * chatterbox-say.py redraws a bad sample itself, which is the right
       * place for it since only that script can try again. This is the guard
       * that does not care which engine produced the answer: a duration that
       * is not physically speech never reaches the timeline.
       * ═══════════════════════════════════════════════════════════════════
       */
      /**
       * ═══════════════════════════════════════════════════════════════════
       * AND HOW MUCH OF IT IS ACTUALLY THE WORDS.
       *
       * Every clip comes back with the model's own silence on both ends — a
       * median of 150ms in front and 145ms behind, measured on three finished
       * reels — and the timeline was treating it as speech. So LEAD_MS, which
       * exists to put a beat of room before the voice, was putting two; and
       * the reel opened on about 300ms of nothing, inside the second where
       * the curve in lib/reel-retention.ts loses half the audience.
       *
       * Trimmed HERE, before anything is measured, so there is one duration
       * for a clip rather than a file length and a speech length that drift
       * apart. The file on disk is rewritten, which is also what makes the
       * guard below honest: a generation that is mostly silence now reports
       * the length of the part that is not.
       *
       * lib/wav.ts returns the clip untouched whenever it cannot find the
       * edges, so the worst case is the timing this had before.
       * ═══════════════════════════════════════════════════════════════════
       */
      for (const item of parsed) {
        const wav = readWav(new Uint8Array(readFileSync(item.path)));
        if (!wav) continue;
        const speech = trimmedToSpeech(wav.format, wav.data);
        if (speech.length >= wav.data.length) continue;
        writeFileSync(item.path, writeWav(wav.format, speech));
        item.ms = durationMs(wav.format, speech.length);
      }

      for (const [i, item] of parsed.entries()) {
        const text = flat[i]?.text;
        if (!text) continue;
        const wrong = implausibleAudio(text, Number(item.ms));
        if (wrong) {
          return reject(new Error(
            `${say} produced audio that cannot be those words.\n  ${wrong}\n`
            + "A phrase this short is a failed generation, and laying it into the track "
            + "deletes the line from the reel without failing anything downstream.",
          ));
        }
      }
      resolve(parsed);
    });
    child.stdin.end(JSON.stringify(ENGINE === "chatterbox" ? chatterboxJob : job));
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
      return { text: phrase.text, gapMs: phrase.gapMs, audioMs: audio.ms, gainDb: gains[cursor - 1] };
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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AND THE ONE NUMBER THE RULES ABOVE CANNOT TURN INTO A RULE.
 *
 * Every check above is a threshold something either clears or does not. This
 * is a measurement of how many people will be left when the reel gets to its
 * point, on the curve this account actually recorded — and across every script
 * the project owns the answer is between 8 and 11 per cent.
 *
 * Printed rather than enforced. A rule that failed all of them would be turned
 * off within a day, and the honest reading is not "this script is broken" but
 * "this format spends most of itself on an audience that has already gone".
 * That is a decision about what to make, and it belongs to whoever is making
 * it, with the number in front of them rather than in a file they have to go
 * and find.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const audience = revealAudience(plan);
if (audience) console.log(`  ${audience.reading}`);

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
  viewport: { width: REEL_W, height: REEL_H },
  deviceScaleFactor: REEL_SCALE,
  colorScheme: "dark",
});
const signedIn = await signIn(await doorway.newPage(), base);
const storageState = await doorway.storageState();
await doorway.close();
console.log(signedIn ? "Signed in off camera." : "No credentials — filming the public pages only.");

const context = await browser.newContext({
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * 540x960, BECAUSE MEDIA QUERIES ANSWER THE VIEWPORT.
   *
   * "The videos feel low quality" is true — this is a 540x960 capture that
   * ffmpeg scales up — and the obvious fix does not work. Recording at
   * 1080x1920 with the page zoomed 2x IS sharper: measured 1.64x more fine
   * detail. It also renders the DESKTOP layout, because CSS media queries
   * answer against the viewport and not against a zoomed box:
   *
   *   viewport 540              body layout 540px   mobile media query TRUE
   *   viewport 1080 + zoom 2    body layout 540px   mobile media query FALSE
   *   viewport 1080 + transform body layout 540px   mobile media query FALSE
   *
   * I shipped that, and the reel came back as a dense multi-column table with
   * a page footer in shot — sharper, and of the wrong app. Nothing in the page
   * can fix it: the breakpoint is decided before any of this runs.
   *
   * So the capture stays at the phone size and the sharpness is recovered in
   * the mux with an unsharp mask after the scale, which measured 1.45x of the
   * 1.64x — nearly all of it, on the layout people actually use.
   * ═══════════════════════════════════════════════════════════════════════
   */
  viewport: { width: REEL_W, height: REEL_H },
  deviceScaleFactor: REEL_SCALE,
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
  recordVideo: { dir: rawDir, size: { width: REEL_W, height: REEL_H } },
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



const page = await context.newPage();

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MEASURE THE CAPTION THAT WAS ACTUALLY DRAWN.
 *
 * lib/safe-zone.test.ts reads the overlay's padding out of the source and
 * checks the numbers, which is worth having and is not the same claim. Padding
 * is where a line STARTS; how wide it ends up is down to how long the words
 * are, whether they wrapped, and what font fell back. Both edges of the
 * caption were already wrong once while the intent in the source read fine.
 *
 * So this asks the browser for the box, in CSS pixels, and scales it to the
 * frame. Violations are collected rather than thrown: stopping the recording
 * half way leaves no artefact to look at, and the run is three minutes. They
 * are reported together at the end, and they fail the run — a caption under
 * the platform's chrome cannot be fixed once the file is rendered.
 *
 * Declared HERE, above the recording loop, and not beside its caller further
 * down: `unsafe` is a const and the loop runs at module top level, so a
 * declaration after it leaves the first real violation throwing a
 * ReferenceError out of the temporal dead zone instead of being reported.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const unsafe: string[] = [];

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE RING MUST NOT POINT AT SOMETHING THE CAPTION IS COVERING.
 *
 * This exact defect is already recorded twice in scripts/reel-overlay.js: "the
 * ring was around the dial and the number was under the caption". FOCUS_AT was
 * the fix — put the focused thing at 36% of the frame — and it was calibrated
 * against a caption band starting at about 68%.
 *
 * That premise has since changed. Lifting the caption clear of Instagram's
 * chrome moved its top from 70% of the frame to 55%, and narrowing it to clear
 * the action rail made the longest captions four rendered lines instead of
 * three. Measured, the budget is now:
 *
 *   ring bottom, worst case   502px   (36% of 960, + GROW_SHARE/2, + 12 pad)
 *   caption top, worst case   528px   (four rendered lines)
 *   clearance                  26px   — it was 174
 *
 * 26px of 960 is not a margin anybody should trust to stay true, and the
 * arithmetic above is only as good as its assumptions about wrapping. So the
 * overlap is measured on the real page instead, every beat, in the one place
 * both things are on screen together.
 * ═══════════════════════════════════════════════════════════════════════════
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A CAPTION THE CODE CALLS ONE LINE AND THE BROWSER DRAWS AS FOUR.
 *
 * captionLines cuts at 42 characters and calls that a line. How many lines it
 * actually becomes depends on the words, the wrap and the face: in the
 * fallback the overlay used to ask for, 42 characters was three rendered lines
 * and never one; in the app's own display face it is two. Nothing downstream
 * knows either number — the block grows upward from a fixed bottom, so the
 * taller it renders the more of the app it covers, and the app is the subject.
 *
 * Counted from the line-height the element reports rather than a number
 * written here, because that is the thing that decides.
 * ═══════════════════════════════════════════════════════════════════════════
 */
async function checkCaptionLines(text: string): Promise<void> {
  const drawn = await page.evaluate(() => {
    const el = document.getElementById("__reel_caption");
    if (!el || !el.textContent) return 0;
    const box = el.getBoundingClientRect();
    const lh = parseFloat(getComputedStyle(el).lineHeight);
    if (!(box.height > 0) || !(lh > 0)) return 0;
    return Math.round(box.height / lh);
  }).catch(() => 0);
  if (drawn <= MAX_CAPTION_LINES) return;

  const line = `caption renders ${drawn} lines, over the ${MAX_CAPTION_LINES}-line ceiling `
    + `— ${JSON.stringify(text)}`;
  if (!unsafe.includes(line)) unsafe.push(line);
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE OVERLAYS MUST NOT SIT ON EACH OTHER.
 *
 * This checked one pair — the spotlight ring against the caption — because
 * for a long time that was the only pair that could happen: the hook held the
 * screen alone for its 1.6 seconds, and nothing else was drawn until it came
 * off. It does not any more, so all three pairs can be on one frame and all
 * three are measured.
 *
 * The pair that made it necessary is the hook against the caption. Measured
 * in a browser at the recording viewport, in frame pixels of 1080x1920: the
 * hook hangs from 42% at a line pitch of 138, so three lines end at 1231; the
 * caption is bottom-anchored at a pitch of 110, so it starts at 1379 for one
 * line, 1269 for two, 1159 for three.
 *
 *   every script as it stands   3-line hook, 1-2 line caption   clear by 38-176px
 *   both ceilings               3-line hook, 3-line caption     OVERLAP by 72px
 *
 * Three lines each is what lib/safe-zone.ts already permits — MAX_HOOK_LINES
 * and MAX_CAPTION_LINES are both 3 — so the collision is a script away rather
 * than impossible, and 38px is not a margin to leave unwatched.
 *
 * The third pair, the ring against the hook, arrived with the same change:
 * the card reels aim their spotlight on the first beat, which used to be a
 * beat and a half after the hook was gone.
 *
 * EVERY BOX GROWS BY ITS OWN BLEED FIRST. The rings the glyphs are outlined
 * with paint outside the layout box — text-shadow is not layout — and they
 * are different sizes, 5px on the hook and 4 on the caption. The element
 * carries its own, which is why the number travels with it.
 *
 * GATED ON "ASKED TO BE VISIBLE", NOT ON "FINISHED FADING IN". The pair this
 * was written for is measured the instant the caption is drawn, and every one
 * of these elements fades — 120ms on the hook and the caption, 220ms on the
 * spotlight. A gate of `opacity === "1"` would therefore find the caption
 * mid-fade every single time and skip the pair, which is a check that runs on
 * every caption in every reel and can never report anything. An element on
 * its way in or out is still an element on the frame, and an overlap during a
 * fade is still an overlap.
 * ═══════════════════════════════════════════════════════════════════════════
 */
async function checkOverlaysClear(text: string): Promise<void> {
  const hits = await page.evaluate(() => {
    const parts = [
      { id: "__reel_ring", name: "spotlight ring", gate: "__reel_spot", needsText: false },
      { id: "__reel_hook", name: "hook", gate: "__reel_hook", needsText: true },
      { id: "__reel_caption", name: "caption", gate: "__reel_caption", needsText: true },
    ];
    const boxes: { name: string; left: number; right: number; top: number; bottom: number }[] = [];
    for (const part of parts) {
      const el = document.getElementById(part.id);
      const gate = document.getElementById(part.gate);
      if (!el || !gate) continue;
      if (getComputedStyle(gate).opacity === "0") continue;
      if (part.needsText && !el.textContent) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const bleed = Number(el.dataset.bleed ?? 0);
      boxes.push({
        name: part.name,
        left: r.left - bleed, right: r.right + bleed,
        top: r.top - bleed, bottom: r.bottom + bleed,
      });
    }
    /**
     * Every rect comes from the same call in the same coordinate space, so
     * the overlaps are valid whatever the zoom does to any of them.
     */
    const out: { a: string; b: string; over: number; aBottom: number; bTop: number }[] = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const over = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        const across = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        if (over > 0 && across > 0) out.push({ a: a.name, b: b.name, over, aBottom: a.bottom, bTop: b.top });
      }
    }
    return out;
  }).catch(() => []);

  for (const hit of hits) {
    const line = `${hit.a} overlaps the ${hit.b} by ${Math.round(hit.over * REEL_SCALE)}px `
      + `(${hit.a} reaches ${Math.round(hit.aBottom * REEL_SCALE)}, ${hit.b} starts `
      + `${Math.round(hit.bTop * REEL_SCALE)}) — ${JSON.stringify(text.slice(0, 48))}`;
    // One per distinct fault. A caption drawn 40 times reports once.
    if (!unsafe.includes(line)) unsafe.push(line);
  }
}

async function checkSafeZone(what: string, id: string, text: string): Promise<void> {
  const box = await page.evaluate((elId) => {
    const el = document.getElementById(elId);
    if (!el || !el.textContent) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    /**
     * The ring the glyphs are outlined with paints OUTSIDE this rect —
     * text-shadow is not layout — so the element carries how far, and the box
     * grows by it before anything is judged. Without this the check was blind
     * to exactly the 6px the first measured frame was over by.
     */
    const bleed = Number(el.dataset.bleed ?? 0);
    return {
      left: r.left - bleed, right: r.right + bleed,
      top: r.top - bleed, bottom: r.bottom + bleed,
    };
  }, id).catch(() => null);
  if (!box) return;

  const framed = {
    left: box.left * REEL_SCALE, right: box.right * REEL_SCALE,
    top: box.top * REEL_SCALE, bottom: box.bottom * REEL_SCALE,
  };
  const problems = outsideSafeZone(framed);
  if (!problems.length) return;
  const where = `x ${Math.round(framed.left)}..${Math.round(framed.right)} `
    + `y ${Math.round(framed.top)}..${Math.round(framed.bottom)}`;
  const line = `${what} ${where}: ${problems.join(", ")} — ${JSON.stringify(text.slice(0, 48))}`;
  // One per distinct fault. A caption drawn 40 times reports once.
  if (!unsafe.includes(line)) unsafe.push(line);
}

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
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT WAS ACTUALLY ON THE SCREEN, WHEN SOMETHING WAS NOT FOUND.
 *
 * "Nothing matches" is true and useless. It sent me guessing three times — a
 * stale page, a slow write, then the wrong button — and the first two were
 * wrong. The screen knows what is on it, so it is asked.
 *
 * BOTH GUARDS USE IT. The first version of this was attached to the focus
 * check only, and the very next failure was a move check, which threw with no
 * evidence at all. A diagnostic on one of two identical failure paths is a
 * diagnostic that is missing half the time.
 * ═══════════════════════════════════════════════════════════════════════════
 */
async function dumpScreen(route: string): Promise<void> {
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * NO INNER FUNCTIONS IN HERE. THIS DUMP LIED FOR FIVE RUNS.
   *
   * It declared `const text = (el) => ...` inside the callback. tsx compiles
   * this file with esbuild's keepNames, which wraps a named arrow in a
   * `__name(...)` call — and Playwright ships the TRANSPILED source of an
   * evaluate callback to the browser, where no `__name` exists. Every call
   * threw ReferenceError, the catch returned its fallbacks, and the fallbacks
   * printed as "no headings, no buttons, no labels".
   *
   * I read that as "the page has not rendered" and built a hydration fix on
   * it. The page was fine; the instrument was broken. A diagnostic that fails
   * silently is worse than none, because its output is trusted.
   * ═══════════════════════════════════════════════════════════════════════
   */
  const seen = await page.evaluate(() => {
    return {
      /**
       * WHERE THE BROWSER ACTUALLY IS, and what it actually shows.
       *
       * Three empty dumps in a row said "nothing on /journal" and I read that
       * as "the page has not rendered". An empty page and a page that
       * redirected somewhere else look identical through a list of headings.
       * The URL distinguishes them, and the body text says whether anything
       * is there at all.
       */
      url: location.href,
      bodyChars: (document.body?.innerText ?? "").trim().length,
      body: (document.body?.innerText ?? "").trim().replace(/\s+/g, " ").slice(0, 180),
      headings: [...document.querySelectorAll("h1, h2, h3")]
        .map((el) => (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40))
        .filter(Boolean).slice(0, 20),
      buttons: [...document.querySelectorAll("button")]
        .map((el) => (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40))
        .filter(Boolean).slice(0, 30),
      named: [...document.querySelectorAll("[aria-label]")]
        .map((el) => el.getAttribute("aria-label") ?? "").filter(Boolean).slice(0, 20),
    };
  }).catch((e: unknown) => {
    // Saying so, rather than printing "?" and letting it read as an empty page.
    console.error(`  the page could not be inspected: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
    return { url: "?", bodyChars: -1, body: "?", headings: [], buttons: [], named: [] };
  });
  console.error(`  url while looking for it: ${seen.url}`);
  console.error(`  body on ${route}: ${seen.bodyChars} chars — ${JSON.stringify(seen.body)}`);
  console.error(`  headings on ${route}: ${JSON.stringify(seen.headings)}`);
  console.error(`  buttons on ${route}: ${JSON.stringify(seen.buttons)}`);
  console.error(`  accessible names on ${route}: ${JSON.stringify(seen.named)}`);
}

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
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NUDGES THE APP IS RIGHT TO SHOW AND THE REEL IS WRONG TO FILM.
 *
 * A dedicated demo account still gets offered things: "Stop typing last
 * night's sleep — connect an Oura ring", and the install-to-home-screen
 * prompt. Both are correct product behaviour and both are somebody else's
 * advert sitting across the opening of ours.
 *
 * THIS USED TO BE A MOVE ON THE FIRST BEAT, and the recording showed why that
 * was the wrong place. Moves run alongside the hook rather than before it, so
 * the tap landed somewhere around 1.5s — the tooltip was gone by 2.5s and
 * present for the whole of the first second. Instagram's retention curve for
 * that reel falls from 100% to about 10% inside two seconds, so the fix was
 * arriving after the audience had left.
 *
 * Here it happens while the routes are being warmed, before the clock starts
 * and before a single recorded frame. It also covers every route rather than
 * the one beat somebody remembered to annotate.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const DISMISS_BEFORE_FILMING = ["Not now"];

async function tidyScreen(): Promise<void> {
  for (const label of DISMISS_BEFORE_FILMING) {
    await page.evaluate(
      (m) => (window as never as { __reelDo: (m: unknown) => boolean }).__reelDo(m),
      { tap: label, optional: true },
    ).catch(() => false);
  }
}

for (const route of [...new Set(plan.steps.map((b) => b.route))]) {
  await page.goto(`${base}${route}`, { waitUntil: "load" }).catch(() => {});
  await settle();
  await tidyScreen();
}

await page.goto(`${base}${plan.steps[0]?.route ?? "/"}`, { waitUntil: "load" }).catch(() => {});
await settle();
await tidyScreen();
await settle();
const started = Date.now();
const leadMs = started - videoStart;
const elapsed = () => Date.now() - started;
let onRoute = plan.steps[0]?.route ?? "";
/** How far down the current screen the drift has reached. */
let driftFrom = 0;

console.log(`Recording "${script.hook}" — ${Math.round(plan.totalMs / 1000)}s, ${plan.steps.length} beats`);

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A ROUTE CHANGE RELOADS THE DOCUMENT, AND THAT IS THE LEAST-BAD OPTION.
 *
 * This was changed to click the app's own link instead — the app does
 * client-side routing, a marker on `window` survives a click and is destroyed
 * by page.goto, and lib/use-async.ts holds a module cache whose comment says
 * it exists to stop exactly the skeleton flash the reels show. All of that is
 * true and the change still made the reel worse. Recorded, measured, reverted:
 *
 *   caption drawn 2025ms after its moment, planned 2155ms at 10570ms on
 *   /home, so 130ms of it is on screen
 *
 * WHY, and it is not that the app is slow. page.goto returns at the `load`
 * event: the prerendered HTML for /home arrives quickly, React hydrates
 * afterwards, and the recorder carries on — so the hydration gap becomes the
 * blank frame the viewer sees. A soft navigation does not change
 * location.pathname until Next has the route's payload and is ready to render,
 * so waiting for it blocks for the whole thing. The time to content is much
 * the same either way. The only question is whether the recorder spends it
 * waiting or filming, and the captions are on an absolute clock, so waiting
 * spends it out of the beat.
 *
 * WHICH MEANS THE FIX IS NEITHER. The navigation has to happen BEFORE the beat
 * that needs it — during the tail of the one before, while its caption is
 * still up — so the new screen is ready when the beat starts. That is a real
 * change to what the previous shot shows for its last half second, and it
 * needs its own measurement rather than another guess on top of this one.
 *
 * Left as it was, with the finding written down, because a pipeline that
 * records with a blank frame is worth more than one that refuses to record.
 * ═══════════════════════════════════════════════════════════════════════════
 */

let hookShown = false;
/** The hook coming off on its own clock. Resolved already on every later beat. */
let hookHold: Promise<void> = Promise.resolve();
let hookFault: unknown = null;
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
    await checkSafeZone("hook", "__reel_hook", plan.hook);
    // openingScroll, not 0.28 written twice: the closing beat glides back to
    // this exact position, so the two have to be the same number.
    /**
     * GLIDED ACROSS THE WHOLE HOOK, not handed to the browser.
     *
     * behavior:"smooth" finishes when the browser decides — measured on a
     * finished reel, about 360ms of a 1.6s hook, after which the frame was
     * frozen for most of a second. Instagram's retention curve for that reel
     * drops from 100% to roughly 10% inside two seconds, which is the window
     * this was supposed to be filling.
     */
    await page.evaluate(
      ({ to, ms }) => (window as never as { __reelGlide: (t: number, m: number) => void }).__reelGlide(to, ms),
      { to: openingScroll(page_), ms: plan.hookMs },
    ).catch(() => {});
    driftFrom = openingScroll(page_);
    /**
     * ═══════════════════════════════════════════════════════════════════════
     * HELD ALONGSIDE THE CAPTIONS, NOT INSTEAD OF THEM.
     *
     * This awaited the whole 1.6 seconds before the beat's captions were
     * scheduled, and the schedule does not wait — a caption whose moment
     * passed is drawn the instant the loop reaches it and replaced by the
     * next one on time. Every reel lost its first line to that, and two lost
     * it completely: "Not fitness." had 1214ms planned and was on screen for
     * none of them, "£0.31 or £3.19," had 1672 and got 72.
     *
     * This is the SAME BUG as the moves below, one level up, and it survived
     * that fix because the fix was made where the moves are. The hook is now
     * a promise that comes off on its own clock, and the captions run under
     * it — which the layout already expects: the pill sits at 42% and the
     * note on it says in as many words that it clears the caption band.
     *
     * checkOverlaysClear measures that rather than trusting it: a hook that
     * runs to three lines and a caption that runs to three would meet, and
     * until now they could never be on one frame for anything to notice.
     * ═══════════════════════════════════════════════════════════════════════
     */
    hookHold = (async () => {
      // Held from the first frame, because the decision is made in three
      // seconds and the hook has to be readable inside them.
      await sleep(Math.max(0, plan.hookMs - elapsed()));
      await page.evaluate(() => (window as never as { __reelHook: (s: string) => void }).__reelHook(""));
      // Caught into a variable and rethrown where it is awaited, the same way
      // the captions below are. A detached promise that rejects is an
      // unhandled rejection; a swallowed one is a hook that never comes off
      // and a reel with a headline across the middle of every shot.
    })().catch((e: unknown) => { hookFault = e; });
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
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * DO THE THING, BEFORE POINTING AT THE RESULT OF IT.
   *
   * Moves run at the top of the beat so the app has reacted by the time the
   * spotlight aims and the line plays — the readiness score has to have moved
   * before a caption says what it moved to.
   *
   * LOUD ON A MISS. A move that finds nothing films a form nobody filled in
   * and a number that never changed, which looks exactly like a working reel
   * to every check that does not watch it. This is the same rule the focus
   * below already follows, for the same reason.
   */
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * THE CAPTIONS RUN ON THE CLOCK. THE MOVES ARE NOT ON IT.
   *
   * The captions used to be scheduled AFTER the moves finished, and the moves
   * take real time — a poll for each target, a click, MOVE_GAP_MS between.
   * Extracted from the recording: at 6.8s and 7.3s the check-in is being
   * filled in on camera, "Barely" and "Wrecked" already lit, and there is no
   * caption on the frame at all. The line arrives at about 7.5s, a second and
   * a half after the voice said it.
   *
   * The VOICE is laid at the plan's absolute times (lib/narration.ts places
   * clips at LEAD_MS + hold and knows nothing about moves), so the audio was
   * right and the words underneath it were late. On the one beat in the whole
   * reel that shows somebody using the app, three quarters of the audience —
   * the ones with the sound off — got a silent screen.
   *
   * So the schedule is started here and awaited after the aim. Both halves
   * are Playwright calls on one page, which serialises them; they interleave
   * rather than race.
   *
   * `willAim` rather than `aimed`: the drift is skipped on a beat that names
   * a focus, and whether it names one is known now. Waiting to find out was
   * the only reason this loop had to come last.
   * ═══════════════════════════════════════════════════════════════════════
   */
  const willAim = Boolean(step.focus);
  let captionFault: unknown = null;
  const captioning = runCaptions(step, willAim).catch((e: unknown) => { captionFault = e; });

  for (const move of step.moves ?? []) {
    /**
     * WAITED FOR, NOT ASSUMED. The navigation above uses `waitUntil: "load"`,
     * which in a Next.js app fires while the document is still empty — the
     * recorder's own screen dump showed /journal with no headings, no buttons
     * and no labels when the first move ran. A move looks for its target
     * until MOVE_WAIT_MS is up, which is what a person does.
     */
    const deadline = Date.now() + MOVE_WAIT_MS;
    let did = false;
    /**
     * ═══════════════════════════════════════════════════════════════════════
     * WHY THE ASK FAILED, NOT JUST THAT IT DID.
     *
     * This was `.catch(() => false)`, which reports "the control was not
     * found" for every possible failure — including the page being unable to
     * answer at all. It was the second: the dump came back with the catch
     * fallbacks in it, meaning page.evaluate itself was throwing, most likely
     * an execution context destroyed by a navigation in flight.
     *
     * So four runs were spent looking for a missing button that was never
     * missing. A catch-all that turns every fault into the same message is
     * worse than no catch: it invents a diagnosis and hides the evidence.
     * ═══════════════════════════════════════════════════════════════════════
     */
    let lastError = "";
    while (!did) {
      did = await page.evaluate(
        (m) => (window as never as { __reelDo: (m: unknown) => boolean }).__reelDo(m),
        move,
      ).catch((e: unknown) => {
        lastError = e instanceof Error ? e.message.split("\n")[0] : String(e);
        return false;
      });
      if (did || Date.now() >= deadline) break;
      await sleep(MOVE_POLL_MS);
    }
    const what = "tap" in move ? `tap "${move.tap}"` : `type "${move.type}" into "${move.into}"`;
    if (!did && lastError) console.error(`  the page could not be asked: ${lastError}`);
    /**
     * An optional move is putting the screen into a known state, not showing
     * anything off. If it is not needed it is not there, and that is fine.
     */
    if (!did && "optional" in move && move.optional) {
      console.log(`  skipped optional ${what} — not on ${step.route}, which is expected`);
      continue;
    }
    /**
     * A MISS STOPS THE RUN. It used to warn and carry on, and the first set of
     * moves ever written missed twice — the labels belonged to a view the reel
     * never opens — so a reel was recorded, muxed and uploaded showing a form
     * nobody had touched, with the warning sitting in a log nobody reads.
     *
     * A reel whose whole claim is "watch this happen" and which shows nothing
     * happening is worse than no reel, so it is refused rather than published.
     * lib/reel-retention.ts already refuses reels on weaker grounds than this.
     */
    if (!did) {
      await dumpScreen(step.route);
      throw new Error(
        `Move missed on ${step.route}: ${what}.\n`
        + "Nothing on that screen matches, so the shot would show nothing happening. "
        + "Check the label against the view the reel actually opens — the quick "
        + "check-in and the detailed one carry different ones.",
      );
    }
    await sleep(MOVE_GAP_MS);
  }

  const want = step.focus ?? "";
  /**
   * The same wait, for the same reason: a beat with no moves aims its
   * spotlight at a page that may still be hydrating.
   */
  const focusBy = Date.now() + MOVE_WAIT_MS;
  let aimed = false;
  // Same as the moves above: a page that cannot answer is not a page that
  // does not contain the words, and reporting both the same way is what sent
  // four runs after a button that was never missing.
  let focusError = "";
  while (!aimed) {
    aimed = await page.evaluate(
      (t) => (window as never as { __reelFocus: (s: string) => boolean }).__reelFocus(t),
      want,
    ).catch((e: unknown) => {
      focusError = e instanceof Error ? e.message.split("\n")[0] : String(e);
      return false;
    });
    if (aimed || !want || Date.now() >= focusBy) break;
    await sleep(MOVE_POLL_MS);
  }
  if (want && !aimed && focusError) console.error(`  the page could not be asked: ${focusError}`);
  /**
   * A DECLARED FOCUS THAT FINDS NOTHING STOPS THE RUN.
   *
   * This warned and carried on, and that is how a reel went out whose reveal
   * beat said "that is what it thinks of you today" over a home screen with
   * no score on it at all — the check-in it had just performed never saved,
   * because the tap hit a button called "Log it" that opens the training
   * section rather than the submit button called "Save today's log". Three
   * moves reported clean, one warning nobody read, and the reel contradicted
   * its own narration.
   *
   * A focus is the script saying "this is the shot". If the shot is not
   * there, the reel is about something that did not happen, and the OUTCOME
   * is the only thing that catches a tap which worked and did the wrong job.
   */
  if (want && !aimed) {
    await dumpScreen(step.route);
    throw new Error(
      `Nothing on ${step.route} matches the focus "${want}".\n`
      + "The beat is built around pointing at it, so the shot would contradict the line. "
      + "If a move on this beat was supposed to produce it, check that the move did what "
      + "it meant to rather than merely finding something to click.",
    );
  }
  // The focus moved the page, so the drift for this beat starts from there
  // rather than from wherever the previous beat left off.
  if (aimed) driftFrom = await page.evaluate(() => window.scrollY).catch(() => driftFrom);

  await captioning;
  if (captionFault) throw captionFault;
  // The hook comes off mid-beat, and a beat that finished first would move on
  // with it still up. Resolved already on every beat but the first.
  await hookHold;
  if (hookFault) throw hookFault;

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * THE END CARD, IN THE SILENCE THAT WAS ALREADY THERE.
   *
   * The recorded reel ended on the app with nothing written on it — the last
   * caption cleared and 1.8 seconds of tail played out blank. That is the
   * frame somebody is looking at when they decide whether to do anything,
   * and it was the only part of the reel asking them for nothing.
   *
   * It reuses the hook overlay rather than inventing a second one: that is
   * already drawn white on a heavy black outline and legible over anything,
   * and a second thing to keep legible is a second thing to get wrong. See
   * lib/reel-plan.ts for why it can never cover a caption.
   * ═══════════════════════════════════════════════════════════════════════
   */
  const last = step.index === plan.steps.length - 1;
  if (!last) {
    await sleep(Math.max(0, step.at + step.ms - elapsed()));
  } else {
    await sleep(Math.max(0, endCardAt(step.at + step.ms, step.captions) - elapsed()));
    await page.evaluate(() => (window as never as { __reelCaption: (s: string) => void }).__reelCaption("")).catch(() => {});
    await page.evaluate(() => (window as never as { __reelFocus: (s: string) => boolean }).__reelFocus("")).catch(() => {});
    await page.evaluate(
      (t) => (window as never as { __reelHook: (s: string) => void }).__reelHook(t),
      SIGNUP_CTA,
    ).catch(() => {});
    await checkSafeZone("sign-off", "__reel_hook", SIGNUP_CTA);
    await sleep(Math.max(0, step.at + step.ms - elapsed()));
  }
  await page.evaluate(() => (window as never as { __reelCaption: (s: string) => void }).__reelCaption("")).catch(() => {});
}

/**
 * Draw this beat's captions at the times the plan gave them, and drift the
 * page between them on a beat that is not pointing at anything.
 *
 * A function so it can be STARTED before the moves and awaited after them —
 * see the note at the call site. Nothing else about it changed.
 */
async function runCaptions(step: (typeof plan.steps)[number], willAim: boolean): Promise<void> {
  let driftAt = driftFrom;
  const page_ = await page.evaluate(() => ({
    scrollable: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
    viewport: window.innerHeight,
  })).catch(() => ({ scrollable: 0, viewport: 0 }));

  for (const [i, caption] of step.captions.entries()) {
    await sleep(Math.max(0, caption.at - elapsed()));
    /**
     * Timed words, not a string. The figure is coloured for the whole line
     * and the highlight sweeps across it as the voice does — the rules for
     * both are in lib/caption-karaoke.ts, tested; the page only draws what it
     * is handed and runs one timer per word.
     */
    await page.evaluate(
      (words) => (window as never as { __reelCaption: (r: unknown) => void }).__reelCaption(words),
      karaokeWords(caption.text, caption.ms),
    );
    /**
     * DRAWN WHEN THE PLAN SAID, measured rather than assumed.
     *
     * Read AFTER the draw, because a caption exists when the browser has been
     * told about it and not when the timer fired. See MAX_CAPTION_LATE_MS —
     * every other caption rule in lib/reel-retention.ts measures the plan, and
     * twice the recorder has quietly not honoured it.
     */
    const lateBy = elapsed() - caption.at;
    if (lateBy > MAX_CAPTION_LATE_MS) {
      const line = `caption drawn ${Math.round(lateBy)}ms after its moment, over the `
        + `${MAX_CAPTION_LATE_MS}ms allowance — planned ${Math.round(caption.ms)}ms at `
        + `${Math.round(caption.at)}ms on ${step.route}, so `
        + `${Math.round(Math.max(0, caption.ms - lateBy))}ms of it is on screen. `
        + `Something ran on the clock before the schedule did: a navigation, a hold, `
        + `a check — ${JSON.stringify(caption.text.slice(0, 48))}`;
      if (!unsafe.includes(line)) unsafe.push(line);
    }
    await checkSafeZone("caption", "__reel_caption", caption.text);
    await checkOverlaysClear(caption.text);
    await checkCaptionLines(caption.text);
    /**
     * ═══════════════════════════════════════════════════════════════════════
     * A COMPOSED SHOT HOLDS STILL.
     *
     * The spotlight is position:fixed and computed once, when the beat aims
     * it. The drift then scrolled the page out from under it — so the reveal
     * frame had a gold ring, correctly drawn, around "Turkey breast mince
     * £1.06" while the caption said "Cheapest: £0.31". Worse than no
     * spotlight: it pointed confidently at the wrong row.
     *
     * Re-aiming after every scroll would work and is the wrong fix. A reveal
     * is the one shot in a reel that should not move: the script named the
     * thing, the camera framed it, and panning off it during the line is not
     * something an editor would do.
     *
     * `willAim`, not the aim's RESULT. This runs alongside the moves now and
     * finishes around the same time the aim does, so waiting for the answer
     * would put it back where it was. Whether the beat names a focus is the
     * question the drift is actually asking.
     * ═══════════════════════════════════════════════════════════════════════
     */
    if (willAim) continue;

    /**
     * THE LAST BEAT GOES BACK THE WAY IT CAME.
     *
     * Five of the seven scripts end on the screen they opened on, and
     * lib/reel-script.ts records what that costs — two other reels go without
     * the loop because returning would push them past MAX_ONE_ROUTE_SHARE.
     * The point of paying it is the picture: "the last shot matches the
     * framing of the first".
     *
     * It did not. driftTarget only ever moves down, so every one of those five
     * ended 720px into a 960px viewport while the first frame is at 0 — the
     * right page at the wrong place, which loops no better than the wrong
     * page. The closing beat glides back to the top instead, arriving on its
     * last caption so the end card asks from the opening framing.
     */
    const closing = step === plan.steps[plan.steps.length - 1];
    const to = closing
      ? closingDrift({ ...page_, from: driftAt, step: i + 1, steps: step.captions.length })
      : driftTarget({ ...page_, from: driftAt, step: i + 1, steps: step.captions.length });
    if (to !== driftAt || i === 0) {
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: "smooth" }), to).catch(() => {});
    }
    if (i === step.captions.length - 1) { driftAt = to; driftFrom = to; }
  }
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
 * ═══════════════════════════════════════════════════════════════════════════
 * AND THE WORDS THAT GO IN THE BOX UNDERNEATH.
 *
 * record-carousel.mts has written a caption.txt next to its slides since it
 * was built. This wrote an .mp4, an .srt and a .sync.json, and left the
 * person posting to write the caption from scratch — on a pipeline whose
 * whole argument is that nothing worth checking gets done by hand at the end.
 *
 * Built from the script's own beats rather than written again, so the caption
 * cannot drift from what the video says, and checked before it is written:
 * captionProblems() is the same guard the other captions get, and a claim it
 * refuses would be refused in the box under a post too.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const caption = renderCaption(reelCaption(script));
const captionFaults = captionProblems(caption);
if (captionFaults.length) {
  throw new Error(
    `The caption for ${script.id} would not be postable:\n  ${captionFaults.join("\n  ")}`,
  );
}
writeFileSync(join(outDir, `${script.id}.caption.txt`), `${caption}\n`);

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE NUMBERS THE RECORDER ACTUALLY USED, SO SYNC STOPS BEING INFERRED.
 *
 * Caption sync was checked three times by finding voice onsets in the muxed
 * audio and comparing them with the SRT, and the heuristic was wrong three
 * times, in three different ways:
 *
 *   walking the captions   every caption that is not the first of its
 *                          sentence reports a large error, because the voice
 *                          does not stop mid-sentence and there is no onset
 *                          near it — a fixed reel looked broken
 *   walking the onsets     a voice that breathes after a colon produces more
 *                          onsets than there are phrases, and each extra one
 *                          is matched to a caption it has nothing to do with
 *   matching the firsts    two sentences run together with no detectable
 *                          pause produce no onset between them, so the
 *                          second one is matched to the next phrase entirely
 *                          — an error of 2.27s that was not in the reel
 *
 * Every one of those was a property of the DETECTOR. The recorder already
 * knows both numbers exactly: where it put each caption, and where the audio
 * for each phrase actually starts. Writing them down turns sync from something
 * inferred off a waveform into something checked with subtraction.
 *
 * A broken instrument is worse than none, because its output gets believed.
 * This file has that lesson in it twice already.
 * ═══════════════════════════════════════════════════════════════════════════
 */
writeFileSync(join(outDir, `${script.id}.sync.json`), JSON.stringify({
  id: script.id,
  totalMs: plan.totalMs,
  leadMs,
  steps: plan.steps.map((step) => ({
    index: step.index,
    route: step.route,
    /** Beat-relative, as measured from the synthesised audio. */
    clips: (step.clips ?? []).map((c) => ({ atMs: c.atMs, ms: c.ms })),
    at: step.at,
    captions: step.captions.map((c) => ({ at: c.at, ms: c.ms, text: c.text })),
  })),
}, null, 2));
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
    clips.map((clip, i) => ({
      atMs: clip.atMs,
      data: read[i]?.data ?? new Uint8Array(0),
      gainDb: clip.phrase.gainDb,
    })),
    plan.totalMs,
  );
  /**
   * The per-role loudness above can only CUT — see lib/speech-prosody.ts — so
   * the assembled track is quieter than the voice as synthesised, by however
   * much this particular reel leans on its quiet roles. One pass brings it
   * back to a fixed level, the same one every reel gets.
   */
  writeFileSync(
    join(outDir, `${script.id}.wav`),
    writeWav(first.format, normalised(first.format, track)),
  );
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
console.log(`  ${outDir}/${script.id}.caption.txt`);

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * REPORTED AFTER THE FILES ARE WRITTEN, AND IT STILL FAILS THE RUN.
 *
 * Both halves of that are deliberate. Failing means the reel does not get
 * posted with its lowest line of text under Instagram's caption — the defect
 * this whole check exists for was invisible in the recorder's output and
 * obvious the moment somebody measured a frame. Writing the files first means
 * there is a .webm to open and see the problem in, instead of a failed run
 * and nothing to look at.
 * ═══════════════════════════════════════════════════════════════════════════
 */
if (unsafe.length) {
  console.error(`\n  ${unsafe.length} thing(s) drawn where the platform covers them:`);
  for (const line of unsafe) console.error(`    ${line}`);
  console.error(
    "\n  The frame is 1080x1920 and the safe box is 60/180/140/400 in from the"
    + "\n  edges — see lib/safe-zone.ts. Shorten the line or move the element;"
    + "\n  it cannot be fixed after the video is rendered.",
  );
  process.exitCode = 1;
}
