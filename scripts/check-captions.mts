/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THE CAPTIONS ACTUALLY LOOK LIKE, WITHOUT RECORDING ANYTHING.
 *
 * How many lines a caption becomes cannot be known from the source. It depends
 * on the words, where the browser wraps them, the letter-spacing and which font
 * fell back — so lib/caption-lines.ts cutting at 42 characters says nothing
 * about a caption being one line, and measured, 42 characters is three.
 *
 * The recorder checks this on the real page, and that was not enough. Reverting
 * the one over-long script line was caught by no test at all, because the unit
 * suite has no browser and a recording takes three minutes and a voice model.
 * This is the same measurement with neither: the overlay, a blank page at the
 * record viewport, every caption of every script.
 *
 *   node --import tsx scripts/check-captions.mts
 *   node --import tsx scripts/check-captions.mts --self-test
 *
 * The self-test is not decoration. Three audio metrics in this project were
 * confidently wrong before they were controlled, so this one renders a string
 * that MUST fail and a string that MUST pass, and refuses to report on the
 * scripts if it gets either wrong.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { chromium, type Browser, type Page } from "playwright";
import { SCRIPTS, reelScript, type ScriptId } from "../lib/reel-script";
import { reelPlan, REEL_W, REEL_H, REEL_SCALE } from "../lib/reel-plan";
import { karaokeWords } from "../lib/caption-karaoke";
import { MAX_CAPTION_LINES, outsideSafeZone } from "../lib/safe-zone";

/**
 * PW_CHROMIUM, the same name record-reel.mts, record-carousel.mts,
 * build-og-images.mts, screenshot-themes.mts and playwright.config.ts already
 * read. Playwright's own download when it is unset; a path when the pinned
 * revision is not the one installed.
 */
const executablePath = process.env.PW_CHROMIUM || undefined;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ON A REAL PAGE, BECAUSE THE FONT IS ON THE REAL PAGE.
 *
 * This used to measure captions on a blank document, which was fine while the
 * overlay asked for `system-ui`. It no longer does: it uses --font-display,
 * the Barlow Semi Condensed that app/layout.tsx loads through next/font, and
 * those variables exist only on the app's own pages. On a blank one the stack
 * falls through to whatever the machine calls sans-serif — 29% wider — so
 * every line count would be measured in a font no reel is drawn in.
 *
 * So it films the same page the recorder does, and refuses to report at all if
 * the font it measured is not the one that will be used. A caption checked in
 * the wrong face is a number about nothing.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const ORIGIN = process.env.REEL_ORIGIN ?? "http://localhost:8899";

