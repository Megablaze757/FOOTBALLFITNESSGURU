/**
 * Render the launch email and measure it at phone width.
 *
 * WHY. The email is read in an inbox on a phone, and nothing about reading its
 * source tells you where the button lands on that screen. The first version of
 * the rewritten email put the primary call to action 855px down — roughly two
 * swipes past where people stop — and that was invisible until it was rendered
 * and measured. It now sits at 322px, which is what this script is for.
 *
 * NOT A TEST. It prints numbers and writes a screenshot; judging the result is
 * a human job. It exists because "open it and look" is the only check that
 * catches an email that is technically correct and visually wrong, and the
 * assertions in lib/launch-announce.test.ts cannot see layout at all.
 *
 *   npx tsx scripts/preview-email.mjs
 *   npx tsx scripts/preview-email.mjs --width 320 --out /tmp/email.png
 */
import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

import { launchEmail } from "../supabase/functions/announce-launch/email.ts";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

// 390px is an iPhone 14/15. 320 is the narrowest phone still in use, and the
// place a stat row or a chip strip breaks first.
const width = Number(arg("width", 390));
const out = arg("out", join(tmpdir(), "launch-email.png"));

const mail = launchEmail({
  appUrl: "https://pocketathlete.com",
  // A real affiliate code, so the CTA carries the ?ref= it would in a live send.
  ref: "TOBI",
  unsubscribeUrl: "https://pocketathlete.com/unsubscribe?t=preview",
});

const html = join(tmpdir(), "launch-email.html");
writeFileSync(html, mail.html);

// Prefer whatever Playwright installed; fall back to the preinstalled browser
// some environments ship, so this runs without a 300MB download first.
const preinstalled = "/opt/pw-browsers/chromium";
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || (existsSync(preinstalled) ? preinstalled : undefined),
});
const page = await browser.newPage({ viewport: { width, height: 1400 }, deviceScaleFactor: 2 });
await page.goto(`file://${html}`, { waitUntil: "networkidle" });

const height = await page.evaluate(() => document.body.scrollHeight);

// Where the first call to action lands is the number that matters. A phone mail
// app shows roughly the first 600-700px, so anything past that is a button most
// readers never see.
const ctaTop = await page.evaluate(() => {
  const a = document.querySelector("a[href*='pocketathlete.com']");
  return a ? Math.round(a.getBoundingClientRect().top + window.scrollY) : null;
});

await page.screenshot({ path: out, fullPage: true });
await browser.close();

console.log(`subject   ${mail.subject}  (${mail.subject.length} chars)`);
console.log(`width     ${width}px`);
console.log(`height    ${height}px`);
console.log(`first CTA ${ctaTop === null ? "NOT FOUND" : `${ctaTop}px`}${
  ctaTop !== null && ctaTop > 650 ? "  <-- below the fold on a phone" : ""
}`);
console.log(`screenshot ${out}`);
