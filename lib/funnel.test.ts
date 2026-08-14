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

// --- the event that was never emitted ----------------------------------------

import { readFileSync } from "node:fs";

const LOGIN = readFileSync(new URL("../app/login/page.tsx", import.meta.url), "utf8");
const M0078 = readFileSync(
  new URL("../supabase/migrations/0078_signup_event_server_side.sql", import.meta.url), "utf8");

/**
 * SIGNUP IS RECORDED SERVER-SIDE, AND MUST NOT COME BACK TO THE CLIENT.
 *
 * The original bug: track('signup') sat inside `if (data.session)`. With email
 * confirmation on there is no session at signUp, so it never fired, and the
 * sign-in branch it claimed would catch it records nothing. Every account was
 * missing from the funnel's first step — the denominator for every conversion
 * rate on the report — while onboarding and check-in events arrived normally.
 *
 * It failed silently because track() swallows all errors by design, so there is
 * no runtime signal to rely on. This is the signal.
 */
test("the signup event is emitted by the trigger, not the login page", () => {
  const code = LOGIN.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.ok(!/track\(\s*["']signup["']/.test(code),
    "the login page records signup again — on a confirm-by-email flow there is no " +
    "session there, so it will silently go missing exactly as before");

  // handle_new_user is the one place that runs once per account whatever the
  // auth flow, which is why 0054 put referral attribution there too.
  // Bounded to the function body. Slicing to end-of-file let this assertion
  // pass against the BACKFILL's not-exists further down — the guard reported
  // green with the trigger's own guard deleted, which an injection caught.
  const fnStart = M0078.indexOf("create or replace function public.handle_new_user");
  const fn = M0078.slice(fnStart, M0078.indexOf("$$;", fnStart) + 3);
  assert.ok(fn.length > 400 && !fn.includes("The accounts that already exist"),
    "the function slice is not bounded to handle_new_user");
  assert.match(fn, /insert into public\.funnel_events[\s\S]{0,200}'signup'/,
    "handle_new_user does not emit the signup event");
  assert.match(fn, /not exists[\s\S]{0,160}event = 'signup'/,
    "the insert is unguarded, so a second trigger firing would double-count the account");
});

/**
 * The accounts that already exist have to be repaired too, or the fix only
 * helps from today and every signup so far stays missing — which is the thing
 * actually being reported.
 */
test("the migration backfills accounts that predate the fix", () => {
  const backfill = M0078.slice(M0078.indexOf("--- The accounts that already exist"));
  assert.match(backfill, /from public\.profiles p/, "nothing backfills existing accounts");
  assert.match(backfill, /p\.created_at/,
    "backfilled rows are not dated from the account, so every old signup lands in today's window");
  assert.match(backfill, /not exists/, "the backfill is not idempotent");
  assert.match(backfill, /'backfilled', true/,
    "backfilled rows are indistinguishable from observed ones");
});
