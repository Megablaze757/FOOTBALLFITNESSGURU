#!/usr/bin/env node
// =============================================================================
// Rebuild the paste-ready combined migration file from the migrations it
// claims to be. The name it writes is derived below — see OUT.
//
// WHY A SCRIPT AND NOT A HAND-EDITED FILE. A paste-ready copy of two dozen
// migrations is a second source of truth, and the failure mode is silent: the
// repo says one thing, the database says another, and the only symptom is a
// feature behaving like last week. That is the exact failure the
// "Apply SQL to Supabase" workflow was written for, and a stale combined file
// would walk straight back into it.
//
// Run it after touching any of the migrations below, and lib/apply-sql.test.ts
// will tell you if you forget.
// =============================================================================

import { readFileSync, writeFileSync } from "node:fs";

/**
 * STARTS AT 0088, NOT 0092.
 *
 * The first version of this file began at 0092 and it failed on a real
 * database: 0095 reads notifications.email_category, which 0091 adds, and 0091
 * had never been applied. The error was `42703: column "email_category" does
 * not exist` at line 434 of a 438-line paste — which tells you nothing about
 * which migration is missing, and leaves the database half-changed.
 *
 * A combined file has to be self-contained back to the last migration anyone
 * is sure about. Every one of these is idempotent (lib/apply-sql.test.ts checks
 * it), so including one that has already been applied costs nothing, and
 * leaving one out costs an error nobody can diagnose from the message.
 */
export const PARTS = [
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
  "0104_admin_cancellation_actor",
  "0105_leaderboard_rank",
  "0106_exercise_review_notes",
  "0107_athlete_share_codes",
  "0108_public_profiles",
  "0109_leaderboard_sport_position",
  "0110_calendar_token",
  "0111_reels",
  "0112_reels_images",
  "0113_retention",
  "0114_win_back",
];

/**
 * EXPORTED, so nothing else has to spell it.
 *
 * The name carries the migration range, so it changes every time the range
 * does — and it was written out by hand in this script, in the test, and in
 * the admin panel's instructions. Renaming it broke the test with an ENOENT
 * on the old name, which is the cheap version of the failure; the expensive
 * one is the panel telling somebody to run a file that no longer exists.
 *
 * DERIVED FROM PARTS NOW, rather than spelled again. It was a literal, and it
 * went stale the moment a migration was added without one: the test computes
 * this name from PARTS and this script wrote a different one, so the two would
 * have disagreed silently about which file is the current paste. Three
 * migrations had already landed past the end of the range with nothing
 * noticing.
 */
const FIRST = PARTS[0].slice(0, 4);
const LAST = PARTS[PARTS.length - 1].slice(0, 4);
export const OUT = `supabase/apply-${FIRST}-${LAST}.sql`;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE HEADER IS GENERATED TOO, AND THAT IS THE POINT OF THIS REWRITE.
 *
 * It used to be preserved: the script read its own previous output, kept
 * everything above the first migration, and appended freshly-read SQL under
 * it. Which meant the one part of the file written in English — the part
 * somebody actually reads before pasting — was the one part no rebuild ever
 * touched. It drifted exactly as far as you would expect. By the time anybody
 * looked, a file containing 0088 to 0114 opened with:
 *
 *   "PocketAthlete — migrations 0088 to 0105, in one file."
 *
 * and told the reader to run the workflow against the 0105 path, which had not
 * existed for nine migrations. Under that: a contents list stopping at 0095,
 * and a note quoting a Worker version three weeks old. Every statement in the
 * file was correct and every sentence about it was wrong.
 *
 * (The stale path is described rather than quoted. lib/apply-sql.test.ts now
 * walks the repository for anything naming the combined file and checks it
 * names the one that exists — a quotation of a dead path, even in a comment
 * explaining that it is dead, reads to that guard as one more thing to fix.)
 *
 * So the range, the filename, the contents and the Worker version are all read
 * from the same places the body is. The prose that is genuinely prose still
 * lives here, in NOTES and in the template, where changing it is a deliberate
 * act rather than something you forget.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * The hand-written entries, for migrations whose own opening comment does not
 * say what an operator needs to know. Everything not listed here is summarised
 * from the migration itself by summarise(), which cannot go stale because it
 * has no copy to go stale against.
 */
