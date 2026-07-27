import { test } from "node:test";
import assert from "node:assert/strict";
import { conversion, worstStep, FUNNEL_STEPS, FUNNEL_EVENTS } from "./funnel";

test("conversion is a percentage to one decimal", () => {
  assert.equal(conversion(100, 50), 50);
  assert.equal(conversion(3, 1), 33.3);
  assert.equal(conversion(0, 5), 0, "no denominator means no rate, not Infinity");
  assert.equal(conversion(10, 0), 0);
});

test("every funnel step is a declared event", () => {
  for (const s of FUNNEL_STEPS) {
    assert.ok((FUNNEL_EVENTS as readonly string[]).includes(s.event), `${s.event} isn't a known event`);
  }
});

test("the steps are the conversion story in order", () => {
  const order = FUNNEL_STEPS.map((s) => s.event);
  assert.equal(order[0], "signup");
  assert.equal(order[order.length - 1], "checkout_complete");
});

test("worstStep finds the biggest absolute drop", () => {
  const counts = {
    signup: 100, onboarded: 90, first_check_in: 40, checkout_start: 30, checkout_complete: 25,
  };
  const w = worstStep(counts);
  assert.ok(w);
  assert.equal(w.from, "Onboarded");
  assert.equal(w.to, "Activated");
  assert.equal(w.lost, 50);
});

test("worstStep stays quiet when the sample is too small", () => {
  // Four people changing their mind is not a 75% drop-off worth acting on, and
  // reporting it as one is how you rebuild a funnel around noise.
  assert.equal(worstStep({ signup: 4, onboarded: 1, first_check_in: 1 }), null);
  assert.equal(worstStep({}), null);
});

test("the minimum sample is adjustable for testing a small funnel", () => {
  const w = worstStep({ signup: 10, onboarded: 2, first_check_in: 2, checkout_start: 2, checkout_complete: 2 }, 5);
  assert.ok(w);
  assert.equal(w.lost, 8);
});

test("a perfect funnel reports a drop of zero, not null", () => {
  const w = worstStep({
    signup: 50, onboarded: 50, first_check_in: 50, checkout_start: 50, checkout_complete: 50,
  });
  assert.ok(w);
  assert.equal(w.lost, 0);
  assert.equal(w.rate, 100);
});

test("missing later steps don't crash the calculation", () => {
  const w = worstStep({ signup: 30 });
  assert.ok(w, "should still report the drop from signup to nothing");
  assert.equal(w.lost, 30);
});
