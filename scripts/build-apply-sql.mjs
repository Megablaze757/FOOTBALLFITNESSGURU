#!/usr/bin/env node
// =============================================================================
// Rebuild supabase/apply-0088-0106.sql from the migrations it claims to be.
//
// WHY A SCRIPT AND NOT A HAND-EDITED FILE. A paste-ready copy of four
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
];

const OUT = "supabase/apply-0088-0106.sql";
const HEADER_END = "-- =============================================================================\n\n\n";

// Importing this module must not rebuild anything — lib/apply-sql.test.ts
// reads PARTS from here so the list cannot drift from a second copy.
if (import.meta.url === `file://${process.argv[1]}`) rebuild();

function rebuild() {
const existing = readFileSync(OUT, "utf8");
const header = existing.slice(0, existing.indexOf(HEADER_END) + HEADER_END.length);
if (!header) throw new Error(`${OUT} has no header to preserve — restore it before rebuilding`);

const body = PARTS.map((part) => {
  const rule = "-- ============================================================================";
  const sql = readFileSync(`supabase/migrations/${part}.sql`, "utf8").replace(/\s+$/, "");
  return `${rule}\n-- ${part}.sql\n${rule}\n\n${sql}\n\n`;
}).join("");

writeFileSync(OUT, header + body);
console.log(`${OUT} rebuilt from ${PARTS.length} migrations`);
}
