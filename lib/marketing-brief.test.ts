import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allowedNumbers,
  briefBlocked,
  briefPrompt,
  briefProblems,
  factLines,
  gatherFacts,
  parseBrief,
  type BriefDraft,
} from "./marketing-brief";
import { money } from "./protein-index";

const facts = gatherFacts({ newAthletes: 14, waitlist: 62 })!;

/** Built from the real facts, so the fixture cannot drift from the data. */
const clean: BriefDraft = {
  subject: "The cheapest protein in the supermarket",
  email:
    `We costed every ingredient in all ${facts.recipeCount} recipes and then asked a simple question: `
    + `what is the cheapest way to buy ${facts.referenceProtein}g of protein? `
    + `The answer is ${facts.cheapest.name.toLowerCase()}, at ${money(facts.cheapest.cost)}. `
    + `The dearest thing on the list, ${facts.dearest.name.toLowerCase()}, costs ${money(facts.dearest.cost)} `
    + `for the same protein. Nothing else about them differs that much. `
    + `Most people guess the gap is small, and it is not — it changes what a week of eating costs `
    + `more than any other single decision. We publish the whole list, and it updates itself `
    + `whenever a shelf price in the database changes.`,
  social: [
    `${facts.referenceProtein}g of protein from ${facts.cheapest.name.toLowerCase()}: ${money(facts.cheapest.cost)}.`,
    `The same ${facts.referenceProtein}g from ${facts.dearest.name.toLowerCase()}: ${money(facts.dearest.cost)}.`,
    `We costed every ingredient in ${facts.recipeCount} recipes to work that out.`,
  ],
};

test("a brief built from the facts has nothing wrong with it", () => {
  assert.deepEqual(briefProblems(clean, facts), []);
  assert.ok(!briefBlocked(clean));
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE FAILURE THIS WHOLE FILE EXISTS FOR.
 *
 * The one genuinely checkable claim in this post is a price. A model that
 * writes "under 30p" because it reads better than "31p" has taken the only
 * thing that made the post worth publishing and made it false — and unlike a
 * clumsy sentence, nobody reviewing it at a glance will notice.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a price the data does not support is caught", () => {
  const rounded: BriefDraft = { ...clean, social: [...clean.social.slice(1), "Protein for under £0.29 a portion."] };
  const problems = briefProblems(rounded, facts);
  assert.ok(problems.some((p) => p.problem.includes("£0.29 is not a number")),
    problems.map((p) => p.problem).join("; "));

  const pence: BriefDraft = { ...clean, subject: "Protein for 29p" };
  assert.ok(briefProblems(pence, facts).some((p) => p.problem.includes("29p is not a number")));

  // And an invented statistic, not just an invented price.
  const stat: BriefDraft = { ...clean, social: [...clean.social.slice(1), "Used by 40000 athletes every week."] };
  assert.ok(briefProblems(stat, facts).some((p) => p.problem.includes("40000 is not a number")));
});

test("the real numbers pass, in every form they are written", () => {
  const allowed = allowedNumbers(facts);
  assert.ok(allowed.has(facts.cheapest.cost.toFixed(2)), "the cheapest price is not allowed through");
  assert.ok(allowed.has(String(facts.recipeCount)), "the recipe count is not allowed through");
  assert.ok(allowed.has(String(facts.referenceProtein)));

  // A live metric passed in this week is a fact; one that was not is not.
  assert.ok(allowed.has("14"), "a metric given to gatherFacts should be quotable");
  assert.ok(!allowedNumbers(gatherFacts({})!).has("14"),
    "a metric that was NOT supplied must not be quotable");
});

test("small numbers in prose are not treated as statistics", () => {
  const prose: BriefDraft = { ...clean, social: [...clean.social.slice(1), "Three things decide a food shop." ] };
  assert.deepEqual(briefProblems(prose, facts).filter((p) => p.problem.includes("not a number")), []);
});

/** Regulated copy is regulated wherever it appears, subject lines included. */
test("a CAP breach is caught in every field", () => {
  const fields: [keyof BriefDraft, BriefDraft][] = [
    ["subject", { ...clean, subject: "Lose 10kg by summer" }],
    ["email", { ...clean, email: `${clean.email} Our meals boost your metabolism.` }],
    ["social", { ...clean, social: [...clean.social.slice(1), "This plan burns belly fat."] }],
  ];
  for (const [field, draft] of fields) {
    const problems = briefProblems(draft, facts);
    assert.ok(problems.some((p) => p.problem.startsWith("BLOCKED")),
      `a breach in ${field} was not blocked: ${problems.map((p) => p.problem).join("; ")}`);
    assert.ok(briefBlocked(draft), `briefBlocked missed a breach in ${field}`);
  }
});

test("house limits are enforced", () => {
  const check = (draft: Partial<BriefDraft>, needle: string) => {
    const problems = briefProblems({ ...clean, ...draft }, facts);
    assert.ok(problems.some((p) => p.problem.includes(needle)),
      `expected "${needle}", got: ${problems.map((p) => p.problem).join("; ")}`);
  };
  check({ subject: "A subject line long enough that it will be cut off in every inbox it lands in" }, "wanted under 60");
  check({ social: clean.social.slice(0, 2) }, "wanted 3");
  check({ social: [...clean.social.slice(1), "word ".repeat(80)] }, "wanted under 280");
  check({ email: "Too short." }, "wanted roughly 80-150");
});

test("the prompt carries the facts and forbids inventing more", () => {
  const { system, user } = briefPrompt(facts);
  for (const line of factLines(facts)) {
    assert.ok(user.includes(line), `the prompt omits a fact it will be checked against: ${line}`);
  }
  assert.match(system, /ONLY numbers that appear/, "the grounding instruction is gone");
  assert.match(system, /weight loss/i, "the CAP instruction is gone");
  assert.ok(system.includes('{"subject"'), "the reply shape has to be stated to be parseable");
});

test("a reply wrapped in markdown or chat still parses", () => {
  const payload = '{"subject": "s", "email": "e", "social": ["a", "b", "c"]}';
  for (const raw of [payload, "```json\n" + payload + "\n```", "Here you go:\n" + payload]) {
    const draft = parseBrief(raw);
    assert.ok(draft, `did not parse: ${raw.slice(0, 30)}`);
    assert.equal(draft.social.length, 3);
  }
  for (const raw of ["", "no.", "{", '{"subject": "s"}', '{"subject": 1, "email": "e", "social": []}']) {
    assert.equal(parseBrief(raw), null, `should not have parsed: ${raw}`);
  }
});

test("the facts describe the data they came from", () => {
  const lines = factLines(facts);
  assert.ok(lines.some((l) => l.includes(facts.cheapest.name.toLowerCase())));
  assert.ok(lines.some((l) => l.includes(money(facts.cheapest.cost))));
  assert.ok(lines.some((l) => l.includes("14 new athletes")), "a supplied metric is missing");
  assert.ok(!factLines(gatherFacts({})!).some((l) => l.includes("new athletes")),
    "a metric nobody supplied is being stated as fact");
});
