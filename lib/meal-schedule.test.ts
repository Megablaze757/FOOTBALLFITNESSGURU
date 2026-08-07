import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSchedule, skipReason } from "./meal-schedule";
import { planTargets, buildWeek, shoppingList, DEFAULT_PREFS, type BodyStats } from "./meal-plan";

const ATHLETE: BodyStats = {
  sex: "male", age: 22, heightCm: 180, weightKg: 78, activity: "high", goal: "maintain",
};
const week = (notes: string) => buildWeek(planTargets(ATHLETE), 0, DEFAULT_PREFS, parseSchedule(notes));

// --- parsing -----------------------------------------------------------------

test("the exact note that was being ignored", () => {
  const s = parseSchedule("i eat food out on tuesdays");
  assert.equal(s.skips.length, 1);
  assert.deepEqual(s.skips[0], { day: 1, slot: "Dinner", reason: "Eating out" });
  assert.ok(s.summary[0].includes("Tuesday"));
});

test("the eating-out assumption is stated, not hidden", () => {
  // We guess dinner when no meal is named — the athlete must be able to see
  // that guess and correct it.
  assert.match(parseSchedule("eating out on Fridays").summary[0], /eating out/i);
  assert.match(parseSchedule("eating out on Fridays").summary[0], /lunch/i);
});

test("phrasings people actually use", () => {
  for (const note of [
    "I eat out on Tuesdays", "takeaway on tuesday", "we get a takeaway every Tuesday",
    "out for dinner on Tuesdays", "restaurant on tuesdays",
  ]) {
    const s = parseSchedule(note);
    assert.ok(s.skips.some((k) => k.day === 1), note);
  }
});

test("a named meal beats the dinner default", () => {
  const s = parseSchedule("I eat out at lunch on Wednesdays");
  assert.deepEqual(s.skips, [{ day: 2, slot: "Lunch", reason: "Eating out" }]);
});

test("skipping and fasting", () => {
  assert.ok(parseSchedule("I skip breakfast").skips.every((s) => s.slot === "Breakfast"));
  assert.equal(parseSchedule("I skip breakfast").skips.length, 7, "every day when no day is named");
  assert.ok(parseSchedule("I fast until noon").skips.some((s) => s.slot === "Breakfast"));
  assert.equal(parseSchedule("no lunch on Mondays").skips.length, 1);
});

test("weekends and weekdays expand correctly", () => {
  assert.deepEqual(parseSchedule("eating out at weekends").skips.map((s) => s.day), [5, 6]);
  assert.equal(parseSchedule("I skip breakfast on weekdays").skips.length, 5);
});

test("food dislikes are not mistaken for schedule changes", () => {
  // "no dairy" must not wipe out a meal slot — that was the risk in treating
  // any negation as a skip.
  assert.equal(parseSchedule("no dairy, no fish").skips.length, 0);
  assert.equal(parseSchedule("I don't like yoghurt").skips.length, 0);
  assert.equal(parseSchedule("").skips.length, 0);
  assert.equal(parseSchedule(null).skips.length, 0);
});

test("skipReason answers per day and slot", () => {
  const s = parseSchedule("I eat out on Tuesdays");
  assert.equal(skipReason(s, 1, "Dinner"), "Eating out");
  assert.equal(skipReason(s, 1, "Lunch"), null);
  assert.equal(skipReason(s, 0, "Dinner"), null);
});

// --- effect on the plan ------------------------------------------------------

test("no Tuesday dinner is planned, and none is shopped for", () => {
  const w = week("I eat food out on tuesdays");
  const tue = w.find((d) => d.day === "Tuesday")!;
  assert.ok(!tue.meals.some((m) => m.meal.slot === "Dinner"), "Tuesday dinner should not be planned");
  assert.ok(tue.skipped.some((s) => s.slot === "Dinner"), "and it should be shown as eating out");
  // Other days are untouched.
  const wed = w.find((d) => d.day === "Wednesday")!;
  assert.ok(wed.meals.some((m) => m.meal.slot === "Dinner"));
});

