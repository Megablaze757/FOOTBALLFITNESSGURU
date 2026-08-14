import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FILE = `${ROOT}supabase/announce-launch.sql`;

/**
 * The checked-in SQL is GENERATED, and generated files rot.
 *
 * supabase/announce-launch.sql exists so the launch can be sent from a phone —
 * opened on GitHub, copied, pasted into the SQL editor, no terminal anywhere.
 * That convenience is also the risk: the copy lives in email.ts, and the moment
 * someone edits the wording there, the file people actually paste still holds
 * the old one. Nothing would notice, and half the list would get the old email.
 */
test("the checked-in launch SQL matches the generator", () => {
  const onDisk = readFileSync(FILE, "utf8");
  const fresh = execFileSync("npx", ["tsx", "scripts/gen-announce-sql.mjs"], {
    cwd: ROOT, encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(onDisk, fresh,
    "supabase/announce-launch.sql is stale — regenerate it:\n" +
    "  npx tsx scripts/gen-announce-sql.mjs > supabase/announce-launch.sql");
});

/**
 * THE DATABASE GOING STALE IS THE REAL FAILURE, NOT THE FILE.
 *
 * The email HTML is a string literal inside the function body, so a wording
 * change only reaches Postgres when the function is replaced. This is not
 * hypothetical: the copy was rewritten, every checked-in artifact regenerated
 * and pushed, and the admin button carried on sending the previous email —
 * because none of that touches the database. announce-launch-update.sql is the
 * smallest thing that fixes it, and it is generated from the same module, so it
 * rots exactly as fast as the file above unless something checks.
 */
test("the checked-in copy-refresh SQL matches the generator", () => {
  const onDisk = readFileSync(`${ROOT}supabase/announce-launch-update.sql`, "utf8");
  const fresh = execFileSync("npx", ["tsx", "scripts/gen-announce-sql.mjs", "--email-only"], {
    cwd: ROOT, encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(onDisk, fresh,
    "supabase/announce-launch-update.sql is stale — regenerate it:\n" +
    "  npx tsx scripts/gen-announce-sql.mjs --email-only > supabase/announce-launch-update.sql");
});

/**
 * It replaces the sender and does nothing else. Two properties matter: it must
 * not send (a file described as "refresh the copy" that mails the list would be
 * the worst possible surprise), and it must not un-stamp anyone — clearing
 * launch_emailed_at would re-mail everybody who already received it.
 */
test("the copy refresh sends nothing and un-stamps nobody", () => {
  const sql = readFileSync(`${ROOT}supabase/announce-launch-update.sql`, "utf8");
  // The only executable statements are the replace and its grants.
  const stmts = sql
    .replace(/\$fn\$[\s\S]*\$fn\$/, "$fn$BODY$fn$")   // the function body is data, not statements
    .split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"));
  const bad = stmts.filter((l) => /^\s*(drop|delete|truncate|insert|select\s+\*\s+from\s+public\.announce_launch)/i.test(l));
  assert.deepEqual(bad, [], "the copy refresh runs something other than a replace");
  assert.ok(!/update\s+public\.waitlist\s+set\s+launch_emailed_at\s*=\s*null/i.test(sql),
    "the copy refresh clears launch_emailed_at, which would re-email everyone already sent to");
  assert.match(sql, /create or replace function public\.announce_launch/,
    "the copy refresh does not replace the sender");
  assert.match(sql, /NOTHING IS SENT BY RUNNING THIS/,
    "the file does not say plainly that it sends nothing");
});

/**
 * THE FILE ANSWERS "DID IT WORK?" ITSELF.
 *
 * Both times this went wrong, the question "is the new copy live?" was answered
 * by looking at an inbox, and both times the answer was wrong — first because
 * regenerating the repo file never touches Postgres, then because a paste
 * silently did not run. A fingerprint stamped into the function body turns that
 * into something the database can answer exactly, and the last statement of the
 * file asks it, so there is nothing to remember to run afterwards.
 *
 * The id is derived from the rendered email, so it tracks the copy on its own —
 * the byte-for-byte generator checks above are what keep it honest.
 */
test("the copy refresh stamps a fingerprint and reports its own result", () => {
  const upd = readFileSync(`${ROOT}supabase/announce-launch-update.sql`, "utf8");
  const full = readFileSync(FILE, "utf8");

  const stamped = upd.match(/--\s*copy-id:\s*([0-9a-f]{12})\b/)?.[1];
  assert.ok(stamped, "the function body carries no copy-id, so a paste cannot be verified");

  // The check must look for the id THIS file installs. A hardcoded or stale id
  // would report success after pasting the wrong file, which is worse than no
  // check at all.
  assert.ok(upd.includes(`copy-id: ${stamped}%'`),
    "the self-check looks for a different copy-id than the one it installs");

  // Both verdicts present, and the failure one has to say what to do.
  assert.match(upd, /INSTALLED - new copy is live/, "no success verdict");
  assert.match(upd, /NOT INSTALLED[\s\S]{0,120}Re-paste/, "the failure verdict does not say what to do");

  // The full install stamps the same copy, or the two files disagree about what
  // "installed" means and the check starts lying depending on which was pasted.
  assert.ok(full.includes(`copy-id: ${stamped}`),
    "the full install stamps a different copy-id than the refresh");

  // BOTH files must end on the verdict, and this is the guard that matters most.
  // The full installer used to end on a grant, which makes the Supabase SQL
  // editor say "Success. No rows returned" — indistinguishable from having
  // pasted a stale copy of the same file. That is not hypothetical: an older
  // announce-launch.sql was pasted repeatedly, reported success every time, and
  // reinstalled the previous email on each run. Ending on a select means "no
  // rows returned" can only mean "that was not this file".
  for (const [name, sql] of [["full install", full], ["copy refresh", upd]] as const) {
    const lastStatement = sql
      .split("\n")
      .filter((l) => l.trim() && !l.trim().startsWith("--"))
      .pop();
    assert.match(lastStatement ?? "", /nspname = 'public';/,
      `the ${name} does not end on the verdict, so a stale paste looks like a successful one`);
  }

  // Reads the catalogue only. A verification step that mutated anything would
  // be a trap in a file whose whole promise is that it sends nothing.
  const check = upd.slice(upd.indexOf("--- Did it take?"));
  assert.match(check, /from pg_proc/, "the self-check does not read the catalogue");
  assert.ok(!/\b(insert|update|delete|drop|net\.http_post)\b/i.test(check),
    "the self-check does something other than read");
});

/** The properties that make it safe to paste, asserted on the artifact itself. */
test("the generated SQL keeps its safety rails", () => {
  const sql = readFileSync(FILE, "utf8");
  assert.match(sql, /if not public\.is_admin\(\)/, "not admin-gated");
  assert.match(sql, /unsubscribed_at is null/, "would email people who unsubscribed");
  assert.match(sql, /launch_emailed_at is null/, "would email people twice");
  assert.match(sql, /update public\.waitlist set launch_emailed_at = now\(\)/, "never marks anyone as sent");
  assert.match(sql, /List-Unsubscribe-Post/, "no one-click unsubscribe header");
  assert.match(sql, /revoke execute on function public\.announce_launch\(int, text, text\) from public, anon/,
    "anon can call the sender");
  // No stray sentinels: one that survives substitution ships as literal text
  // in somebody's inbox. Known ones are removed first and then ANY @@ left over
  // is a problem — the lookahead version of this was wrong, because the closing
  // @@ of "@@CTA@@" has nothing after it and so matched itself.
  const leftover = sql.replace(/@@CTA@@/g, "").replace(/@@UNSUB@@/g, "");
  assert.ok(!leftover.includes("@@"), "an unrecognised @@sentinel@@ survives into the email");

  // And both known sentinels must be substituted at run time, or every
  // recipient gets the literal text instead of their own link.
  for (const s of ["@@CTA@@", "@@UNSUB@@"]) {
    assert.ok(sql.includes(`replace(replace(v_html, '@@CTA@@'`), "the html is not substituted");
    assert.ok(sql.includes(s), `${s} is not in the template at all`);
  }
});

/**
 * THE SENDER ADDRESS HAS TO BE ONE THAT ALREADY WORKS.
 *
 * The Worker sends its reminder emails from REMINDER_FROM, and that address is
 * on a domain Resend has verified — it is the proof the whole setup functions.
 * The launch SQL defaulted to a different mailbox on the same domain, which
 * nothing sends from. A bulk send is the worst moment to discover an address is
 * unconfigured: the failure is one opaque 4xx per recipient, after they have
 * all been stamped as emailed.
 */
test("the launch email sends from the address the app already sends from", () => {
  const toml = readFileSync(`${ROOT}cloudflare/wrangler.toml`, "utf8");
  const from = toml.match(/^REMINDER_FROM\s*=\s*"([^"]+)"/m)?.[1];
  assert.ok(from, "REMINDER_FROM is no longer declared in wrangler.toml");

  const sql = readFileSync(FILE, "utf8");
  const dflt = sql.match(/p_from\s+text default '([^']+)'/)?.[1];
  assert.equal(dflt, from,
    `the launch SQL sends from ${dflt}, but the app's working sender is ${from}`);
});

/**
 * INSTALLING THE KEY WITHOUT A SQL EDITOR.
 *
 * The key already exists — in the Cloudflare Worker, as a secret. Secrets are
 * write-only by design, so it cannot be read back and handed to Postgres; the
 * same key has to be pasted in a second place. That is one SQL call, but the
 * person doing it is on a phone, so the admin screen offers a box instead.
 */
test("the key can be installed and checked without exposing it", () => {
  const sql = readFileSync(FILE, "utf8");
  assert.match(sql, /function public\.set_resend_key\(p_key text\)/, "no way to store the key");
  assert.match(sql, /function public\.has_resend_key\(\)/, "no way to tell whether a key is set");

  // Both admin-only. A function that writes a credential, or reports on one, is
  // not something any signed-in account should reach.
  for (const fn of ["set_resend_key", "has_resend_key"]) {
    const body = sql.slice(sql.indexOf(`function public.${fn}`));
    assert.match(body.slice(0, 900), /is_admin\(\)/, `${fn} is not admin-gated`);
    assert.ok(
      new RegExp(`revoke execute on function public\\.${fn}\\([^)]*\\) from public, anon`).test(sql),
      `anon can call ${fn}`
    );
  }

  // has_resend_key returns a boolean. Returning the secret would make it the
  // easiest way in the codebase to read a credential out of Vault.
  const has = sql.slice(sql.indexOf("function public.has_resend_key"));
  assert.match(has.slice(0, 400), /returns boolean/, "has_resend_key does not return a boolean");
  assert.ok(!/return\s+.*decrypted_secret\s*;/.test(has.slice(0, 900)),
    "has_resend_key hands back the key itself");
});

test("the admin screen offers the key box only when one is missing", () => {
  const admin = readFileSync(`${ROOT}components/admin/WaitlistAnnounce.tsx`, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.match(admin, /rpc\(\s*["']has_resend_key["']/, "the screen never checks for a key");
  assert.match(admin, /rpc\(\s*["']set_resend_key["']/, "the screen cannot store a key");
  assert.match(admin, /hasKey === false &&/,
    "the key box is shown unconditionally, inviting a paste over a working setup");
  // Typed as a password so it is not left on screen in a shared room, and not
  // captured by a password manager as a login.
  assert.match(admin, /type="password"[\s\S]{0,200}keyInput/, "the key field is not masked");
});
