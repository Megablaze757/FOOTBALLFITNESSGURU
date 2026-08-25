import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * The paste-ready copy must be the migrations it claims to be.
 *
 * A second source of truth for schema changes fails silently: the repo says one
 * thing, the database says another, and the only symptom is a feature behaving
 * like last week. That is exactly what the "Apply SQL to Supabase" workflow was
 * written to stop happening — the launch email kept going out with the old copy
 * after every artifact in the repo had been regenerated — and a stale combined
 * file walks straight back into it.
 *
 * Rebuild with: node scripts/build-apply-sql.mjs
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const PARTS = [
  "0088_program_preferences_and_active_rest",
  "0089_post_completion_preferences",
  "0090_coach_conversation",
  "0091_notifications_trials_and_consent",
  "0092_meal_plan_preferences",
  "0093_meal_budget_and_store",
  "0094_run_duration",
  "0095_admin_visibility_and_email_audit",
  "0096_drop_admin_bodyweight_read",
  "0097_reminders_move_to_the_worker",
  "0098_admin_last_logged",
  "0099_publish_custom_exercises",
  "0100_custom_exercise_limits",
  "0101_program_edits",
  "0102_seen_tips",
  "0103_apple_shortcut_link",
];

const combined = read("../supabase/apply-0088-0103.sql");

/**
 * Split SQL into statements, without cutting a function body in half.
 *
 * A naive split on ";" tears `do $$ ... end $$;` and every `create or replace
 * function ... $$ ... $$;` into fragments — the first attempt at this reported
 * "end if" as a statement that cannot be run twice, which is true and useless.
 * Dollar-quoted bodies are skipped over whole.
 *
 * SO ARE SINGLE-QUOTED STRINGS. `comment on column ... is 'workout and
 * active_rest count as activity; rest_day records an intentional recovery
 * day.'` contains a semicolon inside the comment TEXT, and splitting there
 * reported the second half of an English sentence as an unrepeatable
 * statement. Doubled quotes ('') are an escaped quote inside a string, not the
 * end of one.
 */
function statementsIn(sql: string): string[] {
  const out: string[] = [];
  let buffer = "";
  let i = 0;
  while (i < sql.length) {
    if (sql.startsWith("$$", i)) {
      const end = sql.indexOf("$$", i + 2);
      const body = end === -1 ? sql.slice(i) : sql.slice(i, end + 2);
      buffer += body;
      i += body.length;
      continue;
    }
    if (sql[i] === "'") {
      let end = i + 1;
      while (end < sql.length) {
        if (sql[end] === "'" && sql[end + 1] === "'") { end += 2; continue; }
        if (sql[end] === "'") { end += 1; break; }
        end += 1;
      }
      buffer += sql.slice(i, end);
      i = end;
      continue;
    }
    if (sql[i] === "-" && sql[i + 1] === "-") {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? sql.length : nl;
      continue;
    }
    // Block comments too: the migrations use /** … */ for the notes that
    // explain a function, and Postgres accepts them the same as `--`.
    if (sql[i] === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }
    if (sql[i] === ";") {
      out.push(buffer);
      buffer = "";
      i += 1;
      continue;
    }
    buffer += sql[i];
    i += 1;
  }
  out.push(buffer);
  return out.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
}


test("the combined file contains every migration it names, in order", () => {
  let cursor = 0;
  for (const part of PARTS) {
    const sql = read(`../supabase/migrations/${part}.sql`).replace(/\s+$/, "");
    const at = combined.indexOf(sql, cursor);
    assert.notEqual(at, -1,
      `${part} is missing or has drifted from the combined file — run: node scripts/build-apply-sql.mjs`);
    assert.ok(at > cursor, `${part} is out of order in the combined file`);
    cursor = at + sql.length;
  }
});

