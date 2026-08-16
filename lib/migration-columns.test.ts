import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

/**
 * DOES THE SQL REFERENCE COLUMNS THAT EXIST?
 *
 * lib/schema-columns.test.ts asks this of the app's PostgREST queries. Nothing
 * asked it of the migrations themselves, and the gap cost a live failure:
 * `my_affiliate_ledger` selected `c.created_at` from a table whose date column
 * is `earned_at`, and the first anyone knew was the SQL editor refusing to run
 * it. A migration is the one kind of code with no compiler and no test run
 * before it hits production — this is the substitute.
 *
 * Deliberately narrow. It checks ALIASED references inside function bodies
 * (`a.code`, `c.amount_pennies`), which is where the app's own SQL does almost
 * all of its column naming, and does not attempt to parse SQL in general. A
 * checker that tried to understand every statement would be wrong often enough
 * to be ignored, and a check people ignore is worse than no check.
 */

const DIR = new URL("../supabase/migrations/", import.meta.url).pathname;

/** Every column each table declares, across the whole migration set. */
function declaredColumns(): Map<string, Set<string>> {
  const cols = new Map<string, Set<string>>();
  const add = (table: string, col: string) => {
    const key = table.replace(/^public\./, "").toLowerCase();
    if (!cols.has(key)) cols.set(key, new Set());
    cols.get(key)!.add(col.toLowerCase());
  };

  for (const file of readdirSync(DIR).sort()) {
    if (!file.endsWith(".sql")) continue;
    const sql = readFileSync(DIR + file, "utf8");

    // create table ... ( ... );
    for (const m of sql.matchAll(/create table (?:if not exists )?([\w.]+)\s*\(([\s\S]*?)\n\);/gi)) {
      for (const raw of m[2].split("\n")) {
        const line = raw.replace(/--.*$/, "");
        const c = /^\s*([a-z_][a-z0-9_]*)\s+[a-z]/i.exec(line);
        if (c && !/^(constraint|primary|unique|foreign|check|like|exclude)$/i.test(c[1])) add(m[1], c[1]);
      }
    }

    // alter table x add column [if not exists] y — including the multi-column
    // form, where one ALTER carries several ADD COLUMNs separated by commas.
    for (const m of sql.matchAll(/alter table ([\w.]+)((?:[^;]|\n)*?);/gi)) {
      for (const c of m[2].matchAll(/add column (?:if not exists )?([a-z_][a-z0-9_]*)/gi)) add(m[1], c[1]);
    }
  }
  return cols;
}

/**
 * Alias to table, resolved FROM THE QUERY ITSELF.
 *
 * The first version of this used a fixed map — `s` means subscriptions, `a`
 * means affiliates — and it was wrong within a minute of running: aliases are
 * scoped to a query, so `s` is `subscriptions` in one file, `push_subscriptions`
 * in another and `sessions` in a third. It reported twenty imaginary problems,
 * which is exactly the failure a checker must not have. Nobody reads the output
 * of a tool that cries wolf, so it would have hidden the real bug it was
 * written to catch.
 *
 * Scoped per chunk: a function body between $$ markers, or a single statement.
 * An alias the chunk does not define is skipped rather than guessed at.
 */
function aliasesIn(chunk: string): Map<string, string> {
  const out = new Map<string, string>();
  // "from public.affiliates a" / "join public.affiliates a on ..." — with the
  // optional AS, and refusing SQL keywords as alias names.
  const KEYWORD = /^(on|where|order|group|limit|having|left|right|inner|outer|join|as|set|using|and|or|select)$/i;
  for (const m of chunk.matchAll(/\b(?:from|join)\s+(public\.[a-z_][a-z0-9_]*)\s+(?:as\s+)?([a-z][a-z0-9_]*)/gi)) {
    if (KEYWORD.test(m[2])) continue;
    out.set(m[2].toLowerCase(), m[1].replace(/^public\./, "").toLowerCase());
  }
  return out;
}

/** Function bodies and standalone statements, each its own alias scope. */
function chunksOf(sql: string): string[] {
  const out: string[] = [];
  const bodies = sql.split(/\$\$/);
  // Odd indices are inside $$ ... $$; even indices are everything between.
  for (let i = 0; i < bodies.length; i++) {
    if (i % 2 === 1) out.push(bodies[i]);
    else out.push(...bodies[i].split(";"));
  }
  return out.filter((c) => c.trim());
}

