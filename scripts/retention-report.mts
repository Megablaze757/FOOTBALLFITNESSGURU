// =============================================================================
// WHAT THE DATABASE ACTUALLY SAYS ABOUT WHO STAYED.
//
//   SUPABASE_DB_URL=... node --import tsx scripts/retention-report.mts
//
// or, the same way scripts/db-verify.mjs takes it:
//
//   SUPABASE_PROJECT_REF=... SUPABASE_DB_PASSWORD=... \
//     node --import tsx scripts/retention-report.mts
//
// ═══════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS AS A SCRIPT RATHER THAN AS A DASHBOARD.
//
// lib/retention.ts and lib/proportions.ts can answer "did anybody stay" and
// "is that number worth anything", and neither had ever been pointed at the
// real database. The only sample size this project has ever written down is
// the "22 users, 0 paying" in migration 0045's opening comment, and every
// decision about what to build next rests on whether that is still true.
//
// It runs where the credentials already are. A database password is not
// something to paste into a chat window, a CI secret, or a file in this repo,
// and none of those are needed: this reads the numbers on the machine that
// already has the connection string and prints a summary.
//
// ═══════════════════════════════════════════════════════════════════════════
// IT PRINTS NO IDENTITIES, AND THAT IS A DESIGN CONSTRAINT RATHER THAN A HABIT.
//
// The output of this is meant to be readable, quotable, and pasteable — into
// a message, a note, an issue. So it must not contain a single thing that
// identifies an athlete: no ids, no emails, no names, no per-person rows. Only
// counts, dates and rates.
//
// That is the same rule migration 0045 set for funnel_events ("no free text,
// no health data, no email addresses") and the same one 0046 had to enforce
// after funnel_summary shipped readable by anybody signed in. A report whose
// output is safe to share is a report somebody will actually share.
//
// READ ONLY. Every statement below is a SELECT. This does not need 0113 or
// 0114 to have been applied — it reads the tables those migrations read, so
// it answers the question today rather than after a deploy.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

import { Client } from "pg";
import { canUseManagementApi, runQuery } from "../lib/supabase-query";
import {
  LAPSED_AFTER_DAYS, daysSinceActive, longestStreak, retentionReport, standing, type Account,
} from "../lib/retention";
import { describeRate, detectableLift, sampleNeeded } from "../lib/proportions";
import { firstUse } from "../lib/funnel";
import { winBack, WIN_BACK_AFTER_DAYS, WIN_BACK_UNTIL_DAYS, type Facts } from "../lib/win-back";
import { metricLabel } from "../lib/milestones";

const REF = process.env.SUPABASE_PROJECT_REF;
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REGION = process.env.SUPABASE_REGION ?? "eu-west-3";
const connectionString =
  process.env.SUPABASE_DB_URL ??
  (REF && PASSWORD
    ? `postgresql://postgres.${REF}:${PASSWORD}@aws-0-${REGION}.pooler.supabase.com:5432/postgres`
    : "");

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TWO WAYS IN, AND THE SECOND ONE IS WHY THIS EVER GETS RUN.
 *
 * This script has been the first item in HANDOVER.md for as long as that file
 * has existed and has never been run once. Not because anybody disagreed —
 * because running it meant finding a connection string, and the connection
 * string is a DATABASE PASSWORD, which is the one credential this project has
 * already leaked and had to rotate.
 *
 * .github/workflows/apply-sql.yml had already solved that: the Management API
 * takes a personal access token, the repository already holds one, and it is
 * neither the database password nor the service_role key. So the same report
 * runs from the Actions tab with a secret that already exists.
 *
 * THE ANALYSIS DOES NOT MOVE. Only the rows come from somewhere else; every
 * judgement about what they mean stays in lib/retention.ts and
 * lib/proportions.ts, where there are tests for it. Rewriting the windows and
 * the eligibility rule as SQL would be a second implementation of the thing
 * this repository has spent several commits de-duplicating.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const viaApi = canUseManagementApi(process.env);

if (!connectionString && !viaApi) {
  console.error(
    "No way in.\n\n"
    + "  SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... node --import tsx scripts/retention-report.mts\n"
    + "    the Management API. The token is the one apply-sql.yml uses, and is\n"
    + "    NOT the database password and NOT the service_role key. This is also\n"
    + "    what the \"Retention report\" workflow runs, so the easiest way to get\n"
    + "    this output is the Actions tab.\n\n"
    + "  SUPABASE_DB_URL=postgresql://... node --import tsx scripts/retention-report.mts\n"
    + "    or SUPABASE_PROJECT_REF plus SUPABASE_DB_PASSWORD, the pair\n"
    + "    scripts/db-verify.mjs takes.\n\n"
    + "Nothing is written and nothing is stored either way.",
  );
  process.exit(2);
}

