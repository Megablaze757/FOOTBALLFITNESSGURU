import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A TAILWIND CLASS FOR A COLOUR THAT DOES NOT EXIST FAILS SILENTLY.
 *
 * `bg-readiness-amber` produces no rule at all — not a fallback colour, no
 * console warning, nothing. The element simply has no background. It shipped in
 * four places: the dashboard's run-split bar was rendering as an invisible bar,
 * and two pieces of status text had no status colour.
 *
 * The token is `readiness-yellow`. Nothing in the type system covers class
 * strings, so this is the check: every `<family>-<shade>` written against a
 * custom colour family in the theme must be a shade that family actually has.
 *
 * Scoped to the custom families on purpose. Tailwind's own palette is enormous
 * and validating it here would only mean maintaining a copy of it.
 */

// fileURLToPath, not .pathname: on Windows .pathname yields "/C:/Users/...",
// and join() then produces "C:C:Users..." — so every read in this file threw
// ENOENT and the guard silently never ran on a Windows checkout.
const ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * Tailwind's own palette names.
 *
 * The theme OVERRIDES two shades of `slate` — 500 and 600, for contrast — which
 * does not remove the other eight. Treating an override as the full definition
 * flagged `text-slate-400` as undefined, which it very much is not. Only
 * families the theme invents from nothing can be checked exhaustively.
 */
const TAILWIND_PALETTES = new Set([
  "slate", "gray", "zinc", "neutral", "stone", "red", "orange", "amber", "yellow",
  "lime", "green", "emerald", "teal", "cyan", "sky", "blue", "indigo", "violet",
  "purple", "fuchsia", "pink", "rose",
]);

/** The custom colour families and their shades, read from the theme. */
function customFamilies(): Record<string, Set<string>> {
  const config = readFileSync(join(ROOT, "tailwind.config.ts"), "utf8");
  const out: Record<string, Set<string>> = {};
  // Each family is `name: { key: <value>, ... }` inside the colors block, where
  // a value is a hex literal OR `rgb(var(--token) / <alpha-value>)`. Both
  // forms count: the second is what every themed colour became when light mode
  // arrived, and a parser that only knew hex silently found two families out
  // of eight and passed on an assertion about one of them.
  for (const m of config.matchAll(/\n\s{8}"?([a-z][a-z0-9-]*)"?:\s*\{([^}]*)\}/g)) {
    const shades = [...m[2].matchAll(/(?:^|\s)"?([a-zA-Z0-9]+)"?:\s*"(?:#|rgb\()/g)].map((s) => s[1]);
    if (shades.length && !TAILWIND_PALETTES.has(m[1])) out[m[1]] = new Set(shades);
  }
  return out;
}

function sourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const rel = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        walk(rel);
      } else if (/\.tsx?$/.test(e.name)) files.push(rel);
    }
  };
  for (const d of ["app", "components"]) walk(d);
  return files;
}

test("every custom colour class names a shade that exists", () => {
  const families = customFamilies();
  const names = Object.keys(families);
  // Every family invented by this app, named. A parser that quietly finds two
  // of five passes its own assertions and validates nothing — which is what
  // happened when the palette moved from hex to rgb(var(--token)).
  //
  // `sky` and `slate` are Tailwind's own names and are skipped on purpose:
  // extend MERGES, so an undefined shade of those still resolves to a stock
  // colour rather than to nothing. The test below catches that instead.
  for (const family of ["pitch", "gold", "ink", "surface", "readiness"]) {
    assert.ok(names.includes(family),
      `theme parse failed to find "${family}" — found: ${names.join(", ")}`);
  }
  assert.ok(families.readiness.has("yellow"), "readiness should define a yellow");
  assert.ok(families.surface.has("raised"), "surface should define the card layer");

  // bg-, text-, border-, from-, ring-… any utility, and any /opacity suffix.
  const pattern = new RegExp(`\\b[a-z-]+-(${names.join("|")})-([a-z0-9]+)`, "g");
  const bad: string[] = [];

  for (const file of sourceFiles()) {
    const src = readFileSync(join(ROOT, file), "utf8");
    for (const m of src.matchAll(pattern)) {
      const [cls, family, shade] = m;
      // The family name can appear as a plain word too ("readiness-green" in
      // prose); only flag it where it reads as a utility class.
      if (!families[family].has(shade)) bad.push(`${file}: ${cls}`);
    }
  }

  assert.deepEqual(
    [...new Set(bad)], [],
    "these name a colour the theme does not define, so they render as nothing:\n  " +
      [...new Set(bad)].join("\n  ")
  );
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A SHADE THE THEME DOES NOT DEFINE FALLS BACK TO TAILWIND'S FIXED DEFAULT.
 *
 * `theme.extend.colors` MERGES, so `text-slate-950` still resolves — to
 * Tailwind's own near-black, which does not know this app has two themes. It
 * was being used five times as the label on a gold button, which is the same
 * pairing that broke every page in light mode when the gold went dark.
 *
 * Only the tiers lib/theme.ts actually defines are themed. Anything outside
 * them is a colour that will be wrong in one mode and cannot be found by
 * looking at the palette.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("no slate shade outside the themed range is used", () => {
  const themed = new Set(["100", "200", "300", "400", "500", "600"]);
  const offenders: string[] = [];

  for (const file of sourceFiles()) {
    const src = readFileSync(join(ROOT, file), "utf8");
    for (const [cls, shade] of [...src.matchAll(/\b[a-z-]+-slate-(\d+)/g)].map((m) => [m[0], m[1]])) {
      if (!themed.has(shade)) offenders.push(`${file}: ${cls}`);
    }
  }

  assert.deepEqual([...new Set(offenders)], [],
    "these fall through to Tailwind's fixed defaults, which do not flip with the theme:\n  "
      + [...new Set(offenders)].join("\n  "));
});
