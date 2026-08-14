import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Guards for the one control in the app that puts mail in other people's
 * inboxes and cannot be undone.
 *
 * The Edge Function and its email module are Deno and live outside the test
 * runner's reach, so these read the source. That is weaker than executing it,
 * and it is why each assertion targets a specific way this goes wrong rather
 * than "does the file mention unsubscribe".
 */
const FN = readFileSync(new URL("../supabase/functions/announce-launch/index.ts", import.meta.url), "utf8");
const EMAIL = readFileSync(new URL("../supabase/functions/announce-launch/email.ts", import.meta.url), "utf8");
const SQL = readFileSync(new URL("../supabase/migrations/0076_waitlist_announce.sql", import.meta.url), "utf8");
const ADMIN = readFileSync(new URL("../app/admin/page.tsx", import.meta.url), "utf8");

/**
 * Comments out, URLs intact.
 *
 * The naive version — `.replace(/\/\/.*$/gm, "")` — treats the `//` in
 * `https://api.resend.com` as the start of a line comment and deletes the rest
 * of the line. Two guards here compare the POSITION of the send against the
 * position of other statements, and both silently failed because the send had
 * been erased from the text they were searching. A stripper that eats the thing
 * you are looking for reports whatever it likes.
 */
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/**
 * NOBODY GETS IT TWICE. The failure is not hypothetical: the first press is
 * exactly when someone reloads because nothing visibly happened, and without
 * the stamp that mails the entire list again.
 */
