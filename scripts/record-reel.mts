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
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { reelScript, type ScriptId } from "../lib/reel-script";
import { reelPlan, srt, REEL_W, REEL_H, REEL_SCALE } from "../lib/reel-plan";
import { retentionProblems } from "../lib/reel-retention";

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

const plan = reelPlan(script);

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
});
const context = await browser.newContext({
  viewport: { width: REEL_W, height: REEL_H },
  deviceScaleFactor: REEL_SCALE,
  recordVideo: { dir: outDir, size: { width: REEL_W * REEL_SCALE, height: REEL_H * REEL_SCALE } },
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
const started = Date.now();
const elapsed = () => Date.now() - started;

console.log(`Recording "${script.hook}" — ${Math.round(plan.totalMs / 1000)}s, ${plan.steps.length} beats`);

let hookShown = false;
for (const step of plan.steps) {
  await page.goto(`${base}${step.route}`, { waitUntil: "load" }).catch((e) => {
    console.warn(`  ${step.route}: ${e instanceof Error ? e.message : e}`);
  });

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

console.log(`  ${outDir}/${script.id}.webm`);
console.log(`  ${outDir}/${script.id}.srt`);
