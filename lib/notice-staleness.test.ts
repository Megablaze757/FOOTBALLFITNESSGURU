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

// ═══════════════════════════════════════════════════════════════════════════
// FIVE CARDS SAYING THE SAME THING.
//
// A recorded reel showed the demo account's home screen carrying five
// identical "Your daily log" cards — 20 days since your last log, then 19,
// 18, 17, 16. The Worker writes one a day on purpose and each row is a real
// record; showing all of them is what was wrong.
// ═══════════════════════════════════════════════════════════════════════════

const PAYING: SubscriptionState = { loaded: true, stripeStatus: "active" };

const nag = (id: string, created_at: string, kind = "check_in_reminder") => ({ id, kind, created_at });

test("a standing reminder is shown once, however many times it was sent", () => {
  const { show, stale } = sortNotices(
    [nag("e", "2026-09-05"), nag("d", "2026-09-04"), nag("c", "2026-09-03"),
     nag("b", "2026-09-02"), nag("a", "2026-09-01")],
    PAYING,
  );
  assert.deepEqual(show.map((n) => n.id), ["e"], "the home screen still shows a wall of the same card");
  assert.deepEqual(stale.map((n) => n.id).sort(), ["a", "b", "c", "d"],
    "the superseded ones are hidden without being cleared, so every device re-decides them forever");
});

/** Order is the caller's business, and this must not depend on getting it. */
test("the newest is kept whatever order they arrive in", () => {
  const oldestFirst = sortNotices(
    [nag("a", "2026-09-01"), nag("b", "2026-09-02"), nag("c", "2026-09-03")], PAYING);
  assert.deepEqual(oldestFirst.show.map((n) => n.id), ["c"]);

  const shuffled = sortNotices(
    [nag("b", "2026-09-02"), nag("c", "2026-09-03"), nag("a", "2026-09-01")], PAYING);
  assert.deepEqual(shuffled.show.map((n) => n.id), ["c"]);
});

test("identical timestamps keep exactly one, not two and not none", () => {
  const { show, stale } = sortNotices([nag("a", "2026-09-01"), nag("b", "2026-09-01")], PAYING);
  assert.equal(show.length, 1, `${show.length} shown for a tie`);
  assert.equal(stale.length, 1);
});

test("each recurring kind keeps its own newest, not one between them all", () => {
  const { show } = sortNotices([
    nag("check-new", "2026-09-05"), nag("check-old", "2026-09-01"),
    nag("work-new", "2026-09-04", "workout_reminder"),
    nag("work-old", "2026-09-02", "workout_reminder"),
  ], PAYING);
  assert.deepEqual(show.map((n) => n.id).sort(), ["check-new", "work-new"]);
});

/**
 * The one that must NOT collapse. Two assigned programmes are two pieces of
 * work, and hiding one hides something an athlete is expected to do.
 */
test("distinct events are never collapsed into one another", () => {
  const { show, stale } = sortNotices([
    { id: "p1", kind: "program_assigned", created_at: "2026-09-05" },
    { id: "p2", kind: "program_assigned", created_at: "2026-09-04" },
    { id: "c1", kind: "coach_request", created_at: "2026-09-03" },
    { id: "c2", kind: "coach_request", created_at: "2026-09-02" },
  ], PAYING);
  assert.deepEqual(show.map((n) => n.id), ["p1", "p2", "c1", "c2"]);
  assert.deepEqual(stale, []);
});

/** Collapsing must not resurrect a notice staleness already refused. */
test("a stale notice stays stale even when it is the newest of its kind", () => {
  const { show, stale } = sortNotices([
    { id: "t1", kind: "trial_ending", created_at: "2026-09-05" },
    { id: "t2", kind: "trial_ending", created_at: "2026-09-01" },
  ], PAYING);
  assert.deepEqual(show, [], "a trial-ending notice is showing to somebody who is already paying");
  assert.deepEqual(stale.map((n) => n.id).sort(), ["t1", "t2"]);
});

test("a notice with no timestamp is still shown rather than dropped", () => {
  const { show } = sortNotices([{ id: "x", kind: "check_in_reminder" }], PAYING);
  assert.deepEqual(show.map((n) => n.id), ["x"]);
});

/**
 * The gap the first version of these tests had. "trial_ending" was tested
 * only against a PAYING account, where staleness refuses both notices before
 * collapsing is ever reached — so taking it out of RECURRING_KINDS changed
 * nothing and no test noticed. A running trial is the state where the rule
 * has to do the work.
 */
test("a repeated trial reminder collapses while the trial is still running", () => {
  const running: SubscriptionState = { loaded: true, stripeStatus: TRIALING };
  const { show, stale } = sortNotices([
    { id: "new", kind: "trial_ending", created_at: "2026-09-05" },
    { id: "old", kind: "trial_ending", created_at: "2026-09-02" },
  ], running);
  assert.deepEqual(show.map((n) => n.id), ["new"],
    "two live trial-ending notices are both on the home screen");
  assert.deepEqual(stale.map((n) => n.id), ["old"]);
});

/**
 * The collapse is decided from created_at, so a component that stops asking
 * for it would silently go back to a wall of identical cards — sortNotices
 * would keep the first it met and every test here would still pass, because
 * they all supply the field.
 *
 * Comments are stripped before matching, so a mention in prose cannot satisfy
 * this the way one nearly did elsewhere in this repo.
 */
test("the home screen still fetches what the collapse is decided from", () => {
  const src = code("components/Notifications.tsx");
  assert.match(src, /\.select\([^)]*created_at/, "Notifications no longer selects created_at");
  assert.match(src, /created_at:\s*string/, "the row type dropped created_at");
  assert.match(src, /sortNotices\(/, "the home screen no longer runs notices through sortNotices");
});
