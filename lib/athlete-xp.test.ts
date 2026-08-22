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
 *
 * THE FIX IS NOW STRUCTURAL. Home does not show a level at all: it closes on
 * what the week actually did rather than on a bar filling toward a rank, so
 * there is only one screen making the claim and nothing for it to disagree
 * with. The rule this test keeps is the one that outlived the bug — exactly one
 * place computes a level, and it uses every source.
 */
test("one screen computes the level, and it uses every source", () => {
  const home = readFileSync(new URL("../app/(app)/home/page.tsx", import.meta.url), "utf8");
  const rewards = readFileSync(new URL("../app/(app)/rewards/page.tsx", import.meta.url), "utf8");
  const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");

  assert.match(rewards, /fetchXpExtras\(/,
    "Rewards no longer pulls the XP sources that are not row counts — strength tiers and challenges");
  assert.match(code(rewards), /computeXp\(/, "Rewards no longer computes a level");
  assert.ok(!/computeXp\(|levelFor\(|fetchXpExtras\(/.test(code(home)),
    "Home computes a level again — two screens deriving one identity is how they came to disagree");
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
