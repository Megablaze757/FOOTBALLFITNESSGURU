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

async function open(): Promise<{ browser: Browser; page: Page }> {
  const browser = await chromium.launch({ executablePath });
  const context = await browser.newContext({
    viewport: { width: REEL_W, height: REEL_H },
    deviceScaleFactor: REEL_SCALE,
  });
  await context.addInitScript({ path: new URL("./reel-overlay.js", import.meta.url).pathname });
  const page = await context.newPage();
  await page.setContent("<body style='margin:0;height:3000px;background:#111'></body>");
  // install() is lazy — the overlay builds itself on the first caption.
  await page.evaluate(() => (window as never as { __reelCaption: (s: string) => void }).__reelCaption("x"));
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