const client = viaApi ? null : new Client({ connectionString, ssl: { rejectUnauthorized: false } });
if (client) await client.connect();

/**
 * One read, from whichever source this run has.
 *
 * A FAILURE IS A SENTENCE, NOT A STACK TRACE. This is read in a workflow log
 * by somebody who wants a number, and a top-level rejection from a module of
 * top-level awaits prints twenty lines of node internals above the one line
 * that says what went wrong. The messages themselves are already good — an
 * expired token gives "HTTP 401: the database refused it: JWT could not be
 * decoded", naming the query it was on — so the only thing needed is to stop
 * burying them.
 */
const ask = async (sql: string): Promise<Record<string, unknown>[]> => {
  try {
    if (client) return (await client.query(sql)).rows as Record<string, unknown>[];
    return await runQuery(sql, { ref: String(REF), token: String(TOKEN) });
  } catch (e) {
    console.error(`\nCould not read the database.\n  ${e instanceof Error ? e.message : String(e)}`);
    if (viaApi) {
      console.error(
        "\nIf that is an authentication failure, the token has expired or was\n"
        + "never set. Generate one at supabase.com/dashboard/account/tokens and\n"
        + "put it in Settings -> Secrets and variables -> Actions as\n"
        + "SUPABASE_ACCESS_TOKEN. It is not the database password.",
      );
    }
    if (client) await client.end().catch(() => {});
    process.exit(1);
  }
};

const today = new Date().toISOString().slice(0, 10);
const asDay = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").slice(0, 10));

/**
 * The activity definition is 0098's and is not re-decided here: the later of a
 * check-in and a training log. A session refresh counts as a sign-in and so
 * does opening the app and closing it, which is why "last sign-in" was dropped.
 */
const profiles = await ask(`select p.id, u.created_at
     from public.profiles p
     join auth.users u on u.id = p.id`);
const checks = await ask(`select user_id, check_in_date from public.daily_check_ins`);
const logs = await ask(`select user_id, log_date from public.training_logs`);
const bests = await ask(`select b.user_id, m.key as metric, (m.value)::text::numeric as value, b.test_date
     from public.strength_benchmarks b
     cross join lateral jsonb_each(b.metrics) as m(key, value)
    where m.key like '%\\_1rm'
      and jsonb_typeof(m.value) = 'number'
      and (m.value)::text::numeric > 0`);
/**
 * The activation events, counted per DISTINCT athlete.
 *
 * Counting rows would count somebody who built three blocks as three people
 * and turn a fraction of onboarded into something over 100%. The question is
 * "how many people ever reached this", which is a count of distinct users.
 */
const events = await ask(`select event, count(distinct user_id)::int as people
     from public.funnel_events
    group by event`);
const consent = await ask(`select count(*) filter (where health_data_consent_at is not null) as consented,
          count(*) as total
     from public.profiles`);

if (client) await client.end();

// ---------------------------------------------------------------------------
// Fold the rows into the shape lib/retention.ts is tested against.
// ---------------------------------------------------------------------------
const days = new Map<string, Set<string>>();
const note = (userId: unknown, day: unknown) => {
  const id = String(userId ?? "");
  const on = asDay(day);
  if (!id || !on) return;
  const held = days.get(id) ?? new Set<string>();
  held.add(on);
  days.set(id, held);
};
for (const row of checks) note(row.user_id, row.check_in_date);
for (const row of logs) note(row.user_id, row.log_date);

const sessions = new Map<string, number>();
for (const row of logs) {
  const id = String(row.user_id ?? "");
  sessions.set(id, (sessions.get(id) ?? 0) + 1);
}

/**
 * The longest run of consecutive check-in days, per athlete.
 *
 * The counting is longestStreak() from lib/retention.ts rather than a third
 * copy of the same loop — 0114 needs its own in SQL because the Worker's query
 * runs in the database, and two implementations of one rule is already one
 * more than anybody can keep in step.
 */
const streaks = new Map<string, number>();
const checkDays = new Map<string, string[]>();
for (const row of checks) {
  const id = String(row.user_id ?? "");
  const on = asDay(row.check_in_date);
  if (!id || !on) continue;
  checkDays.set(id, [...(checkDays.get(id) ?? []), on]);
}
for (const [id, list] of checkDays) streaks.set(id, longestStreak(list));

const best = new Map<string, { label: string; value: number; unit: string; on: string }>();
for (const row of bests) {
  const id = String(row.user_id ?? "");
  const value = Number(row.value ?? 0);
  const held = best.get(id);
  if (!held || value > held.value) {
    best.set(id, { label: metricLabel(String(row.metric)), value, unit: "kg", on: asDay(row.test_date) });
  }
}

