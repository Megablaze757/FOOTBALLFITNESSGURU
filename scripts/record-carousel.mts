/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE CAROUSEL, AS PNGs.
 *
 * Instagram reported share rate 0.0% and save rate 0.0% on the reel. Those are
 * the two signals that carry a post past existing followers, and a video earns
 * neither well — nobody saves a video to look something up in the shop.
 *
 * A ranked table of what 30g of protein costs is reference material, and this
 * posts it as reference material. Same data as the site, same prices, one
 * command, no design tool.
 *
 * WHY A BROWSER. Text layout — wrapping, a table that lines up, a long food
 * name that has to shrink rather than overflow — is the one thing a browser
 * does better than any drawing API, and a carousel is almost entirely text.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { carouselSlides, SLIDE_H, SLIDE_W, type Slide } from "../lib/carousel";
import { proteinIndex, indexFacts, REFERENCE_PROTEIN } from "../lib/protein-index";

const outDir = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : "carousel";

const money = (n: number) => `£${n.toFixed(2)}`;

const facts = indexFacts();
if (!facts) {
  console.error("No protein index — nothing to post.");
  process.exit(1);
}

const slides = carouselSlides({
  rows: proteinIndex().map((e, i) => ({
    rank: i + 1,
    name: e.name,
    cost: money(e.cost),
    portion: `${Math.round(e.portion)}${e.unit === "each" ? "" : e.unit}`,
  })),
  spread: `${Math.round(facts.spread)}x`,
  cheapestName: facts.cheapest.name,
  cheapestCost: money(facts.cheapest.cost),
  dearestCost: money(facts.dearest.cost),
});

if (slides.length === 0) {
  console.error("No slides.");
  process.exit(1);
}

/**
 * The look, in one place — and it is the APP'S look.
 *
 * The first version was light, on the reasoning that "the app's public pages
 * are light". That was simply wrong: app/globals.css says "Dark is the default
 * because it always was", and light is opt-in through
 * `prefers-color-scheme: light`. Every page I had looked at was a Playwright
 * screenshot, and Playwright defaults to reporting a light preference — so I
 * had been reading my own recorder's setting as a fact about the product.
 *
 * The colours below are the app's own tokens, not approximations of them.
 * A dark 4:5 slide also holds its own in a feed of white ones.
 */
const CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: rgb(9 9 10); }
  .slide {
    width: ${SLIDE_W}px; height: ${SLIDE_H}px; position: relative;
    /* --surface-base to --surface-raised, the app's own two darkest tokens. */
    background: linear-gradient(170deg, rgb(16 16 17) 0%, rgb(9 9 10) 100%);
    color: rgb(241 245 249); display: flex; flex-direction: column;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    padding: 86px 76px 120px;
  }
  .inner { flex: 1; display: flex; flex-direction: column; justify-content: flex-start; }
  .mid { flex: 1; display: flex; flex-direction: column; justify-content: center; }
  h1 { font-size: 128px; line-height: 0.98; font-weight: 900; letter-spacing: -0.035em; }
  h1.small { font-size: 96px; line-height: 1.02; }
  h2 { font-size: 72px; font-weight: 900; letter-spacing: -0.03em; }
  .sub { margin-top: 34px; font-size: 40px; line-height: 1.3; font-weight: 500; color: rgb(148 163 184); }
  .note { margin-top: 14px; font-size: 32px; font-weight: 600; color: rgb(131 145 166); }
  /* SPREAD TO FILL. Eight rows at their natural height left the bottom third
     of the slide empty, which reads as a slide that ran out rather than one
     that was composed. */
  ul {
    list-style: none; margin-top: 36px; flex: 1;
    display: flex; flex-direction: column; justify-content: space-between;
  }
  li {
    display: flex; align-items: center; gap: 22px;
    padding: 16px 0; border-bottom: 2px solid rgba(255,255,255,0.08); font-size: 40px;
  }
  li:last-child { border-bottom: 0; }
  .rank { width: 62px; font-weight: 800; color: rgb(131 145 166); font-size: 34px; }
  /* WRAPS RATHER THAN TRUNCATES. This was text-overflow: ellipsis, which
     turned "Greek style yoghurt (0% fat)" into "Greek style yoghurt (…" and
     "Tuna chunks in spring water" into "Tuna chunks in spring…" — hiding the
     half of the name that says which product to actually buy, on a post whose
     whole purpose is being useful in a shop. The price column has a fixed
     width, so a second line cannot push it off the slide. */
  .name { flex: 1; font-weight: 700; line-height: 1.08; }
  .portion { font-size: 32px; font-weight: 600; color: rgb(148 163 184); }
  .cost { width: 168px; text-align: right; font-weight: 900; font-variant-numeric: tabular-nums; }
  .swipe, .action {
    /* --accent-400 on --on-accent: the app's own button, not a yellow. */
    font-size: 40px; font-weight: 800; color: rgb(10 10 11);
    background: rgb(227 181 63); align-self: flex-start;
    padding: 20px 34px; border-radius: 999px;
  }
  .action { font-size: 34px; }
  .dots { position: absolute; left: 76px; bottom: 56px; display: flex; gap: 12px; }
  .dots i { width: 14px; height: 14px; border-radius: 999px; background: rgba(255,255,255,0.18); }
  .dots i.on { background: rgb(241 245 249); width: 40px; }
`;

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}),
});
// deviceScaleFactor 1: the slide is already authored at full pixel size, so
// scaling would render a 2160px image the platform only downsamples again.
const context = await browser.newContext({
  viewport: { width: SLIDE_W, height: SLIDE_H },
  deviceScaleFactor: 1,
});
await context.addInitScript({ path: new URL("./carousel-slide.js", import.meta.url).pathname });
const page = await context.newPage();
page.on("pageerror", (e) => console.error(`  page error: ${e.message}`));

mkdirSync(outDir, { recursive: true });
await page.setContent(`<style>${CSS}</style><div id="root"></div>`);

for (const [i, slide] of slides.entries()) {
  await page.evaluate(
    ({ s, n, total }) => {
      const html = (window as never as { __slideHtml: (s: Slide, n: number, t: number) => string })
        .__slideHtml(s as Slide, n, total);
      (document.getElementById("root") as HTMLElement).innerHTML = html;
    },
    { s: slide as unknown as Slide, n: i + 1, total: slides.length },
  );
  // Two frames, so webfonts and layout have settled before the shutter.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const name = `${String(i + 1).padStart(2, "0")}.png`;
  await page.screenshot({ path: join(outDir, name) });
  console.log(`  ${name}  ${slide.kind}`);
}

/** The caption, so the post is ready to publish rather than ready to write. */
writeFileSync(
  join(outDir, "caption.txt"),
  `What ${REFERENCE_PROTEIN}g of protein actually costs in a UK supermarket.\n\n`
  + `${facts.cheapest.name} is the cheapest at ${money(facts.cheapest.cost)}. `
  + `The dearest is ${money(facts.dearest.cost)} — ${Math.round(facts.spread)}x more for the same protein.\n\n`
  + `Save this for your next shop.\n\n`
  + `Every price comes from a real supermarket pack size, not a per-100g estimate. `
  + `All ${facts.count} foods are free on the site.\n`,
);

await context.close();
await browser.close();
console.log(`${slides.length} slides in ${outDir}/`);
