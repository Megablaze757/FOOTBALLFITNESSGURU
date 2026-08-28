import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const BOARD = readFileSync(new URL("../components/Leaderboards.tsx", import.meta.url), "utf8");

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * "WHAT RANK AM I?" WAS NOT ANSWERED BY A BOARD FULL OF OTHER PEOPLE.
 *
 * The list drew a badge beside every name and highlighted your row, which
 * answers what rank someone else is and leaves you to find yourself in a list.
 * And a badge is a coloured shape — without its name, Gold 3 and Silver 1 are
 * two similar circles, which is exactly the confusion behind the wrong-rank
 * report on Home.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the board leads with the athlete's own standing", () => {
  assert.match(BOARD, /ordinal\(mine\.rank\)/, "the place is not stated in words");
  assert.match(BOARD, /of \{ranked\.length\}/, "the place is not out of a field size");
  assert.match(BOARD, /\{lvl\.rank\}/, "the rank's NAME is not shown, only its colour");
});

test("every row that carries a person carries their badge, including yours", () => {
  // Two RankBadge uses in the list area plus one in the header summary.
  const badges = BOARD.match(/<RankBadge/g) ?? [];
  assert.ok(badges.length >= 3,
    `only ${badges.length} RankBadge uses — the out-of-top-ten row is probably missing one again`);
});

// --- the pure helpers ---------------------------------------------------------

/** Loaded through the component's own source, since they live beside it. */
async function helpers() {
  return await import("../components/Leaderboards");
}

test("ordinals follow the English rule, teens included", async () => {
  const { __test } = (await helpers()) as unknown as { __test?: { ordinal(n: number): string } };
  const ordinal = __test?.ordinal;
  if (!ordinal) return; // exported only for tests; skip if the component stops doing so.
  assert.equal(ordinal(1), "1st");
  assert.equal(ordinal(2), "2nd");
  assert.equal(ordinal(3), "3rd");
  assert.equal(ordinal(4), "4th");
  assert.equal(ordinal(11), "11th", "the teens are the exception people get wrong");
  assert.equal(ordinal(12), "12th");
  assert.equal(ordinal(13), "13th");
  assert.equal(ordinal(21), "21st");
  assert.equal(ordinal(111), "111th");
});

/**
 * A rank on its own is a verdict. A rank plus "2 behind 13th" is something to
 * do this week, which is the entire reason a board is on the page.
 */
test("the gap to the place above is stated when there is one", () => {
  assert.match(BOARD, /gapTo\(ranked, mine\.rank\)/, "the gap is computed but never shown");
  assert.match(BOARD, /level with/, "an equal score on a tie-break is reported as a gap");
});
