import { test } from "node:test";
import assert from "node:assert/strict";
import { hasHowTo as catalogueSays } from "./exercise-match";
import { hasHowTo as howToSays } from "./how-to";
import { EXERCISES } from "./exercises";
import { HOOK_MAX_WORDS as FROM_KINDS } from "./reel-kinds";
import { HOOK_MAX_WORDS as FROM_RETENTION } from "./reel-retention";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THINGS THAT AGREE TODAY AND NOTHING MAKES AGREE TOMORROW.
 *
 * A sweep for duplicated exports across lib/ turned up three kinds of thing.
 * Two of them were bugs and are fixed: MAX_REEL_MS meant ninety seconds in one
 * module and thirty in another, and five modules each wrote their own
 * daysBetween with three different behaviours between them.
 *
 * The third kind is this one — two implementations that happen to agree. That
 * is not a defect and it is not nothing: the agreement is a coincidence held
 * in place by nobody, and the moment it breaks the symptom appears somewhere
 * else entirely.
 *
 * Neither is worth a refactor. Both are worth a test, which is the cheapest
 * thing that turns a coincidence into a rule.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * ───────────────────────────────────────────────────────────────────────────
 * "DOES THIS EXERCISE HAVE A HOW-TO", ASKED TWO WAYS.
 *
 * lib/exercise-match.ts answers from the catalogue: a `hasHowTo` flag, or any
 * coaching cues at all. lib/how-to.ts answers by looking for an actual how-to
 * entry. Both are `(name: string) => boolean`, so the type system cannot tell
 * them apart and a call site gets whichever one its import names.
 *
 * They agree on all 413 exercises today. If they stop, the visible symptom is
 * either a "how to" link that leads nowhere, or a how-to that exists and is
 * never offered — and neither points at the disagreement that caused it.
 * ───────────────────────────────────────────────────────────────────────────
 */
test("both answers to 'does this exercise have a how-to' agree", () => {
  const disagree: string[] = [];
  for (const exercise of EXERCISES as readonly { name: string }[]) {
    const catalogue = catalogueSays(exercise.name);
    const entry = howToSays(exercise.name);
    if (catalogue !== entry) {
      disagree.push(`${exercise.name}: exercise-match=${catalogue}, how-to=${entry}`);
    }
  }

  assert.deepEqual(disagree, [],
    "Two implementations of the same question have drifted. A call site gets\n"
    + "  whichever one its import names, and the symptom shows up as a dead link\n"
    + "  or a missing one rather than as this:\n  " + disagree.join("\n  "));
});

/** A guard over an empty catalogue would pass forever. */
test("there are exercises to compare", () => {
  assert.ok((EXERCISES as readonly unknown[]).length > 100,
    `only ${(EXERCISES as readonly unknown[]).length} exercises — the comparison above proves nothing`);
});

/**
 * ───────────────────────────────────────────────────────────────────────────
 * ONE NUMBER, TWO MODULES, THE SAME VALUE — SO FAR.
 *
 * lib/reel-kinds.ts and lib/reel-retention.ts both export HOOK_MAX_WORDS, both
 * as 10. That is the one duplicated constant in lib/ whose copies agree, which
 * is exactly why lib/constant-collisions.test.ts does not flag it: that guard
 * is about copies with DIFFERENT values.
 *
 * MAX_REEL_MS presumably agreed once too.
 * ───────────────────────────────────────────────────────────────────────────
 */
test("both copies of HOOK_MAX_WORDS are the same number", () => {
  assert.equal(FROM_KINDS, FROM_RETENTION,
    "reel-kinds and reel-retention disagree about how long a hook may be, and a "
    + "script is checked against whichever its import names");
  assert.ok(FROM_KINDS > 0, "a hook limit of zero refuses every hook");
});
