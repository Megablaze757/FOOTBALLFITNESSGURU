import { test } from "node:test";
import assert from "node:assert/strict";
import { isAuthFailure, SESSION_LOST_KEPT, SESSION_LOST_RETRY } from "./session-guard";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * "Weights aren't saving after a certain amount of time" is a session that aged
 * out in a pocket between sets. The access token lasts an hour and supabase-js
 * renews it on a timer that a frozen mobile tab does not run.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the shapes an expired session actually arrives in", () => {
  for (const err of [
    { status: 401 },
    { status: 403 },
    { code: "PGRST301" },
    { code: "42501" },
    { message: "JWT expired" },
    { message: "invalid JWT: unable to parse or verify signature" },
    { message: "Token is expired" },
    { message: "Not authenticated" },
    { message: "Invalid Refresh Token: Refresh Token Not Found" },
    { message: "Session not found" },
  ]) {
    assert.equal(isAuthFailure(err), true, JSON.stringify(err));
  }
});

/**
 * A policy or validation rejection fails identically on every retry, so
 * queueing it would replace a visible error with a sync that never completes.
 * Only genuinely temporary failures may be kept for later.
 */
test("a real rejection is not mistaken for an expired session", () => {
  for (const err of [
    null,
    undefined,
    {},
    { message: "duplicate key value violates unique constraint" },
    { message: "new row violates row-level security policy" },
    { code: "23505" },
    { status: 400 },
    { status: 500 },
    { message: "Failed to fetch" },                       // offline, handled elsewhere
    { message: "value too long for type character varying(80)" },
  ]) {
    assert.equal(isAuthFailure(err as never), false, JSON.stringify(err));
  }
});

/**
 * The athlete's next decision is whether to retype what is on screen. If the
 * message reads as "gone", they close the app — so the sentence has to say the
 * work is safe before it says anything else about signing in.
 */
test("the message says the work survived, not just that they are signed out", () => {
  for (const msg of [SESSION_LOST_KEPT, SESSION_LOST_RETRY]) {
    assert.match(msg, /timed out/i, "does not say what actually happened");
    assert.match(msg, /saved on this device|Nothing was lost/i, "does not say the work is safe");
    assert.ok(!/^Not signed in/i.test(msg), "still the dead end it replaced");
  }
});

import { readFileSync } from "node:fs";

/**
 * TWO DEFENCES, AND EITHER ALONE LEAVES A HOLE. The keepalive cannot help a
 * token that dies while the app is open and in use; the recovery at the write
 * cannot make a save feel instant if it has to renew first. These check both
 * are actually wired up, because the bug is invisible until somebody has left
 * the app in a pocket for forty minutes.
 */
test("the session is renewed when the app comes back to the foreground", () => {
  const keepalive = readFileSync(new URL("../components/SessionKeepalive.tsx", import.meta.url), "utf8");
  assert.match(keepalive, /visibilitychange/, "nothing listens for the app being reopened");
  assert.match(keepalive, /refreshSession\(\)/, "it never actually renews anything");
  assert.match(keepalive, /expires_at/, "it refreshes blindly rather than when the token is stale");

  const layout = readFileSync(new URL("../app/(app)/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /<SessionKeepalive\s*\/>/, "the keepalive is not mounted anywhere");
});

test("every weight write recovers a timed-out session instead of refusing", () => {
  const journal = readFileSync(new URL("../components/JournalForm.tsx", import.meta.url), "utf8");
  assert.match(journal, /await ensureUser\(supabase\)/, "the daily log still gives up on the first null user");
  assert.ok(!/setError\("Not signed in\."\)/.test(journal), "the dead-end message is back");
  assert.match(journal, /isOffline\(dbError\) \|\| isAuthFailure\(dbError\)/,
    "an expired session no longer queues the entry the way no-signal does");

  for (const file of ["../components/WeightHistory.tsx", "../app/(app)/body/page.tsx"]) {
    const src = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(src, /isAuthFailure\(/, `${file} still shows a raw JWT error to somebody editing a weight`);
  }
});
