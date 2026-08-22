// A ceiling on what the WHOLE APP spends on AI in a month.
//
// The per-user cap (migration 0035, TIER_BUDGET in the Worker) is the right
// control for one athlete and no control at all for the bill: every signup
// brings its own allowance, so the total is users x budget and has no maximum.
// Five hundred subscribers can authorise $1,500 of model spend a month without
// one of them going over their own limit, and nothing would notice until the
// invoice arrived. Free accounts are the worse half — allowance with no revenue
// behind it — so a burst of signups is a bill with nothing beside it.
//
// These read the Worker source rather than importing it: cloudflare/src/index.ts
// is a Workers module with its own runtime and is deployed by being pasted into
// a dashboard, so the source IS the artefact and reading it is the honest check.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { USD_TO_GBP, PLATFORM, AI_CEILING_USD, costLines } from "./costs";

const worker = readFileSync(new URL("../cloudflare/src/index.ts", import.meta.url), "utf8");
const bundle = readFileSync(new URL("../cloudflare/worker.js", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/0096_app_wide_ai_ceiling.sql", import.meta.url), "utf8");

function budgetUsd(): number {
  const m = worker.match(/const APP_BUDGET_USD = ([\d.]+);/);
  assert.ok(m, "APP_BUDGET_USD is gone");
  return Number(m![1]);
}

test("the whole bill, ceiling included, comes in under £100 a month", () => {
  // The number the ceiling is set to is only meaningful next to the costs that
  // arrive anyway. Supabase, Cloudflare and the domain are due whether one
  // person uses the app or ten thousand do, so the AI allowance is what is
  // LEFT of the hundred, not the hundred itself.
  const fixed = PLATFORM.reduce((n, p) => n + p.gbp, 0);
  const ai = budgetUsd() * USD_TO_GBP;
  assert.ok(fixed + ai <= 100, `£${(fixed + ai).toFixed(2)} a month — over the £100 the ceiling is set to hold`);
  // And not so far under that it throttles a working app for nothing.
  assert.ok(fixed + ai > 80, `£${(fixed + ai).toFixed(2)} leaves money on the table`);
});

test("the app and the Worker agree on what the ceiling is", () => {
  // Two copies of one number, because the Worker is a separate module pasted
  // into a dashboard and cannot import from lib/. Drift here would show an
  // admin a limit that is not the limit — so it fails the build instead.
  assert.equal(AI_CEILING_USD, budgetUsd(),
    "lib/costs.ts and cloudflare/src/index.ts disagree about the monthly AI ceiling");
});

test("the cost page says there is a ceiling, and what it is", () => {
  // This is where somebody goes when they are worried about the bill. A cap
  // nobody can see from there is a cap nobody trusts.
  const ai = costLines({ aiSpendUsd: 12.5, paidSubs: 3, mrr: 45 }).find((l) => l.label === "AI providers");
  assert.ok(ai, "the AI line is gone");
  assert.match(ai!.note, new RegExp(`\\$${AI_CEILING_USD}`));
  assert.match(ai!.note, /monthly ceiling/);
});

test("the ceiling is one number an admin can change without a repaste", () => {
  // A limit that needs a code change to raise is a limit somebody removes
  // permanently at 2am rather than raising for a month.
  assert.match(worker, /MONTHLY_BUDGET_USD: string;/);
  assert.match(worker, /envNum\(env\.MONTHLY_BUDGET_USD, APP_BUDGET_USD\)/);
});

test("running low switches off PAID models before it switches off the app", () => {
  // The ladder carries three providers that bill nothing, so a budget running
  // out has a setting between fine and off. Going straight to off would take
  // the coach away from every athlete over a bill that was still being paid.
  assert.match(worker, /const FREE_ONLY_ABOVE = 0\.75;/);
  assert.match(worker, /paidAllowed: !appSpendKnown \|\| appSpent < appBudget \* FREE_ONLY_ABOVE/);
  assert.match(worker, /const chain = opts\.freeOnly \? full\.filter\(billsNothing\) : full;/);
});

test("free means priced at zero, not a list of provider names", () => {
  // A name list goes stale the day Groq starts billing and GROQ_PROMPT_PER_M is
  // set — and it goes stale silently, which is how a ceiling stops being one.
  const fn = worker.slice(worker.indexOf("const billsNothing"), worker.indexOf("const chain = opts.freeOnly"));
  assert.match(fn, /modelPrice\(env, r\)/);
  assert.match(fn, /price\.prompt === 0 && price\.completion === 0/);
  assert.doesNotMatch(fn, /"groq"|"nvidia"/, "the free set is hardcoded by provider again");
});

test("priority AI does not cancel the ceiling", () => {
  // Priority means "skip the free rungs" and freeOnly means "use nothing else".
  // Together they are a chain of no rungs, so one has to win, and it must be
  // the ceiling: a slower answer is a far smaller broken promise than none.
  assert.match(worker, /const free = opts\.priority && !opts\.freeOnly \? \[\] : orChain\.filter\(isFree\)/);
  assert.match(worker, /const priority = !opts\.freeOnly && meetsTier\(/);
});

test("every AI endpoint is behind the ceiling, not just the chatty one", () => {
  // A cap that covers the coach and not the meal photos caps the cheap half.
  const calls = worker.match(/await meteredComplete\(env, u\.id, \{/g) ?? [];
  const capped = worker.match(/freeOnly: !budget\.paidAllowed,/g) ?? [];
  assert.ok(calls.length >= 6, `only ${calls.length} AI call sites found — has the shape changed?`);
  assert.equal(capped.length, calls.length, "an AI endpoint is not passing the ceiling through");
});

test("at the ceiling the athlete is told it is not their fault", () => {
  // Telling somebody who has barely used the app that they are out of allowance
  // is a lie they will reasonably complain about — and offering them an upgrade
  // to fix it is selling something that would not work.
  const fn = worker.slice(worker.indexOf("function overBudget"), worker.indexOf("// --- AI via OpenRouter"));
  assert.match(fn, /AI coaching is paused for the rest of the month\./);
  assert.match(fn, /appSpendKnown && state\.appSpent >= state\.appBudget/);
  // The branch taken at the ceiling is the first string after the `?`.
  const paused = fn.slice(fn.indexOf("const tail")).match(/\?\s*"([^"]*)"/);
  assert.ok(paused, "the app-wide tail is no longer a plain string");
  assert.doesNotMatch(paused![1], /upgrade/, "the app-wide message still upsells");
});

test("a Worker running ahead of the migration does not take the app down", () => {
  // Both halves are pasted by hand, in either order. A Worker live against a
  // database without 0096 reads no app total; treating that as "spent
  // everything" would black out the AI for a missing migration.
  assert.match(worker, /const appSpendKnown = row\.app_spent !== undefined && row\.app_spent !== null;/);
  assert.match(worker, /allowed: row\.allowed === true && !\(appSpendKnown && appSpent >= appBudget\)/);
});

test("...and the fact that it is not enforcing is visible", () => {
  // Failing open is only defensible if somebody can find out. `/health` is
  // public — the app reads it to learn whether the server can see photos — so
  // spend goes on an admin-gated route of its own.
  assert.match(worker, /pathname\.endsWith\("\/ai-status"\)/);
  const fn = worker.slice(worker.indexOf("async function aiStatus"), worker.indexOf("* IS EMAIL CONFIGURED"));
  assert.match(fn, /if \(!\(await isAdmin\(env, user\.id\)\)\) return json\(\{ error: "forbidden" \}, 403\);/);
  assert.match(fn, /appSpendKnown: state\.appSpendKnown/);
  assert.match(fn, /apply migration 0096/);
  // The public route must not start reporting money.
  const health = worker.slice(worker.indexOf('pathname.endsWith("/health")'), worker.indexOf('return json({ error: "not found" }, 404)'));
  assert.doesNotMatch(health, /appSpent|appBudget/, "spend leaked onto the unauthenticated health route");
});

test("the database returns the app total from the check that is already on the path", () => {
  // A second round trip per AI call to read one number would cost latency on
  // every request to save money on the last few.
  assert.match(migration, /returns table \(allowed boolean, spent numeric, calls_today int, app_spent numeric\)/);
  assert.match(migration, /drop function if exists public\.check_ai_budget\(uuid, numeric, int\);/,
    "the return type changed and create-or-replace cannot do that");
  // The drop takes the grants with it, and a function left granted to PUBLIC
  // lets any authenticated user read the app's spend.
  const after = migration.slice(migration.indexOf("drop function if exists public.check_ai_budget"));
  assert.match(after, /revoke execute on function public\.check_ai_budget\(uuid, numeric, int\) from public, anon, authenticated;/);
  assert.match(after, /grant execute on function public\.check_ai_budget\(uuid, numeric, int\) to service_role;/);
});

test("summing a month of spend has an index to do it with", () => {
  // The primary key leads with user_id, so it cannot serve a sum over a period.
  assert.match(migration, /create index if not exists ai_spend_period_idx on public\.ai_spend \(period\)/);
});

test("the deployed bundle carries the ceiling too", () => {
  // The Worker is deployed by pasting worker.js. A ceiling that only exists in
  // the TypeScript is a ceiling that has never run.
  assert.match(bundle, /APP_BUDGET_USD/);
  assert.match(bundle, /FREE_ONLY_ABOVE/);
  assert.match(bundle, /MONTHLY_BUDGET_USD/);
  assert.match(bundle, /ai-status/);
});