test("eating out shrinks the shop rather than the portions", () => {
  const normal = week("");
  const eatingOut = week("I eat out on Tuesdays and Thursdays");
  assert.ok(
    shoppingList(eatingOut).total < shoppingList(normal).total,
    "two fewer dinners should cost less"
  );
  // Breakfast should be the same size — it must not be inflated to cover a
  // restaurant meal we aren't cooking.
  const bScale = (w: ReturnType<typeof week>) =>
    w.find((d) => d.day === "Monday")!.meals.find((m) => m.meal.slot === "Breakfast")!.scale;
  assert.equal(bScale(eatingOut), bScale(normal));
});

test("a skipped day still reports honest macros", () => {
  const tue = week("I eat out on Tuesdays").find((d) => d.day === "Tuesday")!;
  const summed = tue.meals.reduce((n, m) => n + m.macros.kcal, 0);
  assert.ok(Math.abs(summed - tue.macros.kcal) < 1, "day macros should count only what we planned");
});

/**
 * "Tuesdays AND Thursdays" — the way anyone would actually write it.
 *
 * `clauses()` splits on "and", so this arrived as "I eat out on Tuesdays" plus
 * a bare "Thursdays". The second had no eating-out phrase in it and was
 * dropped, so Thursday's dinner was planned, shopped for and cooked anyway —
 * silently, every week. The comma form worked, which is why it went unnoticed.
 */
test("a day list joined by 'and' skips every day in it", () => {
  const s = parseSchedule("I eat out on Tuesdays and Thursdays");
  const days = s.skips.filter((k) => k.slot === "Dinner").map((k) => k.day).sort();
  assert.deepEqual(days, [1, 3], "both days should be skipped");
});

test("'and' works without the word 'on', and for three days", () => {
  assert.deepEqual(
    parseSchedule("eat out Tuesday and Thursday").skips.map((k) => k.day).sort(),
    [1, 3]
  );
  assert.deepEqual(
    parseSchedule("I eat out Mondays, Wednesdays and Fridays").skips.map((k) => k.day).sort(),
    [0, 2, 4]
  );
});

/**
 * The carry-over must be strict. A clause with its own meaning has to keep it,
 * or "I eat out Tuesdays and I skip breakfast" would skip Tuesday's breakfast
 * and dinner both.
 */
test("a clause with its own meaning does not inherit the previous one", () => {
  const s = parseSchedule("I eat out on Tuesdays and I skip breakfast");
  const tueDinner = s.skips.some((k) => k.day === 1 && k.slot === "Dinner");
  assert.ok(tueDinner, "Tuesday dinner should still be skipped");
  // Breakfast is skipped every day, not just Tuesday — it named no day.
  const breakfasts = s.skips.filter((k) => k.slot === "Breakfast").length;
  assert.ok(breakfasts === 0 || breakfasts === 7, `breakfast skipped on ${breakfasts} days`);
});

test("a stray day with no intent anywhere before it changes nothing", () => {
  assert.deepEqual(parseSchedule("Tuesdays and Thursdays").skips, []);
});

/**
 * Cooking two fewer dinners must not cost MORE.
 *
 * It did: the escalating repeat penalty spread a shorter week across more
 * distinct dishes, and the extra ingredients cost more in whole packs than the
 * two dinners saved — £111 against £103. Variety now scales with how many slots
 * there are to amortise a pack over.
 */
test("eating out makes the shop cheaper, not dearer", () => {
  const normal = shoppingList(week(""));
  const out = shoppingList(week("I eat out on Tuesdays and Thursdays"));
  assert.ok(
    out.total < normal.total,
    `eating out twice cost £${out.total.toFixed(2)} against £${normal.total.toFixed(2)} for cooking every night`
  );
});
