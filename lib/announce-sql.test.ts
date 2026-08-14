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
  const admin = readFileSync(`${ROOT}app/admin/page.tsx`, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.match(admin, /rpc\(\s*["']has_resend_key["']/, "the screen never checks for a key");
  assert.match(admin, /rpc\(\s*["']set_resend_key["']/, "the screen cannot store a key");
  assert.match(admin, /hasKey === false &&/,
    "the key box is shown unconditionally, inviting a paste over a working setup");
  // Typed as a password so it is not left on screen in a shared room, and not
  // captured by a password manager as a login.
  assert.match(admin, /type="password"[\s\S]{0,200}keyInput/, "the key field is not masked");
});
