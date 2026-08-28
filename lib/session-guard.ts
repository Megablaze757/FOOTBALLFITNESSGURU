/**
 * Keeping a write alive across an expired session.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE REPORTED BUG: "weights aren't saving after a certain amount of time."
 *
 * It is not a save bug. An access token lasts an hour, and supabase-js refreshes
 * it on a timer — a timer that a backgrounded or frozen mobile tab does not run.
 * Somebody opens the app, starts logging, puts the phone in their pocket between
 * sets, comes back forty minutes later, adds the last lift and presses save.
 * `getUser()` returns null, and the form says "Not signed in."
 *
 * Everything about that is technically correct and it is the worst outcome
 * available: the athlete is looking at a screen full of numbers they just typed,
 * being told they are not signed in, with no way forward that keeps the numbers.
 * They close it. The session was recoverable the whole time — the refresh token
 * in localStorage was valid, nothing had asked it for a new access token.
 *
 * TWO DEFENCES, because either alone leaves a hole:
 *
 *   1. Refresh when the app comes back to the foreground, so the token is fresh
 *      before they press anything. Prevents most of it.
 *   2. Refresh once at the point of the write, and if that fails, treat it
 *      exactly like no signal — queue it on the device and sync later. An
 *      expired session is every bit as recoverable as a basement with no bars,
 *      and losing the entry is the outcome neither should produce.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * Is this the server saying "who are you?" rather than "no".
 *
 * Kept apart from the offline check on purpose: a policy or validation
 * rejection fails identically on every retry, so queueing it would replace a
 * visible error with a sync that never completes. An auth failure is the
 * opposite — it is temporary by nature and the data is worth keeping.
 */
export function isAuthFailure(err: { message?: string; code?: string; status?: number } | null | undefined): boolean {
  if (!err) return false;
  if (err.status === 401 || err.status === 403) return true;
  const code = (err.code ?? "").toLowerCase();
  if (code === "pgrst301" || code === "42501") return true;   // JWT expired / insufficient privilege
  const m = (err.message ?? "").toLowerCase();
  return /jwt expired|jwt is expired|invalid jwt|token is expired|not authenticated|no api key|session (?:from session id )?not found|refresh token/.test(m);
}

/**
 * The signed-in user, refreshing the session once if it looks gone.
 *
 * `getUser()` returning null does NOT mean signed out — on a tab that has been
 * asleep it usually means the access token aged out while nothing was running
 * to renew it. One refresh attempt turns most of those back into a live
 * session; the refresh token itself is good for far longer.
 *
 * Returns null only when the athlete genuinely has to sign in again.
 */
export async function ensureUser(supabase: SupabaseClient): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();
  if (data?.user && !error) return data.user;

  const { data: refreshed } = await supabase.auth.refreshSession();
  return refreshed?.user ?? null;
}

/**
 * What to tell somebody whose session went while they were typing.
 *
 * Never "Not signed in." on its own. The sentence has to say the work is safe,
 * because the athlete's next decision is whether to bother retyping it — and if
 * they believe it is gone, they close the app.
 */
export const SESSION_LOST_KEPT =
  "Your session timed out while this was open. What you typed is saved on this device — sign in again and it will go up automatically.";

export const SESSION_LOST_RETRY =
  "Your session timed out while this was open. Nothing was lost — sign in again and press save.";
