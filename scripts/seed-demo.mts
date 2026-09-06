/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FILL THE DEMO ACCOUNT, SO THE REEL HAS SOMETHING TO FILM.
 *
 * The reel's closing line is "build a week of meals and it prices the whole
 * shop", and the shot behind it was "Add your weight to get your targets" —
 * the empty state, because the account had no height, no age, no sex, no
 * weigh-ins and no meals. The app was working perfectly and had nothing to
 * show.
 *
 * WHAT IT WRITES is decided in lib/demo-seed.ts and tested there. This file is
 * only the plumbing.
 *
 * WHAT IT WILL NOT DO:
 *   * Run without --yes. It writes to a live database.
 *   * Take credentials from anywhere but the environment. No default, no
 *     fallback, no file in this repository — lib/no-secrets.test.ts fails the
 *     build if one appears.
 *   * Delete anything. Every write is an upsert keyed by day, so re-running
 *     replaces the rows it wrote before and touches nothing else.
 *   * Reach another account. Every row carries the signed-in user's id, and
 *     RLS would refuse it anyway — but the id is printed before any write so
 *     the operator can see whose account this is.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { secretValue } from "../lib/env-value";
import { configValue } from "../lib/env-value";
import {
  DEMO_PROFILE, bodyLogs, checkIns, nutritionLogs, trainingLogs,
} from "../lib/demo-seed";

const url = configValue(process.env.SUPABASE_URL);
const key = configValue(process.env.SUPABASE_KEY);
const email = secretValue(process.env.REEL_EMAIL);
const password = secretValue(process.env.REEL_PASSWORD);

if (!url || !key || !email || !password) {
  console.error(
    "Set SUPABASE_URL, SUPABASE_KEY, REEL_EMAIL and REEL_PASSWORD.\n"
    + "The first two are public; the last two are the demo account's.",
  );
  process.exit(1);
}

const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: key, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
if (!res.ok) {
  console.error(`Sign-in failed (HTTP ${res.status}). ${(await res.text()).slice(0, 200)}`);
  process.exit(1);
}
const session = await res.json() as { access_token: string; user: { id: string; email: string } };
const uid = session.user.id;

console.log(`Account: ${session.user.email}\nUser id: ${uid}`);

if (!process.argv.includes("--yes")) {
  console.log("\nDry run. Nothing written. Re-run with --yes to write to this account.");
  process.exit(0);
}

const auth = {
  apikey: key,
  Authorization: `Bearer ${session.access_token}`,
  "Content-Type": "application/json",
};

/**
 * Upsert on the table's own unique-per-day constraint, so a second run
 * replaces what the first wrote instead of failing on a duplicate — and
 * instead of deleting anything to make room.
 */
async function upsert(table: string, rows: object[], onConflict: string): Promise<void> {
  if (rows.length === 0) return;
  const r = await fetch(`${url}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: "POST",
    headers: { ...auth, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows.map((row) => ({ ...row, user_id: uid }))),
  });
  if (!r.ok) {
    console.error(`  ${table}: HTTP ${r.status} — ${(await r.text()).slice(0, 240)}`);
    return;
  }
  console.log(`  ${table}: ${rows.length} rows`);
}

const today = new Date();

// The profile first: without height, age and sex the targets card stays on its
// empty state no matter how many meals are logged behind it.
const p = await fetch(`${url}/rest/v1/profiles?id=eq.${uid}`, {
  method: "PATCH",
  headers: { ...auth, Prefer: "return=minimal" },
  body: JSON.stringify(DEMO_PROFILE),
});
console.log(p.ok ? "  profiles: updated" : `  profiles: HTTP ${p.status} — ${(await p.text()).slice(0, 240)}`);

await upsert("daily_check_ins", checkIns(today), "user_id,check_in_date");
await upsert("body_logs", bodyLogs(today), "user_id,log_date");
await upsert("nutrition_logs", nutritionLogs(today), "user_id,log_date");
await upsert("training_logs", trainingLogs(today), "user_id,log_date");

console.log("\nDone. Record a reel and check /nutrition and /home.");
