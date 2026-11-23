// =============================================================================
// WHICH CHECK-IN COLUMNS THE DATABASE MIGHT NOT HAVE YET.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE SITE AND THE SCHEMA SHIP SEPARATELY, AND NOTHING ORDERS THEM.
//
// The front end deploys on a push to main. The SQL is applied by hand through
// .github/workflows/apply-sql.yml, by a person, afterwards. So there is always
// a window where the browser knows about a column the database has not got,
// and PostgREST does not skip a column it does not recognise — it rejects the
// whole statement. lib/profile-columns.ts is the same lesson learnt on
// `profiles`, where four unmigrated columns made every profile read as a
// brand-new athlete.
//
// On `daily_check_ins` the stakes are higher, because the row being rejected
// is one somebody just filled in. Migration 0115 is the live case.
//
// ═══════════════════════════════════════════════════════════════════════════
// AND THE OFFLINE QUEUE IS WHERE IT STOPS BEING RECOVERABLE.
//
// A failed save in the form is visible: the athlete is looking at it. A failed
// REPLAY is not. components/PWA.tsx drains the queue in the background, a
// rejected row is simply left for next time, and lib/offline-queue.ts keeps
// only the most recent 14 entries. So a check-in made in a basement, during
// the window, would be retried silently until enough days pushed it off the
// end — and then it would be gone, with nothing having said so.
//
// Both write paths split their payload with this list and go through
// upsertWithOptional, so the entry lands without the new answers rather than
// not landing. lib/checkin-columns.test.ts keeps the list in step with the
// migration, and checks both paths still use it.
// =============================================================================

/**
 * The columns migration 0115 added, by name.
 *
 * Kept in step with supabase/migrations/0115_*.sql by its test. A name here
 * that the migration does not add would strip a real column out of every
 * write; a column there that is missing here would be the thing that rejects
 * the row.
 */
export const CHECKIN_COLUMNS_0115 = [
  "sleep_hours",
  "stress_score",
  "soreness_score",
  "cycle_phase",
] as const;

/**
 * Split a check-in payload into what has always been there and what 0115 added.
 *
 * Only keys actually present are moved, so a payload queued before this
 * existed — the shape in somebody's localStorage right now — splits into
 * itself and an empty object, and writes exactly as it always did.
 */
export function splitCheckIn(payload: Record<string, unknown>): {
  stable: Record<string, unknown>;
  optional: Record<string, unknown>;
} {
  const stable: Record<string, unknown> = {};
  const optional: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if ((CHECKIN_COLUMNS_0115 as readonly string[]).includes(key)) optional[key] = value;
    else stable[key] = value;
  }
  return { stable, optional };
}
