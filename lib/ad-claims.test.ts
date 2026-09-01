import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { claimFindings, blocked, summarise, RULE_IDS, type ClaimFinding } from "./ad-claims";

const of = (text: string) => claimFindings(text);
const rules = (text: string) => of(text).map((f) => f.rule).sort();

test("clean copy about what the product actually is passes", () => {
  for (const copy of [
    "35 high-protein meals under £3 a serving, with the cost of every ingredient worked out.",
    "The cheapest 30g of protein in a UK supermarket this week: red lentils, 31p.",
    "You will get a new week of meals every Sunday, costed to your budget.",
    "Built for amateur athletes eating to a target rather than to a diet.",
    "Every recipe has its macros computed from the same food database the planner shops from.",
  ]) {
    assert.deepEqual(of(copy), [], `flagged clean copy: ${copy}`);
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE COPY A MODEL ACTUALLY WRITES.
 *
 * Every string below is the kind of line that comes back from "write me an ad
 * for a fitness app" — which is the entire reason this file exists. If any of
 * them stops being caught, the filter has become decoration.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the breaches a model reaches for are caught", () => {
  const cases: [string, string][] = [
    ["Lose 10kg in six weeks with our meal plans.", "weight-loss-rate"],
    ["Drop 2 stone by summer.", "weight-loss-rate"],
    ["Shed a stone before Christmas with the plan.", "weight-loss-rate"],
    ["Lose weight in 30 days, no gym needed.", "weight-loss-rate"],
    ["Our meals boost your metabolism all day.", "unauthorised-health-claim"],
    ["The high-protein plan that burns belly fat.", "unauthorised-health-claim"],
    ["A 7-day detox to reset your gut health.", "unauthorised-health-claim"],
    ["Packed with superfoods.", "unauthorised-health-claim"],
    ["Our programme prevents injury in season.", "medical-claim"],
    ["Bulletproof your knees this pre-season.", "medical-claim"],
    ["Doctor-recommended nutrition for athletes.", "medical-claim"],
    ["Results guaranteed or you don't pay.", "guaranteed-outcome"],
    ["You will lose fat on this plan.", "guaranteed-outcome"],
    ["The UK's #1 nutrition app for footballers.", "unsubstantiated-superlative"],
    ["Clinically proven to improve recovery.", "unsubstantiated-superlative"],
    ["The best app for building muscle there is.", "unsubstantiated-superlative"],
    ["Our athletes all lose weight in the first month.", "typical-results"],
    ["Help your teenager slim down for the new season.", "under-18"],
    ["100% free forever, no catch.", "pricing-claim"],
    ["Only 3 spots left at this price.", "false-urgency"],
  ];

  for (const [copy, expected] of cases) {
    const found = rules(copy);
    assert.ok(found.includes(expected),
      `"${copy}" should trip ${expected}, tripped [${found.join(", ")}]`);
  }
});

test("every rule is reachable, so none is decoration", () => {
  const reached = new Set<string>();
  for (const copy of [
    "Lose 10kg in six weeks.", "Boosts your metabolism.", "Prevents injury.",
    "Results guaranteed.", "The UK's #1 app.", "Our athletes all lose weight in a month.",
    "Help your teenager slim down.", "100% free forever.", "Only 3 spots left.",
  ]) {
    for (const f of of(copy)) reached.add(f.rule);
  }
  assert.deepEqual([...reached].sort(), [...RULE_IDS].sort(),
    "a rule in RULES can never fire — either fix its pattern or delete it");
});

test("blocked and review are told apart, because they need different actions", () => {
  assert.ok(blocked(of("Lose 10kg in six weeks.")), "a rate-of-loss claim cannot be sent");
  assert.ok(blocked(of("Detox your body in seven days.")), "an unauthorised health claim cannot be sent");

  // Defensible IF the evidence exists — a person decides, the filter does not.
  const superlative = of("The UK's #1 nutrition app.");
  assert.equal(superlative.length, 1);
  assert.equal(superlative[0].risk, "review");
  assert.ok(!blocked(superlative), "a superlative is a question, not a refusal");

  assert.equal(summarise([]), "no claim problems found");
  assert.equal(summarise(of("Lose 10kg in six weeks. The UK's #1 app.")), "1 blocked, 1 to check");
});

/**
 * A filter that fires on the copy already on the site gets switched off, and a
 * filter that is switched off protects nobody. So it is run over the real
 * marketing pages rather than over sentences chosen to make it look good.
 */
test("the site's own live marketing copy does not trip it", () => {
  const pages = [
    "../app/page.tsx",
    "../app/plans/page.tsx",
    "../components/MarketingShell.tsx",
  ];

  for (const page of pages) {
    const source = readFileSync(new URL(page, import.meta.url), "utf8")
      // Comments explain the rules and quote the phrases they forbid.
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/^\s*\/\/.*$/gm, " ");

    const findings = of(source);
    assert.deepEqual(findings.map((f) => `${f.rule}: "${f.matched}"`), [],
      `${page} trips the claim filter on copy that is already live`);
  }
});

/** The disclaimer you would most want to write must not be read as the claim. */
test("saying you are NOT something is not claiming to be it", () => {
  for (const copy of [
    "This is not a medically supervised programme.",
    "We do not guarantee any particular result.",
    "Nothing here is medical advice.",
  ]) {
    const findings = of(copy).filter((f) => f.rule === "medical-claim");
    assert.deepEqual(findings, [], `a disclaimer was read as a claim: ${copy}`);
  }
});

test("one problem is reported once, however many ways it is phrased", () => {
  const findings = of("Detox and cleanse your body, flush out toxins, a real detox.");
  assert.equal(findings.filter((f) => f.rule === "unauthorised-health-claim").length, 1,
    "three phrasings of one breach should be one finding to fix");
});

test("a finding says what to do about it", () => {
  const [finding] = of("Lose 10kg in six weeks.") as [ClaimFinding];
  assert.equal(finding.rule, "weight-loss-rate");
  assert.equal(finding.risk, "blocked");
  assert.match(finding.why, /CAP 13/, "the reason should name the rule being applied");
  assert.match(finding.matched, /10kg/, "the offending text should be quoted back");
});
