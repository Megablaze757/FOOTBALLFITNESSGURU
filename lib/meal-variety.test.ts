import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planTargets, buildWeek, shoppingList, mealMacros, DEFAULT_PREFS,
  type BodyStats, type MealPrefs, type PlannedDay,
} from "./meal-plan";

/**
 * WEEK-ON-WEEK VARIETY.
 *
 * The complaint was that the plan never changed, and it was exactly true: the
 * `seed` argument shifted a tie-break worth a tenth of a penny against terms
 * weighted 4, 8 and 35, so every seed produced the byte-identical week and
 * "Regenerate week" had never once worked. These tests pin the fix and, more
 * importantly, pin its price — variety that quietly costs protein is worse
 * than no variety at all.
 */

const ATHLETES: BodyStats[] = [
  { sex: "male", age: 22, heightCm: 180, weightKg: 78, activity: "high", goal: "maintain" },
  { sex: "female", age: 28, heightCm: 165, weightKg: 60, activity: "moderate", goal: "cut" },
  { sex: "male", age: 35, heightCm: 190, weightKg: 95, activity: "high", goal: "build" },
];
const prefs = (p: Partial<MealPrefs> = {}): MealPrefs => ({ ...DEFAULT_PREFS, ...p });
const idsOf = (w: PlannedDay[]) => w.flatMap((d) => d.meals.map((m) => m.meal.id));

test("a second week differs from the first", () => {
  const rates: { who: string; rate: number }[] = [];
  for (const body of ATHLETES) {
    for (const pattern of ["omnivore", "pescatarian", "vegetarian", "vegan"] as const) {
      const t = planTargets(body);
      const p = prefs({ pattern });
      const first = idsOf(buildWeek(t, 0, p));
      const second = idsOf(buildWeek(t, 0, p, undefined, {}, first));
      const changed = second.filter((id, i) => id !== first[i]).length;
      rates.push({ who: `${body.goal}/${pattern}`, rate: changed / second.length });
    }
  }

  // Nobody gets handed the identical week twice. The floor is low on purpose:
  // a VEGAN CUTTING is the hardest athlete in the app to feed — 1,690 kcal at
  // 0.078g of protein per calorie, with no animal products — and only tofu,
  // edamame and pea protein clear that density. Lentils and chickpeas top out
  // near 0.071. Their week moves by about a tenth and the honest fix is more
  // lean vegan recipes, not a looser rule.
  for (const r of rates) {
    assert.ok(r.rate > 0.05, `${r.who}: only ${Math.round(r.rate * 100)}% of the week changed`);
  }

  // And for everyone else it should be most of the week, not a token slot.
  const avg = rates.reduce((s, r) => s + r.rate, 0) / rates.length;
  assert.ok(avg > 0.5, `average week-on-week change was only ${Math.round(avg * 100)}%`);
});

/**
 * The thing that makes it a fix rather than a regression.
 *
 * Two earlier attempts bought variety with protein, because pounds of
 * tolerance buy protein shortfall more cheaply than they buy anything else.
 * The worst day went from bang on target to 15.7% short. An athlete told to
 * eat 180g and planned 152g so the menu looks fresh has been quietly failed.
 */
test("variety never comes out of the protein target", () => {
  for (const body of ATHLETES) {
    const t = planTargets(body);
    const baseline = buildWeek(t, 0, prefs());
    const varied = buildWeek(t, 0, prefs(), undefined, {}, idsOf(baseline));

    const shortest = (week: PlannedDay[]) => Math.min(...week.map((d) =>
      d.meals.reduce((s, m) => s + mealMacros(m.meal).protein * m.scale, 0)));

    const before = shortest(baseline);
    const after = shortest(varied);
    // A couple of grams of drift is portion rounding. A slide is the bug.
    assert.ok(
      after >= before - 3,
      `${body.goal}: worst day's protein fell from ${Math.round(before)}g to ${Math.round(after)}g for variety`
    );
  }
});

/**
 * A fresh dish drags a new pack in behind it, so some rise is the honest price
 * of variety. This pins how much.
 *
 * Measured over FIVE CONSECUTIVE WEEKS rather than week one against week two,
 * which is the comparison that matters and also the only fair one. Week one is
 * cost-optimal by construction — nothing has been bought yet, so it has no
 * repeat cost to pay and every later week looks dear beside it. Judged that
 * way the rise reads 15%; judged as what the athlete actually spends week
 * after week, it is about 5%.
 */
test("variety doesn't quietly inflate the shopping bill", () => {
  for (const body of ATHLETES) {
    const t = planTargets(body);
    const fixed = shoppingList(buildWeek(t, 0, prefs())).total;

    let recent: string[] = [];
    const totals: number[] = [];
    for (let wk = 0; wk < 5; wk++) {
      const week = buildWeek(t, wk, prefs(), undefined, {}, recent);
      totals.push(shoppingList(week).total);
      recent = idsOf(week);
    }
    // 15% rather than the 5% an average athlete pays, because a LEAN ATHLETE
    // CUTTING pays the most for variety and can't not: their whole shop is £84,
    // and the lean proteins a cut runs on — chicken, tuna, prawns, cottage
    // cheese — come in small packs, so every new dish is a whole new pack
    // rather than a slice off one already in the trolley. Budget mode turns
    // this off entirely for anyone who would rather have the money.
    const avg = totals.reduce((s, v) => s + v, 0) / totals.length;
    assert.ok(
      avg <= fixed * 1.15,
      `${body.goal}: averaged £${avg.toFixed(2)} a week against £${fixed} for the same food every week`
    );
  }
});

/**
 * The narrow-diet case, which is where a variety rule turns into a bug.
 *
 * A vegan avoiding gluten and soy has a handful of options per slot. If
 * "served last week" were a ban rather than a cost, week two would come back
 * with empty days. It has to degrade to repeating rather than to starving.
 */
test("a narrow diet still gets a full week when everything was served last week", () => {
  const t = planTargets(ATHLETES[0]);
  const narrow = prefs({ pattern: "vegan", avoid: ["gluten", "soy"] });
  const first = buildWeek(t, 0, narrow);
  // Every single meal in the book counted as "had it last week".
  const everything = idsOf(first).concat(idsOf(first)).concat(idsOf(first));
  const second = buildWeek(t, 0, narrow, undefined, {}, everything);

  assert.equal(second.length, first.length);
  for (const d of second) {
    assert.equal(d.meals.length, narrow.mealsPerDay, `${d.day} came back short`);
  }
});

test("the same inputs still give back the same week", () => {
  // Persistence depends on this: the plan is rebuilt from the saved seed on
  // every visit, and a shopping list you've started buying against must not
  // change under you.
  const t = planTargets(ATHLETES[0]);
  const recent = idsOf(buildWeek(t, 0, prefs()));
  assert.deepEqual(
    idsOf(buildWeek(t, 4, prefs(), undefined, {}, recent)),
    idsOf(buildWeek(t, 4, prefs(), undefined, {}, recent))
  );
});
