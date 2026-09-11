import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FORMATS, availableFormats, missingFor, formatById, rotate, formatProblems,
  type Asset, type ContentFormat,
} from "./content-formats";

test("the format table is coherent", () => {
  assert.deepEqual(formatProblems(), []);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE WHOLE POINT: SOMETHING MUST BE POSTABLE TODAY.
 *
 * The failure this module exists to prevent is declaring five formats so the
 * engine looks varied, when every one of them needs a camera, a person or
 * footage the project does not have. That is the monotonic output again with
 * more names on it.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("at least one organic format needs nothing we do not have", () => {
  const ready = availableFormats([]).filter((f) => f.channel.includes("organic"));
  assert.ok(ready.length, "every organic format is blocked on an asset we do not have");
});

test("a format blocked on an asset says so rather than being made badly", () => {
  const reaction = formatById("reaction")!;
  assert.deepEqual(missingFor(reaction, []), ["person"]);
  assert.deepEqual(missingFor(reaction, ["person"]), []);
  assert.ok(!availableFormats([]).includes(reaction), "reaction offered without a person");
  assert.ok(availableFormats(["person"]).includes(reaction), "a supplied person does not unlock it");
});

test("the screen tour is kept, and kept out of a cold feed", () => {
  const tour = formatById("screen-tour")!;
  assert.ok(!tour.channel.includes("organic"),
    "the worst-performing format in a cold feed is still aimed at one");
  assert.ok(tour.channel.includes("store") || tour.channel.includes("retarget"),
    "it has a real use and should not have been deleted");
});

test("rotation varies rather than repeating one shape", () => {
  const plan = rotate(6, []);
  assert.equal(plan.length, 6);
  const distinct = new Set(plan.map((f) => f.id));
  assert.ok(distinct.size > 1,
    `a six-post plan uses ${distinct.size} format(s) — that is the monotonic feed`);
  for (let i = 1; i < plan.length; i++) {
    if (distinct.size > 1) {
      assert.notEqual(plan[i].id, plan[i - 1].id, `two ${plan[i].id} posts in a row`);
    }
  }
});

test("more assets unlock more variety", () => {
  const bare = new Set(rotate(6, []).map((f) => f.id)).size;
  const rich = new Set(rotate(6, ["person", "footage"] as Asset[]).map((f) => f.id)).size;
  assert.ok(rich > bare, `a person and footage add nothing: ${bare} formats either way`);
});

test("nothing in a cold feed runs past what a feed finishes", () => {
  for (const f of FORMATS.filter((x) => x.channel.includes("organic"))) {
    assert.ok(f.maxMs <= 60_000, `${f.id} runs to ${f.maxMs}ms`);
    assert.ok(f.minMs >= 6_000, `${f.id} is too short to say anything`);
  }
});

test("every format carries the reason it exists", () => {
  for (const f of FORMATS) {
    assert.ok(f.evidence.length > 40, `${f.id} has no argument behind it`);
    assert.ok(f.note.trim(), `${f.id} has nothing to show in a picker`);
  }
});

/** A table with a duplicate id, an empty band or no reason must be refused. */
test("formatProblems catches a broken table", () => {
  const broken: ContentFormat[] = [
    { id: "a", label: "A", note: "n", channel: [], needs: [], minMs: 9_000, maxMs: 8_000, evidence: "" },
    { id: "a", label: "A", note: "n", channel: ["organic"], needs: ["person"], minMs: 1, maxMs: 2, evidence: "x" },
  ];
  const found = formatProblems(broken);
  assert.ok(found.some((p) => p.includes("share an id")), "duplicate id not caught");
  assert.ok(found.some((p) => p.includes("no channel")), "channel-less format not caught");
  assert.ok(found.some((p) => p.includes("band is empty")), "inverted band not caught");
  assert.ok(found.some((p) => p.includes("no stated reason")), "missing evidence not caught");
  assert.ok(found.some((p) => p.includes("without assets")), "all-blocked table not caught");
});