const accounts: Account[] = profiles.map((p) => ({
  id: String(p.id),
  joined: asDay(p.created_at),
  activeDays: [...(days.get(String(p.id)) ?? [])],
}));

// ---------------------------------------------------------------------------
const line = (s = "") => console.log(s);
line(`PocketAthlete — retention, ${today}`);
line("=".repeat(60));
line();
for (const l of retentionReport(accounts, today)) line(`  ${l}`);

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WHERE THE ONES WHO NEVER LOGGED ANYTHING ACTUALLY STOPPED.
 *
 * "Never logged anything" is one number and three completely different
 * problems: they never finished onboarding, they onboarded and never got a
 * block, or they got a block and never trained from it. The fixes have nothing
 * in common, and until program_built and first_session were given a place in
 * the report the difference could not be seen.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const counts: Record<string, number> = {};
for (const row of events) counts[String(row.event)] = Number(row.people ?? 0);
const started = firstUse(counts);

line();
line("Did the product ever start working for them?");
line("-".repeat(60));
if (!started.base) {
  line("  Nobody has finished onboarding, so there is nothing to measure yet.");
} else {
  line(`  Of the ${started.base} who finished onboarding:`);
  for (const step of started.steps) line(`    ${step.label}: ${step.reading}`);
}

const where = standing(accounts, today);
line();
line("Consent");
line("-".repeat(60));
// Everything but an essential email is gated on this — see the join in
// pending_notification_emails(). An athlete without it cannot be reached at
// all, which changes what the lapsed number is worth.
line(`  ${describeRate(Number(consent[0]?.consented ?? 0), Number(consent[0]?.total ?? 0))} have given health-data consent`);
line("  (everything except account email is gated on it, so the rest are unreachable)");

// ---------------------------------------------------------------------------
// What the win-back would actually do, before it is deployed.
//
// The interesting number is not how many are lapsed — it is how many of them
// have a statistic worth a sentence, because lib/win-back.ts sends nothing to
// the rest. If that number is small, the feature is not worth the deploy.
// ---------------------------------------------------------------------------
let wouldSend = 0;
let nothingToSay = 0;
const leads = new Map<string, number>();
for (const account of [...where.lapsed]) {
  const quiet = daysSinceActive(account, today);
  if (quiet === null || quiet < WIN_BACK_AFTER_DAYS || quiet > WIN_BACK_UNTIL_DAYS) continue;
  const facts: Facts = {
    lastActive: [...account.activeDays].sort().at(-1) ?? null,
    sessions: sessions.get(account.id) ?? 0,
    longestStreak: streaks.get(account.id) ?? 0,
    best: best.get(account.id) ?? null,
    wantsEmail: true,
    alreadySent: false,
  };
  const message = winBack(facts, today);
  if (!message) { nothingToSay += 1; continue; }
  wouldSend += 1;
  // The SHAPE of the line, never the line itself — the subject contains their
  // own numbers and this output is meant to be safe to paste.
  const shape = /sessions\./.test(message.subject) ? "nearly a milestone"
    : /is still/.test(message.subject) ? "a personal best that still stands"
    : "a streak they beat once";
  leads.set(shape, (leads.get(shape) ?? 0) + 1);
}

line();
line("Win-back (lib/win-back.ts, not yet deployed)");
line("-".repeat(60));
line(`  Past ${LAPSED_AFTER_DAYS} days and inside the ${WIN_BACK_UNTIL_DAYS}-day ceiling: ${wouldSend + nothingToSay}`);
line(`  Would get a message: ${wouldSend}`);
line(`  Have nothing specific worth saying, so get nothing: ${nothingToSay}`);
for (const [shape, count] of [...leads].sort((a, b) => b[1] - a[1])) line(`    ${count} on ${shape}`);

// ---------------------------------------------------------------------------
// And the question the startup advice was really about.
// ---------------------------------------------------------------------------
const population = accounts.length;
const perArm = Math.floor(population / 2);
line();
line("Could anything here be A/B tested?");
line("-".repeat(60));
line(`  ${population} accounts is ${perArm} per arm.`);
for (const baseline of [0.1, 0.3]) {
  const smallest = detectableLift(perArm, baseline);
  line(`  Against a ${Math.round(baseline * 100)}% baseline, the smallest change that could be settled `
    + `is ${(smallest * 100).toFixed(0)} points.`);
}
line(`  Settling a 5-point change against a 30% baseline needs `
  + `${sampleNeeded({ baseline: 0.3, lift: 0.05 }).toLocaleString()} per arm.`);
line();
line("Nothing was written. No identity appears above; this output is safe to share.");