test("it carries nothing the migrations do not", () => {
  // A hand-added statement here would run against the database and exist in no
  // migration, so a fresh project rebuilt from supabase/migrations would be
  // missing it — the worst kind of drift, because it only shows up on a rebuild.
  const bodyStart = combined.indexOf("-- 0092_meal_plan_preferences.sql");
  const body = combined.slice(bodyStart);
  const fromMigrations = PARTS
    .map((p) => read(`../supabase/migrations/${p}.sql`).replace(/\s+$/, ""))
    .join("\n");

  const inMigrations = new Set(statementsIn(fromMigrations));
  for (const statement of statementsIn(body)) {
    assert.ok(inMigrations.has(statement),
      `the combined file has a statement no migration does:\n  ${statement.slice(0, 120)}`);
  }
});

test("running it twice is safe", () => {
  /**
   * SOMEBODY WILL RUN IT TWICE. They will not remember whether they already
   * pasted it, and the honest answer to that doubt is "just run it again" —
   * which is only true if every statement can be.
   */
  const statements = statementsIn(combined);

  const REPEATABLE = [
    /^alter table [\w.]+ add column if not exists/i,
    /^alter table [\w.]+ drop constraint if exists/i,
    /^alter table [\w.]+ add constraint/i,       // always preceded by a drop
    /^alter table [\w.]+ alter column/i,          // setting a type it already has is a no-op
    /^alter table [\w.]+ enable row level security/i,
    /^create table if not exists/i,
    /^create index if not exists/i,
    /^create unique index if not exists/i,
    /^create or replace function/i,
    // A plain `create function` is repeatable only because the migration drops
    // it immediately above — which it must, since a function whose RETURNS
    // TABLE changed cannot be replaced in place.
    /^create function/i,
    /^create or replace view/i,
    /^drop policy if exists/i,
    // A function whose signature changed cannot be replaced in place, so the
    // migration drops it first. `if exists` is what makes that repeatable.
    /^drop (function|view|trigger|index|table) if exists/i,
    /^create policy/i,                            // always preceded by a drop
    /^comment on/i,
    /^notify pgrst/i,
    /^revoke /i,
    /^grant /i,
    /^do \$\$/i,                                  // guarded blocks
    // The confirmation line at the end of a migration. It reads the database
    // and changes nothing, which is the definition of safe to repeat.
    /^select /i,
    /**
     * A repair that only touches rows a constraint is about to reject.
     *
     * Repeatable because it is idempotent by shape: the second run finds
     * nothing left to change. It exists because a constraint added against
     * data written under a LATER migration cannot be applied at all — see the
     * session_type note in 0088.
     */
    /^update [\w.]+ set .* where /is,
  ];

  /**
   * `create trigger` has no `or replace` and no `if not exists`, so unlike a
   * policy it is checked rather than assumed: the matching `drop trigger if
   * exists` has to actually appear earlier in the file. Getting that pairing
   * wrong is invisible on a fresh database and fails only on the second run,
   * which is precisely the case this test exists for.
   */
  const droppedTriggers = new Set(
    statements
      .map((st) => /^drop trigger if exists (\w+) on ([\w.]+)/i.exec(st))
      .filter(Boolean)
      .map((m) => `${m![1].toLowerCase()} on ${m![2].toLowerCase()}`),
  );

  for (const statement of statements) {
    const trigger = /^create trigger (\w+)\s+before|^create trigger (\w+)\s+after|^create trigger (\w+)\s+instead/i.exec(statement);
    if (trigger) {
      const name = (trigger[1] ?? trigger[2] ?? trigger[3]).toLowerCase();
      const on = /\son ([\w.]+)/i.exec(statement)?.[1].toLowerCase();
      assert.ok(
        droppedTriggers.has(`${name} on ${on}`),
        `create trigger ${name} is not preceded by "drop trigger if exists ${name} on ${on}"`,
      );
      continue;
    }
    assert.ok(REPEATABLE.some((rule) => rule.test(statement)),
      `this cannot be run twice:\n  ${statement.slice(0, 140)}`);
  }
});

test("it says how to run it and what is still outstanding", () => {
  // The file is read by somebody who has not seen this conversation.
  assert.match(combined, /SQL Editor/);
  assert.match(combined, /Apply SQL to Supabase/);
  assert.match(combined, /SAFE TO RUN TWICE/);
  // The Worker is deployed by hand and is not in this file. Somebody who runs
  // the SQL and stops will find the admin email panel still not answering.
  assert.match(combined, /cloudflare\/worker\.js/);
});
