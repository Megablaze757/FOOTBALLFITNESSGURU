import { test } from "node:test";
import assert from "node:assert/strict";
import { conversion, worstStep, FUNNEL_STEPS, FUNNEL_EVENTS } from "./funnel";

test("conversion is a percentage to one decimal", () => {
  assert.equal(conversion(100, 50), 50);
  assert.equal(conversion(3, 1), 33.3);
  assert.equal(conversion(0, 5), 0, "no denominator means no rate, not Infinity");
  assert.equal(conversion(10, 0), 0);
});

test("every funnel step is a declared event, or a documented derived one", () => {
  // confirmed_email is the one exception and is deliberate: nothing inserts it,
  // funnel_summary derives it from auth.users because confirming an email
  // happens on Supabase's side and the app never sees the moment it does.
  const derived = new Set(["confirmed_email"]);
  for (const s of FUNNEL_STEPS) {
    if (derived.has(s.event)) continue;
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

test("a measured zero is a total drop; a single measured step is not a drop at all", () => {
  // Nobody progressed. funnel_summary emits a row per step precisely so this
  // arrives as an explicit zero, and it is a real finding worth reporting.
  const measured = worstStep({ signup: 30, confirmed_email: 0, onboarded: 0, first_check_in: 0 });
  assert.ok(measured, "an explicit zero at the next step should report the full drop");
  assert.equal(measured.lost, 30);

  // Only one step has data at all. There is no second point to compare against,
  // and inventing one by reading "absent" as zero is what made an unmeasured
  // step look like a catastrophe.
  assert.equal(worstStep({ signup: 30 }), null,
    "one data point cannot produce a drop");
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

// --- the funnel has to compare the same people ---------------------------------

const M0079 = readFileSync(
  new URL("../supabase/migrations/0079_funnel_excludes_beta.sql", import.meta.url), "utf8");
const ONBOARDING = readFileSync(
  new URL("../app/(app)/onboarding/page.tsx", import.meta.url), "utf8");

/**
 * IT MUST BE A COHORT, NOT TWO WINDOWS.
 *
 * funnel_summary used to count events in a time window and group by event, so
 * "signup" was people who signed up in 30 days and "onboarded" was people who
 * onboarded in 30 days — different populations. The report divides one by the
 * other, which meant somebody who signed up in April and onboarded today added
 * to the numerator with no denominator behind them, and the rate could exceed
 * 100%. Verified against real Postgres: that person is now excluded.
 */
test("funnel_summary measures one cohort, not two overlapping windows", () => {
  const fn = M0079.slice(M0079.indexOf("function public.funnel_summary"),
                         M0079.indexOf("function public.funnel_daily"));
  assert.match(fn, /with cohort as \(/, "there is no cohort — the steps are still counted independently");
  assert.match(fn, /e\.event = 'signup'[\s\S]{0,200}created_at >= v_since/,
    "the cohort is not defined by signing up inside the window");
  // Later steps are joined to the cohort and bounded at its own signup, or a
  // stray earlier row credits somebody with a step from a previous life.
  assert.match(fn, /join cohort c on c\.user_id = e\.user_id/,
    "later steps are not restricted to the cohort");
  assert.match(fn, /e\.created_at >= c\.signed_up_at/,
    "a step recorded before the person signed up would still count");
});

test("testers are excluded from every funnel number", () => {
  for (const fn of ["funnel_summary", "funnel_daily", "funnel_timing", "funnel_signup_breakdown"]) {
    const start = M0079.indexOf(`function public.${fn}`);
    assert.ok(start > 0, `${fn} is missing`);
    const body = M0079.slice(start, start + 2600);
    assert.match(body, /not coalesce\(p\.beta, false\)/,
      `${fn} still counts beta testers`);
  }
});

/**
 * The first drop merged three unrelated things. Splitting them is the point:
 * unconfirmed mail is a deliverability problem, a confirmed account that stopped
 * is a screen problem, and an account an hour old is not a loss at all.
 */
test("the first drop is broken down into causes that need different fixes", () => {
  const fn = M0079.slice(M0079.indexOf("function public.funnel_signup_breakdown"));
  assert.match(fn, /email_confirmed_at is not null/, "confirmation state is never read");
  assert.match(fn, /Never confirmed their email/, "no deliverability bucket");
  assert.match(fn, /Confirmed, did not onboard/, "no abandoned-onboarding bucket");
  assert.match(fn, /Still in flight/,
    "recent signups are counted as losses, which makes every rate look worse than it is");
  assert.match(fn, /interval '24 hours'/, "nothing defines how long 'too early to call' is");
});

/** A derived step, and it must not be offered to track(). */
test("confirmed_email is a step but never an insertable event", () => {
  assert.ok(FUNNEL_STEPS.some((s) => s.event === "confirmed_email"),
    "the funnel does not show whether people confirmed their email");
  assert.ok(!(FUNNEL_EVENTS as readonly string[]).includes("confirmed_email"),
    "confirmed_email is in FUNNEL_EVENTS, so track() would offer a name the CHECK constraint rejects");
  // Ordered between signing up and reaching the product, or the step teaches
  // nothing about where the loss is.
  const names = FUNNEL_STEPS.map((s) => s.event);
  assert.ok(names.indexOf("signup") < names.indexOf("confirmed_email"), "confirmed_email is before signup");
  assert.ok(names.indexOf("confirmed_email") < names.indexOf("onboarded"), "confirmed_email is after onboarding");
});

/**
 * SKIPPING IS STILL GETTING THROUGH. The skip button marked the profile
 * onboarded — so the app never asked again — while recording nothing, which
 * counted the person as lost at the exact step being investigated.
 */
test("skipping onboarding is recorded, and marked as a skip", () => {
  const skip = ONBOARDING.slice(ONBOARDING.indexOf("async function skip()"),
                                ONBOARDING.indexOf("return (", ONBOARDING.indexOf("async function skip()")));
  assert.match(skip, /track\(\s*["']onboarded["']/,
    "skipping marks the profile onboarded but records nothing, so it reads as a drop-out");
  assert.match(skip, /skipped:\s*true/,
    "a skip is indistinguishable from a completed onboarding");
});
