import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  TRIALING, TRIAL_ONLY_KINDS, sortNotices, staleReason, subscriptionState, trialIsRunning,
  type SubscriptionState,
} from "./notice-staleness";
import { EMAIL_KINDS } from "./email-kinds";

const code = (src: string) =>
  readFileSync(src, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

const loaded = (stripeStatus: string | null): SubscriptionState => ({ loaded: true, stripeStatus });
const trial = { id: "n1", kind: "trial_ending" };

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * "FREE TRIAL END SOON REMINDERS STILL POPPING UP WHEN USER PAYING CUSTOMER"
 *
 * "Your free trial ends soon — Pro will charge £X unless you cancel", shown to
 * somebody who was charged last week, by the app that charged them, with a
 * Cancel link under it.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a paying customer is never warned about a trial ending", () => {
  assert.ok(staleReason(trial, loaded("active")));
});

test("nor is anyone else whose trial is not running", () => {
  for (const status of ["canceled", "past_due", "unpaid", "incomplete", "paused", null]) {
    assert.ok(
      staleReason(trial, loaded(status)),
      `${status ?? "no subscription"} is not a running trial and the warning was shown anyway`,
    );
  }
});

/** The notice is required by the terms. Hiding it during the trial would be
 *  the opposite bug, and a worse one. */
test("somebody actually on a trial still gets it", () => {
  assert.equal(staleReason(trial, loaded(TRIALING)), null);
});

/**
 * THE RACE THAT WOULD MAKE THIS PERMANENT.
 *
 * The subscription and the notifications load in parallel. Judging before the
 * status arrives would hide a real notice — and hiding marks it read, so it
 * would never come back. The one moment this can be wrong is the one moment it
 * cannot be undone.
 */
test("nothing is judged before the subscription has loaded", () => {
  assert.equal(staleReason(trial, { loaded: false }), null);
  const { show, stale } = sortNotices([trial], { loaded: false });
  assert.deepEqual(show, [trial]);
  assert.deepEqual(stale, []);
});

test("notices that are not about a trial are left alone whatever the status", () => {
  const others = ["general", "coach_request", "billing", "milestone", "workout_reminder", "weekly_summary"];
  for (const kind of others) {
    for (const status of ["active", "trialing", "canceled", null]) {
      assert.equal(staleReason({ id: "x", kind }, loaded(status)), null, `${kind} was hidden on ${status}`);
    }
  }
});

test("sorting keeps every notice on exactly one side, in order", () => {
  const notices = [
    { id: "a", kind: "general" },
    { id: "b", kind: "trial_ending" },
    { id: "c", kind: "billing" },
    { id: "d", kind: "trial_ending" },
  ];
  const { show, stale } = sortNotices(notices, loaded("active"));
  assert.deepEqual(show.map((n) => n.id), ["a", "c"]);
  assert.deepEqual(stale.map((n) => n.id), ["b", "d"]);
  assert.equal(show.length + stale.length, notices.length, "a notice went missing");
});

test("the reason says which rule fired, because this hides billing copy", () => {
  assert.match(staleReason(trial, loaded("active"))!, /paying/);
  assert.match(staleReason(trial, loaded(null))!, /no subscription/);
  assert.match(staleReason(trial, loaded("past_due"))!, /past_due/);
});

/** The kind string has to be one the sender actually uses, or this rule is
 *  guarding a typo and the real notice sails past it. */
test("the kinds this hides are kinds that get sent", () => {
  const known = new Set(EMAIL_KINDS.map((k) => k.id));
  for (const kind of TRIAL_ONLY_KINDS) {
    assert.ok(known.has(kind), `"${kind}" is not a notification kind anything sends`);
  }
  const worker = readFileSync("cloudflare/src/index.ts", "utf8");
  for (const kind of TRIAL_ONLY_KINDS) {
    assert.ok(worker.includes(`kind: "${kind}"`), `nothing in the Worker queues a "${kind}"`);
  }
});

/**
 * A DROPPED REQUEST MUST NOT LOOK LIKE AN ANSWER.
 *
 * "No row" means no subscription. An error means we do not know. Only the
 * first is knowledge — and because hiding a notice also marks it read, reading
 * a network failure as "not on a trial" turns a blip into a permanently
 * suppressed billing notice.
 */
