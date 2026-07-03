import { test } from "node:test";
import assert from "node:assert/strict";
import { tierMeets, planFor, PLANS } from "./subscription";

test("tierMeets respects the ranking", () => {
  assert.ok(tierMeets("gold", "silver"));
  assert.ok(tierMeets("silver", "silver"));
  assert.ok(tierMeets("silver", "bronze"));
  assert.ok(!tierMeets("bronze", "silver"));
  assert.ok(!tierMeets("silver", "gold"));
});

test("planFor returns the matching plan, bronze as fallback", () => {
  assert.equal(planFor("gold").name, "Gold");
  assert.equal(planFor("bronze").paid, false);
});

test("only paid plans are marked paid", () => {
  const paid = PLANS.filter((p) => p.paid).map((p) => p.id);
  assert.deepEqual(paid, ["silver", "gold"]);
});