const NOTES = {
  "0088_program_preferences_and_active_rest":
    "Ordered programme goals and saved exercises on the profile, and active-rest days as a real kind of "
    + "training log rather than an absence of one.",
  "0089_post_completion_preferences":
    "A run's own distance, pace and unit; explicit rest days; display preferences; custom nutrition targets; "
    + "and the email controls the notification pipeline below reads.",
  "0091_notifications_trials_and_consent":
    "ONE notification pipeline, trial-ending reminders, and health consent recorded rather than assumed. This "
    + "is the one that was missing: it adds notifications.email_category, which 0095's admin email views "
    + "select from.",
  "0092_meal_plan_preferences":
    "Meal-plan preferences that were only ever held in React state. \"Keep it cheap\" has existed since the "
    + "planner did and was never saved anywhere — so a plan generated in budget mode was rebuilt WITHOUT it "
    + "on the nutrition page. Same seed, different dinners, in two places at once. Adds diet_budget and "
    + "diet_cook_level.",
  "0093_meal_budget_and_store":
    "A weekly food budget in pounds, and the supermarket it is measured in. The shop has to move off the "
    + "device with it: store prices differ by a flat index per shop, so once a budget can change the plan, an "
    + "athlete whose phone said Aldi and whose laptop said Tesco would be handed two different weeks from one "
    + "seed.",
  "0094_run_duration":
    "A run's own duration, separate from the session it sat inside. A footballer's Tuesday is a 90-minute "
    + "session with a 20-minute run in it, and pace computed from the session reads 4:30/km as 20:00/km. Also "
    + "widens distance_km, which was silently rounding 5.666km to 5.67.",
  "0095_admin_visibility_and_email_audit":
    "Admin visibility and the email audit. The delivery log has recorded every send since 0089 and the only "
    + "policy on it was \"read own\", so an admin querying it saw their own handful of rows and concluded "
    + "nothing was being sent — which is exactly what nothing being sent looks like. Adds admin reads, a "
    + "summary function, an audit that joins each send to the notification that triggered it, and the two "
    + "email categories that were asked for and did not exist (recovery alerts, meal plan).",
};

/**
 * What a migration says about itself, in its own words.
 *
 * Its first paragraph of comment, which in this project is reliably the line
 * that says what the migration is for — the rules and the ALL-CAPS arguments
 * come after it. Taking it verbatim is the whole trick: a summary copied by
 * hand is a second source of truth about a thing whose first source is three
 * lines long and right there.
 */
function summarise(part) {
  const sql = readFileSync(`supabase/migrations/${part}.sql`, "utf8");
  const collected = [];
  for (const raw of sql.split("\n")) {
    const line = raw.trim();
    // Decoration and blank lines before the prose are skipped; either one
    // AFTER it has started is the end of the paragraph.
    const isRule = /^--\s*[=═–—-]{4,}\s*$/.test(line);
    const isBlankComment = /^--\s*$/.test(line);
    if (!line.startsWith("--")) break;
    if (isRule || isBlankComment) {
      if (collected.length) break;
      continue;
    }
    collected.push(line.replace(/^--\s?/, "").trim());
  }
  // "0113: Retention — who came back" is already labelled with its number by
  // the line it is about to be printed on.
  const text = collected.join(" ").replace(/^0\d{3}\s*(?:[—:–-]\s*)?/, "").trim();
  if (!text) {
    throw new Error(
      `${part}.sql opens with no comment, so there is nothing to say about it in the header.\n`
      + `Give it an opening line, or add an entry to NOTES in scripts/build-apply-sql.mjs.`,
    );
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Greedy wrap, so the header stays inside eighty columns like the rest of it. */
function wrap(text, width) {
  const out = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && `${line} ${word}`.length > width) {
      out.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) out.push(line);
  return out;
}

const INDENT = "--         ";
function entry(part) {
  const lines = wrap(NOTES[part] ?? summarise(part), 67);
  return lines
    .map((line, i) => (i === 0 ? `--   ${part.slice(0, 4)}  ${line}` : `${INDENT}${line}`))
    .join("\n");
}

/**
 * The Worker's version, read from the Worker.
 *
 * It is in the header because the SQL is only half of a deploy and the other
 * half is a manual paste into the Cloudflare dashboard — somebody who runs
 * this file and stops finds the admin email panel still not answering. The
 * number is how they check the paste landed, so a number from three weeks ago
 * is worse than no number: it reads as confirmation.
 */
function workerVersion() {
  const found = /WORKER_VERSION = "([^"]+)"/.exec(readFileSync("cloudflare/worker.js", "utf8"));
  if (!found) throw new Error("cloudflare/worker.js has no WORKER_VERSION — the header quotes it");
  return found[1];
}