async function open(): Promise<{ browser: Browser; page: Page }> {
  const browser = await chromium.launch({ executablePath });
  const context = await browser.newContext({
    viewport: { width: REEL_W, height: REEL_H },
    deviceScaleFactor: REEL_SCALE,
  });
  await context.addInitScript({ path: new URL("./reel-overlay.js", import.meta.url).pathname });
  const page = await context.newPage();
  const target = `${ORIGIN}/studio/cheapest-protein/1/`;
  const landed = await page.goto(target, { waitUntil: "load" }).catch(() => null);
  if (!landed || !landed.ok()) {
    console.error(`Could not reach ${target}.`);
    console.error("This measures captions in the font they are drawn in, which lives on the");
    console.error("app's own pages — so it needs the export built and served:");
    console.error("  npm run build && python3 -m http.server 8899 --directory out &");
    console.error("Set REEL_ORIGIN to point somewhere else.");
    await browser.close();
    process.exit(1);
  }
  // install() is lazy — the overlay builds itself on the first caption.
  await page.evaluate(() => (window as never as { __reelCaption: (s: string) => void }).__reelCaption("x"));

  /** The face actually resolved, not the one the stack asked for. */
  const font = await page.evaluate(() => {
    const el = document.getElementById("__reel_caption")!;
    const want = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim();
    return { want, used: getComputedStyle(el).fontFamily };
  });
  if (!font.want || !font.used.includes(font.want.split(",")[0].replace(/["']/g, ""))) {
    console.error("The caption is not rendering in the app's display face.");
    console.error(`  --font-display: ${font.want || "(missing)"}`);
    console.error(`  resolved to:    ${font.used}`);
    console.error("Measuring line counts in a fallback would report numbers about a font no");
    console.error("reel is drawn in, so this refuses rather than guessing.");
    await browser.close();
    process.exit(1);
  }
  return { browser, page };
}

interface Drawn { lines: number; box: { left: number; right: number; top: number; bottom: number } }

async function draw(page: Page, text: string): Promise<Drawn> {
  await page.evaluate(
    (words) => (window as never as { __reelCaption: (r: unknown) => void }).__reelCaption(words),
    karaokeWords(text, 2_000) as unknown,
  );
  return page.evaluate(() => {
    const el = document.getElementById("__reel_caption")!;
    const r = el.getBoundingClientRect();
    const lh = parseFloat(getComputedStyle(el).lineHeight);
    const bleed = Number(el.dataset.bleed ?? 0);
    const s = Number(document.documentElement.dataset.reelScale ?? 2);
    return {
      lines: lh > 0 ? Math.round(r.height / lh) : 0,
      box: {
        left: (r.left - bleed) * s, right: (r.right + bleed) * s,
        top: (r.top - bleed) * s, bottom: (r.bottom + bleed) * s,
      },
    };
  });
}

const { browser, page } = await open();
await page.evaluate((s) => { document.documentElement.dataset.reelScale = String(s); }, REEL_SCALE);

if (process.argv.includes("--self-test")) {
  /** Long enough that no band could hold it in three lines. */
  const tall = await draw(page, "The cheapest thirty grams of protein you can buy anywhere today is red lentils and it is not remotely close");
  /**
   * "£0.31", and the first attempt at this control is worth recording: it was
   * "Cheapest: £0.31", which measured TWO lines and looked like a broken
   * instrument. Fifteen characters at 26.4px average is 396px in a 412px band
   * — the string sits on the wrap boundary, so it was the control that was
   * wrong, not the reading. A control has to be unambiguous or it teaches you
   * the wrong lesson.
   */
  const short = await draw(page, "£0.31");
  await browser.close();
  const bad: string[] = [];
  if (tall.lines <= MAX_CAPTION_LINES) bad.push(`a ${tall.lines}-line caption was not flagged`);
  if (short.lines > MAX_CAPTION_LINES) bad.push(`a one-line caption was flagged as ${short.lines}`);
  if (short.lines !== 1) bad.push(`"£0.31" measured ${short.lines} lines, not 1`);
  if (outsideSafeZone(short.box).length) bad.push(`a safe caption was called unsafe: ${outsideSafeZone(short.box)}`);
  if (bad.length) {
    console.error("the instrument is wrong, so its readings mean nothing:");
    for (const b of bad) console.error(`  ${b}`);
    process.exit(1);
  }
  console.log(`self-test OK — ${tall.lines} lines flagged, 1 line passed, safe box judged safe`);
  process.exit(0);
}

const problems: string[] = [];
const histogram = new Map<number, number>();
let highest = { top: REEL_H * REEL_SCALE, text: "" };
let total = 0;

for (const meta of SCRIPTS) {
  const script = reelScript(meta.id as ScriptId, "");
  if (!script) continue;
  for (const step of reelPlan(script).steps) {
    for (const caption of step.captions) {
      total += 1;
      const { lines, box } = await draw(page, caption.text);
      histogram.set(lines, (histogram.get(lines) ?? 0) + 1);
      if (box.top < highest.top) highest = { top: box.top, text: caption.text };
      if (lines > MAX_CAPTION_LINES) {
        problems.push(`${meta.id}: ${lines} lines, over the ${MAX_CAPTION_LINES}-line ceiling `
          + `— ${JSON.stringify(caption.text)}`);
      }
      for (const reason of outsideSafeZone(box)) {
        problems.push(`${meta.id}: ${reason} — ${JSON.stringify(caption.text)}`);
      }
    }
  }
}
await browser.close();

const shape = [...histogram.keys()].sort((a, b) => a - b)
  .map((n) => `${n} line${n === 1 ? " " : "s"}: ${histogram.get(n)}`).join("   ");
console.log(`${total} captions across ${SCRIPTS.length} scripts`);
console.log(`  ${shape}`);
console.log(`  tallest block starts ${Math.round(highest.top)}px down a ${REEL_H * REEL_SCALE}px frame `
  + `(${((1 - highest.top / (REEL_H * REEL_SCALE)) * 100).toFixed(0)}% covered) — ${JSON.stringify(highest.text)}`);

if (problems.length) {
  console.error(`\n${problems.length} caption problem(s):`);
  for (const p of problems) console.error(`  ${p}`);
  console.error("\nA caption is cut by length and drawn by width, and only the second one"
    + "\nis what anybody sees. Reword the line, or split it at a comma — see the"
    + "\nnote on the standards script's payoff beat for a worked example.");
  process.exit(1);
}
console.log("\nevery caption fits the frame and the line ceiling");
