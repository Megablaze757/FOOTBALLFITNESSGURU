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
