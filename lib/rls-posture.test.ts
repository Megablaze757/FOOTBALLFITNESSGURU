import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WHO CAN READ WHAT, ENFORCED RATHER THAN AUDITED.
 *
 * This project has got row-level security wrong twice and caught it late both
 * times. Migration 0046 exists because funnel_summary shipped readable by
 * anybody signed in. Migration 0096 exists because 0095 granted is_admin() a
 * blanket select on body_logs for an internal screen that no longer exists —
 * an admin could read anybody's bodyweight for as long as that stood.
 *
 * Both were found by somebody looking. This looks on every run.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * IT REPLAYS THE MIGRATIONS IN ORDER, WHICH IS THE ONLY HONEST WAY TO READ
 * THEM.
 *
 * A first version of this scan read all 114 files as one flat document and
 * reported `profiles: read all (authenticated)` — a policy letting every
 * signed-in athlete read every profile row. That policy is real and it is
 * from 0001; migration 0037 drops it and replaces it with "read own or
 * related". Reading migrations without their order reports a state from
 * thirty-six migrations ago as though it were today's.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * AND THE SECOND BUG IN THE SCAN, WHICH MATTERED MORE.
 *
 * Policy names appear both quoted ("profiles: read own or related") and bare
 * (funnel_own_insert). The scan required quotes, so it reported funnel_events
 * and push_subscriptions as having NO POLICIES AT ALL — when they have four
 * apiece — and it would equally have missed a bare-named policy that was
 * genuinely wide open.
 *
 * A security scan that silently matches nothing is worse than no scan, so the
 * last test here checks that this one still finds what it is looking for.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const DIR = "supabase/migrations";
/** Quoted or bare — both spellings are in use, and the bare ones are the trap. */
const NAME = `(?:"([^"]+)"|([a-z_0-9]+))`;

interface Policy { body: string; from: string }