test("a failed subscription read is not the same as having no subscription", () => {
  assert.deepEqual(subscriptionState({ error: new Error("offline") }), { loaded: false });
  assert.deepEqual(subscriptionState({ error: { message: "PGRST116" }, data: null }), { loaded: false });
  assert.deepEqual(subscriptionState(null), { loaded: false });
  assert.deepEqual(subscriptionState(undefined), { loaded: false });

  assert.deepEqual(subscriptionState({ data: null }), { loaded: true, stripeStatus: null });
  assert.deepEqual(subscriptionState({ data: { stripe_status: "active" } }), { loaded: true, stripeStatus: "active" });
  assert.deepEqual(subscriptionState({ data: { stripe_status: null } }), { loaded: true, stripeStatus: null });
});

/**
 * ONE RULE, BOTH SIDES. The Worker clears these when a subscription stops
 * trialing; the client hides the ones already sent. A status the two disagreed
 * about would be one where the sender clears a notice the reader still shows.
 */
test("the sender and the reader use the same definition of a running trial", () => {
  assert.equal(trialIsRunning("trialing"), true);
  for (const status of ["active", "canceled", "past_due", "unpaid", "incomplete", "paused", "", null, undefined]) {
    assert.equal(trialIsRunning(status), false, `${status} was treated as a running trial`);
  }
  // The client's rule is this one, not a copy of it: hiding must agree with
  // clearing for every status, including ones neither list mentions.
  for (const status of ["trialing", "active", "canceled", "past_due", "future_status"]) {
    const hidden = staleReason({ id: "x", kind: "trial_ending" }, { loaded: true, stripeStatus: status }) !== null;
    assert.equal(hidden, !trialIsRunning(status), `hiding and clearing disagree on "${status}"`);
  }
});

// --- the screen has to use it ------------------------------------------------

/**
 * The wiring, pinned rather than exercised.
 *
 * Everything above is pure and properly tested; what is left is four lines of
 * a React effect, and reaching those needs a DOM this project does not carry.
 * Calling `sortNotices` and then rendering the unfiltered list is a change that
 * passes every other test in this file, so these look at the two places the
 * result is USED — not merely at whether the helper is mentioned, which was the
 * first version of this test and which two mutations walked straight through.
 */
test("Home renders the filtered list, not the raw one", () => {
  const src = code("components/Notifications.tsx");
  assert.match(src, /subscriptionState\(/, "it never looks up whether the trial is still running");
  assert.match(src, /from\("subscriptions"\)/, "nothing reads the subscription this decision needs");
  assert.match(src, /sortNotices\(/, "the banner shows whatever the table holds, stale or not");
  assert.match(src, /setItems\(show\)/,
    "sortNotices is called and its answer thrown away — the stale notices still render");
});

test("Home clears what it hides, so the backlog drains", () => {
  const src = code("components/Notifications.tsx");
  // Hiding without marking read means every device re-decides the same rows
  // forever, and the row stays unread in the table behind them.
  assert.match(
    src,
    /from\("notifications"\)\s*\.update\(\{\s*read_at[\s\S]{0,160}?\.in\("id",\s*stale/,
    "stale notices are hidden but never marked read",
  );
});

/**
 * The sender's half. A Worker fix alone cannot reach the rows already out
 * there — that is why the client filters — but leaving them for the client to
 * mop up forever would mean every device re-discovering the same backlog.
 */
test("the Worker clears trial notices when the trial stops running", () => {
  const worker = code("cloudflare/src/index.ts");
  assert.match(worker, /clearTrialNotices/, "nothing clears them at the source");
  assert.match(worker, /trialIsRunning/, "the Worker keeps its own idea of what a running trial is");
  assert.match(worker, /kind=eq\.trial_ending&read_at=is\.null/,
    "it clears more than the stale trial notices, or fewer");
  assert.ok(!/notifications\?[^"`]*method: "DELETE"/.test(worker),
    "the notice is the record that a required warning was given — mark it read, do not delete it");
  assert.match(worker, /async function upsertSub/, "upsertSub is where every Stripe status lands");
  const at = worker.indexOf("async function upsertSub");
  assert.ok(
    worker.slice(at, at + 2600).includes("clearTrialNotices"),
    "the clear is not on the path every subscription status change takes",
  );
});
