import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TWO MODULES, ONE NAME, DIFFERENT NUMBERS — AND NOTHING SAID SO.
 *
 * lib/reel.ts exported MAX_REEL_MS = 90_000, "Instagram wants a reel between
 * 3 and 90 seconds". lib/reel-retention.ts exported MAX_REEL_MS = 30_000,
 * "past this, completion falls away and the algorithm stops promoting". Both
 * are correct about their own question, and the name answered neither.
 *
 * lib/reel-script.ts — the module that WRITES the scripts — refused anything
 * "over the ceiling" and imported the ceiling from the first one. So the
 * generator's real limit was ninety seconds while every measurement tool and
 * every piece of reasoning in the project said thirty. A script three times
 * too long to be promoted passed the generator's own check and would have
 * been caught only by scripts/measure-reel.mts, after it was filmed.
 *
 * The import line is the only place the difference is visible, and an import
 * line is the last thing anybody reads.
 *
 * MIN_REEL_MS had the same collision between the same two modules, 3s against
 * 6s, and the same silence around it.
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface Export { file: string; value: string }

/**
 * Every exported numeric constant in lib/, by name.
 *
 * NUMBERS ONLY, and deliberately: a string or an object exported twice under
 * one name is usually two unrelated things in two unrelated domains, where a
 * number under a shared name reads as one measurement and silently is not.
 */
function numericExports(): Map<string, Export[]> {
  const out = new Map<string, Export[]>();
  const files = readdirSync("lib")
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

  for (const file of files) {
    const src = readFileSync(`lib/${file}`, "utf8");
    for (const m of src.matchAll(/^export const ([A-Z][A-Z0-9_]*)\s*(?::[^=]+)?=\s*([^;\n]+);/gm)) {
      const [, name, raw] = m;
      const value = raw.trim();
      // A literal number, with or without the underscore separators this
      // codebase uses. Anything computed is left alone: a derived value is
      // supposed to track whatever it derives from.
      if (!/^-?[\d_]+(\.\d+)?$/.test(value)) continue;
      out.set(name, [...(out.get(name) ?? []), { file, value }]);
    }
  }
  return out;
}

/**
 * Collisions that are allowed, each with the reason it is not the bug above.
 *
 * NAMED RATHER THAN TOLERATED. An allowance with no reason beside it is how a
 * guard stops being one — somebody adds a name to a list to make a test quiet
 * and the next reader cannot tell which entries were thought about.
 */
const ALLOWED: Record<string, string> = {
  /**
   * An article's meta description and a submitted exercise's description are
   * different fields in different domains, and no module imports both. The
   * collision that mattered was between two constants about THE SAME THING.
   */
  DESCRIPTION_MAX: "article meta description (160) vs an exercise's body (2000) — unrelated fields",
  /** How many gaps make a content gap, against how close a session milestone is. */
  NEARLY: "content-gaps counts topics (4); win-back counts sessions short of a milestone (5)",
};

test("no two modules export the same numeric constant with different values", () => {
  const problems: string[] = [];

  for (const [name, entries] of numericExports()) {
    if (entries.length < 2) continue;
    const values = new Set(entries.map((e) => e.value.replace(/_/g, "")));
    if (values.size < 2) continue;

    if (ALLOWED[name]) continue;
    problems.push(
      `${name} is exported with different values by `
      + entries.map((e) => `${e.file} (${e.value})`).join(" and ")
      + " — an importer gets whichever one its import line happens to name",
    );
  }

  assert.deepEqual(problems, [],
    `Two constants sharing a name is only visible on the import line, which is `
    + `the last thing anybody reads.\n  ${problems.join("\n  ")}`);
});

/**
 * An allowance for a collision that no longer exists is clutter that reads as
 * a known hazard. If somebody reconciles DESCRIPTION_MAX, this says so.
 */
test("every documented exception is still a real collision", () => {
  const found = numericExports();
  for (const name of Object.keys(ALLOWED)) {
    const entries = found.get(name) ?? [];
    const values = new Set(entries.map((e) => e.value.replace(/_/g, "")));
    assert.ok(values.size >= 2,
      `${name} is on the allowed list but is no longer a collision — remove the exception`);
  }
});

/**
 * The check on the check. A scan that matches nothing passes forever, and this
 * one is a regex over source text, which is exactly the kind that quietly
 * stops matching when a formatting convention changes.
 */
test("the scan actually finds the constants it is scanning for", () => {
  const found = numericExports();
  assert.ok(found.size > 50, `only ${found.size} exported numeric constants found — the scan is not working`);

  // Three that are certain to exist, from three different modules.
  for (const [name, file] of [
    ["MAX_REEL_MS", "reel-retention.ts"],
    ["PLATFORM_MAX_REEL_MS", "reel.ts"],
    ["SKELETON_MIN_PX", "reel-paint.ts"],
  ] as const) {
    const entries = found.get(name) ?? [];
    assert.ok(entries.some((e) => e.file === file), `${name} was not found in ${file}`);
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AND THE SPECIFIC ONE, PINNED.
 *
 * The general check above would pass if somebody renamed the platform limit
 * back to MAX_REEL_MS in a module that nothing imports it from. This is about
 * the consumer that actually got it wrong.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the script builder measures itself against the retention ceiling", async () => {
  const src = readFileSync("lib/reel-script.ts", "utf8");
  assert.match(src, /import \{ MAX_REEL_MS \} from "\.\/reel-retention"/,
    "reel-script.ts takes its ceiling from somewhere else again");
  /**
   * ANCHORED TO AN ACTUAL IMPORT LINE. Written without the `^import` this
   * matched the COMMENT above the import — the one explaining that the
   * platform limit is the wrong ceiling — and failed on the file that had
   * just been fixed.
   *
   * That is the third time in this session a guard has matched prose instead
   * of syntax: /SERVICE_ROLE/i tripped over a comment saying a workflow does
   * not take one, and an identity check tripped over the English word
   * "email". A test that reads source text has to say which construct it
   * means, every time.
   */
  assert.doesNotMatch(src, /^import[^\n]*MAX_REEL_MS[^\n]*from "\.\/reel"/m,
    "reel-script.ts is back on the platform limit, which is three times the real one");

  const { MAX_REEL_MS } = await import("./reel-retention");
  const { PLATFORM_MAX_REEL_MS } = await import("./reel");
  assert.ok(MAX_REEL_MS < PLATFORM_MAX_REEL_MS,
    "the project's ceiling is no longer inside the platform's, which makes one of them wrong");
});
