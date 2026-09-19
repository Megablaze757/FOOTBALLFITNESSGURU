// =============================================================================
// SIGNING OUT, INCLUDING THE COPY OF THEIR DATA THAT IS STILL ON THE DEVICE.
//
// ═══════════════════════════════════════════════════════════════════════════
// FOUR PLACES SIGNED SOMEBODY OUT AND THEY DID FOUR DIFFERENT AMOUNTS OF IT.
//
//   SuspendedGate      clearAllDrafts + recordChanged("everything")  — correct
//   ProfileForm        clearAllDrafts + recordChanged("profile", "goals")
//   HealthConsentGate  nothing
//   DeleteAccount      nothing
//
// lib/use-async.ts keeps a copy of what every screen loaded, in memory and in
// sessionStorage, for ten minutes. Its own comment sets the rule: "this is a
// copy of someone's training data, and it should not outlive the browsing
// session on a shared device."
//
// Signing out is the moment that rule is being invoked, and sessionStorage
// does not end at sign-out — it ends when the tab does. So on two of the four
// paths the athlete's check-ins, body logs, nutrition and coaching briefing
// stayed readable in the tab they walked away from.
//
// ───────────────────────────────────────────────────────────────────────────
// THE TWO THAT CLEARED NOTHING ARE THE TWO THAT MATTER MOST.
//
// DeleteAccount signs out because the account has just been DELETED. The rows
// are gone from the database and a copy of them remained on the device.
//
// HealthConsentGate signs out somebody who has just DECLINED to have their
// health data held. Leaving a cached copy of exactly that data behind is the
// most direct possible contradiction of what they were asked and answered.
//
// Neither was a leak between accounts — lib/use-async.ts keys athlete data by
// user id, so a different person signing into the same tab reads their own
// empty cache. It is the device it was left on that is the problem.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

import { clearAllDrafts } from "./drafts";
import { invalidate } from "./use-async";

/**
 * What to forget when somebody stops being signed in.
 *
 * ORDER MATTERS AND IS NOT OBVIOUS. The local copies go FIRST, before the
 * session is torn down. A sign-out can navigate, fail, or race a reload; doing
 * the forgetting first means the data is gone even when the rest does not
 * finish, and the worst case is an athlete who is still signed in with a cold
 * cache rather than one who is signed out with a warm one.
 *
 * NOT async. Both calls are synchronous storage work, and making this return a
 * promise would invite a caller to forget to await it — which is the failure
 * this module exists to remove rather than relocate.
 */
export function forgetLocalCopies(userId?: string): void {
  // Drafts live in localStorage and outlive the tab entirely.
  clearAllDrafts(userId);
  // Every cached page, in memory and in sessionStorage. No prefix: a partial
  // clear is what ProfileForm was doing, and it left the journal, the body
  // log and the coaching briefing behind.
  invalidate();
}

/** Minimal shape of the Supabase client, so this module does not import one. */
interface SignsOut {
  auth: { signOut: () => Promise<unknown> };
}

/**
 * Forget the local copies, then end the session.
 *
 * Every place that signs somebody out goes through here, and
 * lib/sign-out.test.ts fails the build if one does not — because the four
 * call sites disagreeing is exactly how two of them came to clear nothing.
 */
export async function signOutAndForget(client: SignsOut, userId?: string): Promise<void> {
  forgetLocalCopies(userId);
  await client.auth.signOut();
}