test("the migration parser finds the schema it is supposed to check", () => {
  // A parser that quietly matches nothing would pass every assertion below
  // while checking absolutely nothing — the exact failure mode that makes a
  // green test suite worthless. These are the sanity assertions.
  const cols = declaredColumns();
  assert.ok(cols.size > 20, `only parsed ${cols.size} tables out of the migration set`);

  for (const [table, expected] of [
    ["affiliate_commissions", ["earned_at", "payable_at", "amount_pennies", "status", "level"]],
    ["affiliates", ["code", "email", "user_id", "rate_pct", "active"]],
    ["waitlist", ["email", "source"]],
    ["training_logs", ["intervals", "interval_seconds", "run_type", "zone"]],
    ["rehab_plans", ["current_stage", "active", "plan"]],
    ["programs", ["swaps", "plan", "completed_sessions"]],
  ] as const) {
    const set = cols.get(table);
    assert.ok(set, `no columns parsed for ${table}`);
    for (const col of expected) {
      assert.ok(set!.has(col), `${table}.${col} was not parsed, so the parser is wrong, not the schema`);
    }
  }

  // And it must NOT think a made-up column exists, or the check below is
  // vacuous in the other direction.
  assert.equal(cols.get("affiliate_commissions")!.has("created_at"), false,
    "the parser invented a column — affiliate_commissions has earned_at, not created_at");
});

test("every aliased column in a migration exists on its table", () => {
  const cols = declaredColumns();
  const problems: string[] = [];
  let checked = 0;

  for (const file of readdirSync(DIR).sort()) {
    if (!file.endsWith(".sql")) continue;

    for (const chunk of chunksOf(readFileSync(DIR + file, "utf8"))) {
      const aliases = aliasesIn(chunk);
      if (aliases.size === 0) continue;

      for (const m of chunk.matchAll(/\b([a-z][a-z0-9_]*)\.([a-z_][a-z0-9_]{2,})\b/g)) {
        const table = aliases.get(m[1].toLowerCase());
        if (!table) continue;              // not an alias this query defines
        const set = cols.get(table);
        if (!set) continue;                // a table we could not parse — not a finding
        checked++;
        if (!set.has(m[2].toLowerCase())) problems.push(`${file}: ${m[1]}.${m[2]} — ${table} has no such column`);
      }
    }
  }

  assert.ok(checked > 50, `only ${checked} references checked; the alias scan has stopped working`);
  assert.deepEqual(problems, [], "migration SQL references columns that do not exist");
});

/**
 * A function whose RETURN TYPE CHANGES cannot be `create or replace`d.
 *
 * 0024 records this the hard way: replaying the migration set halted with
 * "cannot change return type of existing function" and everything after it
 * never ran.
 *
 * THE CHECK IS "CHANGED", NOT "REPLACED". The first version of this flagged
 * every `create or replace ... returns table` that lacked a drop, and reported
 * fifteen migrations that have been applied for months and work perfectly —
 * because replacing a function with the SAME return type is completely legal
 * and is the normal way to fix a query. Flagging those would have taught
 * everyone to ignore the test.
 *
 * So it compares the column list each definition declares, in order, and only
 * complains when a later one differs from an earlier one without dropping
 * first. That is the case Postgres actually refuses.
 */
test("a function's return type never changes without dropping it first", () => {
  const seen = new Map<string, { columns: string; file: string }>();
  const problems: string[] = [];

  for (const file of readdirSync(DIR).sort()) {
    if (!file.endsWith(".sql")) continue;
    const sql = readFileSync(DIR + file, "utf8");

    for (const m of sql.matchAll(
      /create (?:or replace )?function (public\.[a-z_][a-z0-9_]*)\s*\([^)]*\)\s*returns table\s*\(([\s\S]*?)\)\s*\n\s*language/gi,
    )) {
      const name = m[1].toLowerCase();
      // Normalised: whitespace and comments do not change a return type.
      const columns = m[2].replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim().toLowerCase();
      const prior = seen.get(name);

      if (prior && prior.columns !== columns) {
        const dropped = new RegExp(`drop function if exists ${name.replace(".", "\\.")}`, "i").test(sql);
        if (!dropped) {
          problems.push(
            `${file}: ${name} changes the return type it had in ${prior.file} without dropping the function first`,
          );
        }
      }
      seen.set(name, { columns, file });
    }
  }

  // The scan has to be finding definitions at all, or this passes by not
  // looking — the same vacuous-green failure the parser test guards against.
  assert.ok(seen.size >= 5, `only found ${seen.size} table-returning functions; the scan has stopped working`);
  assert.deepEqual(problems, []);
});
