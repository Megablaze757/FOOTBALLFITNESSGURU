import { test } from "node:test";
import assert from "node:assert/strict";
import { splitFor, SPLIT_STYLES } from "./hypertrophy";
import { buildProgram } from "./coach";
import { templatesForSport } from "./programs";

const names = (days: number, style: Parameters<typeof splitFor>[1]) => splitFor(days, style).map((d) => d.name);

test("a chosen split is built, whatever the day count", () => {
  assert.deepEqual(names(3, "ppl"), ["Push", "Pull", "Legs"]);
  assert.deepEqual(names(2, "upper_lower"), ["Upper", "Lower"]);
  assert.equal(names(5, "bro").length, 5);
});

test("picking a split beats the day-count default", () => {
  // 4 days would normally mean upper/lower — the athlete asked for PPL.
  const four = names(4, "ppl");
  assert.equal(four[0], "Push");
  assert.equal(four.length, 4);
});

test("running past the cycle repeats it with distinct names", () => {
  const five = names(5, "ppl");
  assert.deepEqual(five.slice(0, 3), ["Push", "Pull", "Legs"]);
  // Second time round is labelled, so the calendar doesn't show two "Push".
  assert.equal(new Set(five).size, five.length, five.join(", "));
});

test("the Arnold split pairs chest with back", () => {
  const day = splitFor(3, "arnold")[0];
  assert.match(day.name, /chest & back/i);
  assert.deepEqual([...day.groups].sort(), ["back", "chest"]);
});

test("a body-part split trains one group a day", () => {
  const split = splitFor(5, "bro");
  assert.equal(split[0].groups.length, 1);
  assert.match(split[0].name, /chest/i);
});

test("auto still picks by day count", () => {
  // Three days is full body under auto now: PPL there trains every muscle once
  // a week, which is where an aesthetics block was losing most of its volume.
  // Somebody who wants PPL at three days can still choose it explicitly — that
  // is what the style picker is for, and the tests above cover it.
  assert.ok(names(3, "auto").every((n) => n.startsWith("Full body")), names(3, "auto").join("/"));
  assert.equal(names(4, "auto")[0], "Upper A");
  assert.deepEqual(names(6, "auto").slice(0, 3), ["Push", "Pull", "Legs"]);
  assert.ok(names(2, "auto").every((n) => n.startsWith("Full body")));
});

test("every offered style produces a usable week", () => {
  for (const s of SPLIT_STYLES) {
    const split = splitFor(s.days, s.id);
    assert.equal(split.length, s.days, `${s.id} wrong length`);
    for (const d of split) {
      assert.ok(d.name.length > 0, `${s.id} has an unnamed day`);
      assert.ok(d.groups.length > 0, `${s.id} day "${d.name}" trains nothing`);
    }
  }
});

test("the gym tiles build the split they advertise", () => {
  for (const t of templatesForSport("gym")) {
    if (!t.style) continue;
    const plan = buildProgram({
      goal: t.goal, painMap: {}, focus: t.focus, sport: "gym",
      daysPerWeek: t.daysPerWeek, style: t.style,
    });
    assert.equal(plan.weeks[0].sessions.length, t.daysPerWeek, `${t.id} wrong session count`);
    const titles = plan.weeks[0].sessions.map((s) => s.title).join(" | ");
    if (t.style === "ppl") assert.match(titles, /Push/);
    if (t.style === "bro") assert.match(titles, /Chest/);
    if (t.style === "arnold") assert.match(titles, /Chest & back/i);
  }
});

test("no template claims someone else's published programme by name", () => {
  // "5/3/1", "Starting Strength" and the like belong to their authors.
  const banned = /5\s*\/\s*3\s*\/\s*1|starting strength|stronglifts|nsuns|smolov|german volume/i;
  for (const sport of ["gym", "weightlifting"] as const) {
    for (const t of templatesForSport(sport)) {
      assert.doesNotMatch(`${t.name} ${t.blurb}`, banned, `${t.id} names a published programme`);
    }
  }
});
