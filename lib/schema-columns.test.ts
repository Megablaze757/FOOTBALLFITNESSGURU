import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * EVERY COLUMN A PAGE ASKS FOR MUST EXIST.
 *
 * PostgREST does not ignore a column it has never heard of — it rejects the
 * WHOLE request. One wrong name in a select list and the query returns an
 * error, `data` is null, and the page renders as though the athlete has done
 * nothing at all. Nothing throws, nothing is logged where anyone will see it,
 * and every number derived from that query is silently zero.
 *
 * This has now bitten twice:
 *
 *   nutrition   named columns from 0066-0069 before they were applied, and
 *               rendered an athlete with no height, no weight and no plan
 *   rewards     asked for `training_logs.rpe`, which has never existed in any
 *               migration — the column is called `intensity` — so sessions this
 *               week, rest days, perfect days and easy sessions were ALL zero
 *               for everybody, and the weekly training challenge could never
 *               complete however much anyone trained
 *
 * The second one took a bug report and a long hunt to find, because a zero is
 * indistinguishable from "you haven't done it yet". So this reads the selects
 * out of the app and checks them against the migrations.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: prove the DEPLOYED database matches the
 * migrations. It cannot — that is what supabase/CHECK-MIGRATIONS.sql is for.
 * It proves the app and the repo agree, which is the half that is checkable
 * here and the half that was wrong.
 */

const ROOT = new URL("..", import.meta.url).pathname;

/** Column names per table, as the migrations define them. */
function schemaFromMigrations(): Map<string, Set<string>> {
  const dir = join(ROOT, "supabase/migrations");
  const sql = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n");

  const tables = new Map<string, Set<string>>();
  const add = (table: string, col: string) => {
    const key = table.replace(/^public\./, "");
    if (!tables.has(key)) tables.set(key, new Set());
    tables.get(key)!.add(col);
  };

  // create table [if not exists] public.x ( ... );
  const createRe = /create table\s+(?:if not exists\s+)?([\w.]+)\s*\(([\s\S]*?)\n\);/gi;
  for (const m of sql.matchAll(createRe)) {
    for (const raw of m[2].split("\n")) {
      const line = raw.trim();
      // Skip blanks, comments and table-level constraints.
      if (!line || line.startsWith("--")) continue;
      if (/^(primary key|unique|constraint|check|foreign key|references|exclude|like)\b/i.test(line)) continue;
      const col = line.match(/^"?([a-z_][a-z0-9_]*)"?\s+/i);
      if (col) add(m[1], col[1]);
    }
  }

  /**
   * ALTER TABLE ... ADD COLUMN, which is frequently written across several
   * lines with more than one column per statement:
   *
   *   alter table public.profiles
   *     add column if not exists position text,
   *     add column if not exists training_focus text;
   *
   * Matching `alter table X add column Y` on one line missed every one of
   * those and reported columns that plainly exist as missing — which would
   * have made this guard cry wolf on its first run and be deleted.
   */
  const alterRe = /alter table\s+(?:if exists\s+)?([\w.]+)([\s\S]*?);/gi;
  for (const m of sql.matchAll(alterRe)) {
    for (const c of m[2].matchAll(/add column\s+(?:if not exists\s+)?"?([a-z_][a-z0-9_]*)"?/gi)) {
      add(m[1], c[1]);
    }
  }

  return tables;
}

/** Every `.from("t").select("a, b")` in the app, as (table, columns). */
function selectsInApp(): { file: string; table: string; columns: string[] }[] {
  const out: { file: string; table: string; columns: string[] }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.tsx?$/.test(p)) continue;
      const src = readFileSync(p, "utf8");
      // .from("table")<anything not a quote or paren>.select("cols")
      const re = /\.from\(\s*"([a-z_]+)"\s*\)\s*\.select\(\s*"([^"]*)"/g;
      for (const m of src.matchAll(re)) {
        out.push({ file: p.slice(ROOT.length), table: m[1], columns: m[2].split(",").map((c) => c.trim()) });
      }
    }
  };
  walk(join(ROOT, "app"));
  walk(join(ROOT, "components"));
  return out;
}

test("every column selected from the database actually exists", () => {
  const schema = schemaFromMigrations();
  // Sanity: the parser has to have found real tables, or this test passes by
  // knowing nothing — which is exactly how a guard becomes decoration.
  assert.ok(schema.size > 15, `only parsed ${schema.size} tables out of the migrations`);
  assert.ok(schema.get("training_logs")?.has("intensity"), "the migration parser missed a known column");

  const problems: string[] = [];
  for (const { file, table, columns } of selectsInApp()) {
    const known = schema.get(table);
    // Only check tables this repo defines. A view or a table created outside
    // the migrations is not evidence of a bug.
    if (!known) continue;
    for (const col of columns) {
      if (!col || col === "*") continue;
      // Skip embedded resources and aggregates — `profiles(name)`, `count`.
      if (/[(:]/.test(col) || col === "count") continue;
      if (!known.has(col)) {
        problems.push(`${file}: ${table}.${col} does not exist (PostgREST will reject the whole query)`);
      }
    }
  }
  assert.deepEqual(problems, [], `\n${problems.join("\n")}\n`);
});
