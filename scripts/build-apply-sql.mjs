#!/usr/bin/env node
// =============================================================================
// Rebuild supabase/apply-0092-0095.sql from the migrations it claims to be.
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

const PARTS = [
  "0092_meal_plan_preferences",
  "0093_meal_budget_and_store",
  "0094_run_duration",
  "0095_admin_visibility_and_email_audit",
];

const OUT = "supabase/apply-0092-0095.sql";
const HEADER_END = "-- =============================================================================\n\n\n";

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
