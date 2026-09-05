// =============================================================================
// A NOTICE THAT WAS TRUE WHEN IT WAS WRITTEN AND IS NOT TRUE NOW.
//
// ═══════════════════════════════════════════════════════════════════════════
// "FREE TRIAL END SOON REMINDERS STILL POPPING UP WHEN USER PAYING CUSTOMER"
//
// The reminder itself is correct and required — we tell people 72 hours before
// a trial converts, with the price and a route to cancel, and the terms say so.
// What was missing is that a notice is a MOMENT, and this one was stored as a
// permanent row: unread notifications are shown until they are dismissed, and
// somebody who reads "your free trial ends soon — Pro will charge £X unless you
// cancel" a week after being charged has been told something false by their own
// billing screen.
//
// Worse than untidy. It reads as "you are about to be charged again", from the
// app that just charged you, and the action it offers is Cancel.
//
// WHY THE CLIENT AND NOT ONLY THE SENDER. The sender can stop writing new ones
// and clear old ones — and does, in upsertSub — but a Worker fix only reaches
// people once the Worker is deployed, and the rows are already out there. This
// runs on every render for everybody, and marks what it hides as read, so the
// backlog drains itself.
//
// NEVER JUDGE WHAT YOU CANNOT SEE. The subscription and the notifications load
// in parallel, so there is a moment where the status is not known yet. Deciding
// during it would hide a legitimate notice — and, because hiding also marks it
// read, would hide it permanently. Hence `loaded`, which makes the unsafe call
// impossible to write by accident rather than merely discouraged.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

/** What the app knows about the viewer's subscription at render time. */
export type SubscriptionState =
  | { loaded: false }
  | { loaded: true; stripeStatus: string | null };

export interface Notice {
  id: string;
  kind: string;
}

/**
 * The Stripe status a trial notice is about.
 *
 * Not "anything except active": a cancelled, past_due or absent subscription is
 * equally not a running trial, and a warning about a trial that ended is as
 * wrong as one about a trial that converted.
 */
export const TRIALING = "trialing";

/** Kinds that are only true while a trial is actually running. */
export const TRIAL_ONLY_KINDS = ["trial_ending"];

/**
 * Is there still a trial for a trial warning to be about?
 *
 * ONE RULE, BOTH SIDES. The Worker clears these notices when a subscription
 * stops trialing and the client hides the ones already out there; if the two
 * disagreed, a status would exist where the sender clears a notice the reader
 * still shows, or the reader shows one the sender has stopped clearing. The
 * Worker imports this rather than repeating it — cloudflare/src/index.ts
 * already imports from ../../lib, so there is no reason for a second copy.
 */
export function trialIsRunning(stripeStatus: string | null | undefined): boolean {
  return stripeStatus === TRIALING;
}

/**
 * What one PostgREST read of `subscriptions` actually told us.
 *
 * `error` and "no row" are different answers and only one of them is
 * knowledge. Treating a dropped request as "not on a trial" would hide a real
 * billing notice — and hiding marks it read, so a network blip becomes
 * permanent. Pure and here rather than inline in the component, because that
 * distinction is the whole risk and it deserves a test.
 */
export function subscriptionState(
  result: { error?: unknown; data?: { stripe_status?: string | null } | null } | null | undefined,
): SubscriptionState {
  if (!result || result.error) return { loaded: false };
  return { loaded: true, stripeStatus: result.data?.stripe_status ?? null };
}

/**
 * Why this notice should not be shown, or null to show it.
 *
 * A string rather than a boolean because it is worth being able to say which
 * rule fired — this hides billing copy, and "it disappeared" is not something
 * anybody should have to guess at from a log.
 */
export function staleReason(notice: Notice, state: SubscriptionState): string | null {
  if (!state.loaded) return null;
  if (!TRIAL_ONLY_KINDS.includes(notice.kind)) return null;
  if (trialIsRunning(state.stripeStatus)) return null;
  if (state.stripeStatus === "active") return "the trial already converted — they are paying";
  if (!state.stripeStatus) return "there is no subscription for this trial to be about";
  return `the subscription is ${state.stripeStatus}, not a running trial`;
}

export interface Sorted<T> {
  /** Show these. */
  show: T[];
  /** Hide these, and mark them read so they do not come back. */
  stale: T[];
}

export function sortNotices<T extends Notice>(notices: readonly T[], state: SubscriptionState): Sorted<T> {
  const show: T[] = [];
  const stale: T[] = [];
  for (const notice of notices) {
    (staleReason(notice, state) === null ? show : stale).push(notice);
  }
  return { show, stale };
}
