import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

const ROOT = new URL("..", import.meta.url).pathname;

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
  // Each family is `name: { key: "#hex", ... }` inside the colors block.
  for (const m of config.matchAll(/\n\s{8}([a-z][a-z0-9]*):\s*\{([^}]*)\}/g)) {
    const shades = [...m[2].matchAll(/(?:^|\s)"?([a-z0-9]+)"?:\s*"#/g)].map((s) => s[1]);
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
  assert.ok(names.includes("readiness"), `theme parse failed — found families: ${names.join(", ")}`);
  assert.ok(families.readiness.has("yellow"), "readiness should define a yellow");

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