function finalState() {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  const policies = new Map<string, Map<string, Policy>>();
  const rlsOn = new Set<string>();
  const tables = new Set<string>();
  const dropped = new Set<string>();
  const definerWithoutPath: string[] = [];

  for (const file of files) {
    const sql = readFileSync(`${DIR}/${file}`, "utf8")
      // Comments first: this repository writes long prose about policies, and
      // a sentence describing one is not one.
      .replace(/^\s*--.*$/gm, " ")
      .replace(/\/\*[\s\S]*?\*\//g, " ");

    for (const m of sql.matchAll(/create table (?:if not exists )?(?:public\.)?([a-z_0-9]+)/gi)) {
      tables.add(m[1].toLowerCase());
    }
    for (const m of sql.matchAll(/drop table (?:if exists )?(?:public\.)?([a-z_0-9]+)/gi)) {
      dropped.add(m[1].toLowerCase());
    }
    for (const m of sql.matchAll(/alter table (?:public\.)?([a-z_0-9]+)\s+enable row level security/gi)) {
      rlsOn.add(m[1].toLowerCase());
    }
    for (const m of sql.matchAll(new RegExp(`drop policy (?:if exists )?${NAME}\\s+on\\s+(?:public\\.)?([a-z_0-9]+)`, "gi"))) {
      policies.get(m[3].toLowerCase())?.delete(m[1] ?? m[2]);
    }
    for (const m of sql.matchAll(new RegExp(`create policy\\s+${NAME}\\s+on\\s+(?:public\\.)?([a-z_0-9]+)([\\s\\S]*?);`, "gi"))) {
      const table = m[3].toLowerCase();
      if (!policies.has(table)) policies.set(table, new Map());
      policies.get(table)!.set(m[1] ?? m[2], { body: m[4].replace(/\s+/g, " ").trim(), from: file });
    }

    /**
     * A definer function runs as its owner. Without a pinned search_path, a
     * caller who can create a schema on the search path can shadow a table or
     * an operator it uses and have it run their code as the owner. Postgres's
     * own documentation is blunt about it.
     */
    for (const m of sql.matchAll(/create (?:or replace )?function\s+(?:public\.)?(\w+)[\s\S]{0,1500}?\$\$/gi)) {
      if (/security\s+definer/i.test(m[0]) && !/set\s+search_path/i.test(m[0])) {
        definerWithoutPath.push(`${file}: ${m[1]}`);
      }
    }
  }

  const live = [...tables].filter((t) => !dropped.has(t)).sort();
  return { live, policies, rlsOn, definerWithoutPath };
}

const state = finalState();

// ═══════════════════════════════════════════════════════════════════════════

test("every live table has row-level security enabled", () => {
  const without = state.live.filter((t) => !state.rlsOn.has(t));
  assert.deepEqual(without, [],
    "A table without RLS is readable by every signed-in athlete through PostgREST,\n"
    + `  whatever the app does:\n  ${without.join("\n  ")}`);
});

/**
 * RLS on with no policy is DENY-ALL, which is safe — so this is not about a
 * hole. It is about a table nothing can reach: if the app expects to read it,
 * the symptom is silently zero rows rather than an error.
 */
const DENY_ALL_ON_PURPOSE: Record<string, string> = {
  /** Written only by claim_referral(), which is security definer and revoked from public. */
  referral_claims: "reached only through claim_referral(), a definer function — deny-all is the point",
  /** Vestigial: pg_cron config, and 0097 moved the reminders to the Worker. */
  cron_config: "nothing in the app or the Worker references it; pg_cron left with 0097",
};

test("every table nothing can reach is one nothing needs to reach", () => {
  const unreachable = state.live.filter((t) => state.rlsOn.has(t) && !(state.policies.get(t)?.size));
  const undocumented = unreachable.filter((t) => !DENY_ALL_ON_PURPOSE[t]);
  assert.deepEqual(undocumented, [],
    "RLS on with no policy is deny-all. That is safe, and if the app reads this\n"
    + `  table it gets zero rows and no error:\n  ${undocumented.join("\n  ")}`);
});

test("the deny-all list does not outlive its reasons", () => {
  for (const table of Object.keys(DENY_ALL_ON_PURPOSE)) {
    assert.ok(state.live.includes(table), `${table} is on the deny-all list but no longer exists`);
    assert.equal(state.policies.get(table)?.size ?? 0, 0,
      `${table} has policies now — it is reachable, so remove the exception`);
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A POLICY THAT IS TRUE FOR EVERYBODY.
 *
 * `using (true)` is not automatically wrong — something has to be public — but
 * it is the shape every one of this project's RLS mistakes took, so each one
 * is named with what it exposes.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const PUBLIC_ON_PURPOSE: Record<string, string> = {
  /**
   * One row, one meaningful column: `launched`. The front page has to know
   * whether to show the waitlist or the signup form, and it asks before
   * anybody has signed in — so anon has to be able to read it.
   */
  app_settings: "a single row whose only column is `launched`; the front page reads it before sign-in",
};

test("nothing is world-readable except what is meant to be", () => {
  const open: string[] = [];
  for (const table of state.live) {
    for (const [name, { body, from }] of state.policies.get(table) ?? []) {
      if (!/using\s*\(\s*true\s*\)/i.test(body)) continue;
      if (/to\s+service_role/i.test(body)) continue;
      if (PUBLIC_ON_PURPOSE[table]) continue;
      open.push(`${table}: "${name}" from ${from} — ${body.slice(0, 110)}`);
    }
  }
  assert.deepEqual(open, [],
    "This is the shape both of this project's RLS mistakes took — 0046 and 0096.\n"
    + `  Name it above with what it exposes, or narrow it:\n  ${open.join("\n  ")}`);
});

test("the world-readable list does not outlive its reasons", () => {
  for (const table of Object.keys(PUBLIC_ON_PURPOSE)) {
    const bodies = [...(state.policies.get(table)?.values() ?? [])].map((p) => p.body);
    assert.ok(bodies.some((b) => /using\s*\(\s*true\s*\)/i.test(b)),
      `${table} is listed as deliberately world-readable but no longer has such a policy`);
  }
});

/**
 * A definer function runs as its owner. Without a pinned search_path a caller
 * who can create a schema can shadow something it uses and run their own code
 * with the owner's rights.
 */
test("no security definer function runs with an unpinned search_path", () => {
  assert.deepEqual(state.definerWithoutPath, [],
    "A definer function with a mutable search_path is a privilege escalation:\n  "
    + state.definerWithoutPath.join("\n  "));
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE CHECK ON THE CHECK, AND IT IS NOT DECORATION HERE.
 *
 * Both earlier versions of this scan were wrong in ways that made it QUIETER:
 * one read the migrations out of order and reported a policy dropped in 0037,
 * the other required quoted policy names and missed eight real policies across
 * two tables. Either mistake in the other direction — a regex that stops
 * matching — turns every test above into a test that passes on an empty set.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the scan still finds the schema it is scanning", () => {
  assert.ok(state.live.length >= 30,
    `only ${state.live.length} live tables found — the table regex has stopped matching`);

  let policies = 0;
  for (const table of state.live) policies += state.policies.get(table)?.size ?? 0;
  assert.ok(policies >= 80,
    `only ${policies} live policies found — the policy regex has stopped matching`);

  // Both spellings, because missing the bare one is the bug this had.
  const named = new Set<string>();
  for (const table of state.live) for (const n of state.policies.get(table)?.keys() ?? []) named.add(n);
  assert.ok([...named].some((n) => n.includes(" ")), "no quoted, multi-word policy names found");
  assert.ok([...named].some((n) => /^[a-z_0-9]+$/.test(n)), "no bare policy names found — the trap is back");

  // And the tables most worth protecting are in the set at all.
  for (const table of ["profiles", "body_logs", "training_logs", "daily_check_ins"]) {
    assert.ok(state.live.includes(table), `${table} was not found by the scan`);
    assert.ok((state.policies.get(table)?.size ?? 0) > 0, `${table} has no policies in the scan's view`);
  }
});