test("the send skips anyone already emailed, and stamps as it goes", () => {
  const fn = code(FN);
  assert.match(fn, /\.is\(\s*["']launch_emailed_at["']\s*,\s*null\s*\)/,
    "the query does not exclude people who were already emailed");
  assert.match(fn, /update\(\s*\{\s*launch_emailed_at:/,
    "nothing is ever stamped, so every run mails the whole list again");
  // Stamped inside the per-row loop, after the send. Stamping a whole batch up
  // front loses anyone whose send failed; stamping at the end re-sends everyone
  // if the function is killed mid-batch.
  const sendIdx = fn.indexOf("api.resend.com");
  const stampIdx = fn.indexOf("launch_emailed_at: new Date()");
  assert.ok(sendIdx > 0 && stampIdx > sendIdx, "rows are stamped before the send is confirmed");
});

/** An opt-out is not optional, and it must survive having no account. */
test("every email carries a working unsubscribe", () => {
  assert.match(code(EMAIL), /unsubscribeUrl/, "the email body has no unsubscribe link");
  assert.ok(/unsubscribeUrl/.test(code(EMAIL).split("text = [")[1] ?? ""),
    "the plain-text part has no unsubscribe link");
  // Gmail and Yahoo require one-click unsubscribe on bulk mail. Without it this
  // send damages deliverability for everything else the app sends, including
  // password resets.
  assert.match(code(FN), /List-Unsubscribe/, "no List-Unsubscribe header");
  assert.match(code(FN), /List-Unsubscribe-Post/, "no one-click unsubscribe header");
  // And the RPC behind it has to be reachable without a login.
  assert.match(SQL, /grant execute on function public\.unsubscribe_waitlist\(uuid\) to anon/i,
    "anon cannot call the unsubscribe function, so the link cannot work");
});

test("an unsubscribed address is filtered in the query, not after it", () => {
  assert.match(code(FN), /\.is\(\s*["']unsubscribed_at["']\s*,\s*null\s*\)/,
    "unsubscribed people are still selected for sending");
});

/**
 * ADMIN ONLY, AND CHECKED SERVER-SIDE. The button lives behind an admin screen,
 * but anyone can POST to a function URL with their own token — the UI is not a
 * permission check.
 */
test("the send verifies the caller is an admin with the service key", () => {
  const fn = code(FN);
  assert.match(fn, /role["']?\s*\)?\s*!==\s*["']admin["']|!==\s*["']admin["']/,
    "no admin check");
  assert.match(fn, /createClient\(url,\s*serviceKey\)/,
    "the role is not read with the service key, so the caller could influence it");
  assert.match(fn, /403/, "a non-admin is not refused");
});

/** A bulk send you cannot rehearse is one you learn about from the replies. */
test("there is a dry run that sends nothing", () => {
  const fn = code(FN);
  assert.match(fn, /dryRun/, "no dry run");
  const dryIdx = fn.indexOf("if (dryRun)");
  const resendIdx = fn.indexOf("api.resend.com");
  assert.ok(dryIdx > 0 && dryIdx < resendIdx, "the dry run does not return before sending");
});

/**
 * THE COPY MUST NOT OUTRUN THE PRODUCT. Every number here is checkable, and one
 * claim in particular is not made: the clip IS uploaded to the athlete's
 * account, and only the ANALYSIS runs on the phone. "Never leaves your device"
 * would be false and the first reply would say so.
 */
test("the email does not claim the video never leaves the phone", () => {
  const body = EMAIL.toLowerCase();
  for (const overclaim of ["never leaves your phone", "never leaves your device", "never uploaded"]) {
    assert.ok(!body.includes(overclaim), `the email claims "${overclaim}", which is not true`);
  }
  assert.match(EMAIL, /analysis runs on your own phone/i, "the on-device claim is gone entirely");
});

test("the numbers in the email match the app", async () => {
  const { SPORTS } = await import("./exercises");
  const { positionsForSport } = await import("./coach");
  const { ACHIEVEMENTS } = await import("./gamification");
  const { CHALLENGE_POOL } = await import("./challenge-pool");

  const positions = SPORTS.reduce((n, s) => n + positionsForSport(s.id).length, 0);
  assert.ok(EMAIL.includes(`${SPORTS.length} sports`), `the email's sport count is not ${SPORTS.length}`);
  assert.ok(EMAIL.includes(`${positions} positions`), `the email's position count is not ${positions}`);
  assert.ok(EMAIL.includes(`${CHALLENGE_POOL.length} challenges`), `the email's challenge count is not ${CHALLENGE_POOL.length}`);
  assert.ok(EMAIL.includes(`${ACHIEVEMENTS.length} badges`), `the email's badge count is not ${ACHIEVEMENTS.length}`);
});

/**
 * ATTRIBUTION. The ledger in 0057 is what actually guarantees this — it binds
 * the email to its referrer permanently and signup reads it back — but the link
 * still carries ?ref= for anyone who signs up with a different address, which
 * the ledger cannot match.
 */
test("the launch link carries the affiliate code that brought them in", () => {
  assert.match(code(EMAIL), /\?ref=\$\{encodeURIComponent\(ref\)\}/,
    "the CTA does not carry the referral code");
  assert.match(code(FN), /row\.referral_code\s*\?\?\s*row\.source/,
    "the send does not read the referral code off the waitlist row");
});

test("the admin screen shows the size of the send before it is sent", () => {
  const admin = code(ADMIN);
  assert.match(admin, /waitlist_launch_stats/, "the count is never fetched");
  // Two presses, not one, for something that cannot be undone.
  assert.match(admin, /armed/, "the send fires on a single click");
  assert.match(admin, /functions\.invoke\(\s*["']announce-launch["']/,
    "the admin page does not call the function, or calls it through the Worker-preferring helper");
});

/** The stats RPC must not hand out addresses, and must refuse non-admins. */
test("the stats function returns counts only, and only to an admin", () => {
  const stats = SQL.slice(SQL.indexOf("function public.waitlist_launch_stats"));
  assert.match(stats, /is_admin\(\)/, "any signed-in user can read waitlist stats");
  assert.ok(!/\bw\.email\b/.test(stats.split("$$;")[0]), "the stats function selects email addresses");
  assert.match(SQL, /revoke execute on function public\.waitlist_launch_stats\(\) from public, anon/i,
    "anon can call the stats function");
});
