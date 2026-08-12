import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A migration gets exactly one chance to be right.
 *
 * These are pasted by hand into the Supabase SQL editor — there is no CI step
 * that runs them, no staging database, and no rollback. So a syntax error is
 * not "the build goes red", it is a person pasting a wall of SQL, getting
 * `ERROR: syntax error at or near "window"`, and having no idea which half of
 * the file ran.
 *
 * That is not hypothetical. `0075` was written with a column called `window`,
 * which is a RESERVED word in PostgreSQL: `window text not null` fails at
 * CREATE TABLE. It was caught by running the file against a real PostgreSQL
 * 16.13 before sending it, and this test is the cheap version of that check.
 *
 * The list below is the reserved words plausible as a column name in this
 * schema. It is deliberately not the full set — `select` and `from` are
 * reserved too, and nobody is going to name a column `select`.
 */
const RESERVED = new Set([
  "window", "order", "user", "check", "default", "primary", "references",
  "table", "column", "constraint", "unique", "using", "when", "where", "case",
  "end", "all", "any", "array", "asc", "desc", "limit", "offset", "group",
  "having", "union", "distinct", "on", "in", "is", "not", "null", "and", "or",
  "to", "do", "as", "at", "by", "for", "from", "into", "select", "grant",
  "returning", "with", "only", "both", "leading", "trailing", "cast", "collate",
  "current_date", "current_time", "current_user", "session_user", "localtime",
]);

const DIR = new URL("../supabase/migrations", import.meta.url).pathname;

/**
 * Column names out of a `create table` body: the first word of each line that
 * looks like a definition. Constraint lines (`primary key (...)`, `check(...)`)
 * and comments are skipped — they legitimately start with reserved words.
 */
function columnsIn(sql: string): { table: string; column: string }[] {
  const out: { table: string; column: string }[] = [];
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?([\w.]+)\s*\(([\s\S]*?)\n\)\s*;/gi;
  for (const m of sql.matchAll(re)) {
    const [, table, body] = m;
    let depth = 0;
    for (const raw of body.split("\n")) {
      const line = raw.trim();
      // Track parens so a multi-line check constraint does not look like columns.
      const before = depth;
      depth += (raw.match(/\(/g) ?? []).length - (raw.match(/\)/g) ?? []).length;
      if (before > 0) continue;
      if (!line || line.startsWith("--")) continue;
      const word = line.match(/^"?([a-zA-Z_][\w]*)"?\s/)?.[1];
      if (!word) continue;
      const lower = word.toLowerCase();
      // Table-level constraints, not columns.
      if (["primary", "foreign", "unique", "check", "constraint", "exclude", "like"].includes(lower)) continue;
      // Already quoted is legal, however reserved the word is.
      if (line.startsWith('"')) continue;
      out.push({ table, column: word });
    }
  }
  return out;
}

test("no migration names a column with a reserved word", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  assert.ok(files.length > 50, `only found ${files.length} migrations — wrong directory?`);

  const bad: string[] = [];
  for (const f of files) {
    const sql = readFileSync(join(DIR, f), "utf8");
    for (const { table, column } of columnsIn(sql)) {
      if (RESERVED.has(column.toLowerCase())) bad.push(`${f}: ${table}.${column}`);
    }
  }
  assert.deepEqual(bad, [], "these fail at CREATE TABLE unless quoted");
});

/**
 * And the parser above has to actually find columns, or the test passes by
 * looking at nothing — which is the failure mode of every source-scanning
 * guard. Pinned against the migration that motivated it.
 */
test("the column scan actually reads columns", () => {
  const sql = readFileSync(join(DIR, "0075_challenge_completions.sql"), "utf8");
  const cols = columnsIn(sql).map((c) => c.column);
  assert.deepEqual(cols.sort(), ["board_window", "challenge_id", "completed_at", "period", "user_id", "xp"]);

  // And it catches the real thing when it is there.
  const broken = `create table if not exists public.t (
  id uuid primary key,
  window text not null,
  primary key (id)
);`;
  assert.ok(columnsIn(broken).some((c) => RESERVED.has(c.column.toLowerCase())),
    "the scan does not notice a reserved column name");
});
