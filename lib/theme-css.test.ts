import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AA_NORMAL, contrast, ratio } from "./contrast";
import { PALETTES, accentSurfacesOf, cssVariables, withThemeBlock } from "./theme";

const CSS = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE PALETTE EXISTS TWICE AND MUST NOT DIFFER.
 *
 * It has to be TypeScript, so the contrast test can reach it. It has to be
 * CSS, so the browser can. Ninety numbers in two places is a guarantee that
 * one of them is wrong eventually, and the symptom is the worst kind: a colour
 * that passes its own test and ships something else.
 *
 * This already caught one. The variables were written by a one-shot script
 * whose anchor stopped matching after the first run, so a token added later —
 * --on-accent, the one holding every button label — silently never reached the
 * stylesheet while every unit test still passed.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("globals.css carries exactly what the palette says", () => {
  assert.equal(withThemeBlock(CSS), CSS,
    "app/globals.css has drifted from lib/theme.ts — run: node --import tsx scripts/build-theme-css.mts");
});

test("every token in the palette reached the stylesheet", () => {
  for (const [themeName, palette] of Object.entries(PALETTES)) {
    for (const line of cssVariables(palette).split("\n")) {
      const declaration = line.trim();
      assert.ok(CSS.includes(declaration), `${themeName} is missing "${declaration}" from globals.css`);
    }
  }
  // The one that got lost. Named explicitly so a rename cannot quietly drop it.
  assert.match(CSS, /--on-accent:/, "the button-label token is not in the stylesheet");
});

test("an explicit choice beats the system preference", () => {
  const media = CSS.indexOf("@media (prefers-color-scheme: light)");
  const explicit = CSS.indexOf(':root[data-theme="light"]');
  assert.ok(media > 0 && explicit > media,
    "the data-theme rules come before the media query, so choosing dark on a light phone would not stick");
  assert.match(CSS, /:root:not\(\[data-theme="dark"\]\)/,
    "the media query does not exclude an explicit dark choice, so it would override it");
});

/**
 * The label on a bright accent is the pairing that broke first, and it broke on
 * every page at once: dark text stayed dark while the gold beneath it had to go
 * dark for light mode.
 */
test("button labels are readable on every accent they sit on", () => {
  const failures: string[] = [];
  for (const [themeName, palette] of Object.entries(PALETTES)) {
    for (const surface of accentSurfacesOf(palette)) {
      const r = contrast(palette.onAccent, surface.colour);
      if (r < AA_NORMAL) {
        failures.push(`${themeName}: label ${palette.onAccent} on ${surface.name} ${surface.colour} = ${ratio(r)}`);
      }
    }
  }
  assert.deepEqual(failures, [], `button text below AA:\n  ${failures.join("\n  ")}`);
});

/** color-scheme drives the native form controls and the scrollbar. */
test("the browser is told which scheme it is rendering", () => {
  assert.match(CSS, /:root\s*\{\s*color-scheme: dark;/);
  assert.ok((CSS.match(/color-scheme: light;/g) ?? []).length >= 2,
    "light needs color-scheme on both the media query and the explicit choice");
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OPACITY ON ACCENT TEXT DOES NOT SURVIVE A THEME FLIP.
 *
 * `text-pitch-400/60` was a deliberately dimmed gold and it measured 4.23 on
 * the dark page — fine for the large decorative numerals it was used on. The
 * same utility in light mode is 2.67, which fails even the 3:1 large-text bar,
 * because dimming a colour towards a WHITE page moves it the wrong way.
 *
 * There is no way to write one opacity that is right in both directions. The
 * palette already carries dimmer tiers — pitch-500 is duller than pitch-400 in
 * dark AND darker in light — so the tier is the answer and the modifier is the
 * bug. Backgrounds and borders are unaffected: nobody has to read those.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("no accent text is dimmed with an opacity modifier", async () => {
  const { readdirSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) return walk(full);
      return full.endsWith(".tsx") ? [full] : [];
    });

  const offenders: string[] = [];
  for (const file of [...walk("app"), ...walk("components")]) {
    const source = readFileSync(file, "utf8");
    for (const [, match] of source.matchAll(/(text-(?:pitch|sky|readiness)-[a-z0-9]+\/\d+)/g)) {
      offenders.push(`${file}: ${match}`);
    }
  }

  assert.deepEqual(offenders, [],
    `accent text dimmed with opacity — use a dimmer tier instead:\n  ${offenders.join("\n  ")}`);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GOLD TEXT AND GOLD FILLS ARE TWO TOKENS, AND HAVE TO STAY TWO.
 *
 * The first light mode darkened `pitch` so that `text-pitch-400` would pass on
 * white. It did — and turned every gold button muddy brown, because the same
 * token paints the fill. Every contrast test passed while the brand was gone,
 * which is precisely the failure a ratio cannot see.
 *
 * `pitch` is the fill and is identical in both themes. `accent` is the text
 * and darkens. Using `text-pitch-*` puts the bright fill gold on a white page
 * at about 1.9:1.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("gold text uses the text token, never the fill token", async () => {
  const { readdirSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) return walk(full);
      return /\.(tsx|css)$/.test(full) ? [full] : [];
    });

  const offenders: string[] = [];
  for (const file of [...walk("app"), ...walk("components")]) {
    for (const [, match] of readFileSync(file, "utf8").matchAll(/(text-(?:pitch|gold)-[a-z0-9]+)/g)) {
      offenders.push(`${file}: ${match}`);
    }
  }

  assert.deepEqual(offenders, [],
    `gold text must use accent-*, which darkens for light mode:\n  ${offenders.join("\n  ")}`);

  // And the split has to be real — identical values would mean it never happened.
  assert.notEqual(PALETTES.light.accent[400], PALETTES.light.pitch[400],
    "the text and fill golds are the same colour in light mode — the split is decorative");
  assert.equal(PALETTES.dark.accent[400], PALETTES.dark.pitch[400],
    "dark mode has no reason to differ, and differing would be an accident");
});
