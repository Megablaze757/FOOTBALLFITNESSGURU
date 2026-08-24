import { test } from "node:test";
import assert from "node:assert/strict";
import {
  editWeight, deleteWeight, deleteWarning, weightError, surpriseAgainst,
  MIN_KG, MAX_KG, SURPRISE_KG,
} from "./weight-edit";
import type { Bodyweight } from "./bodyweight";

const weighIn: Bodyweight = { date: "2026-08-20", kg: 80, source: "weigh-in" };
const checkIn: Bodyweight = { date: "2026-08-21", kg: 81, source: "check-in" };
const ME = "user-uuid";
const profile: Bodyweight = { date: null, kg: 79, source: "profile" };

// --- the rule this module exists for ------------------------------------------

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A check-in row holds sleep, soreness, mood, readiness and the session they
 * logged. The obvious implementation of "delete this entry" — delete the row it
 * came from — would silently destroy a day of training history when somebody
 * taps the bin next to a mistyped weight, and they would find out when a streak
 * broke.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("removing a check-in weight nulls it and never deletes the day", () => {
  const plan = deleteWeight(checkIn, ME);
  assert.equal(plan.action, "update");
  assert.equal(plan.action === "update" && plan.table, "daily_check_ins");
  assert.deepEqual(plan.action === "update" && plan.patch, { weight_kg: null });
});

test("no input at all can produce a delete against daily_check_ins", () => {
  const sources: Bodyweight["source"][] = ["check-in", "weigh-in", "profile"];
  for (const source of sources) {
    for (const ctx of [{}, { hasOtherBodyData: true }, { hasOtherBodyData: false }]) {
      const plan = deleteWeight({ date: "2026-08-20", kg: 80, source }, ME, ctx);
      if (plan.action === "delete") {
        assert.equal(plan.table, "body_logs", `a delete was issued against ${plan.table}`);
      }
    }
  }
});

test("a weigh-in row is deleted only when the weight was all it held", () => {
  assert.equal(deleteWeight(weighIn, ME, { hasOtherBodyData: false }).action, "delete");
  assert.equal(deleteWeight(weighIn, ME).action, "delete", "no context means nothing else on it");

  const kept = deleteWeight(weighIn, ME, { hasOtherBodyData: true });
  assert.equal(kept.action, "update", "a body fat reading or a photo keeps the row");
  assert.deepEqual(kept.action === "update" && kept.patch, { weight_kg: null });
});

test("the warning tells them what survives", () => {
  assert.match(deleteWarning(checkIn, ME), /rest of that day's log is kept/i);
  assert.match(deleteWarning(weighIn, ME, { hasOtherBodyData: true }), /body fat and photo.*kept/i);
  assert.match(deleteWarning(weighIn, ME, { hasOtherBodyData: false }), /Removes this weigh-in/i);
});

// --- editing ------------------------------------------------------------------

test("an edit addresses the table the weight actually came from", () => {
  const a = editWeight(weighIn, 79.4, ME);
  assert.equal(a.action === "update" && a.table, "body_logs");
  assert.equal(a.action === "update" && a.dateColumn, "log_date");
  assert.equal(a.action === "update" && a.date, "2026-08-20");

  const b = editWeight(checkIn, 79.4, ME);
  assert.equal(b.action === "update" && b.table, "daily_check_ins");
  assert.equal(b.action === "update" && b.dateColumn, "check_in_date");
});

test("a weight is stored to the tenth, not to fifteen decimal places", () => {
  const plan = editWeight(weighIn, 79.44999, ME);
  assert.deepEqual(plan.action === "update" && plan.patch, { weight_kg: 79.4 });
});

test("the undated profile weight is refused rather than guessed at", () => {
  for (const plan of [editWeight(profile, 80, ME), deleteWeight(profile, ME)]) {
    assert.equal(plan.action, "refuse");
    assert.match(plan.action === "refuse" ? plan.reason : "", /profile/i);
  }
  assert.match(deleteWarning(profile, ME), /profile/i);
});

// --- validation ---------------------------------------------------------------

test("a number that is not a weight is refused with the complaint", () => {
  assert.match(weightError(0) ?? "", /more than zero/i);
  assert.match(weightError(-5) ?? "", /more than zero/i);
  assert.match(weightError(NaN) ?? "", /number/i);
  assert.match(weightError(Infinity) ?? "", /number/i);
  assert.match(weightError(MAX_KG + 1) ?? "", /too high/i);
  assert.equal(weightError(MIN_KG), null);
  assert.equal(weightError(MAX_KG), null);
  assert.equal(weightError(80.5), null);
});

/** The slipped decimal point is the mistake people actually make. */
test("a slipped decimal is caught and the fix is suggested", () => {
  const msg = weightError(8.5);
  assert.match(msg ?? "", /too low/i);
  assert.match(msg ?? "", /85\.0 kg/, "says what they probably meant");
});

test("editWeight refuses before it builds a mutation", () => {
  const plan = editWeight(weighIn, 8.5, ME);
  assert.equal(plan.action, "refuse");
});

/**
 * A confirmation, not a refusal: somebody back after six months off genuinely
 * has moved twelve kilos, and a filter that will not let them say so is worse
 * than one that asks.
 */
test("a big jump asks rather than refuses", () => {
  assert.equal(surpriseAgainst(80, 79), null);
  assert.equal(surpriseAgainst(80, 80 - SURPRISE_KG + 0.1), null);
  assert.match(surpriseAgainst(92, 80) ?? "", /12\.0 kg away/);
  assert.match(surpriseAgainst(92, 80) ?? "", /anyway\?/);
  assert.equal(surpriseAgainst(92, null), null, "the first entry cannot be surprising");
  assert.equal(surpriseAgainst(92, undefined), null);
});

/**
 * RLS scopes these tables to the owner today. It does so because of a policy,
 * and policies get added — body_logs already carries a coach read and has
 * carried an admin read. An update matched on date alone starts editing other
 * people's weights the day one of those is widened.
 */
test("every mutation names the owner as well as the date", () => {
  const plans = [
    editWeight(weighIn, 79, ME),
    editWeight(checkIn, 79, ME),
    deleteWeight(weighIn, ME, { hasOtherBodyData: false }),
    deleteWeight(weighIn, ME, { hasOtherBodyData: true }),
    deleteWeight(checkIn, ME),
  ];
  for (const plan of plans) {
    assert.notEqual(plan.action, "refuse");
    assert.equal(plan.action !== "refuse" ? plan.userId : null, ME);
  }
});

test("no user id means no mutation", () => {
  assert.equal(editWeight(weighIn, 79, "").action, "refuse");
  assert.equal(deleteWeight(weighIn, "").action, "refuse");
});
