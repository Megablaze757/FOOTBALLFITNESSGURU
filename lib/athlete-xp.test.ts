import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeXp, EMPTY_STATS } from "./gamification";
import { EMPTY_XP_EXTRAS } from "./athlete-xp";

/**
 * HOME SAID SILVER 1 WHILE REWARDS SAID GOLD 3 — same athlete, same day.
 *
 * Each page assembled the XP sources that are not simple row counts, and Home
 * missed two: strength tiers (60 XP a rung) and recorded challenge completions.
 * A level is an identity rather than a statistic, so getting it wrong on the
 * first screen somebody opens is worse than getting a chart wrong — they cannot
 * tell which of the app's two claims about them is real.
 */
test("both screens build the level from the same sources", () => {
  const home = readFileSync(new URL("../app/(app)/home/page.tsx", import.meta.url), "utf8");
  const rewards = readFileSync(new URL("../app/(app)/rewards/page.tsx", import.meta.url), "utf8");

  for (const [name, src] of [["home", home], ["rewards", rewards]] as const) {
    assert.match(src, /fetchXpExtras\(/,
      `${name} assembles its own XP sources, so the two can disagree about somebody's level again`);
  }
  // And Home must actually ADD the challenge XP, not merely fetch it.
  assert.match(home, /computeXp\(data!\.stats\) \+ data!\.challengeXp/,
    "home computes XP without the challenge total, which is how it under-reported the level");
});

/**
 * The gap was not cosmetic. Strength alone is 60 XP a rung across nine muscle
 * groups, and a level is a few hundred XP — so a well-ranked athlete was being
 * shown a level or two below the truth.
 */
test("the missing sources are worth real levels", () => {
  const bare = computeXp({ ...EMPTY_STATS, checkIns: 40, trainingSessions: 30 });
  const withStrength = computeXp({
    ...EMPTY_STATS, checkIns: 40, trainingSessions: 30,
    strengthTiers: 14, bestStrengthTier: 3, musclesRanked: 6,
  });
  assert.ok(withStrength > bare, "strength tiers contribute no XP at all");
  assert.ok(withStrength - bare >= 500,
    `strength was worth only ${withStrength - bare} XP — check XP.strengthTier still applies`);
});

test("the extras degrade to zero rather than throwing", () => {
  // A missing challenge_completions table (0075 unapplied) or an offline moment
  // must not take down the home screen.
  for (const [k, v] of Object.entries(EMPTY_XP_EXTRAS)) {
    assert.equal(v, 0, `${k} does not default to zero`);
  }
});
