import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/migrations/0107_athlete_share_codes.sql", import.meta.url), "utf8");
const combined = readFileSync(new URL("../supabase/apply-0088-0111.sql", import.meta.url), "utf8");

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A USERNAME BRINGS PEOPLE IN AND OWES THEM NOTHING.
 *
 * Giving every athlete a share code is only worth doing if it costs nothing
 * per signup. Every commission and payout query in this schema joins
 * profiles.referral_code = affiliates.code, so a username — which is not in
 * affiliates — matches nothing there and creates no liability.
 *
 * That is a property of the SCHEMA rather than of any one function, so it is
 * checked as one. If a later migration ever attributes commission by anything
 * looser than an affiliates join, this is what should stop it.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a username can never become a commission", () => {
  // The resolver is not permitted to enrol anybody in the paid scheme.
  assert.ok(!/insert\s+into\s+public\.affiliates/i.test(sql),
    "0107 writes to the affiliates table — that is a payout somebody did not ask for");
  // Both comment styles: the header uses `--` lines and the function docs use
  // block comments, and the word appears in each of them on purpose.
  const code = sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*--.*$/gm, " ");
  assert.ok(!/commission/i.test(code), "0107 touches commission outside its own comments");
  assert.ok(!/affiliates/i.test(code.replace(/lower\(code\)|public\.affiliates where|from public\.affiliates/gi, " "))
    || /select 1 from public\.affiliates/i.test(code),
    "0107 does more than READ affiliates");
});

test("affiliates are checked first, so a paid code never resolves to the free one", () => {
  const fn = sql.slice(sql.indexOf("create or replace function public.referral_code_valid"));
  const affiliateAt = fn.indexOf("public.affiliates");
  const profileAt = fn.indexOf("public.profiles");
  assert.ok(affiliateAt > 0 && profileAt > 0, "the validator no longer checks both");
  assert.ok(affiliateAt < profileAt, "profiles are checked before affiliates — the paid path must win");
});

/**
 * Without this, anybody could take an affiliate's code as their username and
 * every link that affiliate ever posted becomes ambiguous.
 */
test("a username cannot take an affiliate's code", () => {
  assert.match(sql, /create trigger trg_username_not_affiliate_code/);
  assert.match(sql, /before insert or update of username on public\.profiles/);
  assert.match(sql, /raise exception 'username_taken'/);
});

test("the validator still answers for affiliates, and the grants did not widen", () => {
  assert.match(sql, /grant execute on function public\.referral_code_valid\(text\) to anon, authenticated/);
  assert.match(sql, /revoke all on function public\.referral_code_valid\(text\) from public/);
});

/** The migration has to actually be in the file the admin screen tells you to run. */
test("0107 is in the apply file", () => {
  assert.ok(combined.includes("0107_athlete_share_codes.sql"), "0107 is not in the combined script");
  assert.ok(combined.includes("trg_username_not_affiliate_code"));
});
