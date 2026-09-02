#!/usr/bin/env node
// =============================================================================
// Photograph the app in both themes, so somebody can look at it.
//
// WHY THIS EXISTS. The contrast tests prove every colour is READABLE. They
// cannot tell you it looks right, and the first light mode passed all of them
// while turning the brand's gold button into a muddy brown — because the one
// token was doing two jobs, a readable label on white and a recognisable gold
// fill, and only the first of those is a ratio.
//
// Nothing here asserts. It writes PNGs to look at, which is the part no test
// was ever going to do.
//
//   npm run build              # the pages come from out/
//   npx serve out -l 4173 &
//   PW_CHROMIUM=... npm run shots
// =============================================================================

import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const OUT = "screenshots";
const BASE = process.env.SHOT_BASE ?? "http://localhost:4173";
const PAGES: [string, string][] = [
  ["landing", "/"],
  ["plans", "/plans/"],
  ["recipes", "/recipes/"],
  ["protein", "/cheapest-protein/"],
  ["collections", "/collections/"],
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });

for (const theme of ["light", "dark"] as const) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  // The same path an athlete takes: the boot script reads this before paint.
  await context.addInitScript((t) => {
    try { localStorage.setItem("pa-theme", t as string); } catch { /* private mode */ }
  }, theme);

  const page = await context.newPage();
  for (const [name, path] of PAGES) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${OUT}/${name}-${theme}.png` });
    console.log(`${OUT}/${name}-${theme}.png`);
  }
  await context.close();
}

await browser.close();