function header() {
  return `-- =============================================================================
-- PocketAthlete — migrations ${FIRST} to ${LAST}, in one file.
--
-- HOW TO RUN IT. Either:
--
--   1. Supabase dashboard -> SQL Editor -> New query -> paste the whole file
--      -> Run. It is one transaction-free script; run it top to bottom.
--
--   2. Or, from GitHub: Actions -> "Apply SQL to Supabase" -> Run workflow,
--      with file = ${OUT}. That needs the repo secret
--      SUPABASE_ACCESS_TOKEN (supabase.com/dashboard/account/tokens).
--      Prefer this one: it prints what the database returned and fails the run
--      on a non-2xx, so "did it apply?" has an answer in the log rather than in
--      somebody's memory of a paste.
--
-- SAFE TO RUN TWICE. Every statement is \`if not exists\`, \`create or replace\`,
-- \`drop policy if exists\` before create, or a guarded \`do $$\` block. Running it
-- again changes nothing and errors nowhere — so if you are unsure whether it
-- already went in, run it.
--
-- SAFE TO RUN LATE. Nothing here is required for the app to work; each feature
-- degrades to what it did before and says which migration is missing rather
-- than showing an empty screen. Applying it turns those features on.
--
-- IT STARTS AT ${FIRST} FOR A REASON. An earlier version of this file began at
-- 0092 and failed on a real database with \`42703: column "email_category" does
-- not exist\`, four hundred lines in: 0095 reads a column that 0091 adds, and
-- 0091 had never been applied. A combined file has to reach back to the last
-- migration anybody is sure about, and since every statement here is safe to
-- run twice, including one you already have costs nothing at all.
--
-- THIS FILE IS GENERATED. \`node scripts/build-apply-sql.mjs\` writes it, header
-- and all, from supabase/migrations — including the list below, so a migration
-- cannot be added to the paste without appearing in what the paste says it is.
-- Editing it here is editing the wrong file; lib/apply-sql.test.ts will say so.
--
-- WHAT IT ADDS, in order:
--
${PARTS.map(entry).join("\n--\n")}
--
-- AFTER RUNNING IT, one thing is still outstanding and is NOT in this file:
-- paste cloudflare/worker.js into the Cloudflare dashboard. The admin email
-- panel's configuration check, test send and retry are Worker routes, and the
-- Worker is deployed by hand. /health reports version ${workerVersion()} once it is.
-- =============================================================================


`;
}

function rebuild() {
  const body = PARTS.map((part) => {
    const rule = "-- ============================================================================";
    const sql = readFileSync(`supabase/migrations/${part}.sql`, "utf8").replace(/\s+$/, "");
    return `${rule}\n-- ${part}.sql\n${rule}\n\n${sql}\n\n`;
  }).join("");

  writeFileSync(OUT, header() + body);
  console.log(`${OUT} rebuilt from ${PARTS.length} migrations`);
}

/**
 * Importing this module must not rebuild anything — lib/apply-sql.test.ts
 * reads PARTS from here so the list cannot drift from a second copy.
 *
 * LAST LINE IN THE FILE, not near the top with the exports. It was above
 * NOTES, and `const` does not hoist: running the script threw "Cannot access
 * 'NOTES' before initialization" from inside a function declaration that had
 * hoisted perfectly well over the data it reads.
 */
if (import.meta.url === `file://${process.argv[1]}`) rebuild();
