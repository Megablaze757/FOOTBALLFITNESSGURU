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
  // The LAST send is the bulk loop. There is an earlier one in the test-send
  // branch, and measuring against that was a false failure — the dry run is
  // about not mailing the LIST, not about the single test message.
  const bulkIdx = fn.lastIndexOf("api.resend.com");
  assert.ok(dryIdx > 0 && dryIdx < bulkIdx, "the dry run does not return before the bulk send");
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
  // The button calls the DATABASE function by rpc, not the Edge Function.
  // That is what lets it work with nothing deployed — which is the whole reason
  // the SQL sender exists. Calling functions.invoke here would put the deploy
  // requirement back without anyone noticing until the button 404s.
  assert.match(admin, /rpc\(\s*["']announce_launch["']/,
    "the admin page no longer calls the SQL sender");
  assert.ok(!/functions\.invoke\(\s*["']announce-launch["']/.test(admin),
    "the admin page is back to requiring a deployed Edge Function");
  // And it must explain the likeliest failure rather than surfacing raw
  // Postgres. "function does not exist" tells nobody what to do about it.
  assert.match(admin, /Paste supabase\/announce-launch\.sql/,
    "a missing sender surfaces as a raw database error");
});

/** The stats RPC must not hand out addresses, and must refuse non-admins. */
test("the stats function returns counts only, and only to an admin", () => {
  const stats = SQL.slice(SQL.indexOf("function public.waitlist_launch_stats"));
  assert.match(stats, /is_admin\(\)/, "any signed-in user can read waitlist stats");
  assert.ok(!/\bw\.email\b/.test(stats.split("$$;")[0]), "the stats function selects email addresses");
  assert.match(SQL, /revoke execute on function public\.waitlist_launch_stats\(\) from public, anon/i,
    "anon can call the stats function");
});

/**
 * A TEST SEND MUST NOT COST A REAL ONE.
 *
 * The whole value of a test is that you can fire it repeatedly while tweaking
 * the copy. If it selected rows, stamped anyone, or consumed a place in the
 * batch, then checking the email would quietly remove people from the send it
 * was checking — and you would not find out until the numbers looked wrong.
 */
test("a test send touches nobody on the waitlist", () => {
  const fn = code(FN);
  const testIdx = fn.indexOf("if (testTo)");
  assert.ok(testIdx > 0, "there is no test send");

  // It returns before the code that selects and stamps the real recipients.
  const selectIdx = fn.indexOf('.from("waitlist")\n    .select("id, email');
  const stampIdx = fn.indexOf("launch_emailed_at: new Date()");
  assert.ok(testIdx < stampIdx, "the test path runs after rows are stamped");

  // And its own branch never stamps: everything between `if (testTo)` and the
  // return that closes it must be free of the update.
  const branch = fn.slice(testIdx, fn.indexOf("const { data: rows", testIdx));
  assert.ok(!/launch_emailed_at:/.test(branch), "the test send marks somebody as emailed");
  assert.ok(!/unsubscribed_at/.test(branch), "the test send touches unsubscribe state");
  assert.ok(selectIdx === -1 || testIdx < selectIdx, "the test path runs after the recipient query");
});

test("the test send is admin-gated like everything else here", () => {
  const fn = code(FN);
  // The role check must come BEFORE the test branch, or anyone with a login
  // could make the app send mail to an address of their choosing.
  const roleIdx = fn.indexOf('!== "admin"');
  const testIdx = fn.indexOf("if (testTo)");
  assert.ok(roleIdx > 0 && roleIdx < testIdx, "the test send is reachable without being an admin");
});

test("a test send refuses something that is not an email", () => {
  assert.match(code(FN), /that is not an email address/,
    "the test address is not validated, so a typo becomes a provider error");
});
