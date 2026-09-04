import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A RESERVED WORD IN A COLUMN LIST STOPS A 2,000-LINE PASTE HALFWAY.
 *
 * Migration 0109 declared `position text` in a RETURNS TABLE. `position` is a
 * col_name_keyword in Postgres — POSITION(x IN y) is SQL-standard function
 * syntax — so it parses as the function, not as a name, and CREATE FUNCTION
 * fails with `42601: syntax error at or near "position"`.
 *
 * WHAT MAKES IT EXPENSIVE IS WHERE IT FAILS. These migrations are pasted into
 * the Supabase SQL editor by hand as one script. The error arrives at line 1957
 * of 2043, after everything before it has been read — and the transaction rolls
 * the lot back, so a twenty-minute job produces a database that has not moved
 * and an error about a word that looks perfectly ordinary.
 *
 * Nothing else here could catch it: there is no database in CI, the file
 * compiles to nothing, and the SQL is only ever read by a person. So this reads
 * the declarations and checks the names against the keyword list.
 *
 * NOT EXHAUSTIVE, and deliberately not pretending to be — encoding the whole
 * Postgres grammar to lint a dozen files would be its own bug. It carries the
 * keywords a schema like this plausibly reaches for. A name that is reserved
 * and absent from the list still breaks; one that is on the list is definitely
 * worth quoting.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TWO LISTS, BECAUSE ONE LIST FLAGS VALID SQL.
 *
 * The first version of this test had a single set and reported migration 0015's
 * `add column position` as an error. It is not: `position` is a
 * col_name_keyword, which Postgres allows as a COLUMN name and forbids as a
 * function-or-type name. That is exactly why 0109 failed where it did — a
 * RETURNS TABLE parameter is parsed as a type_function_name, and 0015's column
 * has been fine for a year.
 *
 * A lint that flags working SQL gets deleted, and rightly. So the distinction
 * is encoded rather than glossed over.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Cannot be a column name OR a parameter name without quoting. */
const RESERVED = new Set([
  "all", "analyse", "analyze", "and", "any", "array", "as", "asc", "asymmetric",
  "both", "case", "cast", "check", "collate", "column", "constraint", "create",
  "current_catalog", "current_date", "current_role", "current_time",
  "current_timestamp", "current_user", "default", "deferrable", "desc", "distinct",
  "do", "else", "end", "except", "false", "fetch", "for", "foreign", "from", "grant",
  "group", "having", "in", "initially", "intersect", "into", "lateral", "leading",
  "limit", "localtime", "localtimestamp", "not", "null", "offset", "on", "only",
  "or", "order", "placing", "primary", "references", "returning", "select",
  "session_user", "some", "symmetric", "table", "then", "to", "trailing", "true",
  "union", "unique", "user", "using", "variadic", "when", "where", "window", "with",
]);

/**
 * Fine as a column name, NOT fine as a parameter name — which is the RETURNS
 * TABLE case and the one that broke. Postgres calls these col_name_keyword and
 * type_func_name_keyword; the distinction between those two does not matter
 * here because neither may be a parameter name.
 */
const NOT_A_PARAM_NAME = new Set([
  "between", "bigint", "binary", "bit", "boolean", "char", "character", "coalesce",
  "collation", "concurrently", "cross", "current_schema", "dec", "decimal", "exists",
  "extract", "float", "freeze", "full", "greatest", "grouping", "ilike", "inner",
  "inout", "int", "integer", "interval", "is", "isnull", "join", "json", "least",
  "left", "like", "national", "natural", "nchar", "none", "normalize", "notnull",
  "nullif", "numeric", "out", "outer", "overlaps", "overlay", "position",
  "precision", "real", "right", "row", "setof", "similar", "smallint", "substring",
  "tablesample", "time", "timestamp", "treat", "trim", "values", "varchar",
  "verbose", "xmlattributes", "xmlconcat", "xmlelement", "xmltable",
]);

/** Every word that cannot appear unquoted where a NAME is expected. */
const BAD_PARAM_NAME = new Set([...RESERVED, ...NOT_A_PARAM_NAME]);

const DIR = new URL("../supabase/migrations/", import.meta.url);

function migrations(): { file: string; sql: string }[] {
  return readdirSync(DIR.pathname)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((file) => ({ file, sql: readFileSync(join(DIR.pathname, file), "utf8") }));
}

/** SQL with its `--` comments removed, so prose about a keyword is not a hit. */
function code(sql: string): string {
  return sql.replace(/--[^\n]*/g, " ");
}

test("no RETURNS TABLE declares an unquoted reserved word", () => {
  const offences: string[] = [];

  for (const { file, sql } of migrations()) {
    for (const block of code(sql).matchAll(/returns\s+table\s*\(([\s\S]*?)\)\s*language/gi)) {
      for (const line of block[1].split(",")) {
        // `name type` — the name is the first bareword. A quoted one is already
        // a name and is exactly the fix, so it is skipped.
        const name = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s+\S/.exec(line)?.[1];
        if (name && BAD_PARAM_NAME.has(name.toLowerCase())) {
          offences.push(`${file}: RETURNS TABLE (… ${name} …) — quote it as "${name.toLowerCase()}"`);
        }
      }
    }
  }

  assert.deepEqual(offences, [],
    "these stop the paste at CREATE FUNCTION with 42601, after everything before them has run");
});

/**
 * Only the truly reserved words. `add column position` is valid SQL and has
 * been in migration 0015 for a year — flagging it is how a lint gets deleted.
 */
test("no column is added with a word that cannot be a column name", () => {
  const offences: string[] = [];

  for (const { file, sql } of migrations()) {
    const body = code(sql);
    for (const m of body.matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?([A-Za-z_][A-Za-z0-9_]*)/gi)) {
      if (RESERVED.has(m[1].toLowerCase())) offences.push(`${file}: add column ${m[1]}`);
    }
    for (const m of body.matchAll(/create\s+(?:or\s+replace\s+)?function\s+[\w.]+\s*\(([^)]*)\)/gi)) {
      for (const arg of m[1].split(",")) {
        const name = /^\s*(?:in|out|inout\s+)?([A-Za-z_][A-Za-z0-9_]*)\s+\S/.exec(arg)?.[1];
        if (name && BAD_PARAM_NAME.has(name.toLowerCase())) offences.push(`${file}: function argument ${name}`);
      }
    }
  }

  assert.deepEqual(offences, [], "each of these is a syntax error, not a column");
});

/**
 * The guard has to be able to fail. A regex that matches nothing passes every
 * file forever, which is the failure mode of every source-scanning test.
 */
test("the scan actually reads the declarations it claims to", () => {
  const all = migrations();
  assert.ok(all.length > 50, `only ${all.length} migrations found — is the path right?`);

  const tables = all.flatMap(({ sql }) => [...code(sql).matchAll(/returns\s+table\s*\(([\s\S]*?)\)\s*language/gi)]);
  assert.ok(tables.length >= 3, `found ${tables.length} RETURNS TABLE blocks — the pattern has stopped matching`);

  // And it recognises the exact thing that broke, in the file that broke.
  const stats = all.find(({ file }) => file.startsWith("0109"))!;
  assert.ok(stats, "0109 has gone");
  assert.match(stats.sql, /"position" text/, "0109 has lost the quoting that makes it parse");
  assert.ok(BAD_PARAM_NAME.has("position"), "the word that broke is not in the list");
  assert.ok(!RESERVED.has("position"),
    "position is being treated as un-usable as a column name, which would flag migration 0015's valid SQL");
});
