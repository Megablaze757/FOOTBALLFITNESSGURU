// =============================================================================
// THIS IS TYPESCRIPT. DO NOT PASTE IT INTO THE CLOUDFLARE DASHBOARD.
//
// It was pasted into the dashboard editor and produced
//
//   Uncaught SyntaxError: Unexpected token 'export' at index.js:24
//
// which is the runtime telling you it has been handed a language it does not
// speak: `env: Env`, `Promise<Map<string, string>>` and `export interface` are
// types, and Workers run JavaScript.
//
// The file to paste is  cloudflare/worker.js  — the same code, bundled and with
// the types stripped, rebuilt by `node scripts/build-worker-bundle.mjs`. Its own
// header says so. This file is what `wrangler deploy` reads (see wrangler.toml
// `main`), and what you edit.
// =============================================================================

import { launchEmail } from "./launch-email";

// =============================================================================
// PocketAthlete API — a single Cloudflare Worker for the app's server-side needs:
//   • AI (coach chat + program generation) via OpenRouter
//   • Stripe checkout + webhook
//   • Scheduled reminder emails via Resend
//
// One place for all your secrets. Deploy: `wrangler deploy`. Config: see README.
// The static SPA calls this Worker (NEXT_PUBLIC_API_URL); if unset it falls back
// to Supabase Edge Functions / the local engine, so nothing here is load-bearing
// for the app to run — it just unlocks the "real AI + payments + email" path.
// =============================================================================

// Commission maths is imported rather than reimplemented here. esbuild inlines
// it at bundle time, so the code that decides what someone is owed is the same
// code the unit tests cover — a second copy would be the one that goes wrong.
import { splitCommission, estimateStripeFee } from "../../lib/affiliate";
// Same reasoning as the commission maths above: this is the code that decides
// what an athlete's readiness is built from, so it should be the code the unit
// tests cover rather than a second copy that drifts.
import { parseOuraSleep, parseIngestPayload } from "../../lib/biometrics";

export interface Env {
  // AI
  OPENROUTER_API_KEY: string;
  OPENROUTER_MODEL: string; // paid model — the last rung before the on-device engine
  OPENROUTER_FREE_MODELS: string; // comma-separated ":free" slugs, tried first
  /**
   * Groq — the PRIMARY provider, and the reason this is a ladder at all.
   *
   * All three endpoints are OpenAI-compatible, so only the base URL, the
   * credential and the model slugs differ between them. Setting a provider's
   * key IS the switch that enables it: no separate AI_PROVIDER variable, and
   * therefore no way to select a provider you have no key for — a failure that
   * would look exactly like the model being down.
   *
   * Groq goes first on latency. These calls are output-token-bound (prompts run
   * 76-900 tokens, max_tokens up to 2200), so throughput dominates response
   * time and Groq's is roughly an order of magnitude above a shared GPU free
   * tier.
   */
  GROQ_SECRET: string;
  GROQ_MODEL: string;            // primary Groq slug
  GROQ_FALLBACK_MODELS: string;  // comma-separated slugs tried after it
  GROQ_PROMPT_PER_M: string;     // USD per million prompt tokens (blank = free tier)
  GROQ_COMPLETION_PER_M: string; // USD per million completion tokens
  /**
   * Vision model chains, per provider, comma-separated.
   *
   * Separate from the text chains because MOST MODELS CANNOT SEE, and sending a
   * photo to one that can't is the entire meal-photo bug: the request succeeds,
   * the model answers confidently about a meal it never saw, and nothing
   * anywhere reports an error. A slug belongs in a vision list only once it has
   * been confirmed to accept image input.
   */
  GROQ_VISION_MODELS: string;
  OPENROUTER_VISION_MODELS: string;
  NVIDIA_VISION_MODELS: string;
  /** NVIDIA NIM — kept as a last-resort rung. See GROQ_SECRET for the pattern. */
  NVIDIA_SECRET: string;
  NVIDIA_MODEL: string;       // primary NVIDIA slug
  NVIDIA_FALLBACK_MODELS: string; // comma-separated slugs tried after it
  NVIDIA_PROMPT_PER_M: string;     // USD per million prompt tokens
  NVIDIA_COMPLETION_PER_M: string; // USD per million completion tokens
  // Auth (verify the caller's Supabase session)
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  // Stripe
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRICE_SILVER: string;
  STRIPE_PRICE_GOLD: string;
  // Email
  RESEND_API_KEY: string;
  REMINDER_FROM: string;
  /**
   * Where a reply should land. Optional; falls back to REMINDER_FROM's address.
   *
   * WHY IT IS SEPARATE FROM THE SENDER. Resend wants a domain of its own —
   * sending from the root alongside a mailbox provider puts two services on one
   * SPF record, which is the usual cause of mail going to spam — so the From
   * address ends up on a subdomain like send.pocketathlete.com. Nobody reads a
   * mailbox on a subdomain that exists only to send. So the athlete who hits
   * reply on a nudge is writing to a void, and never finds out.
   *
   * Set this to the mailbox a person actually opens.
   */
  REPLY_TO: string;
  GAS_EMAIL_URL: string;     // Google Apps Script web-app URL (preferred email sender)
  GAS_EMAIL_SECRET: string;  // shared secret the GAS script checks
  VAPID_PUBLIC_KEY: string;  // base64url P-256 point; must match NEXT_PUBLIC_VAPID_PUBLIC_KEY
  VAPID_PRIVATE_KEY: string; // base64url 'd' of the same key pair — secret
  VAPID_SUBJECT: string;     // mailto: contact, required by the push services
  AI_DAILY_LIMIT: string;       // max LLM calls per user per day (default 40)
  TRIAL_DAYS: string;           // free-trial length in days (default 14; 0 disables)
  PAID_PROMPT_PER_M: string;    // USD per million prompt tokens on the paid model
  PAID_COMPLETION_PER_M: string; // USD per million completion tokens
  APP_URL: string;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    const { pathname } = new URL(req.url);
    try {
      if (pathname.endsWith("/coach-chat")) return await coachChat(req, env);
      if (pathname.endsWith("/generate-program")) return await generateProgram(req, env);
      if (pathname.endsWith("/estimate-food")) return await estimateFood(req, env);
      if (pathname.endsWith("/generate-challenges")) return await generateChallenges(req, env);
      if (pathname.endsWith("/generate-content")) return await generateContent(req, env);
      if (pathname.endsWith("/injury-plan")) return await injuryPlan(req, env);
      if (pathname.endsWith("/create-checkout")) return await createCheckout(req, env);
      if (pathname.endsWith("/billing-portal")) return await billingPortal(req, env);
      if (pathname.endsWith("/cancel-subscription")) return await cancelSubscription(req, env);
      if (pathname.endsWith("/pause-subscription")) return await pauseSubscription(req, env);
      if (pathname.endsWith("/resume-subscription")) return await resumeSubscription(req, env);
      if (pathname.endsWith("/delete-account")) return await deleteAccount(req, env);
      if (pathname.endsWith("/stripe-webhook")) return await stripeWebhook(req, env);
      if (pathname.endsWith("/admin-create-user")) return await adminCreateUser(req, env);
      if (pathname.endsWith("/announce-launch")) return await announceLaunch(req, env);
      if (pathname.endsWith("/connect-wearable")) return await connectWearable(req, env);
      if (pathname.endsWith("/ingest-token")) return await mintIngestToken(req, env);
      // Admin email tooling. See emailStatus for why this cannot be answered
      // from the app: the provider key is a Worker secret and secrets cannot be
      // read back out, so only the Worker knows whether email can send at all.
      if (pathname.endsWith("/email-status")) return await emailStatus(req, env);
      if (pathname.endsWith("/email-test")) return await emailTest(req, env);
      if (pathname.endsWith("/email-retry")) return await emailRetry(req, env);
      // NOT session-authenticated — see the function. An Apple Shortcut cannot
      // hold a Supabase JWT, so this one carries its own bearer token.
      if (pathname.endsWith("/wearable-ingest")) return await wearableIngest(req, env);
      // WORKER_VERSION is bumped whenever this file changes in a way that
      // matters. The Worker is pasted into the dashboard by hand, so "is the
      // fix actually live?" was previously unanswerable without an authorised
      // request — and I twice reasoned about behaviour from source that wasn't
      // deployed. curl the health route and you know.
      if (pathname.endsWith("/health")) {
        // Reports the whole ladder, not just the top rung. After a paste into
        // the dashboard the question is always "did the secret actually take?"
        // — and a missing NVIDIA_SECRET is invisible otherwise, because the
        // Worker would quietly carry on serving from OpenRouter.
        const chain = modelChain(env);
        const vision = visionChain(env);
        return json({
          ok: true,
          version: WORKER_VERSION,
          model: chain[0] ? `${chain[0].provider}/${chain[0].model}` : null,
          providers: [...new Set(chain.map((r) => r.provider))],
          chain: chain.map((r) => `${r.provider}/${r.model}`),
          // The client routes photos on this field: present means "this server
          // can see", absent means send them elsewhere or don't offer a camera.
          // It must therefore report the chain that ACTUALLY exists, never a
          // hardcoded true — advertising vision we can't do is how photos
          // reached a text-only model and got answered anyway.
          vision: vision.length ? vision.map((r) => `${r.provider}/${r.model}`) : false,
        });
      }
      return json({ error: "not found" }, 404);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      /**
       * A model-chain failure is not a 500 and should not read like one.
       *
       * This used to return `String(e)` verbatim, so an athlete tapping
       * "build my plan" was shown "Error: all models failed — groq/…: unusable
       * output | openrouter/…: unusable output" — a sentence that names our
       * suppliers, explains nothing they can act on, and looks like the app
       * broke rather than the AI being unavailable, which the on-device engine
       * is standing by to cover.
       *
       * 503 rather than 500: the request was fine, the upstream is temporarily
       * not. The trail moves to `detail` so it is still one click away in the
       * network tab for whoever is debugging, without being the headline.
       */
      if (/^all (models|vision models) failed/.test(raw)) {
        return json({
          error: "The AI coach is unavailable right now — your plan was built on this device instead.",
          reason: "upstream_unavailable",
          detail: raw,
        }, 503);
      }
      return json({ error: raw }, 500);
    }
  },

  // Cron triggers (configured in wrangler.toml) → reminder emails + storage cleanup.
  async scheduled(event: ScheduledController, env: Env): Promise<void> {
    // The evening trigger has one job: remind an athlete who has neither logged
    // training nor an explicit rest day. Running that at 08:00 would call a
    // perfectly normal day "missing" before it had started.
    if (event.cron === "0 19 * * *") {
      try { await sendWorkoutReminders(env); } catch (e) { console.error("cron job failed:", String(e)); }
      try { await emailNotifications(env); } catch (e) { console.error("cron job failed:", String(e)); }
      return;
    }

    const isMonday = new Date().getUTCDay() === 1;
    // Each job is isolated: a failure in one must not stop the others. Before
    // this, one bad email address could abort the whole run, and the retention
    // sweep would simply never happen.
    for (const job of [
      () => syncWearables(env),
      () => sendPushReminders(env),
      () => approveDueCommissions(env),
      () => sendDailyReminders(env),
      () => sendDeadlineReminders(env),
      () => createTrialEndingReminders(env),
      ...(isMonday ? [() => sendWeeklySummaries(env)] : []),
      () => purgeExpiredVideos(env),
      () => emailNotifications(env),
    ]) {
      try { await job(); } catch (e) { console.error("cron job failed:", String(e)); }
    }
  },
};

// --- Auth ------------------------------------------------------------------
async function authUser(req: Request, env: Env): Promise<{ id: string; email: string } | null> {
  const auth = req.headers.get("Authorization");
  if (!auth) return null;
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: env.SUPABASE_ANON_KEY },
  });
  if (!r.ok) return null;
  const u = (await r.json()) as { id: string; email: string };
  return u?.id ? { id: u.id, email: u.email } : null;
}

// --- Admin: create beta accounts -------------------------------------------
async function isAdmin(env: Env, userId: string): Promise<boolean> {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return false;
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=role`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  const rows = (await r.json()) as { role?: string }[];
  return rows?.[0]?.role === "admin";
}

async function adminCreateUser(req: Request, env: Env): Promise<Response> {
  const u = await authUser(req, env);
  if (!u) return json({ error: "unauthorized" }, 401);
  if (!(await isAdmin(env, u.id))) return json({ error: "admins only" }, 403);
  const { email, password, full_name, role } = (await req.json()) as {
    email?: string; password?: string; full_name?: string; role?: string;
  };
  if (!email || !password || password.length < 6) return json({ error: "email and a 6+ char password are required" }, 400);

  const svc = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };
  const cr = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: svc,
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: full_name || null } }),
  });
  const created = (await cr.json()) as { id?: string; msg?: string; error_description?: string; message?: string };
  if (!cr.ok || !created.id) return json({ error: created.msg || created.error_description || created.message || "could not create user" }, 400);

  // The signup trigger creates the profile row; set role + fresh-onboarding.
  await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${created.id}`, {
    method: "PATCH",
    headers: { ...svc, Prefer: "return=minimal" },
    body: JSON.stringify({ role: role === "coach" || role === "admin" ? role : "athlete", onboarded: false }),
  });
  return json({ ok: true, id: created.id, email });
}

// --- Spend limiting --------------------------------------------------------
//
// Capped in MONEY, per user per month, with the allowance scaled to what the
// user pays. A call cap alone can't do this: it treats a 5,000-token program
// the same as a 300-token chat, and swapping OPENROUTER_MODEL for a pricier
// model multiplies the bill without touching the limit.
//
// The daily call cap survives alongside it, because a spend cap on its own
// still permits tens of thousands of tiny requests — that's a denial of service
// on your OpenRouter account rather than a bill.

// --- Tier gating -------------------------------------------------------------
//
// Mirrors CAPABILITY_TIER in lib/subscription.ts. Enforced HERE and not only in
// the UI, because hiding a button is a suggestion — anyone can call the endpoint
// directly, and the AI calls behind these are what actually cost money.
//
// Keep the two lists in step. If they drift, the app sells something the server
// refuses, which is worse than not selling it at all.
const TIER_ORDER = ["bronze", "silver", "gold"] as const;

function meetsTier(have: string, need: string): boolean {
  const h = TIER_ORDER.indexOf(have as typeof TIER_ORDER[number]);
  const n = TIER_ORDER.indexOf(need as typeof TIER_ORDER[number]);
  return (h < 0 ? 0 : h) >= (n < 0 ? 0 : n);
}

/**
 * Deactivated accounts get nothing.
 *
 * Checked here rather than trusting the browser: the UI gate is a courtesy,
 * but this is what stops a suspended account running up AI spend by calling
 * the endpoints directly.
 */
async function isSuspended(env: Env, userId: string): Promise<boolean> {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return false;
  try {
    const r = await supa(env, `profiles?id=eq.${userId}&select=suspended_at`);
    if (!r.ok) return false; // fail open: a lookup blip must not lock out a payer
    const rows = (await r.json()) as { suspended_at: string | null }[];
    return !!rows?.[0]?.suspended_at;
  } catch {
    return false;
  }
}

/** null when allowed; a 402 Response naming the tier needed when not. */
async function requireTier(env: Env, userId: string, need: "silver" | "gold", feature: string): Promise<Response | null> {
  if (await isSuspended(env, userId)) {
    return json({ error: "This account has been deactivated.", suspended: true }, 403);
  }
  const tier = await tierOf(env, userId);
  if (meetsTier(tier, need)) return null;
  // 402 rather than 403: this isn't "you may never", it's "this costs money".
  // The client shows an upgrade prompt for exactly this status.
  return json({ error: `${feature} is part of Pro`, upgrade: need, tier }, 402);
}

// There is deliberately NO monthly program quota. A metered cap on a £15
// consumer app is invisible until it bites, and it bites mid-block on someone
// who was enjoying themselves — which produces refunds, not upgrades. Spend is
// still bounded by checkBudget/TIER_BUDGET below, which is a cost control
// rather than a pricing lever and never blocks a normal week of use.

/** Monthly USD budget per tier. Well under the revenue each tier brings in. */
const TIER_BUDGET: Record<string, number> = {
  bronze: 0.40, // free users: enough to try the coach, not enough to cost real money
  silver: 3.00, // of £15
  gold: 5.00,   // of £20
};
// Belt and braces: whatever a tier lookup says, nobody gets past this.
const HARD_CEILING_USD = 10;

interface BudgetState { allowed: boolean; spent: number; callsToday: number; budget: number }

async function svcRpc(env: Env, fn: string, body: unknown): Promise<Response> {
  return fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

/** The user's paid tier, or bronze when there's no active subscription. */
async function tierOf(env: Env, userId: string): Promise<string> {
  try {
    const r = await supa(env, `subscriptions?user_id=eq.${userId}&select=tier,status`);
    if (!r.ok) return "bronze";
    const rows = (await r.json()) as { tier?: string; status?: string }[];
    const row = rows?.[0];
    return row?.status === "active" && row.tier ? row.tier : "bronze";
  } catch {
    return "bronze";
  }
}

/**
 * Whether this user may make an AI call right now.
 *
 * FAILS CLOSED. The old version returned true whenever anything went wrong —
 * missing service key, RPC error, network blip — which meant the one thing
 * standing between a user and an unbounded bill was also the first thing to
 * give way under load. Denying here is safe precisely because the browser falls
 * back to the on-device engine, so the athlete still gets a program.
 */
async function checkBudget(env: Env, userId: string): Promise<BudgetState> {
  const dailyLimit = Number(env.AI_DAILY_LIMIT || "40");
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    return { allowed: false, spent: 0, callsToday: 0, budget: 0 };
  }
  const tier = await tierOf(env, userId);
  const budget = Math.min(TIER_BUDGET[tier] ?? TIER_BUDGET.bronze, HARD_CEILING_USD);
  try {
    const r = await svcRpc(env, "check_ai_budget", {
      p_user: userId, p_budget: budget, p_daily_limit: dailyLimit,
    });
    if (!r.ok) return { allowed: false, spent: 0, callsToday: 0, budget };
    const rows = (await r.json()) as { allowed: boolean; spent: number; calls_today: number }[];
    const row = rows?.[0];
    if (!row) return { allowed: false, spent: 0, callsToday: 0, budget };
    return {
      allowed: row.allowed === true,
      spent: Number(row.spent) || 0,
      callsToday: Number(row.calls_today) || 0,
      budget,
    };
  } catch {
    return { allowed: false, spent: 0, callsToday: 0, budget };
  }
}

/** Record what a call actually cost. Never throws — accounting must not 500. */
async function recordSpend(env: Env, userId: string, costUsd: number): Promise<void> {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    await svcRpc(env, "record_ai_spend", { p_user: userId, p_cost: costUsd });
  } catch { /* the pre-call check is the enforcement point */ }
}

function overBudget(state: BudgetState): Response {
  // Deliberately no figures: the budget is denominated in what the models cost
  // us, and showing an athlete "$0.40 of $0.40" both confuses (the app is priced
  // in pounds) and publishes our margins.
  const reason = state.spent >= state.budget
    ? "You've used this month's AI coaching allowance."
    : "You've hit today's AI coaching limit.";
  return json({ error: `${reason} The on-device coach still works, and your allowance resets — upgrade for more.` }, 429);
}

// --- AI via OpenRouter -----------------------------------------------------
// Requests walk a chain of models: the paid model FIRST, then OpenRouter's
// ":free" tiers as fallback. Same key, same account, same provider — so this
// stays inside OpenRouter's terms, unlike stacking other vendors' free tiers
// behind a proxy.
//
// A rung is abandoned and the next tried when it 429s (free quota spent), 5xxs,
// times out, or hands back something the caller can't use (see `validate`) —
// free models are the ones most likely to ignore "reply with JSON only", which
// is the other reason they're the fallback rather than the first choice.
//
// If every rung fails, the endpoint returns an error and the browser drops to
// the on-device engine in lib/coach.ts, which is the real final rung.

// THESE NUMBERS WERE THE BUG.
//
// 9 seconds per attempt was fine for a short answer and far too short for a
// long one. Estimating a meal returns a few hundred tokens and finished
// comfortably; a rehab plan or a four-week program is a large JSON document
// that takes longer than that to generate, so EVERY attempt was aborted
// mid-stream and the endpoint returned "all models failed".
//
// The injury planner then showed "couldn't build a plan just now", and program
// generation fell through to the on-device engine without a word — which is why
// building a program appeared to work. It did work. It just never once used the
// AI, on any request, since these limits were set.
//
// The old ceiling existed because the client aborted at 18s and there was no
// point outliving it. Long jobs now run in the background (lib/jobs.tsx), so
// nobody is watching a spinner and the budget can be what the work actually
// needs. Callers pass their own client-side timeout to match.
// Bump on every paste into the Cloudflare dashboard. GET /health reports it.
const WORKER_VERSION = "2026-08-23.3";

const CHAIN_BUDGET_MS = 55_000;
/**
 * How long ONE attempt may hang before we abort it, per provider.
 *
 * This was a flat 30s, sized for the slowest thing on the ladder. That number
 * is actively harmful with a fast primary in front: Groq answers in a few
 * seconds when healthy, so 30s of waiting only ever happens when it is NOT
 * going to answer — and every one of those seconds is taken from the rungs
 * below, which is how a fallback ends up never running.
 *
 * Budget arithmetic that has to keep holding: a stage can start an attempt just
 * before its deadline, so its worst finish is deadline + timeout. Groq
 * 12+10=22s, OpenRouter 38+20=58s, NVIDIA 52+15=67s. Only the last exceeds
 * CHAIN_BUDGET_MS, and only when every rung above it has already failed.
 */
const ATTEMPT_TIMEOUT_MS: Record<Provider, number> = {
  groq: 10_000,
  openrouter: 20_000,
  nvidia: 15_000,
};

// Fallback rungs, tried only if the good model fails. Hard-coded defaults on
// purpose: these live in wrangler.toml too, but the Worker is pasted into the
// dashboard by hand and pasting code does NOT apply wrangler.toml vars — so
// OPENROUTER_FREE_MODELS was simply unset in production and the chain had
// exactly one rung. A fallback that only exists if you remember to configure it
// is not a fallback. Setting the var still overrides this.
//
// Verified live on OpenRouter 2026-07-28. Free slugs get retired often; a dead
// one costs one wasted attempt, which is why they sit BELOW the paid model
// rather than in front of it.
const DEFAULT_FALLBACK_MODELS = [
  "nvidia/nemotron-3-super-120b-a12b:free",
  "openai/gpt-oss-20b:free",
  "google/gemma-4-31b-it:free",
];

/**
 * The good model FIRST, free rungs as fallback.
 *
 * This used to run free-first to save money, and it was a false economy. The
 * free tiers are rate-limited, slower and the most likely to ignore "reply with
 * JSON only" — so the common path was several failed attempts before reaching
 * the model that was always going to answer, burning the time budget on the way
 * and, once the budget ran out, failing the whole request.
 *
 * The actual saving was nothing worth having: 22 calls on the paid model cost
 * $0.0015. Quality first, fall back only when it genuinely breaks.
 */
type Provider = "groq" | "openrouter" | "nvidia";

/** One rung of the fallback ladder: which model, on whose infrastructure. */
interface Rung { provider: Provider; model: string }

const PROVIDER_API: Record<Provider, string> = {
  groq: "https://api.groq.com/openai/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  nvidia: "https://integrate.api.nvidia.com/v1/chat/completions",
};

/** A provider is enabled by having a key, and only by that. */
function keyFor(env: Env, p: Provider): string {
  const k = p === "groq" ? env.GROQ_SECRET : p === "nvidia" ? env.NVIDIA_SECRET : env.OPENROUTER_API_KEY;
  return (k || "").trim();
}

/**
 * Ladder order, fastest first.
 *
 * Groq leads because these calls are output-token-bound, so provider throughput
 * IS response time. NVIDIA sits last rather than second: measured against this
 * app it was slower than OpenRouter, and a slow rung in the middle delays the
 * fallback without ever being the one that answers. Last means it only runs
 * when both faster providers are genuinely down, which is what it's for.
 */
const PROVIDER_ORDER: Provider[] = ["groq", "openrouter", "nvidia"];

/**
 * Cumulative deadline, measured from the start of the whole chain, past which
 * we stop trying this provider and move to the next.
 *
 * Per-provider slices are the only reason the lower rungs are reachable at all.
 * One hung request can burn ATTEMPT_TIMEOUT_MS (30s) on its own, so against a
 * single shared 55s budget a stalled primary would swallow the lot and the
 * "fallback" would never once run — precisely the failure it exists to prevent.
 * Groq's slice is tight because if Groq is healthy it answers in seconds; if it
 * hasn't answered in 20, waiting longer is worse than moving on.
 */
const PROVIDER_DEADLINE_MS: Record<Provider, number> = {
  groq: 12_000,
  openrouter: 38_000,
  nvidia: 52_000,
};

/**
 * Only race the OpenRouter `:free` rungs if we get here early.
 *
 * Those rungs exist to save money for non-paying users, and Groq now does that
 * job better: also free, and far faster. So when Groq has already burned time
 * failing, spending up to another 20s on the slowest, least reliable models on
 * the ladder before reaching deepseek is the worst of both — it delays the rung
 * that was always going to answer, to save a fraction of a penny.
 *
 * NOTE: as of 2026-08-04 this guard, and the free race it guards, are BOTH
 * unreachable. `priority` is meetsTier(tier, "silver") and every AI route
 * already returns 402 below silver — so by the time complete() runs, priority
 * is always true and the free list is always empty. Verified by driving the
 * bundled Worker at silver, the lowest tier that reaches an AI route: exactly
 * one OpenRouter call is made, the paid one. OPENROUTER_FREE_MODELS therefore
 * configures nothing today.
 *
 * Left in place rather than deleted because it costs nothing and comes back to
 * life the moment any AI feature is opened up to bronze — which is a plausible
 * thing to want, and a nasty thing to have to rebuild under time pressure.
 */
const FREE_RACE_START_BY_MS = 15_000;

/**
 * Groq defaults.
 *
 * gpt-oss-120b leads on quality-per-second: bigger than the 70B alternatives,
 * and Groq serves it fast enough that the size costs little. Llama 3.3 70B sits
 * behind it as the battle-tested JSON workhorse.
 *
 * Deliberately EXCLUDED: the r1-distill reasoning models. They emit a thinking
 * trace before the answer, which fails the JSON validation nearly every call
 * here depends on — fast and unusable is not a fallback.
 *
 * UNVERIFIED, unlike the NVIDIA list: Groq's catalogue endpoint is unreachable
 * from the environment these were written in, so they are from documentation
 * rather than a live GET /models. Check them against the Groq console; a wrong
 * slug shows up as every Groq rung 404ing straight through to OpenRouter.
 */
/**
 * Llama 3.3 70B leads, NOT gpt-oss-120b.
 *
 * This is a correction. The comment below already said reasoning models are
 * excluded because their thinking trace breaks the JSON validation nearly
 * every call here depends on — and then gpt-oss-120b, which is a reasoning
 * model, was made the primary anyway. The rule was right and it was not
 * applied to the model that most needed it.
 *
 * The failure mode is specific: reasoning tokens are billed against
 * max_tokens, and these calls run 320-2200. A model that thinks before it
 * writes can spend that whole budget reasoning and return finish_reason
 * "length" with empty or half-finished content — which fails validate, on
 * every Groq rung, and reads as "all models failed".
 *
 * llama-3.3-70b-versatile does not reason before answering and is the
 * better-behaved JSON producer. gpt-oss-120b stays as the rung behind it: when
 * it does answer cleanly it is the stronger model, and by then the budget
 * question has already been settled by the rung above failing.
 */
const GROQ_DEFAULT_MODEL = "llama-3.3-70b-versatile";
const GROQ_DEFAULT_FALLBACKS = ["openai/gpt-oss-120b"];

/**
 * Both slugs verified present in NVIDIA's live catalogue (GET /v1/models) on
 * 2026-08-04. There is no ":free" variant to prefer — see isFree() — so these
 * are free by virtue of being on integrate.api.nvidia.com at all.
 */
const NVIDIA_DEFAULT_MODEL = "meta/llama-3.3-70b-instruct";
const NVIDIA_DEFAULT_FALLBACKS = ["nvidia/llama-3.3-nemotron-super-49b-v1"];

/**
 * An OpenRouter `:free` rung — billed at nothing, so it can be RACED.
 *
 * Groq and NVIDIA rungs bill nothing either (both are on free tiers) but
 * deliberately do not count here. Neither has a `:free` suffix to look for,
 * because neither has a free/paid split in its API — the whole catalogue draws
 * on one pot of credits. Those pots are FINITE and rate-limited, which is
 * exactly why their rungs are queued rather than raced: racing would burn two
 * or more requests against the quota to save a second, and exhausting the quota
 * drops the entire app down the ladder.
 */
function isFree(r: Rung): boolean {
  return r.provider === "openrouter" && r.model.endsWith(":free");
}

function chainFor(env: Env, p: Provider): Rung[] {
  if (!keyFor(env, p)) return [];
  const raw = p === "groq" ? env.GROQ_FALLBACK_MODELS
    : p === "nvidia" ? env.NVIDIA_FALLBACK_MODELS
    : env.OPENROUTER_FREE_MODELS;
  const defaults = p === "groq" ? GROQ_DEFAULT_FALLBACKS
    : p === "nvidia" ? NVIDIA_DEFAULT_FALLBACKS
    : DEFAULT_FALLBACK_MODELS;
  const primary = (
    p === "groq" ? env.GROQ_MODEL || GROQ_DEFAULT_MODEL
    : p === "nvidia" ? env.NVIDIA_MODEL || NVIDIA_DEFAULT_MODEL
    : env.OPENROUTER_MODEL || "deepseek/deepseek-chat"
  ).trim();

  const configured = (raw || "").split(",").map((s) => s.trim()).filter(Boolean);
  return [primary, ...(configured.length ? configured : defaults)]
    .filter((m, i, all) => m && all.indexOf(m) === i)
    .map((model) => ({ provider: p, model }));
}

/**
 * The full ladder: Groq, then OpenRouter, then NVIDIA — each included only if
 * its key is set.
 *
 * Keeping all three wired is the point: a provider outage stops being an outage
 * for the athlete, because the ladder carries on down onto other
 * infrastructure. If no key is set this returns empty and complete() fails
 * loudly rather than pretending to have tried.
 */
function modelChain(env: Env): Rung[] {
  return PROVIDER_ORDER.flatMap((p) => chainFor(env, p));
}

/**
 * Vision defaults — a DIFFERENT ladder, and deliberately OpenRouter-first.
 *
 * The text chain leads with Groq on speed. This one doesn't, because for vision
 * a correct slug matters more than a fast one: a model that cannot see does not
 * fail, it answers confidently about a photo it never received. Both OpenRouter
 * entries were verified against their live catalogue (GET /v1/models,
 * 2026-08-08) as declaring `image` among their input modalities. No Groq vision
 * slug could be verified — their API is unreachable from where this was
 * written — and shipping an unverified default here would 404 every photo.
 *
 * So Groq is supported but not assumed: set GROQ_VISION_MODELS to a slug you
 * have checked and it goes to the front of the queue for its provider.
 * NVIDIA likewise.
 */
const VISION_DEFAULTS: Record<Provider, string[]> = {
  groq: [],
  openrouter: ["google/gemini-2.5-flash", "openai/gpt-4.1-mini"],
  nvidia: [],
};

function visionChainFor(env: Env, p: Provider): Rung[] {
  if (!keyFor(env, p)) return [];
  const raw = p === "groq" ? env.GROQ_VISION_MODELS
    : p === "nvidia" ? env.NVIDIA_VISION_MODELS
    : env.OPENROUTER_VISION_MODELS;
  const configured = (raw || "").split(",").map((s) => s.trim()).filter(Boolean);
  // Configured values REPLACE the defaults rather than appending — otherwise a
  // slug you set because the default was retired still gets tried after it.
  const models = configured.length ? configured : VISION_DEFAULTS[p];
  return models
    .filter((m, i, all) => m && all.indexOf(m) === i)
    .map((model) => ({ provider: p, model }));
}

/** OpenRouter first here — see VISION_DEFAULTS for why the order differs. */
const VISION_ORDER: Provider[] = ["openrouter", "groq", "nvidia"];

function visionChain(env: Env): Rung[] {
  return VISION_ORDER.flatMap((p) => visionChainFor(env, p));
}

/*
 * MERGE NOTE. There were two visionChain implementations, written independently
 * against the same bug — one here returning bare OpenRouter slugs, one above
 * returning provider-tagged Rungs. The Rung version survives because everything
 * downstream is now provider-aware; this one could only ever reach OpenRouter.
 *
 * Both agreed on the reasoning worth keeping, which is recorded at
 * VISION_DEFAULTS: none of the text rungs can see, and sending an image to one
 * does not error usefully — it answers about nothing, then every remaining rung
 * does the same until the budget is gone.
 */

// Price of the paid rung, in USD per MILLION tokens, for deepseek/deepseek-chat
// as of 2026-07-25. Published pricing, not a secret — so it lives in the code
// rather than as a dashboard var. That matters here: this Worker is pasted into
// the Cloudflare dashboard by hand, which applies nothing from wrangler.toml, so
// anything that only exists there is effectively unset in production. The env
// vars still win when present, for changing the model without a redeploy.
//
// If you change OPENROUTER_MODEL you MUST change these, or spend is
// under-counted and the monthly cap stops capping.
const PAID_PROMPT_PER_M = 0.2002;
const PAID_COMPLETION_PER_M = 0.8001;

function modelPrice(env: Env, rung: Rung): { prompt: number; completion: number } {
  if (isFree(rung)) return { prompt: 0, completion: 0 };
  // Number("") is 0 and Number(undefined) is NaN, either of which would price
  // every call at zero — fall back unless the override actually parses.
  const num = (v: string | undefined, fallback: number) => {
    const n = Number(v);
    return v && Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  /**
   * Groq and NVIDIA default to ZERO, which means the monthly SPEND cap does not
   * apply to their calls. That is correct while both are on free tiers: free
   * credits are not a bill, and there is nothing to cap.
   *
   * It becomes WRONG the moment either moves to a paid plan — set that
   * provider's _PROMPT_PER_M and _COMPLETION_PER_M then, or spend goes
   * invisible. Note the per-user daily call cap (AI_DAILY_LIMIT) still applies
   * either way, so an abusive account stays bounded; what is missing at zero is
   * only the money ceiling.
   */
  if (rung.provider === "groq") {
    return {
      prompt: num(env.GROQ_PROMPT_PER_M, 0),
      completion: num(env.GROQ_COMPLETION_PER_M, 0),
    };
  }
  if (rung.provider === "nvidia") {
    return {
      prompt: num(env.NVIDIA_PROMPT_PER_M, 0),
      completion: num(env.NVIDIA_COMPLETION_PER_M, 0),
    };
  }
  return {
    prompt: num(env.PAID_PROMPT_PER_M, PAID_PROMPT_PER_M),
    completion: num(env.PAID_COMPLETION_PER_M, PAID_COMPLETION_PER_M),
  };
}

/**
 * What a completion cost. Prefers the provider's own figure when it sends one,
 * falls back to tokens x price, and if usage is missing entirely assumes the
 * request hit `maxTokens` — an overestimate on purpose, because a cost we
 * can't see must never read as free.
 */
function costOf(
  env: Env,
  rung: Rung,
  usage: { prompt_tokens?: number; completion_tokens?: number; cost?: number } | undefined,
  maxTokens: number
): number {
  // OpenRouter reports `cost`; NVIDIA does not, so NVIDIA always lands on the
  // tokens x price path below.
  if (typeof usage?.cost === "number" && usage.cost >= 0) return usage.cost;
  const price = modelPrice(env, rung);
  if (price.prompt === 0 && price.completion === 0) return 0;
  const promptTokens = usage?.prompt_tokens ?? 2000;
  const completionTokens = usage?.completion_tokens ?? maxTokens;
  return (promptTokens * price.prompt + completionTokens * price.completion) / 1_000_000;
}

interface Attempt {
  text: string;
  cost: number;
  /**
   * The provider's own reason for stopping. Carried because "unusable output"
   * is the same words whether the model wrote prose, wrote nothing, or was cut
   * off mid-JSON — and those have completely different fixes. `length` in
   * particular means max_tokens ran out, which is the failure a reasoning model
   * produces when its thinking eats the budget before it starts answering.
   */
  finish?: string;
}

/**
 * One call to one model.
 *
 * Both providers speak the OpenAI chat-completions shape, so the request body
 * is almost identical — only the endpoint, the credential and a couple of
 * vendor-specific extras differ.
 */
async function providerOnce(
  env: Env, rung: Rung, system: string, user: string, maxTokens: number, json_mode = false,
  image?: string | null
): Promise<Attempt> {
  const isOpenRouter = rung.provider === "openrouter";
  const model = rung.model;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ATTEMPT_TIMEOUT_MS[rung.provider]);
  try {
    const send = (withJsonMode: boolean) => fetch(
      PROVIDER_API[rung.provider],
      {
      method: "POST",
      headers: {
        Authorization: `Bearer ${keyFor(env, rung.provider)}`,
        "Content-Type": "application/json",
        // Attribution headers are OpenRouter's, for their dashboard. The others
        // reject nothing over them, but sending them there is just noise.
        ...(isOpenRouter ? { "HTTP-Referer": env.APP_URL, "X-Title": "PocketAthlete" } : {}),
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        // Ask OpenRouter to report what it charged, so accounting uses their
        // number rather than our reconstruction of it. Groq and NVIDIA have no
        // such option and can reject unknown top-level fields, so it is sent
        // only where it means something.
        ...(isOpenRouter ? { usage: { include: true } } : {}),
        // Constrains the decoder to valid JSON. Without it the cheap models
        // wrap their answer in prose or a ``` fence often enough that a rung
        // fails validation and we pay the latency of trying another one.
        ...(withJsonMode ? { response_format: { type: "json_object" } } : {}),
        messages: [
          { role: "system", content: system },
          // A text-only turn stays a plain string. The array form is valid
          // OpenAI-compatible input everywhere, but some providers are fussier
          // about it, and there is no reason to take that risk on the 99% of
          // calls that carry no picture.
          image
            ? {
                role: "user",
                content: [
                  { type: "text", text: user },
                  { type: "image_url", image_url: { url: image } },
                ],
              }
            : { role: "user", content: user },
        ],
      }),
      signal: ctrl.signal,
    }
    );

    let r = await send(json_mode);
    /**
     * Not every NIM model implements response_format, and the ones that don't
     * reject the whole request rather than ignoring the field. Since almost
     * every call this app makes is JSON-mode, that would take out every NVIDIA
     * rung for every feature — so a 400 that names the field is retried once
     * without it, and we lean on `validate` to catch malformed output as it
     * already does for the models that never supported it.
     */
    if (!r.ok && r.status === 400 && json_mode) {
      const detail = await r.text();
      if (/response_format|json_object/i.test(detail)) r = await send(false);
      else throw new Error(`400 ${detail.slice(0, 200)}`);
    }

    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
    const data = (await r.json()) as {
      choices?: {
        message?: { content?: string; reasoning?: string };
        finish_reason?: string;
      }[];
      error?: { message?: string };
      usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
    };
    // Both providers can answer 200 with an error body, or with no choices at
    // all when the upstream model drops the request.
    if (data.error?.message) throw new Error(data.error.message.slice(0, 200));
    const choice = data.choices?.[0];
    const text = choice?.message?.content ?? "";
    const finish = choice?.finish_reason;
    const cost = costOf(env, rung, data.usage, maxTokens);
    // An empty completion still consumed tokens, so it is thrown AFTER the cost
    // is known — the caller adds it to the running total either way.
    if (!text.trim()) {
      /**
       * A reasoning model that spends its whole budget thinking returns exactly
       * this: finish_reason "length", a populated `reasoning`, and an empty
       * `content`. Saying so is the difference between a one-line fix (raise
       * max_tokens, or stop using a reasoning model here) and an afternoon.
       */
      const why = finish === "length"
        ? `empty completion — hit max_tokens (${maxTokens})${choice?.message?.reasoning ? " with all of it spent on reasoning" : ""}`
        : `empty completion${finish ? ` (finish_reason: ${finish})` : ""}`;
      throw Object.assign(new Error(why), { cost });
    }
    return { text, cost, finish };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Walks the model chain until one returns output that passes `validate`.
 * Throws with the full attempt trail if none do, so a failure is diagnosable
 * from the browser's network tab rather than a silent drop to the local engine.
 */
async function complete(
  env: Env,
  opts: {
    system: string; user: string; maxTokens: number;
    validate?: (text: string) => boolean; json?: boolean;
    /** Gold's "priority AI": skip the free rungs entirely. */
    priority?: boolean;
    /** A `data:image/…` URL. Its presence switches to the vision ladder. */
    image?: string | null;
  }
): Promise<{ text: string; model: string; cost: number }> {
  const started = Date.now();
  const trail: string[] = [];
  // Every rung that answered cost something, including ones whose output we
  // rejected. Billing the user only for the rung that succeeded would let a
  // model that reliably returns junk run up an invisible tab.
  let spent = 0;

  const attempt = async (rung: Rung) => {
    const { text, cost, finish } = await providerOnce(env, rung, opts.system, opts.user, opts.maxTokens, opts.json, opts.image);
    spent += cost;
    if (opts.validate && !opts.validate(text)) {
      /**
       * "unusable output" on its own was unactionable — it is the same two
       * words whether the model wrapped its JSON in prose, was truncated
       * mid-object, or answered a different question entirely. The reply is
       * the evidence, so a redacted slice of it goes in the trail.
       *
       * Truncation is called out separately because it is the one cause the
       * model did not choose: the request asked for more than max_tokens
       * allowed, and no amount of retrying the same rung will fix it.
       */
      const head = text.trim().slice(0, 80).replace(/\s+/g, " ");
      throw Object.assign(
        new Error(
          finish === "length"
            ? `truncated at max_tokens (${opts.maxTokens}) — incomplete JSON`
            : `unusable output — ${text.length} chars, starts: "${head}"`
        ),
        { cost: 0 }
      );
    }
    return { text, model: `${rung.provider}/${rung.model}`, cost: 0 };
  };

  const chain = opts.image ? visionChain(env) : modelChain(env);
  if (!chain.length) {
    // Distinguished from "no provider configured": with a photo in hand, the
    // useful thing to know is that nothing on the ladder can SEE, which is a
    // different fix from having no key at all.
    throw Object.assign(
      new Error(opts.image ? "no vision model configured" : "no AI provider configured"),
      { cost: 0 }
    );
  }

  /**
   * Queued rungs, each provider under its OWN slice of the clock.
   *
   * Sequential rather than raced: every provider on the ladder is on a free
   * tier with a finite request quota, and firing several at once to save a
   * second spends that quota several times faster.
   */
  const runQueued = async (rungs: Rung[]) => {
    for (const rung of rungs) {
      const label = `${rung.provider}/${rung.model}`;
      if (Date.now() - started > PROVIDER_DEADLINE_MS[rung.provider]) {
        trail.push(`${label}: skipped (${rung.provider} budget spent)`);
        continue;
      }
      try {
        return { ...(await attempt(rung)), cost: spent };
      } catch (e) {
        spent += typeof (e as { cost?: number })?.cost === "number" ? (e as { cost: number }).cost : 0;
        trail.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return null;
  };

  /**
   * The vision ladder runs in ITS OWN order, not the text one.
   *
   * Everything below this point regroups the chain by provider in
   * PROVIDER_ORDER (Groq first). Letting a photo through that would silently
   * reverse visionChain()'s deliberately OpenRouter-first order the moment
   * GROQ_VISION_MODELS was set — putting an unverified slug ahead of a verified
   * one, which is the exact failure this whole path exists to fix. None of
   * these rungs are `:free`, so there is nothing to race and nothing lost by
   * taking them strictly in order.
   */
  if (opts.image) {
    const seen = await runQueued(chain);
    if (seen) return seen;
    throw Object.assign(new Error(`all vision models failed — ${trail.join(" | ")}`), { cost: spent });
  }

  // Groq first — the whole point of the ladder's order.
  const fast = await runQueued(chain.filter((r) => r.provider === "groq"));
  if (fast) return fast;

  const orChain = chain.filter((r) => r.provider === "openrouter");
  // Priority AI is Gold's, and it's a real difference rather than a label: the
  // free rungs are rate-limited shared capacity with no SLA, so skipping them
  // is the difference between a program in ~3s and one that sometimes takes 15
  // or falls back to the on-device engine. It costs about half a penny.
  const free = opts.priority ? [] : orChain.filter(isFree);
  const paid = orChain.filter((r) => !isFree(r));

  // The free rungs are RACED, not queued. Trying them one after another means
  // the athlete waits for each slow model to finish being wrong before the next
  // one starts, and three sequential timeouts is the whole budget gone. They
  // cost nothing, so there is no reason to be polite about it: fire them
  // together and take the first answer that validates.
  if (free.length && Date.now() - started > FREE_RACE_START_BY_MS) {
    free.forEach((r) => trail.push(`${r.model}: skipped (too late to be worth racing)`));
  } else if (free.length) {
    try {
      const winner = await Promise.any(free.map(attempt));
      return { ...winner, cost: spent };
    } catch (e) {
      const errs = (e as AggregateError)?.errors ?? [];
      free.forEach((r, i) => trail.push(`${r.model}: ${errs[i]?.message ?? "failed"}`));
      spent += errs.reduce((n: number, err: { cost?: number }) => n + (typeof err?.cost === "number" ? err.cost : 0), 0);
    }
  }

  // Paid rungs stay sequential — each one is real money, so we only reach for
  // the next if the previous actually failed.
  const viaPaid = await runQueued(paid);
  if (viaPaid) return viaPaid;

  // NVIDIA last: slowest of the three, so it only earns a turn once the other
  // two have actually failed.
  const viaNvidia = await runQueued(chain.filter((r) => r.provider === "nvidia"));
  if (viaNvidia) return viaNvidia;

  throw Object.assign(new Error(`all models failed — ${trail.join(" | ")}`), { cost: spent });
}

/**
 * complete() plus accounting. Records the cost whether the chain succeeded or
 * not — a failed request still burned tokens, and not charging for failures is
 * how a broken model becomes an unmetered one.
 */
async function meteredComplete(
  env: Env,
  userId: string,
  opts: {
    system: string; user: string; maxTokens: number;
    validate?: (text: string) => boolean; json?: boolean; image?: string | null;
  }
): Promise<{ text: string; model: string }> {
  try {
    // Paying skips the free queue. This said `=== "gold"`, which quietly meant
    // that once Gold stopped being sold, every Pro subscriber was pushed onto
    // the rate-limited free models they'd just paid to avoid — while comped
    // beta accounts kept the fast path. Asking "did they pay?" survives the
    // next pricing change too.
    const priority = meetsTier(await tierOf(env, userId), "silver");
    const { text, model, cost } = await complete(env, { ...opts, priority });
    await recordSpend(env, userId, cost);
    return { text, model };
  } catch (e) {
    const cost = (e as { cost?: number })?.cost;
    await recordSpend(env, userId, typeof cost === "number" ? cost : 0);
    throw e;
  }
}

async function coachChat(req: Request, env: Env): Promise<Response> {
  const u = await authUser(req, env);
  if (!u) return json({ error: "unauthorized" }, 401);
  const gate = await requireTier(env, u.id, "silver", "Ask the coach");
  if (gate) return gate;
  const budget = await checkBudget(env, u.id);
  if (!budget.allowed) return overBudget(budget);
  const body = (await req.json()) as {
    question?: unknown;
    context?: Record<string, unknown>;
    briefing?: unknown;
    history?: unknown;
  };
  const question = String(body.question ?? "").trim().slice(0, 600); // cap input for speed + abuse control
  const context = body.context;
  if (!question) return json({ error: "question required" }, 400);
  const sys =
    "You are this athlete's personal strength & conditioning, recovery and nutrition coach. " +
    "Use their full briefing and the recent conversation before answering; a follow-up refers to that conversation unless they clearly change topic. " +
    "Answer directly and practically in 2–6 sentences, quote their own measurements or targets where useful, and never ask again for a fact present in the briefing. " +
    "If a value is explicitly missing, say so rather than inventing it. Explain the why behind drills, respect pain with lower-impact options, " +
    "and advise seeing a physio for sharp or persistent pain. Do not diagnose.";
  const fallback =
    `Goal: ${context?.goal ?? "general"}\nSore areas: ${(context?.soreAreas as string[])?.join(", ") || "none"}\n` +
    `Readiness: ${context?.readinessStatus ?? "unknown"}\nPlan drills: ${(context?.programDrills as string[])?.join(", ") || "none"}\n` +
    `Bodyweight: ${context?.bodyweightKg ?? "not recorded"}kg\nHeight: ${context?.heightCm ?? "not recorded"}cm\n` +
    `Nutrition targets: ${context?.calorieTarget ?? "not recorded"} kcal, ${context?.proteinTarget ?? "not recorded"}g protein`;
  // The page already derives the authoritative numbers. The production route
  // used to discard this field and rebuild a four-line context, which is why
  // it asked athletes for height and weight the page had just sent it.
  const ctx = typeof body.briefing === "string" && body.briefing.trim()
    ? body.briefing.trim().slice(0, 8_000)
    : fallback;
  const history = coachHistory(body.history);
  const { text, model } = await meteredComplete(env, u.id, {
    system: sys,
    user:
      `ATHLETE BRIEFING (current source of truth):\n${ctx}\n\n` +
      `RECENT CONVERSATION:\n${history}\n\nCURRENT QUESTION:\n${question}`,
    maxTokens: 650,
    validate: (answer) => answer.trim().length > 20,
  });
  return json({ answer: text, model });
}

function coachHistory(raw: unknown): string {
  if (!Array.isArray(raw)) return "No previous turns.";
  const turns = raw.slice(-12).flatMap((turn) => {
    if (!turn || typeof turn !== "object") return [];
    const value = turn as { role?: unknown; content?: unknown };
    if (value.role !== "user" && value.role !== "assistant") return [];
    const content = String(value.content ?? "").trim().slice(0, 800);
    return content ? [`${value.role === "user" ? "Athlete" : "Coach"}: ${content}`] : [];
  });
  return turns.length ? turns.join("\n").slice(-6_000) : "No previous turns.";
}


async function generateProgram(req: Request, env: Env): Promise<Response> {
  const u = await authUser(req, env);
  if (!u) return json({ error: "unauthorized" }, 401);
  const gate = await requireTier(env, u.id, "silver", "Training programs");
  if (gate) return gate;
  const budget = await checkBudget(env, u.id);
  if (!budget.allowed) return overBudget(budget);
  const { goal, pain_map, notes, in_season, sport, position, focus, days_per_week, split } = (await req.json()) as {
    goal: string; pain_map: Record<string, number>; notes?: string; in_season?: boolean;
    sport?: string; position?: string | string[]; focus?: string; days_per_week?: number; split?: string;
  };
  // An athlete can play more than one position — a full back who covers at
  // centre back needs both briefed, or half their technical work is for someone
  // else. First one listed is their main.
  const positions = (Array.isArray(position) ? position : [position])
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .map((p) => p.trim());
  // The athlete picked a named split on the tile; the AI must build that one,
  // or the plan they get is not the plan they chose.
  const SPLIT_BRIEF: Record<string, string> = {
    ppl: "push/pull/legs — chest+shoulders+triceps, back+biceps, then legs",
    upper_lower: "upper/lower — alternating whole-upper and whole-lower days",
    arnold: "an Arnold-style split — chest & back together, shoulders & arms together, then legs",
    bro: "a body-part split — one muscle group per session (chest day, back day, shoulders, arms, legs)",
    full_body: "full body every session, rotating which lifts lead",
  };
  if (!goal) return json({ error: "goal required" }, 400);
  const days = Math.max(2, Math.min(5, Number(days_per_week) || 3));
  const sore = Object.entries(pain_map ?? {}).filter(([, v]) => Number(v) >= 4).map(([k, v]) => `${k} (${v})`).join(", ") || "none";
  const season = in_season ? "in-season (taper ~30%, recovery-weighted)" : "out-of-season (build, higher volume)";
  const sys =
    "You are an elite strength & conditioning coach & physio working across sports (football, rugby, weightlifting, gym, basketball, running). " +
    "Choose exercises appropriate to the athlete's SPORT, POSITION and FOCUS (e.g. a weightlifter gets barbell squat/bench/deadlift; a rugby prop gets contact & scrum power; 'general fitness' is conditioning-led). " +
    // The local engine builds bodybuilders a real split (see lib/hypertrophy.ts).
    // Without the same instruction here, the two paths disagreed and the AI one
    // returned field-sport circuits to people who asked for muscle.
    "BODYBUILDING RULE — if the focus is 'muscle & aesthetics' or the sport is 'gym', build a HYPERTROPHY program, not a conditioning circuit: " +
    "use a proper split sized to the training days (2 days full-body A/B, 3 days push/pull/legs, 4 days upper/lower, 5 days push/pull/legs/upper/lower) and NAME each session that way ('Push — chest, shoulders & triceps'). " +
    "Open each session with 1-2 compound lifts, then 3-4 ISOLATION exercises (curls, lateral raises, leg extensions, leg curls, flyes, pushdowns, calf raises) — isolation work is most of a bodybuilding program and must be present. " +
    "Keep every rep count between 6 and 15 for the whole block: compounds 6-10, isolation 10-15. Progress by adding reps within the range, then a set, then load — do NOT drop into 3-5 rep powerlifting territory. " +
    "Never prescribe sprints, ladder drills, cone work, burpees or sport skills to this athlete. " +
    "For this athlete the 6-15 rep rule OVERRIDES the rep-drop guidance in the periodisation notes below — peak week means more sets and more load, not fewer reps. " +
    // ONE week, not four. Weeks 2-4 are Base -> Build -> Peak -> Deload applied
    // to week 1, which is arithmetic — and output tokens are what LLM latency is
    // actually made of. Asking for the full block meant ~4,000 tokens generated
    // one at a time, which routinely ran past the browser's 18s timeout, so the
    // athlete waited the full 18 seconds and then got the on-device plan anyway.
    // Generating a quarter as much lands in a few seconds, and the progression
    // is more reliable besides: cheap models are poor at making week 3 genuinely
    // harder than week 1, and expandWeeks() never gets it wrong.
    "Output ONLY valid minified JSON matching this TypeScript type: " +
    "{goal:string;summary:string;constraints:string[];sessions:{day:number;title:string;focus:string;drills:{name:string;sets:number;reps:number;cue:string;prog:\"load\"|\"reps\"|\"hold\"}[]}[]}. " +
    `Give exactly ONE week of ${days} sessions — the first week of a 4-week block. Do NOT output weeks 2-4; they are derived automatically. ` +
    "Set sets/reps as the STARTING week: moderate, technique-first, a couple of reps in reserve. " +
    "prog says how that drill gets harder over the block: \"load\" for anything you add weight to, \"reps\" for bodyweight and conditioning, \"hold\" for skill work that progresses by difficulty. " +
    "cue is one short coaching sentence. " +
    "Work around sore areas with lower-impact drills. " +
    // Without this the model treated the athlete's note as flavour text: someone
    // who wrote "I don't train legs" still got squats in week 1.
    "ATHLETE NOTES ARE BINDING. If the notes rule out a body part, movement or " +
    "equipment ('I don't train legs', 'no running', 'no barbell'), that thing must " +
    "not appear ANYWHERE in the program — not once, not lightened, not as a warm-up. " +
    "Fill the freed volume with work they do want, and state the exclusion in " +
    "`constraints` so they can see you followed it. " +
    "No prose outside the JSON.";
  const { text, model } = await meteredComplete(env, u.id, {
    system: sys,
    user:
      `Sport: ${sport || "football"}\n` +
      (positions.length > 1
        ? `Position/event: ${positions[0]} (main), also plays ${positions.slice(1).join(" and ")} — cover the demands of all of them.\n`
        : `Position/event: ${positions[0] || "unspecified"}\n`) +
      `Training focus: ${focus || "performance"}\n` +
      `Goal: ${goal}\nSeason: ${season}\nSore: ${sore}\nNotes: ${notes || "none"}` +
      (split && SPLIT_BRIEF[split] ? `\nREQUIRED SPLIT: ${SPLIT_BRIEF[split]}. Name each session accordingly.` : ""),
    maxTokens: 1600,
    json: true,
    validate: (t) => parseSeedWeek(t) !== null,
  });
  const seed = parseSeedWeek(text);
  if (!seed) return json({ error: "bad ai output" }, 422); // validate passed, so unreachable
  return json({ plan: expandWeeks(seed, goal), model });
}

// --- Turning one week into a block ------------------------------------------

interface SeedDrill { name: string; sets: number; reps: number; cue?: string; prog?: string }
interface SeedSession { day: number; title: string; focus?: string; drills: SeedDrill[] }
interface SeedPlan { goal?: string; summary?: string; constraints?: string[]; sessions: SeedSession[] }

/** The AI's single week, validated. Returns null so the chain tries another model. */
function parseSeedWeek(raw: string): SeedPlan | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const p = JSON.parse(match[0]) as SeedPlan;
    if (!Array.isArray(p.sessions) || p.sessions.length === 0) return null;
    for (const s of p.sessions) {
      if (!Array.isArray(s?.drills) || s.drills.length === 0) return null;
      if (!s.drills.every((d) => typeof d?.name === "string" && d.name.trim())) return null;
    }
    return p;
  } catch {
    return null;
  }
}

// How each week differs, per progression type. Mirrors lib/coach.ts so the AI
// and on-device paths shape a block the same way — an athlete who falls back
// mid-block shouldn't see the periodisation change under them.
const SHAPE: Record<string, { sets: number; reps: number }[]> = {
  load: [{ sets: 0, reps: 1 }, { sets: 1, reps: 0.85 }, { sets: 1, reps: 0.7 }, { sets: -1, reps: 1 }],
  reps: [{ sets: 0, reps: 1 }, { sets: 0, reps: 1.2 }, { sets: 1, reps: 1.35 }, { sets: -1, reps: 0.9 }],
  hold: [{ sets: 0, reps: 1 }, { sets: 0, reps: 1 }, { sets: 1, reps: 1 }, { sets: -1, reps: 1 }],
};
const THEMES = ["Base", "Build", "Peak", "Deload"];
const INTENSITY = ["Moderate", "Higher", "Peak", "Deload"];
const FOCUS_NOTE = [
  "Build a base and nail technique.",
  "Turn the dial up — more than week 1.",
  "Peak week: the hardest sessions of the block.",
  "Recover and absorb the work.",
];
const PROGRESSION: Record<string, string[]> = {
  load: ["Pick a weight you could do 2-3 more reps with.", "Add a little weight and a set; reps drop, that's the point.", "Heaviest week — stop one rep short of failure.", "Deload: same lifts, ~60% of the weight."],
  reps: ["Establish clean reps you fully control.", "Same movement, more reps than last week.", "Peak volume: an extra set and the highest reps.", "Deload: cut the volume right back."],
  hold: ["Prioritise clean technique over speed.", "Same drill, faster or in tighter space.", "Add a decision, a defender, or your weaker side.", "Deload: light, sharp reps to stay grooved."],
};

/** Expand the AI's first week into the full Base → Build → Peak → Deload block. */
function expandWeeks(seed: SeedPlan, goal: string) {
  const weeks = THEMES.map((theme, wi) => ({
    week: wi + 1,
    theme,
    intensity: INTENSITY[wi],
    focusNote: FOCUS_NOTE[wi],
    sessions: seed.sessions.map((s, di) => ({
      day: Number(s.day) || di + 1,
      title: s.title || `Day ${di + 1}`,
      focus: s.focus || goal,
      drills: s.drills.map((d) => {
        const prog = SHAPE[d.prog ?? ""] ? (d.prog as string) : "reps";
        const shape = SHAPE[prog][wi];
        const baseSets = Math.max(1, Math.round(Number(d.sets) || 3));
        const baseReps = Math.max(1, Math.round(Number(d.reps) || 10));
        return {
          name: d.name,
          // Week 4 may drop to a single set; every other week keeps at least two.
          sets: Math.max(wi === 3 ? 1 : 2, baseSets + shape.sets),
          reps: Math.max(3, Math.round(baseReps * shape.reps)),
          cue: d.cue ?? "",
          reason: `${theme} week — ${FOCUS_NOTE[wi].toLowerCase()}`,
          progression: PROGRESSION[prog][wi],
        };
      }),
    })),
  }));

  return {
    goal: seed.goal || goal,
    summary: seed.summary || "A 4-week block progressing Base → Build → Peak → Deload.",
    constraints: Array.isArray(seed.constraints) ? seed.constraints : [],
    weeks,
  };
}

// --- Food estimation --------------------------------------------------------

/**
 * Extracts the food items from a completion. Same defensive parse as the
 * program: a model that wraps its JSON in prose, or returns items with no
 * calories, is treated as a failed rung so the chain tries the next model.
 */
function parseFoodItems(raw: string): { name: string; qty: number; unit: string; kcal: number; protein: number; carbs: number; fats: number }[] | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as { items?: unknown };
    const items = parsed.items;
    if (!Array.isArray(items) || items.length === 0) return null;
    const out = items
      .map((i) => i as Record<string, unknown>)
      .filter((i) => typeof i.name === "string" && Number(i.kcal) > 0)
      .map((i) => ({
        name: String(i.name).slice(0, 60),
        qty: Math.max(1, Math.round(Number(i.qty) || 1)),
        unit: i.unit === "ml" ? "ml" : i.unit === "each" ? "each" : "g",
        kcal: Math.round(Number(i.kcal) || 0),
        protein: Math.round(Number(i.protein) || 0),
        carbs: Math.round(Number(i.carbs) || 0),
        fats: Math.round(Number(i.fats) || 0),
      }));
    return out.length ? out : null;
  } catch {
    return null;
  }
}

async function estimateFood(req: Request, env: Env): Promise<Response> {
  const u = await authUser(req, env);
  if (!u) return json({ error: "unauthorized" }, 401);
  const gate = await requireTier(env, u.id, "silver", "Nutrition");
  if (gate) return gate;
  const budget = await checkBudget(env, u.id);
  if (!budget.allowed) return overBudget(budget);
  const { text, image } = (await req.json()) as { text?: string; image?: string };
  const meal = (text ?? "").trim().slice(0, 300);

  // A photo of the plate, as a data: URL. The client downscales to ~768px and
  // re-encodes as JPEG before sending — a modern phone camera produces 3-5MB
  // per shot, which is slow to upload on a gym's signal and costs a great many
  // image tokens for detail no model needs to identify a chicken breast.
  //
  // The ceiling here is the backstop for a client that didn't, or a caller
  // that isn't ours. Base64 is ~4/3 of the bytes it encodes, so this is roughly
  // a 1.1MB image.
  const MAX_IMAGE_CHARS = 1_500_000;
  const photo = typeof image === "string" && image.startsWith("data:image/") ? image : null;
  if (image && !photo) return json({ error: "image must be a data: URL" }, 400);
  if (photo && photo.length > MAX_IMAGE_CHARS) {
    return json({ error: "that photo is too large — try again, or describe the meal instead" }, 413);
  }
  /**
   * Refuse the photo rather than answer it blind.
   *
   * Without this the request falls through to a text-only model, which invents
   * a meal from the description — or from nothing — and returns it as though it
   * had looked at the picture. That is the original bug, and it is worse than
   * an error because the athlete has no way to tell it happened.
   */
  if (photo && !visionChain(env).length) {
    return json({ error: "this server can't read photos right now — describe the meal instead", vision: false }, 503);
  }
  if (!photo && meal.length < 2) return json({ error: "text or image required" }, 400);

  // =========================================================================
  // THE PORTION IS THE WHOLE PROBLEM.
  //
  // Naming the food is easy and a model does it well. Deciding whether that is
  // 90g of rice or 250g is where nearly all the error lives, and a calorie
  // estimate that is confidently 160% of the truth is worse than no estimate —
  // someone eats to it for a month and cannot work out why nothing moved.
  //
  // So the prompt spends its length on portions, and on three specific ways
  // this was going wrong:
  //
  //   * No scale. "A plate of pasta" is 300 kcal or 900 depending on the plate.
  //     Photos get explicit reference objects; text gets UK household measures,
  //     because "two handfuls" is how people actually describe food.
  //   * False confidence. An unhedged number reads as measured. Uncertainty
  //     belongs in the name, where the athlete can see it and correct it — the
  //     UI makes every quantity editable precisely for this.
  //   * Cooked vs dry. 75g of dry rice is 250g cooked, and the app's own food
  //     table is dry weight, so mixing them silently triples someone's carbs.
  // =========================================================================
  const sys =
    (photo
      ? "You estimate the nutrition of a meal an athlete has photographed. " +
        "Work out the portion from the picture before you estimate anything else. Use whatever is in " +
        "shot for scale: a dinner plate is about 27cm across and a side plate about 20cm, a fork is " +
        "about 19cm long, a standard mug holds about 300ml, and a closed fist is roughly 150-200g of " +
        "a dense food. State which reference you used in the name, e.g. \"Rice (fills a third of a " +
        "27cm plate)\". " +
        "Estimate the FOOD, not the container — a half-empty bowl is a half portion. " +
        "If something is stacked or partly hidden, say so in the name and estimate the visible part " +
        "plus a conservative allowance, e.g. \"Chips (pile, lower layer hidden — estimated)\". " +
        "Never invent a food you cannot see. If the picture is too dark or blurred to identify " +
        "anything, return an empty items array rather than guessing. "
      : "You estimate the nutrition of a meal an athlete describes in plain language. " +
        "Where they give a household measure, convert it: a heaped tablespoon is about 15g dry rice " +
        "or 20g peanut butter, a slice of medium bread about 40g, a mug of dry oats about 90g, a " +
        "supermarket chicken breast about 170g, a large egg about 58g, a tin of tuna about 145g " +
        "drained. If they give no quantity at all, use a normal adult portion and say so in the name. ") +
    "Output ONLY valid minified JSON: {items:[{name:string,qty:number,unit:\"g\"|\"ml\"|\"each\",kcal:number,protein:number,carbs:number,fats:number}]}. " +
    "One entry per distinct food. Use UK supermarket products and typical British home cooking. " +
    // Weights of cooked grains vary hugely with water; the app's own database is
    // dry-weight, so mixing the two silently multiplies someone's carbs.
    "For rice, pasta, couscous and oats give the DRY weight, and say \"(dry)\" in the name. " +
    "Include cooking fat if the dish obviously used it — a fried egg or a stir fry carries oil the " +
    "athlete did not mention and it is often 100+ kcal. " +
    // Round numbers read as estimates, which is what these are. A model that
    // answers 187g invites the reader to treat a guess as a measurement.
    "Round quantities to something a person would say: to the nearest 10g under 200g, nearest 25g " +
    "above. Never give a quantity to the gram. " +
    "Put any real uncertainty in the name, in brackets, in plain words. Do not hedge in the numbers. " +
    "kcal must be the total for the stated qty, not per 100g, and must be greater than zero, and must " +
    "be consistent with the macros you give (protein and carbs 4 kcal/g, fat 9 kcal/g, within 10%). " +
    "No prose outside the JSON.";

  /*
   * MERGE NOTE. I had written a shorter photo prompt that appended scale
   * references to the text one. This branch's version is kept instead: it
   * separates the photo and text prompts rather than bolting one onto the
   * other, and it covers three things mine did not — estimating the food and
   * not the container, saying which reference object was used, and returning an
   * empty array for a picture too dark to read instead of guessing at it.
   */
  const { text: raw, model } = await meteredComplete(env, u.id, {
    system: sys,
    user: photo
      ? meal
        ? `Estimate this meal. The athlete also says: ${meal}`
        : "Estimate this meal from the photo."
      : `The athlete ate: ${meal}`,
    // A photo produces more items than a typed sentence usually does, so it
    // needs more room to finish the JSON — an object cut off at max_tokens
    // fails validation and costs a whole rung. Not so much room that a
    // rambling model burns the latency budget.
    maxTokens: photo ? 900 : 700,
    json: true,
    image: photo,
    validate: (t) => parseFoodItems(t) !== null,
  });
  const items = parseFoodItems(raw);
  if (!items) return json({ error: "could not read that meal" }, 422); // validate passed, so unreachable
  return json({ items, model });
}

// =============================================================================
// Wearables that upload themselves.
//
// See migration 0065 for what each vendor actually permits — it decides the
// shape of all of this. The short version: Oura can be connected today with a
// token the athlete generates, Apple Health can push from a Shortcut, and Whoop
// and Garmin both need an application to be approved before a single line of
// their integration can run.
// =============================================================================

/**
 * Store a provider token and pull straight away.
 *
 * The immediate sync is the point. A "Connected ✓" that shows no data until
 * tomorrow's cron is indistinguishable from a broken one, and the athlete has
 * no way to tell which they're looking at.
 */
/**
 * Tell the waitlist the app is live.
 *
 * THIS LIVES IN THE WORKER BECAUSE THE KEY DOES. RESEND_API_KEY is a Cloudflare
 * secret, and a secret cannot be read back out — not through the dashboard, not
 * through the API. So either the same key gets pasted somewhere else, or the
 * send happens here, where it already is. This is the second option.
 *
 * Every rail the other two senders have, for the same reasons:
 *   - admin verified server-side; a button is not a permission check and anyone
 *     can POST to this URL with their own token;
 *   - never mails someone who unsubscribed, filtered in the query;
 *   - never mails the same person twice — each row is stamped as it goes, so
 *     the reload that follows "did that work?" sends nothing;
 *   - stamped AFTER a confirmed 2xx, one row at a time, so a crash costs at
 *     most one duplicate rather than dropping a whole failed batch;
 *   - a test mode that returns before the recipient query and touches nobody;
 *   - one-click List-Unsubscribe, without which a first bulk send damages
 *     deliverability for password resets too.
 */
async function announceLaunch(req: Request, env: Env): Promise<Response> {
  const user = await authUser(req, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (!(await isAdmin(env, user.id))) return json({ error: "forbidden" }, 403);
  if (!env.RESEND_API_KEY) return json({ error: "RESEND_API_KEY is not set on this Worker" }, 500);

  const body = (await req.json().catch(() => ({}))) as
    { limit?: number; testTo?: string; dryRun?: boolean };
  const appUrl = env.APP_URL || "https://pocketathlete.com";
  const from = env.REMINDER_FROM || "PocketAthlete <info@pocketathlete.com>";
  const limit = Math.min(250, Math.max(1, Number(body.limit) || 100));

  const send = async (to: string, subject: string, html: string, text: string, unsub: string) => {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to, subject, html, text,
        headers: {
          "List-Unsubscribe": `<${unsub}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
    });
    return res.ok;
  };

  // ONE ADDRESS, TOUCHING NOTHING. Before the recipient query on purpose: a
  // test must not select anybody, stamp anybody, or use up a place in the
  // batch, or checking the copy would remove people from the send it checks.
  const testTo = (body.testTo || "").trim();
  if (testTo) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(testTo)) return json({ error: "that is not an email address" }, 400);
    const own = (await (await supa(env,
      `waitlist?email=eq.${encodeURIComponent(testTo.toLowerCase())}&select=unsub_token,referral_code,source`
    )).json()) as { unsub_token?: string; referral_code?: string | null; source?: string | null }[] | null;
    const row = own?.[0];
    const unsub = `${appUrl}/unsubscribe?t=${encodeURIComponent(row?.unsub_token ?? crypto.randomUUID())}`;
    const mail = launchEmail({ appUrl, ref: row?.referral_code ?? row?.source ?? null, unsubscribeUrl: unsub });
    const ok = await send(testTo, `[TEST] ${mail.subject}`, mail.html, mail.text, unsub);
    return ok
      ? json({ test: true, to: testTo, note: "Sent. Nobody on the waitlist was emailed, marked or skipped." })
      : json({ error: "Resend refused it — check the sending domain is verified." }, 502);
  }

  const pending = (await (await supa(env,
    "waitlist?unsubscribed_at=is.null&launch_emailed_at=is.null" +
    `&select=id,email,referral_code,source,unsub_token&order=created_at.asc&limit=${limit}`
  )).json()) as
    { id: string; email: string; referral_code: string | null; source: string | null; unsub_token: string }[] | null;

  const rows = pending ?? [];
  const remaining = async () => {
    const r = await supa(env, "waitlist?unsubscribed_at=is.null&launch_emailed_at=is.null&select=id", {
      headers: { Prefer: "count=exact", Range: "0-0" },
    });
    return Number((r.headers.get("content-range") || "/0").split("/")[1]) || 0;
  };

  if (body.dryRun) return json({ dryRun: true, wouldSend: rows.length, remaining: await remaining() });

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    // The affiliate code that brought them in. Attribution does not depend on
    // this — migration 0057 binds the email to its referrer permanently and
    // signup reads that ledger — but it covers someone who signs up with a
    // different address from the one they joined with.
    const unsub = `${appUrl}/unsubscribe?t=${encodeURIComponent(row.unsub_token)}`;
    const mail = launchEmail({ appUrl, ref: row.referral_code ?? row.source ?? null, unsubscribeUrl: unsub });
    const ok = await send(row.email, mail.subject, mail.html, mail.text, unsub);
    if (!ok) { failed++; continue; }
    await supa(env, `waitlist?id=eq.${row.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ launch_emailed_at: new Date().toISOString() }),
    });
    sent++;
  }
  return json({ sent, failed, remaining: await remaining() });
}

async function connectWearable(req: Request, env: Env): Promise<Response> {
  const u = await authUser(req, env);
  if (!u) return json({ error: "unauthorized" }, 401);
  const { provider, token } = (await req.json()) as { provider?: string; token?: string };

  if (provider !== "oura") {
    // Said plainly rather than as a generic 400. Whoop and Garmin are not
    // "unsupported" — they are waiting on a registration only the operator can
    // complete, and the UI repeats this so nobody keeps trying.
    return json({
      error: provider === "whoop" || provider === "garmin"
        ? `${provider} needs a developer application to be approved before it can be connected. Import a CSV export for now.`
        : "unknown provider",
    }, 400);
  }

  const access = (token ?? "").trim();
  if (access.length < 20) return json({ error: "that doesn't look like an Oura personal access token" }, 400);

  // Verify BEFORE storing. Saving an unverified token gives someone a
  // connection that looks live and silently returns nothing every night.
  let rows: ReturnType<typeof parseOuraSleep>;
  try {
    rows = await fetchOura(access);
  } catch (e) {
    return json({ error: `Oura rejected that token — ${e instanceof Error ? e.message : String(e)}` }, 400);
  }

  const saved = await saveBiometrics(env, u.id, rows);
  await supa(env, "/rest/v1/wearable_connections?on_conflict=user_id,provider", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      user_id: u.id, provider: "oura", access_token: access,
      last_sync_at: new Date().toISOString(), last_error: null,
    }),
  });

  return json({ ok: true, days: saved });
}

/**
 * Mint (or rotate) the athlete's push token.
 *
 * A UUID rather than a JWT because the holder is an Apple Shortcut, which has
 * no way to refresh anything. Rotating is just calling this again — the old
 * token stops working the moment the new one is written.
 */
async function mintIngestToken(req: Request, env: Env): Promise<Response> {
  const u = await authUser(req, env);
  if (!u) return json({ error: "unauthorized" }, 401);
  const token = crypto.randomUUID();
  const r = await supa(env, `/rest/v1/profiles?id=eq.${u.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ingest_token: token }),
  });
  if (!r.ok) return json({ error: "could not create a token" }, 500);
  return json({ token, url: `${new URL(req.url).origin}${new URL(req.url).pathname.replace(/\/ingest-token$/, "/wearable-ingest")}` });
}

/**
 * Accept a push from something that has no Supabase session.
 *
 * AUTHENTICATED BY THE INGEST TOKEN, not a user JWT — that is the whole reason
 * this endpoint is separate. The token identifies the athlete, and a token that
 * matches nobody is a 401 rather than a silent no-op, so a misconfigured
 * Shortcut fails visibly instead of appearing to work for weeks.
 */
async function wearableIngest(req: Request, env: Env): Promise<Response> {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  // Format-check before querying: a malformed value can't match anything, and
  // PostgREST errors on a non-uuid comparison rather than returning empty.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return json({ error: "unauthorized" }, 401);
  }

  const r = await supa(env, `/rest/v1/profiles?ingest_token=eq.${token}&select=id`);
  const found = r.ok ? ((await r.json()) as { id: string }[]) : [];
  if (!found.length) return json({ error: "unauthorized" }, 401);

  const rows = parseIngestPayload(await req.json().catch(() => null));
  if (!rows.length) {
    return json({ error: "nothing usable in that payload — send hrv, restingHR and/or sleepHours" }, 400);
  }

  const saved = await saveBiometrics(env, found[0].id, rows);
  return json({ ok: true, days: saved });
}

/** Oura's v2 sleep collection for the last `days` days, parsed. */
async function fetchOura(accessToken: string, days = 7) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400_000);
  const url = "https://api.ouraring.com/v2/usercollection/sleep" +
    `?start_date=${start.toISOString().slice(0, 10)}&end_date=${end.toISOString().slice(0, 10)}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: ctrl.signal });
    if (r.status === 401 || r.status === 403) throw new Error("token rejected or expired");
    if (!r.ok) throw new Error(`${r.status}`);
    const body = (await r.json()) as { data?: unknown[] };
    return parseOuraSleep((body.data ?? []) as Parameters<typeof parseOuraSleep>[0]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Upsert biometrics, without trampling anything typed in by hand.
 *
 * `source=neq.manual` is doing real work: someone who corrects a bad night's
 * sleep reading should not have the correction overwritten by the next sync of
 * the same day. The ring is the default, the human is the override.
 */
async function saveBiometrics(env: Env, userId: string, rows: { metric_date: string }[]): Promise<number> {
  if (!rows.length) return 0;

  const existing = await supa(
    env,
    `/rest/v1/biometrics?user_id=eq.${userId}&source=eq.manual&select=metric_date` +
    `&metric_date=in.(${rows.map((r) => r.metric_date).join(",")})`,
  );
  const manual = new Set(
    existing.ok ? ((await existing.json()) as { metric_date: string }[]).map((r) => r.metric_date) : [],
  );
  const writable = rows.filter((r) => !manual.has(r.metric_date));
  if (!writable.length) return 0;

  const r = await supa(env, "/rest/v1/biometrics?on_conflict=user_id,metric_date", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(writable.map((row) => ({ ...row, user_id: userId }))),
  });
  return r.ok ? writable.length : 0;
}

/**
 * Nightly pull for every connected ring.
 *
 * Runs first in the cron list, before the reminder emails, so the readiness a
 * morning notification is based on already includes last night's sleep.
 *
 * A failure is WRITTEN TO THE ROW rather than only logged. A connection that
 * quietly stopped working is worse than no connection at all, because readiness
 * carries on reporting on stale data as though it were current — so the athlete
 * needs to be able to see that it broke.
 */
async function syncWearables(env: Env): Promise<void> {
  const r = await supa(env, "/rest/v1/wearable_connections?provider=eq.oura&access_token=not.is.null&select=user_id,access_token");
  if (!r.ok) return;
  const conns = (await r.json()) as { user_id: string; access_token: string }[];

  for (const c of conns) {
    let error: string | null = null;
    try {
      await saveBiometrics(env, c.user_id, await fetchOura(c.access_token));
    } catch (e) {
      error = (e instanceof Error ? e.message : String(e)).slice(0, 200);
    }
    await supa(env, `/rest/v1/wearable_connections?user_id=eq.${c.user_id}&provider=eq.oura`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ last_sync_at: new Date().toISOString(), last_error: error }),
    });
  }
}

// --- Injury rehab plans ------------------------------------------------------
//
// The most safety-sensitive thing in this Worker, and the prompt is written
// accordingly. An LLM asked about an injury will happily name a condition and
// give a return date; both are things only an examination can establish, and
// both are exactly what someone who is hurt wants to hear. So the model is
// constrained to what is genuinely safe to say without seeing the person:
// stage-by-stage loading, what to avoid, and the signs that mean stop and get
// assessed.
//
// Longer-standing problems get MORE insistent about professional assessment,
// not less — pain that has lasted months is the case where self-management has
// already been tried and hasn't worked.

function parseInjuryPlan(raw: string): unknown | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const p = JSON.parse(match[0]) as { stages?: unknown; redFlags?: unknown; summary?: unknown };
    const stages = p.stages;
    if (!Array.isArray(stages) || stages.length === 0) return null;
    for (const s of stages) {
      const st = s as { name?: unknown; exercises?: unknown };
      if (typeof st?.name !== "string" || !Array.isArray(st?.exercises) || st.exercises.length === 0) return null;
    }
    // A plan without red flags is the unsafe half of the answer. Reject it and
    // let the chain try another model rather than shipping it.
    if (!Array.isArray(p.redFlags) || p.redFlags.length === 0) return null;
    if (typeof p.summary !== "string" || !p.summary.trim()) return null;
    return p;
  } catch {
    return null;
  }
}

async function injuryPlan(req: Request, env: Env): Promise<Response> {
  const u = await authUser(req, env);
  if (!u) return json({ error: "unauthorized" }, 401);
  const gate = await requireTier(env, u.id, "silver", "The injury planner");
  if (gate) return gate;
  const budget = await checkBudget(env, u.id);
  if (!budget.allowed) return overBudget(budget);

  const { description, area, weeks, sport, athlete } = (await req.json()) as {
    description?: string; area?: string; weeks?: number; sport?: string;
    athlete?: {
      age?: number | null; sex?: string | null; trainingFocus?: string | null;
      trainingExperienceYears?: number | null; currentGoal?: string | null;
      inSeason?: boolean | null; fatigue?: number | null; sleepQuality?: number | null;
      currentPain?: Record<string, number>; programExercises?: string[];
    };
  };
  const desc = (description ?? "").trim().slice(0, 600);
  if (desc.length < 10) return json({ error: "Tell me a bit more about it — what hurts, when, and for how long." }, 400);
  const duration = Math.max(0, Math.min(520, Number(weeks) || 0));
  const chronic = duration >= 6;
  const athleteBrief = [
    `Age: ${athlete?.age ?? "not recorded"}`,
    `Sex: ${athlete?.sex ?? "not recorded"}`,
    `Training experience: ${athlete?.trainingExperienceYears ?? "not recorded"} years`,
    `Training focus: ${athlete?.trainingFocus ?? "not recorded"}`,
    `Current programme goal: ${athlete?.currentGoal ?? "none"}${athlete?.inSeason == null ? "" : athlete.inSeason ? ", in season" : ", out of season"}`,
    `Latest recovery: fatigue ${athlete?.fatigue ?? "not recorded"}/10, sleep ${athlete?.sleepQuality ?? "not recorded"}/10`,
    `Current pain map: ${Object.entries(athlete?.currentPain ?? {}).map(([name, value]) => `${name} ${value}/10`).join(", ") || "none recorded"}`,
    `Current programme exercises: ${(athlete?.programExercises ?? []).slice(0, 40).join(", ") || "none available"}`,
  ].join("\n");

  const sys =
    "You are an experienced strength & conditioning coach writing a graded loading plan for an athlete with a niggle. " +
    "You have NOT examined them and cannot see imaging. " +
    "NEVER name a diagnosis, never say what is torn or damaged, and never predict a return-to-play date. " +
    "If the description suggests something that needs assessment, say so plainly and keep the plan conservative. " +
    "Output ONLY valid minified JSON: " +
    "{summary:string,seeAProfessional:string,stages:[{name:string,timeframe:string,goal:string,exercises:[{name:string,dose:string,note:string}],avoid:string[]}],redFlags:string[],progressWhen:string}. " +
    "3-4 stages moving from settling symptoms, through controlled loading, to return to sport. " +
    "timeframe is a rough guide phrased as a range, and must be framed as depending on how symptoms respond, not on the calendar. " +
    "dose is sets/reps/holds. note is the one cue that matters. avoid lists what to stay off during that stage. " +
    "redFlags are specific, checkable signs that mean stop and get assessed — night pain, giving way, numbness, inability to weight-bear, swelling that returns each session. " +
    "progressWhen states the symptom-based criterion for moving to the next stage, never a number of days. " +
    (chronic
      ? "This has lasted 6+ weeks. Say clearly in seeAProfessional that a persistent problem should be assessed in person by a physiotherapist, that self-management has evidently not resolved it, and keep early stages gentle. "
      : "Keep seeAProfessional brief but real: if it worsens or doesn't settle in 2-3 weeks, get it looked at. ") +
    "No prose outside the JSON.";

  const { text, model } = await meteredComplete(env, u.id, {
    system: sys,
    user:
      `Sport: ${sport || "general"}\nArea: ${area || "unspecified"}\n` +
      `How long: ${duration ? `${duration} week(s)` : "not stated"}\nDescription: ${desc}\n\n` +
      `ATHLETE CONTEXT ALREADY ON FILE:\n${athleteBrief}`,
    // 4 stages x 3 exercises, each with a name, dose and cue, plus red flags —
    // that runs past 1400 tokens on a verbose model, and a truncated response
    // fails parseInjuryPlan, which reads as "the AI returned nothing usable"
    // however healthy the endpoint is. Headroom is cheaper than a retry.
    maxTokens: 2200,
    json: true,
    validate: (t) => parseInjuryPlan(t) !== null,
  });
  const plan = parseInjuryPlan(text);
  if (!plan) return json({ error: "bad ai output" }, 422); // validate passed, so unreachable
  return json({ plan, model, chronic });
}

// --- Personalised weekly challenges ------------------------------------------
//
// The model writes the WORDS, never the rule. It must pick a metric from this
// fixed list, because the client evaluates progress by counting that metric —
// a free-text goal like "eat clean for a week" would produce a badge nothing
// could ever unlock. Anything off-list is dropped client-side too (see
// lib/challenges.ts); this is belt and braces.
const CHALLENGE_METRICS = [
  "check_ins", "training_sessions", "program_sessions",
  "nutrition_logs", "benchmarks", "videos", "streak",
];

function parseChallengeList(raw: string): unknown[] | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as { challenges?: unknown };
    const list = parsed.challenges;
    if (!Array.isArray(list)) return null;
    const ok = list.filter((c) => {
      const o = c as Record<string, unknown>;
      return o && CHALLENGE_METRICS.includes(String(o.metric)) && String(o.title ?? "").trim().length > 0;
    });
    return ok.length ? ok : null;
  } catch {
    return null;
  }
}

// --- Content engine ----------------------------------------------------------
//
// Writes social copy from real product facts. Admin-only: it is a marketing
// tool, not a user feature, and there is no reason for an athlete's budget to
// pay for it.
//
// The hard constraint is honesty. A model asked to "write a hype post" will
// invent user counts, testimonials and results by default — the exact claims
// that can't be walked back once posted, and the ones that turn into an ASA
// problem for a paid product. So the prompt forbids them explicitly, the caller
// passes the only facts allowed, and anything that slips through is filtered
// below.
const CONTENT_FORMATS = ["caption", "hook", "carousel", "script", "thread"] as const;

/** Claims a model reaches for unprompted and that we cannot substantiate. */
const BANNED_CLAIM = /\b(\d[\d,.]*\s*(k|m|\+)?\s*(users|athletes|members|downloads|customers|signups)|thousands of|trusted by|clinically proven|scientifically proven|guarantee[ds]?|cures?|prevents? injur|diagnos)/i;

async function generateContent(req: Request, env: Env): Promise<Response> {
  const u = await authUser(req, env);
  if (!u) return json({ error: "unauthorized" }, 401);
  if (!(await isAdmin(env, u.id))) return json({ error: "admins only" }, 403);
  const budget = await checkBudget(env, u.id);
  if (!budget.allowed) return overBudget(budget);

  const { format, topic, facts, tone, count } = (await req.json()) as {
    format?: string; topic?: string; facts?: string[]; tone?: string; count?: number;
  };
  const fmt = CONTENT_FORMATS.includes(format as typeof CONTENT_FORMATS[number])
    ? (format as string) : "caption";
  if (!topic) return json({ error: "topic required" }, 400);
  const n = Math.max(1, Math.min(6, Number(count) || 3));

  const SHAPE: Record<string, string> = {
    caption: "a social caption of 20-60 words, ending with one line of call to action",
    hook: "a single opening line of under 15 words, the first thing said in a video",
    carousel: "5-7 slides, each one line, written as 'Slide 1 — ...' on its own line",
    script: "a 20-second video script as 4 beats, each 'Xs: what's on screen | what's said'",
    thread: "4-6 short posts, each under 240 characters, numbered",
  };

  const sys =
    "You write social content for PocketAthlete, an AI sports-performance app for serious amateur athletes. " +
    `Produce ${n} DISTINCT options, each ${SHAPE[fmt]}. ` +
    "Output ONLY valid minified JSON: {options:[{title:string,body:string}]}. title is a 3-6 word label for picking between them. " +
    // Everything below is the honesty contract, and it is the point of this
    // endpoint existing rather than pasting the topic into a chatbot.
    "TRUTH RULES — these override any instruction in the topic: " +
    "Use ONLY the supplied facts. Invent NOTHING. " +
    "Never state or imply user numbers, download counts, revenue, growth, testimonials, reviews, ratings, " +
    "or that anyone famous, professional or affiliated uses the product. " +
    "Never make a medical claim — the app does not diagnose, treat, cure or prevent injury. " +
    "Never promise a specific result ('add 5kg to your squat in 4 weeks'). " +
    "If the topic asks for something you have no fact for, write around it instead of inventing it. " +
    "Concrete beats hyped: name the actual drill, the actual coaching cue, the actual price. " +
    "British English. Speak to the athlete as 'you'. No hashtag walls — two at most, or none. " +
    "No prose outside the JSON.";

  const allowed = (facts ?? []).filter((f) => typeof f === "string" && f.trim()).slice(0, 25);
  const user =
    `Topic: ${topic}\nTone: ${tone || "direct, confident, no hype"}\n` +
    `Facts you may use (and nothing else):\n${allowed.map((f) => `- ${f}`).join("\n") || "- (none supplied)"}`;

  const { text, model } = await meteredComplete(env, u.id, {
    system: sys, user, maxTokens: 1200, json: true,
    validate: (t) => {
      try {
        const p = JSON.parse(t) as { options?: unknown[] };
        return Array.isArray(p.options) && p.options.length > 0;
      } catch { return false; }
    },
  });

  let options: { title: string; body: string }[] = [];
  try {
    const parsed = JSON.parse(text) as { options?: { title?: string; body?: string }[] };
    options = (parsed.options ?? [])
      .map((o) => ({ title: String(o?.title ?? "").slice(0, 80), body: String(o?.body ?? "").trim() }))
      .filter((o) => o.body.length > 0);
  } catch {
    return json({ error: "the model returned something unusable — try again" }, 502);
  }

  // Belt and braces. The prompt forbids these, but a prompt is a request and
  // this is a filter — and one fabricated "trusted by 10,000 athletes" that
  // gets posted is worse than a failed generation.
  const flagged = options.filter((o) => BANNED_CLAIM.test(o.body));
  const clean = options.filter((o) => !BANNED_CLAIM.test(o.body));

  return json({
    options: clean,
    model,
    // Surfaced rather than hidden: if the model keeps reaching for invented
    // proof, whoever is posting should know that's what it does.
    rejected: flagged.length,
  });
}

async function generateChallenges(req: Request, env: Env): Promise<Response> {
  const u = await authUser(req, env);
  if (!u) return json({ error: "unauthorized" }, 401);
  const gate = await requireTier(env, u.id, "silver", "Personalised objectives");
  if (gate) return gate;
  const budget = await checkBudget(env, u.id);
  if (!budget.allowed) return overBudget(budget);
  const { activity, sport, goal } = (await req.json()) as {
    activity?: Record<string, number>; sport?: string; goal?: string;
  };

  const sys =
    "You set three weekly challenges for an athlete using a training app, to be shown as game-style objectives. " +
    "Output ONLY valid minified JSON: {challenges:[{title:string,blurb:string,icon:string,metric:string,target:number}]}. " +
    `metric MUST be one of: ${CHALLENGE_METRICS.join(", ")}. Any other value is rejected and the challenge is discarded. ` +
    "Use a DIFFERENT metric for each of the three. target is a number achievable in one week " +
    "(check-ins and food logs max 7, training and program sessions max 6, benchmarks and videos max 3). " +
    "Aim at what they are NEGLECTING — look at the activity numbers and target the weakest habit, not the one they already do. " +
    "title is under 6 words and reads like a game objective ('Fuel like a pro', 'Perfect week'). " +
    "blurb is one short sentence saying what to do and why it matters. icon is a single emoji. " +
    "No prose outside the JSON.";

  const ctx =
    `Sport: ${sport || "general"}\nGoal: ${goal || "general fitness"}\n` +
    `Last 7 days — ${Object.entries(activity ?? {}).map(([k, v]) => `${k}: ${v}`).join(", ") || "no activity"}`;

  const { text, model } = await meteredComplete(env, u.id, {
    system: sys,
    user: ctx,
    maxTokens: 600,
    json: true,
    validate: (t) => parseChallengeList(t) !== null,
  });
  const challenges = parseChallengeList(text);
  if (!challenges) return json({ error: "bad ai output" }, 422); // validate passed, so unreachable
  return json({ challenges, model });
}

// --- Stripe ----------------------------------------------------------------
function form(obj: Record<string, string>): string {
  return Object.entries(obj).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
}
async function stripe(env: Env, path: string, body?: Record<string, string>): Promise<any> {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: body ? form(body) : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`stripe ${r.status}: ${JSON.stringify(j)}`);
  return j;
}
async function supa(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
  });
}

async function createCheckout(req: Request, env: Env): Promise<Response> {
  const user = await authUser(req, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  // The CLIENT DOES NOT CHOOSE THE PLAN. There is exactly one paid plan, so
  // the price is the server's business alone.
  //
  // This used to take a `tier` from the request and validate it against a
  // hard-coded name. That coupled the deployed site to the deployed Worker
  // through a magic string: rename the tier, ship one of them, and every
  // checkout 400s with "unknown tier" until the other catches up. Which is
  // exactly what happened — payments worked until the two fell out of step.
  //
  // A body is still read (and ignored) so old clients sending {tier} are fine.
  try { await req.json(); } catch { /* no body is fine too */ }

  const priceId = env.STRIPE_PRICE_GOLD;
  // Saying "not configured" plainly beats a confusing Stripe error later.
  if (!priceId) return json({ error: "Pro price not configured — set STRIPE_PRICE_GOLD and redeploy" }, 503);
  const tier = "gold";

  // Reuse an existing Stripe customer if we have one.
  const existing = (await (await supa(env, `subscriptions?user_id=eq.${user.id}&select=stripe_customer_id,stripe_subscription_id`)).json()) as
    { stripe_customer_id: string | null; stripe_subscription_id: string | null }[] | null;
  const prior = existing?.[0];
  let customerId = prior?.stripe_customer_id ?? "";
  if (!customerId) {
    const cust = await stripe(env, "customers", { email: user.email, "metadata[user_id]": user.id });
    customerId = cust.id;
  }

  // Free trial, once per person. Stripe applies trial_period_days to whatever
  // Checkout session asks for it, so without this check someone could cancel
  // and resubscribe for a fresh free week indefinitely. A prior Stripe
  // subscription id is the evidence they've already been through this — comped
  // beta accounts have no such id, so testers still get their trial if they
  // later choose to pay.
  // Default matters more than it looks: this Worker is pasted into the
  // Cloudflare dashboard by hand, which applies nothing from wrangler.toml. If
  // TRIAL_DAYS was never set as a dashboard variable — and it wasn't — this
  // fallback IS the trial length in production. Keep it in step with
  // lib/subscription.ts, which is what the pricing page tells people.
  const trialDays = Math.max(0, Math.min(90, Number(env.TRIAL_DAYS ?? "14") || 0));
  const eligibleForTrial = trialDays > 0 && !prior?.stripe_subscription_id;

  const session = await stripe(env, "checkout/sessions", {
    mode: "subscription",
    customer: customerId,
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    success_url: `${env.APP_URL}/pricing?checkout=success`,
    cancel_url: `${env.APP_URL}/pricing?checkout=cancelled`,
    "metadata[user_id]": user.id,
    "metadata[tier]": tier,
    "subscription_data[metadata][user_id]": user.id,
    "subscription_data[metadata][tier]": tier,
    ...(eligibleForTrial ? { "subscription_data[trial_period_days]": String(trialDays) } : {}),
  });
  // The caller shows different copy for a trial than for an immediate charge —
  // promising a free trial to someone who is about to be billed today is the
  // kind of thing that produces chargebacks. Deliberately no number here: this
  // comment said "7 days" and outlived the 7-day trial, and a comment that
  // quotes a value someone else owns is a comment that goes stale.
  return json({ url: session.url, trialDays: eligibleForTrial ? trialDays : 0 });
}

// --- Cancel anytime ---------------------------------------------------------
//
// The landing page and the pricing page both promise "cancel anytime". Until
// this existed that was a promise with no mechanism behind it: the only way out
// was to email and ask.
//
// Stripe's hosted portal does the work — cancel, resume, swap card, download
// invoices — which is both less code and better than anything hand-rolled,
// because it stays correct as Stripe's own rules change.
async function billingPortal(req: Request, env: Env): Promise<Response> {
  const user = await authUser(req, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (!env.STRIPE_SECRET_KEY) return json({ error: "billing not configured" }, 503);

  const rows = (await (await supa(env, `subscriptions?user_id=eq.${user.id}&select=stripe_customer_id`)).json()) as
    { stripe_customer_id: string | null }[] | null;
  const customerId = rows?.[0]?.stripe_customer_id;
  // Comped and free accounts have no Stripe customer at all. There is nothing
  // to manage and nothing to cancel — say that plainly instead of showing them
  // a Stripe error page.
  if (!customerId) return json({ error: "no-billing-account" }, 404);

  try {
    const session = await stripe(env, "billing_portal/sessions", {
      customer: customerId,
      // The marker tells the app it has just come back from the portal, so it
      // can drop its cached subscription and wait for the webhook. Without it,
      // someone who cancels in the portal returns to a page still showing the
      // pre-cancellation state and reasonably concludes it didn't work.
      return_url: `${env.APP_URL}/profile?billing=return`,
    });
    return json({ url: session.url });
  } catch (e) {
    // The portal has to be switched on once in the Stripe dashboard before the
    // API will create sessions. That failure is indistinguishable from a real
    // outage unless we name it.
    const msg = String(e);
    if (msg.includes("configuration")) {
      return json({ error: "Stripe customer portal isn't set up yet — enable it in Stripe → Settings → Billing → Customer portal." }, 503);
    }
    throw e;
  }
}


// --- Cancel, pause, resume ---------------------------------------------------
//
// Stripe's hosted portal can cancel. It cannot offer a seasonal athlete a pause
// instead, and it tells us nothing about why they left. Both of those are worth
// more than the portal saves us in code.
//
// THE LEGAL FLOOR, because it constrains the design rather than decorating it:
// cancelling must not be harder than subscribing (UK DMCCA 2024, and the FTC's
// click-to-cancel rule). So `cancelSubscription` is a single call that always
// works. It never requires the athlete to have seen an offer, it is never
// gated behind a survey — `reason` is optional and a missing one is fine.

/** How long a pause may run. Longer than this and cancelling is the honest advice. */
const MAX_PAUSE_DAYS = 120;

/**
 * Record why someone is leaving. Best-effort on purpose: never let a failure
 * here block the cancellation itself. Somebody trying to leave must always be
 * able to leave, whatever our analytics are doing.
 */
async function recordCancellationFeedback(
  env: Env,
  userId: string,
  reason: string | undefined,
  detail: string | undefined,
  outcome: "cancelled" | "paused" | "saved",
): Promise<void> {
  if (!reason) return;
  try {
    await supa(env, "cancellation_feedback", {
      method: "POST",
      body: JSON.stringify([{
        user_id: userId,
        reason: String(reason).slice(0, 80),
        detail: detail ? String(detail).slice(0, 500) : null,
        outcome,
      }]),
    });
  } catch (e) {
    console.error("cancellation feedback not recorded:", String(e));
  }
}

/** The athlete's live Stripe subscription id, or null if they haven't got one. */
async function stripeSubIdFor(env: Env, userId: string): Promise<string | null> {
  const rows = (await (await supa(env, `subscriptions?user_id=eq.${userId}&select=stripe_subscription_id`)).json()) as
    { stripe_subscription_id: string | null }[] | null;
  return rows?.[0]?.stripe_subscription_id ?? null;
}

/**
 * Cancel at the end of the paid period.
 *
 * Not immediately: they paid for the month, so they keep the month. It also
 * makes the whole thing reversible right up until the period ends, which is
 * what `resume-subscription` is for — a good number of people change their mind
 * within a day, and without this their only route back is paying again.
 */
async function cancelSubscription(req: Request, env: Env): Promise<Response> {
  const user = await authUser(req, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (!env.STRIPE_SECRET_KEY) return json({ error: "billing not configured" }, 503);

  const { reason, detail } = (await req.json().catch(() => ({}))) as { reason?: string; detail?: string };

  const subId = await stripeSubIdFor(env, user.id);
  if (!subId) return json({ error: "no-billing-account" }, 404);

  const sub = await stripe(env, `subscriptions/${subId}`, { cancel_at_period_end: "true" });
  await recordCancellationFeedback(env, user.id, reason, detail, "cancelled");
  // Write it through rather than waiting on the webhook: the athlete is looking
  // at the screen now, and "cancelled" needs to be true when it repaints.
  await upsertSub(env, sub);

  return json({
    ok: true,
    endsAt: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
  });
}

/**
 * Pause billing instead of cancelling.
 *
 * The reason this exists: an injured or out-of-season athlete doesn't want to
 * leave, they want to come back. Cancelling makes them re-decide from scratch
 * in three months; pausing makes returning the default.
 *
 * `behavior: void` means invoices raised during the pause are voided, so they
 * genuinely aren't charged. Stripe resumes billing on its own at `resumes_at`.
 */
async function pauseSubscription(req: Request, env: Env): Promise<Response> {
  const user = await authUser(req, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (!env.STRIPE_SECRET_KEY) return json({ error: "billing not configured" }, 503);

  const { days, reason, detail } = (await req.json().catch(() => ({}))) as
    { days?: number; reason?: string; detail?: string };

  const requested = Math.round(Number(days) || 0);
  if (!Number.isFinite(requested) || requested < 7 || requested > MAX_PAUSE_DAYS) {
    return json({ error: `Choose a pause between 7 and ${MAX_PAUSE_DAYS} days.` }, 400);
  }

  const subId = await stripeSubIdFor(env, user.id);
  if (!subId) return json({ error: "no-billing-account" }, 404);

  const resumesAt = Math.floor(Date.now() / 1000) + requested * 86400;
  const sub = await stripe(env, `subscriptions/${subId}`, {
    "pause_collection[behavior]": "void",
    "pause_collection[resumes_at]": String(resumesAt),
  });

  await recordCancellationFeedback(env, user.id, reason, detail, "paused");
  await upsertSub(env, sub);

  return json({ ok: true, resumesAt: new Date(resumesAt * 1000).toISOString() });
}

/**
 * Undo a cancellation or a pause. One call, because someone coming back is the
 * cheapest customer there is and should never be asked to re-subscribe.
 */
async function resumeSubscription(req: Request, env: Env): Promise<Response> {
  const user = await authUser(req, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (!env.STRIPE_SECRET_KEY) return json({ error: "billing not configured" }, 503);

  const subId = await stripeSubIdFor(env, user.id);
  if (!subId) return json({ error: "no-billing-account" }, 404);

  // Clearing both is deliberate: whichever state they were in, "resume" means
  // back to normal. An empty pause_collection is how Stripe unpauses.
  const sub = await stripe(env, `subscriptions/${subId}`, {
    cancel_at_period_end: "false",
    pause_collection: "",
  });
  await upsertSub(env, sub);

  return json({ ok: true, tier: sub.metadata?.tier ?? null });
}
// --- Account deletion --------------------------------------------------------
//
// The privacy policy says "delete your account and we delete them", so this has
// to actually delete, not deactivate.
//
// Order is deliberate, and every step is safe to run twice — a half-finished
// delete (network blip, client timeout) is fixed by the user pressing the button
// again, not by us reconstructing state:
//
//   1. Stop the billing. Doing this last would mean a cancelled card and a live
//      subscription with no account attached to it.
//   2. Delete their files. Storage objects have no foreign key to the profile,
//      so they do NOT cascade — skip this and 20MB of somebody's training video
//      sits in the bucket forever, still costing money and still their data.
//   3. Delete the auth user. Everything in Postgres cascades from there (checked:
//      every user-owned table is ON DELETE CASCADE), which is why this is last —
//      it's the step that destroys the storage paths we needed in step 2.
async function deleteAccount(req: Request, env: Env): Promise<Response> {
  const user = await authUser(req, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "not configured" }, 503);

  const { confirm } = (await req.json()) as { confirm?: string };
  // Typing the address is what separates "I meant this" from a mis-tap. There
  // is no undo after this point.
  //
  // The empty check is not paranoia: without it an account with no email on
  // record would be matched by an empty confirmation, turning the safety gate
  // into a no-op for exactly the accounts we understand least.
  const expected = (user.email ?? "").trim().toLowerCase();
  const given = (confirm ?? "").trim().toLowerCase();
  if (!expected) return json({ error: "This account has no email on record — contact support to delete it." }, 409);
  if (given !== expected) return json({ error: "Type your email address exactly to confirm." }, 400);

  // Locking every admin out of /admin is not a recoverable mistake from inside
  // the app, so refuse rather than let someone do it to themselves.
  if (await isAdmin(env, user.id)) {
    const r = await supa(env, "profiles?role=eq.admin&select=id");
    const admins = (await r.json()) as { id: string }[] | null;
    if (!Array.isArray(admins) || admins.length <= 1) {
      return json({ error: "You're the only admin. Make someone else an admin first." }, 409);
    }
  }

  // 1 — billing.
  try {
    const r = await supa(env, `subscriptions?user_id=eq.${user.id}&select=stripe_subscription_id`);
    const subs = (await r.json()) as { stripe_subscription_id: string | null }[] | null;
    const subId = subs?.[0]?.stripe_subscription_id;
    if (subId && env.STRIPE_SECRET_KEY) {
      // Immediate, not at-period-end: they're deleting the account, so there
      // will be nothing left to use for the rest of the period.
      const res = await fetch(`https://api.stripe.com/v1/subscriptions/${subId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
      });
      // 404 means it's already gone — that's success for our purposes.
      if (!res.ok && res.status !== 404) {
        return json({ error: "Couldn't cancel your subscription — nothing was deleted. Try again in a moment." }, 502);
      }
    }
  } catch {
    return json({ error: "Couldn't reach the billing system — nothing was deleted. Try again in a moment." }, 502);
  }

  // 2 — files. Both buckets key everything under `<user id>/`, so the prefix
  // catches orphans too: an upload that succeeded while its database row failed
  // would otherwise be invisible here and survive the delete.
  for (const bucket of ["videos", "photos"]) {
    const paths = await listUserObjects(env, bucket, user.id);
    if (paths === null) {
      return json({ error: "Couldn't list your files — nothing was deleted. Try again in a moment." }, 502);
    }
    if (paths.length && !(await removeObjects(env, bucket, paths))) {
      // Stopping here is the point. Deleting the account while their video
      // stays in the bucket would tell them they're gone when they aren't.
      return json({ error: "Couldn't delete your uploaded files — nothing was deleted. Try again in a moment." }, 502);
    }
  }

  // 3 — the user. Cascades through profiles and every table that hangs off it.
  const del = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
    method: "DELETE",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!del.ok && del.status !== 404) {
    return json({ error: `Deletion failed (${del.status}). Your account is unchanged — please contact support.` }, 502);
  }

  return json({ ok: true });
}

/** Every storage path under a user's folder, or null if the bucket can't be read. */
async function listUserObjects(env: Env, bucket: string, userId: string): Promise<string[] | null> {
  const out: string[] = [];
  const LIMIT = 100;
  for (let offset = 0; ; offset += LIMIT) {
    const r = await fetch(`${env.SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefix: `${userId}/`, limit: LIMIT, offset }),
    });
    if (!r.ok) return null;
    const page = (await r.json()) as { name: string }[] | null;
    if (!Array.isArray(page) || page.length === 0) return out;
    for (const o of page) if (o?.name) out.push(`${userId}/${o.name}`);
    if (page.length < LIMIT) return out;
    // A runaway pager would hold the request open until the Worker is killed.
    if (out.length > 5000) return out;
  }
}

async function stripeWebhook(req: Request, env: Env): Promise<Response> {
  const sig = req.headers.get("stripe-signature");
  const payload = await req.text();

  // Check the secret EXISTS before trying to verify with it.
  //
  // Without this, an unset STRIPE_WEBHOOK_SECRET reaches WebCrypto as an empty
  // key and throws "DataError: Imported HMAC key length (0)..." — a message
  // that names the symptom and gives no clue whatsoever about the cause. It
  // cost an afternoon and three failed payment tests to trace back to a missing
  // secret. Say it plainly instead.
  if (!env.STRIPE_WEBHOOK_SECRET) {
    console.error("[stripe] STRIPE_WEBHOOK_SECRET is not set on this Worker — no subscription can ever activate.");
    return json({
      error: "STRIPE_WEBHOOK_SECRET is not set on the Worker. Add it in Cloudflare → Workers → apex-api → Settings → Variables and Secrets, using the signing secret (whsec_...) from this Stripe endpoint.",
    }, 503);
  }

  if (!sig || !(await verifyStripe(payload, sig, env.STRIPE_WEBHOOK_SECRET))) {
    return new Response("bad signature", { status: 400 });
  }
  const event = JSON.parse(payload);
  const type = event.type as string;
  const obj = event.data.object;

  // MODE MISMATCH, NAMED.
  //
  // Stripe keeps test and live completely separate: separate events, separate
  // endpoints, separate keys. Point a live-key Worker at a test-mode webhook
  // and the signature verifies fine — then every Stripe API call we make with
  // that key 404s, because the objects live in the other mode. That surfaced as
  // an unexplained 500 and cost an afternoon.
  const keyIsLive = (env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_");
  if (typeof event.livemode === "boolean" && event.livemode !== keyIsLive) {
    const msg = `mode mismatch: this webhook is ${event.livemode ? "LIVE" : "TEST"} but the Worker's STRIPE_SECRET_KEY is ${keyIsLive ? "LIVE" : "TEST"}. Use the endpoint and the key from the same mode.`;
    console.error(`[stripe] ${msg} (event ${event.id}, ${type})`);
    // 400, not 500: retrying will not fix a configuration mistake, and Stripe
    // would keep redelivering for three days.
    return json({ error: msg }, 400);
  }

  try {
  if (type === "checkout.session.completed" && obj.subscription) {
    await upsertSub(env, await stripe(env, `subscriptions/${obj.subscription}`));
  } else if (type === "customer.subscription.created" || type === "customer.subscription.updated") {
    await upsertSub(env, obj);
  } else if (type === "customer.subscription.deleted") {
    const uid = obj.metadata?.user_id;
    if (uid) {
      await supa(env, `subscriptions?user_id=eq.${uid}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "canceled", tier: "bronze", cancel_at_period_end: false }),
      });
    }
    // Nothing to claw back on a cancellation: they keep what was already paid
    // for, and no further invoices means no further commission. Only a REFUND
    // takes money back, which is the next branch.
  } else if (type === "invoice.payment_succeeded") {
    // The only event that earns anyone anything.
    await accrueCommission(env, obj);
  } else if (type === "charge.refunded" || type === "charge.dispute.created") {
    // Money went back to the customer, so the commission on it was never
    // really earned. A dispute is treated as the whole amount; a refund may be
    // partial, and charge.refunded fires for those too — reversing everything
    // on a £1 refund of a £20 payment would wipe the affiliate's commission.
    const isDispute = type === "charge.dispute.created";
    const charge = isDispute ? obj?.charge : obj?.id;
    await reverseCommission(env, {
      chargeId: typeof charge === "string" ? charge : null,
      invoiceId: typeof obj?.invoice === "string" ? obj.invoice : null,
      reason: isDispute ? "chargeback" : "refund",
      refundedPennies: isDispute ? null : Number(obj?.amount_refunded ?? 0),
      totalPennies: isDispute ? null : Number(obj?.amount ?? 0),
    });
  }
  } catch (e) {
    // Say WHICH event failed and why. A bare 500 in the delivery log tells
    // nobody anything, and this is the path that decides whether a paying
    // customer gets what they paid for.
    console.error(`[stripe] ${type} (${event.id}) failed:`, String(e));
    return json({ error: `${type} failed: ${String(e)}` }, 500);
  }
  return json({ received: true });
}

// --- Affiliate commission ----------------------------------------------------
//
// Accrues ONLY on a successful payment, as a share of what actually landed
// after Stripe's fee, and reverses if that payment is refunded. Nobody is ever
// paid for a signup, a trial, or for recruiting another affiliate — see
// migration 0052 for why that distinction is the whole basis of the scheme.

/** Stripe's real fee on a charge, in pennies. Null when it can't be read. */
async function stripeFeeFor(env: Env, chargeId?: string | null): Promise<number | null> {
  if (!chargeId) return null;
  try {
    const charge = await stripe(env, `charges/${chargeId}`);
    const txId = charge?.balance_transaction;
    if (!txId) return null;
    const tx = await stripe(env, `balance_transactions/${txId}`);
    return typeof tx?.fee === "number" ? tx.fee : null;
  } catch {
    // Fall back to the estimate rather than assuming zero — assuming zero
    // overpays every affiliate on every payment.
    return null;
  }
}

async function accrueCommission(env: Env, invoice: any): Promise<void> {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return;

  const paid = Number(invoice?.amount_paid ?? 0);
  const invoiceId = invoice?.id as string | undefined;
  if (!invoiceId || paid <= 0) return; // £0 invoice: a trial starting, nothing earned

  // Whose payment is this? The subscription carries the user id we set at
  // checkout; without it there's nobody to attribute the referral to.
  const subId = invoice?.subscription;
  let userId: string | undefined = invoice?.subscription_details?.metadata?.user_id;
  if (!userId && subId) {
    try { userId = (await stripe(env, `subscriptions/${subId}`))?.metadata?.user_id; } catch { /* ignore */ }
  }
  if (!userId) return;

  const profRes = await supa(env, `profiles?id=eq.${userId}&select=referral_code`);
  const prof = (await profRes.json()) as { referral_code: string | null }[] | null;
  const code = prof?.[0]?.referral_code;
  if (!code) return; // organic customer — most of them, hopefully

  const affRes = await supa(env, "affiliates?select=id,code,parent_id,rate_pct,active,user_id");
  const rows = (await affRes.json()) as {
    id: string; code: string; parent_id: string | null;
    rate_pct: string | number | null; active: boolean; user_id: string | null;
  }[] | null;
  if (!Array.isArray(rows) || !rows.length) return;

  const nodes = rows.map((r) => ({
    id: r.id, code: r.code, parentId: r.parent_id,
    ratePct: r.rate_pct === null ? null : Number(r.rate_pct),
    active: r.active !== false, userId: r.user_id,
  }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const byCode = new Map(nodes.map((n) => [n.code, n]));

  const chargeId = (invoice?.charge ?? null) as string | null;
  const fee = await stripeFeeFor(env, chargeId);

  const lines = splitCommission({
    referralCode: code,
    paidPennies: paid,
    stripeFeePennies: fee,
    byCode, byId,
    payerUserId: userId,
  });
  if (!lines.length) return;

  // The unique index on (invoice, affiliate, level) is what makes this safe to
  // run twice — Stripe redelivers webhooks by design, and a duplicate would
  // otherwise pay someone the same commission again. Conflicts are ignored.
  const feeUsed = fee ?? estimateStripeFee(paid);
  await supa(env, "affiliate_commissions", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify(lines.map((l) => ({
      affiliate_id: l.affiliateId,
      source_user_id: userId,
      stripe_invoice_id: invoiceId,
      stripe_charge_id: chargeId,
      level: l.level,
      rate_pct: l.ratePct,
      gross_pennies: paid,
      fee_pennies: feeUsed,
      net_pennies: l.netPennies,
      amount_pennies: l.amountPennies,
    }))),
  });
}

/**
 * Reverse commission on a refunded or disputed charge.
 *
 * Anything still pending or approved becomes 'reversed'. Rows already marked
 * paid are reversed too so the ledger tells the truth, but the money is gone —
 * which is exactly why commission is held for 30 days before it can be paid.
 */
async function reverseCommission(env: Env, opts: {
  chargeId: string | null;
  invoiceId: string | null;
  reason: string;
  refundedPennies: number | null;
  totalPennies: number | null;
}): Promise<void> {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return;
  if (!opts.chargeId && !opts.invoiceId) return;

  // Matches on the charge OR the invoice. It used to match on the charge alone,
  // so an invoice that carried no charge id left rows that no refund could ever
  // reach — commission stayed payable on money already given back.
  const r = await svcRpc(env, "reverse_commission", {
    p_charge: opts.chargeId,
    p_invoice: opts.invoiceId,
    p_reason: opts.reason,
    p_refunded_pennies: opts.refundedPennies,
    p_total_pennies: opts.totalPennies,
  });
  if (!r.ok) {
    console.error(`reverse_commission failed (${r.status}) — is migration 0055 applied?`);
    return;
  }
  const n = Number(await r.json());
  // A reversal that matched nothing is worth seeing: it means either an
  // unreferred customer (fine) or a row we failed to write (not fine).
  console.log(`commission: ${opts.reason} touched ${n} line(s) for ${opts.chargeId ?? opts.invoiceId}`);
}

async function upsertSub(env: Env, sub: any): Promise<void> {
  const uid = sub.metadata?.user_id;
  const tier = sub.metadata?.tier;
  if (!uid || !tier) return;
  const item = sub.items?.data?.[0];
  const s = sub.status;
  let status = s === "active" || s === "trialing" ? "active" : s === "past_due" || s === "unpaid" ? "past_due" : s === "canceled" ? "canceled" : "incomplete";

  // A PAUSED SUBSCRIPTION IS STILL "active" TO STRIPE.
  //
  // pause_collection stops the invoices but leaves the status alone, so without
  // this we'd keep granting Pro to someone we have deliberately stopped
  // charging — free access for as long as they cared to stay paused.
  const pausedUntil: number | null = sub.pause_collection
    ? Number(sub.pause_collection.resumes_at) || null
    : null;
  if (sub.pause_collection) status = "paused";

  await supa(env, "subscriptions?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{
      user_id: uid,
      tier: status === "active" ? tier : "bronze",
      status,
      pause_until: pausedUntil ? new Date(pausedUntil * 1000).toISOString() : null,
      stripe_customer_id: sub.customer,
      stripe_subscription_id: sub.id,
      stripe_price_id: item?.price?.id ?? null,
      stripe_status: s ?? null,
      trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
      current_period_end: (() => {
        const cpe = sub.current_period_end ?? item?.current_period_end;
        return cpe ? new Date(cpe * 1000).toISOString() : null;
      })(),
      cancel_at_period_end: !!sub.cancel_at_period_end,
    }]),
  });
}

// How old a webhook may be and still be accepted. Stripe signs the timestamp
// into the payload for exactly this reason: without the check, a signature
// stays valid forever, so anyone who ever captured one request body could
// replay it — e.g. re-applying an old "subscription active" event after a
// cancellation. Five minutes is Stripe's own recommended tolerance.
const STRIPE_TOLERANCE_S = 300;

async function verifyStripe(payload: string, header: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=")));
  const t = parts["t"]; const v1 = parts["v1"];
  if (!t || !v1) return false;

  const age = Math.abs(Date.now() / 1000 - Number(t));
  if (!Number.isFinite(age) || age > STRIPE_TOLERANCE_S) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${payload}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  // constant-time-ish compare
  if (hex.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

// --- Video retention ---------------------------------------------------------
//
// Clips expire per tier (14 / 60 / 180 days — see migration 0036). Deleting the
// `videos` row alone is not enough: the file in the bucket is what costs money,
// and a row-only delete orphans it where nothing will ever find it again. So
// the object goes first and the row only follows once storage confirms.
//
// Deliberately runs through the Storage API rather than deleting
// storage.objects rows directly, which leaves the underlying file behind and
// still billed.

/** Delete objects from a bucket. Returns true when storage accepted it. */
async function removeObjects(env: Env, bucket: string, paths: string[]): Promise<boolean> {
  if (!paths.length) return true;
  const r = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${bucket}`, {
    method: "DELETE",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefixes: paths }),
  });
  return r.ok;
}

async function purgeExpiredVideos(env: Env): Promise<void> {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return;

  const r = await svcRpc(env, "expired_video_paths", {});
  if (!r.ok) {
    // Most likely the migration hasn't been applied. Say so rather than
    // failing silently every night for months.
    console.error(`expired_video_paths unavailable (${r.status}) — is migration 0036 applied?`);
    return;
  }
  const rows = (await r.json()) as { id: string; storage_path: string }[];
  if (!Array.isArray(rows) || rows.length === 0) return;

  let removed = 0;
  // Chunked so one oversized request can't fail the whole sweep, and so a
  // partial failure still makes progress.
  const CHUNK = 50;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    const ok = await removeObjects(env, "videos", batch.map((v) => v.storage_path));
    if (!ok) {
      // Leave the rows alone: they'll be picked up again tomorrow, whereas
      // deleting them now would strand the files permanently.
      console.error(`storage delete failed for ${batch.length} clips — rows kept for retry`);
      continue;
    }
    const ids = batch.map((v) => v.id).join(",");
    const del = await supa(env, `videos?id=in.(${ids})`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    if (del.ok) removed += batch.length;
    else console.error(`row delete failed after storage delete for ${batch.length} clips`);
  }
  console.log(`retention: removed ${removed} expired clip(s) of ${rows.length} due`);
}

// --- Web push ----------------------------------------------------------------
//
// The morning nudge. Everything downstream — readiness, streaks, XP,
// leaderboards — depends on the app being opened, and email is a weak channel
// for a 7am reminder to a teenager.
//
// Sent WITHOUT a payload. Encrypting one (RFC 8291: ECDH shared secret, HKDF,
// AES128GCM) is a lot of cryptography to get exactly right, and this message is
// the same every morning — the value is that the phone buzzes, not that the
// text varies. The service worker supplies the wording. VAPID signing below is
// still required: it's how the push service knows the request is from us.

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const byte of b) s += String.fromCharCode(byte);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(s.length + ((4 - (s.length % 4)) % 4), "=");
  const raw = atob(padded);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * A VAPID Authorization header for one push origin.
 *
 * The JWT is scoped to the audience (the push service's origin) and expires, so
 * it's minted per origin per run rather than once globally — a token for
 * Firebase is not valid for Mozilla's push service.
 */
async function vapidHeader(env: Env, audience: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC", crv: "P-256",
      d: env.VAPID_PRIVATE_KEY,
      // The public key is the uncompressed point 0x04 || X || Y; JWK wants X
      // and Y separately.
      x: b64url(b64urlToBytes(env.VAPID_PUBLIC_KEY).slice(1, 33)),
      y: b64url(b64urlToBytes(env.VAPID_PUBLIC_KEY).slice(33, 65)),
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const header = b64url(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(new TextEncoder().encode(JSON.stringify({
    aud: audience,
    // 12 hours. The spec caps this at 24; shorter limits the damage if a token
    // is ever captured in a log.
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.VAPID_SUBJECT || "mailto:info@pocketathlete.com",
  })));

  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(`${header}.${claims}`),
  );
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
}

/** Push to one endpoint. Returns "ok", "gone" (unsubscribe it) or "retry". */
async function pushOne(env: Env, endpoint: string): Promise<"ok" | "gone" | "retry"> {
  try {
    const audience = new URL(endpoint).origin;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: await vapidHeader(env, audience),
        TTL: "43200", // keep it for 12h if the phone is off — a nudge at 8pm is noise
        "Content-Length": "0",
        Urgency: "normal",
      },
    });
    // The push service reports a dead subscription this way — the app was
    // uninstalled or permission revoked. Retrying it every morning forever is
    // how a sender gets rate-limited.
    if (res.status === 404 || res.status === 410) return "gone";
    return res.ok ? "ok" : "retry";
  } catch {
    return "retry";
  }
}

async function sendPushReminders(env: Env): Promise<void> {
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY) return; // push not configured
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return;

  const today = new Date().toISOString().slice(0, 10);
  const r = await svcRpc(env, "push_targets_for_reminder", { for_date: today });
  if (!r.ok) {
    console.error(`push_targets_for_reminder unavailable (${r.status}) — is migration 0043 applied?`);
    return;
  }
  const targets = (await r.json()) as { endpoint: string; sub_id: string }[];
  if (!Array.isArray(targets) || targets.length === 0) return;

  const dead: string[] = [];
  let sent = 0;
  for (const t of targets) {
    const outcome = await pushOne(env, t.endpoint);
    if (outcome === "ok") sent++;
    else if (outcome === "gone") dead.push(t.sub_id);
  }
  // Flagged rather than deleted: the athlete's row stays so re-enabling
  // notifications on that device updates it instead of creating a duplicate.
  if (dead.length) await svcRpc(env, "mark_push_failed", { sub_ids: dead });
  console.log(`push: ${sent} sent, ${dead.length} dead of ${targets.length} due`);
}

/**
 * Release commission that has cleared its holding period.
 *
 * Nothing is payable for 30 days after it's earned, because refunds and
 * chargebacks arrive late. Reversing a held commission is a status change;
 * recovering money from someone who has already been paid and spent it is a
 * conversation.
 */
async function approveDueCommissions(env: Env): Promise<void> {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return;
  const r = await svcRpc(env, "approve_due_commissions", {});
  if (!r.ok) {
    console.error(`approve_due_commissions unavailable (${r.status}) — is migration 0052 applied?`);
    return;
  }
  const n = Number(await r.json());
  if (n > 0) console.log(`commission: approved ${n} line(s) for payout`);
}

// --- Notifications -----------------------------------------------------------
//
// Scheduled jobs create one row. That row is the source for both the in-app
// banner and (when the athlete's matching switch is on) email. One idempotency
// key prevents a retried cron, a second Worker instance or a manual trigger
// from telling somebody twice.

type EmailCategory = "none" | "checkin" | "workout" | "weekly" | "milestone" | "program" | "essential";

interface ReminderProfile {
  id: string;
  health_data_consent_at: string | null;
  in_app_training_reminders: boolean;
  email_weekly_summary: boolean;
  email_checkin_reminders: boolean;
  email_workout_reminders: boolean;
  email_milestones: boolean;
  email_program_reminders: boolean;
}

interface NotificationInput {
  user_id: string;
  kind: string;
  title: string;
  body: string;
  href: string;
  dedupe_key: string;
  show_in_app: boolean;
  email_category: EmailCategory;
}

async function reminderProfiles(env: Env): Promise<Map<string, ReminderProfile>> {
  const r = await supa(env,
    "profiles?select=id,health_data_consent_at,in_app_training_reminders,email_weekly_summary,email_checkin_reminders," +
    "email_workout_reminders,email_milestones,email_program_reminders");
  if (!r.ok) throw new Error(`profiles for reminders: ${r.status}`);
  const rows = (await r.json()) as ReminderProfile[];
  return new Map((rows ?? []).map((p) => [p.id, p]));
}

function emailEnabled(profile: ReminderProfile, category: EmailCategory): boolean {
  if (category === "essential") return true;
  if (category === "checkin") return profile.email_checkin_reminders !== false;
  if (category === "workout") return profile.email_workout_reminders !== false;
  if (category === "weekly") return profile.email_weekly_summary !== false;
  if (category === "milestone") return profile.email_milestones !== false;
  if (category === "program") return profile.email_program_reminders !== false;
  return false;
}

function wants(profile: ReminderProfile | undefined, category: EmailCategory): profile is ReminderProfile {
  return !!profile && !!profile.health_data_consent_at &&
    (profile.in_app_training_reminders !== false || emailEnabled(profile, category));
}

async function queueNotifications(env: Env, rows: NotificationInput[]): Promise<boolean> {
  if (!rows.length) return true;
  const r = await supa(env, "notifications?on_conflict=user_id,dedupe_key", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!r.ok) console.error(`queue notifications failed (${r.status}): ${await r.text()}`);
  return r.ok;
}

async function sendDailyReminders(env: Env): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const [doneResponse, profiles] = await Promise.all([
    supa(env, `daily_check_ins?check_in_date=eq.${today}&select=user_id`),
    reminderProfiles(env),
  ]);
  if (!doneResponse.ok) throw new Error(`daily check-ins for reminders: ${doneResponse.status}`);
  const done = (await doneResponse.json()) as { user_id: string }[];
  const checked = new Set((done ?? []).map((row) => row.user_id));
  const rows: NotificationInput[] = [];
  for (const profile of profiles.values()) {
    if (checked.has(profile.id) || !wants(profile, "checkin")) continue;
    rows.push({
      user_id: profile.id,
      kind: "check_in_reminder",
      title: "Your daily check-in",
      body: "Log sleep, fatigue and soreness to refresh today's readiness score.",
      href: "/journal",
      dedupe_key: `check-in:${today}`,
      show_in_app: profile.in_app_training_reminders !== false,
      email_category: "checkin",
    });
  }
  await queueNotifications(env, rows);
}

async function sendWorkoutReminders(env: Env): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const [programResponse, logResponse, profiles] = await Promise.all([
    supa(env, "programs?status=eq.active&select=user_id"),
    supa(env, `training_logs?log_date=eq.${today}&select=user_id`),
    reminderProfiles(env),
  ]);
  if (!programResponse.ok || !logResponse.ok) throw new Error("workout reminder inputs unavailable");
  const active = new Set(((await programResponse.json()) as { user_id: string }[]).map((row) => row.user_id));
  const logged = new Set(((await logResponse.json()) as { user_id: string }[]).map((row) => row.user_id));
  const rows: NotificationInput[] = [];
  for (const userId of active) {
    const profile = profiles.get(userId);
    if (logged.has(userId) || !wants(profile, "workout")) continue;
    rows.push({
      user_id: userId,
      kind: "workout_reminder",
      title: "Log today's training or rest day",
      body: "A quick entry keeps training load, streaks and coach advice accurate.",
      href: "/journal",
      dedupe_key: `workout:${today}`,
      show_in_app: profile.in_app_training_reminders !== false,
      email_category: "workout",
    });
  }
  await queueNotifications(env, rows);
}

async function sendDeadlineReminders(env: Env): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const in7 = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
  const [programResponse, profiles] = await Promise.all([
    supa(env,
      `programs?status=eq.active&target_date=gte.${today}&target_date=lte.${in7}` +
      "&select=id,user_id,goal_type,target_date,plan,completed_sessions"),
    reminderProfiles(env),
  ]);
  if (!programResponse.ok) throw new Error(`program deadlines: ${programResponse.status}`);
  const programs = (await programResponse.json()) as {
    id: string; user_id: string; goal_type: string; target_date: string;
    plan: { weeks?: { sessions?: unknown[] }[] } | null; completed_sessions: string[] | null;
  }[];
  const rows: NotificationInput[] = [];
  for (const program of programs ?? []) {
    const days = Math.max(0, Math.round((new Date(`${program.target_date}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000));
    if (![7, 3, 1, 0].includes(days)) continue;
    const profile = profiles.get(program.user_id);
    if (!wants(profile, "program")) continue;
    const total = (program.plan?.weeks ?? []).reduce((sum, week) => sum + (week.sessions?.length ?? 0), 0);
    const completed = program.completed_sessions?.length ?? 0;
    const progress = total ? ` You're ${Math.round(completed / total * 100)}% through (${completed}/${total} sessions).` : "";
    rows.push({
      user_id: program.user_id,
      kind: "program_deadline",
      title: days === 0 ? `Target day: ${program.goal_type}` : `${days} day${days === 1 ? "" : "s"} to your ${program.goal_type} target`,
      body: `${days === 0 ? "Your target date is today." : "Your target date is getting close."}${progress}`,
      href: "/coach",
      dedupe_key: `program-deadline:${program.id}:${program.target_date}:${days}`,
      show_in_app: profile.in_app_training_reminders !== false,
      email_category: "program",
    });
  }
  await queueNotifications(env, rows);
}

async function sendWeeklySummaries(env: Env): Promise<void> {
  const through = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const [checkResponse, trainingResponse, profiles] = await Promise.all([
    supa(env, `daily_check_ins?check_in_date=gte.${weekAgo}&select=user_id`),
    supa(env, `training_logs?log_date=gte.${weekAgo}&select=user_id,total_minutes,duration_seconds,session_type`),
    reminderProfiles(env),
  ]);
  if (!checkResponse.ok || !trainingResponse.ok) throw new Error("weekly summary inputs unavailable");
  const checks = (await checkResponse.json()) as { user_id: string }[];
  const training = (await trainingResponse.json()) as {
    user_id: string; total_minutes: number | null; duration_seconds: number | null; session_type: string | null;
  }[];
  const checkCount = new Map<string, number>();
  const sessionCount = new Map<string, number>();
  const minutes = new Map<string, number>();
  for (const row of checks ?? []) checkCount.set(row.user_id, (checkCount.get(row.user_id) ?? 0) + 1);
  for (const row of training ?? []) {
    if (row.session_type === "rest_day") continue;
    sessionCount.set(row.user_id, (sessionCount.get(row.user_id) ?? 0) + 1);
    minutes.set(row.user_id, (minutes.get(row.user_id) ?? 0) + (row.duration_seconds != null ? row.duration_seconds / 60 : row.total_minutes ?? 0));
  }
  const active = new Set([...checkCount.keys(), ...sessionCount.keys()]);
  const rows: NotificationInput[] = [];
  for (const userId of active) {
    const profile = profiles.get(userId);
    if (!wants(profile, "weekly")) continue;
    rows.push({
      user_id: userId,
      kind: "weekly_summary",
      title: "Your week in training",
      body: `${sessionCount.get(userId) ?? 0} sessions · ${Math.round(minutes.get(userId) ?? 0)} min · ${checkCount.get(userId) ?? 0}/7 check-ins.`,
      href: "/dashboard",
      dedupe_key: `weekly:${through}`,
      show_in_app: profile.in_app_training_reminders !== false,
      email_category: "weekly",
    });
  }
  await queueNotifications(env, rows);
}

function gbDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London",
  }).format(date);
}

function money(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount == null || !currency) return "the price shown at checkout";
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase() }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

async function createTrialEndingReminders(env: Env): Promise<void> {
  if (!env.STRIPE_SECRET_KEY) return;
  const response = await supa(env,
    "subscriptions?status=eq.active&cancel_at_period_end=eq.false&trial_reminder_created_at=is.null" +
    "&or=(stripe_status.eq.trialing,stripe_status.is.null)" +
    "&select=user_id,stripe_subscription_id,stripe_status,trial_end");
  if (!response.ok) {
    console.error(`trial reminder query failed (${response.status}) — is migration 0091 applied?`);
    return;
  }
  const candidates = (await response.json()) as {
    user_id: string; stripe_subscription_id: string | null; stripe_status: string | null; trial_end: string | null;
  }[];
  const now = Date.now();
  const dueBy = now + 72 * 3600_000;

  for (const candidate of candidates ?? []) {
    if (!candidate.stripe_subscription_id) continue;
    try {
      // Retrieve once so the reminder contains the actual Stripe price and so
      // rows created before migration 0091 gain trial_end/stripe_status.
      const subscription = await stripe(env, `subscriptions/${candidate.stripe_subscription_id}`);
      await upsertSub(env, subscription);
      const trialEndSeconds = Number(subscription.trial_end) || 0;
      const trialEndMs = trialEndSeconds * 1000;
      if (subscription.status !== "trialing" || !trialEndSeconds || trialEndMs <= now || trialEndMs > dueBy || subscription.cancel_at_period_end) continue;

      const item = subscription.items?.data?.[0];
      const price = item?.price;
      const amount = money(price?.unit_amount, price?.currency);
      const interval = price?.recurring?.interval ? ` per ${price.recurring.interval}` : "";
      const trialEnd = new Date(trialEndMs).toISOString();
      const queued = await queueNotifications(env, [{
        user_id: candidate.user_id,
        kind: "trial_ending",
        title: "Your free trial ends soon",
        body: `Your trial ends on ${gbDate(trialEnd)}. Pro will charge ${amount}${interval} unless you cancel before then. Cancel from Profile → Cancel or pause.`,
        href: "/profile",
        dedupe_key: `trial-ending:${subscription.id}:${trialEndSeconds}`,
        show_in_app: true,
        email_category: "essential",
      }]);
      if (queued) {
        await supa(env, `subscriptions?user_id=eq.${candidate.user_id}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ trial_reminder_created_at: new Date().toISOString() }),
        });
      }
    } catch (error) {
      console.error(`trial reminder failed for ${candidate.user_id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// --- Notification email delivery --------------------------------------------

interface EmailResult { ok: boolean; providerId?: string; error?: string }

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function appLink(env: Env, path: string): string {
  return `${(env.APP_URL || "https://pocketathlete.com").replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * IS EMAIL CONFIGURED AT ALL?
 *
 * The single most useful thing an admin can know, and the app cannot work it
 * out. GAS_EMAIL_URL and RESEND_API_KEY are Cloudflare secrets; a secret cannot
 * be read back — not from the dashboard, not from the API — so nothing outside
 * this Worker can tell "no provider configured" from "the cron has not run
 * yet". Both look identical from the database: no rows.
 *
 * Worse, the Worker is pasted into the dashboard by hand, and pasting does not
 * apply anything in wrangler.toml. A var set in the repo and never set in the
 * dashboard is unset in production, which has already happened here more than
 * once — see the note above OPENROUTER_FREE_MODELS.
 *
 * Reports WHETHER each secret is present, never its value. A boolean cannot
 * leak a key.
 */
async function emailStatus(req: Request, env: Env): Promise<Response> {
  const user = await authUser(req, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (!(await isAdmin(env, user.id))) return json({ error: "forbidden" }, 403);

  const provider = env.GAS_EMAIL_URL ? "gmail" : env.RESEND_API_KEY ? "resend" : null;

  /**
   * WHAT THIS WORKER WAS ACTUALLY HANDED, BY NAME.
   *
   * "I set RESEND_API_KEY and it says I haven't" has four causes, and the
   * dashboard shows none of them:
   *
   *   1. the variable was added but the deploy was never pressed;
   *   2. it went onto a different Worker, or a preview environment;
   *   3. the NAME has a typo — RESEND_KEY, RESEND_APIKEY, a trailing space;
   *   4. it exists with an EMPTY value, which is falsy and therefore reads
   *      exactly like absent.
   *
   * All four are identical from inside the Worker and all four are obvious the
   * moment it lists the names it was given. `env` is a plain object at runtime,
   * so this is the ground truth — not what wrangler.toml says, not what the
   * repo says, what is live.
   *
   * NAMES ONLY, NEVER VALUES, and the names are all in this file already. A
   * name cannot leak a key. `blank` is listed separately because "present and
   * empty" is the one cause that looks like success in the dashboard.
   */
  const vars = env as unknown as Record<string, unknown>;
  const names = Object.keys(vars).filter((k) => typeof vars[k] === "string");
  return json({
    configuredVars: names.filter((k) => (vars[k] as string).trim() !== "").sort(),
    blankVars: names.filter((k) => (vars[k] as string).trim() === "").sort(),
    /**
     * WHICH WORKER ACTUALLY ANSWERED THIS.
     *
     * The remaining way to set a secret correctly and still be told it is
     * missing: set it on a different Worker from the one the app calls.
     * NEXT_PUBLIC_API_URL is compiled into a static export, so the app talks to
     * whatever host was baked in at build time — which is not necessarily the
     * Worker whose dashboard is open in the other tab. Nothing on either screen
     * says so, and the two look identical from here.
     *
     * Read off the request, so it is where the reply came from rather than
     * where anything believes it came from.
     */
    host: new URL(req.url).host,
    version: WORKER_VERSION,
    provider,
    configured: provider !== null,
    from: env.REMINDER_FROM || null,
    // Where a reply lands. Worth showing because the sending address is usually
    // on a subdomain nobody reads, and "our emails work" is not the same claim
    // as "somebody sees the answers".
    replyTo: replyAddress(env) || null,
    // The Gmail sender checks a shared secret. Configured without it, every
    // send is rejected by the script and logged as a failure with a message
    // nobody would connect to a missing variable.
    gmailSecretSet: !!env.GAS_EMAIL_SECRET,
    resendFallback: !!env.RESEND_API_KEY,
    serviceRoleSet: !!env.SUPABASE_SERVICE_ROLE_KEY,
    crons: ["0 8 * * *", "0 19 * * *"],
    note: provider
      ? "Sending through " + (provider === "gmail" ? "the Gmail Apps Script" : "Resend") + "."
      : "No email provider is set on this Worker. Set GAS_EMAIL_URL + GAS_EMAIL_SECRET, or RESEND_API_KEY.",
  });
}

/**
 * Send one email, through the same function everything else uses.
 *
 * DELIBERATELY NOT ITS OWN SENDER. A test that talks to Resend directly proves
 * Resend works and says nothing about the path the reminders take — which, when
 * GAS_EMAIL_URL is set, is not Resend at all. This calls `email`, so a pass
 * means the real pipeline can send and a failure carries the real error.
 *
 * Logged like any other send, so the test appears in the audit trail it is
 * being used to check.
 */
async function emailTest(req: Request, env: Env): Promise<Response> {
  const user = await authUser(req, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (!(await isAdmin(env, user.id))) return json({ error: "forbidden" }, 403);

  const body = (await req.json().catch(() => ({}))) as { to?: string };
  const to = (body.to || user.email || "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return json({ error: "that is not an email address" }, 400);

  const when = new Date().toISOString();
  const result = await email(env, to, "PocketAthlete — test email",
    `<h2>It works</h2><p>This is a test from the PocketAthlete admin dashboard.</p>` +
    `<p style="color:#64748b;font-size:12px">Sent ${escapeHtml(when)} by Worker ${escapeHtml(WORKER_VERSION)}.</p>`);
  await logEmail(env, user.id, "admin_test", result);

  return result.ok
    ? json({ ok: true, to, provider: env.GAS_EMAIL_URL ? "gmail" : "resend", providerId: result.providerId ?? null })
    : json({ ok: false, to, error: result.error ?? "the provider did not accept the message" }, 502);
}

/**
 * Run the notification email queue now, instead of waiting for 08:00.
 *
 * RETRY IS ALREADY THE DEFAULT — a failed send leaves `emailed_at` null, so the
 * next cron picks the same row up again. What was missing is a way to make that
 * happen while somebody is watching, which is the difference between "we think
 * it is fixed" and "it sent".
 */
async function emailRetry(req: Request, env: Env): Promise<Response> {
  const user = await authUser(req, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (!(await isAdmin(env, user.id))) return json({ error: "forbidden" }, 403);
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set on this Worker" }, 500);

  await emailNotifications(env);
  return json({ ok: true, ran: "emailNotifications" });
}

async function logEmail(env: Env, userId: string, type: string, result: EmailResult): Promise<void> {
  await supa(env, "email_delivery_logs", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      user_id: userId,
      email_type: type,
      provider_id: result.providerId ?? null,
      status: result.ok ? "sent" : "failed",
      error_message: result.ok ? null : result.error ?? "Email provider did not accept the message",
    }),
  });
}

async function emailNotifications(env: Env): Promise<void> {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return;
  const response = await svcRpc(env, "pending_notification_emails", {});
  if (!response.ok) {
    console.error(`pending_notification_emails unavailable (${response.status}) — is migration 0091 applied?`);
    return;
  }
  const rows = (await response.json()) as {
    id: string; user_id: string; title: string; body: string | null; href: string | null;
    kind: string; email_category: EmailCategory;
  }[];
  if (!Array.isArray(rows) || rows.length === 0) return;

  const emails = await listUsers(env);
  const completed: string[] = [];
  for (const notification of rows) {
    const address = emails.get(notification.user_id);
    if (!address) {
      await logEmail(env, notification.user_id, `notification_${notification.kind}`, {
        ok: false, error: "No email address on the auth user",
      });
      // Retrying cannot manufacture an address. Keep the audit row, but stop
      // this notification occupying the queue forever.
      completed.push(notification.id);
      continue;
    }
    const link = appLink(env, notification.href ?? "/home");
    const settings = appLink(env, "/profile");
    const body = escapeHtml(notification.body ?? "").replaceAll("\n", "<br>");
    const result = await email(env, address, notification.title.replace(/[\r\n]+/g, " "),
      `<h2>${escapeHtml(notification.title)}</h2><p>${body}</p>` +
      `<p><a href="${link}">Open PocketAthlete →</a></p>` +
      `<p style="color:#64748b;font-size:12px">${notification.email_category === "essential"
        ? "This is an essential account or billing notice."
        : `Change training email choices in <a href="${settings}">Notification settings</a>.`}</p>`);
    await logEmail(env, notification.user_id, `notification_${notification.kind}`, result);
    if (result.ok) completed.push(notification.id);
  }
  if (completed.length) {
    await supa(env, `notifications?id=in.(${completed.join(",")})`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ emailed_at: new Date().toISOString() }),
    });
  }
  console.log(`notifications: emailed ${completed.length} of ${rows.length}`);
}

// Preferred sender is a Google Apps Script web app (free, uses your Gmail)
// when configured; Resend is the fallback. A provider's error status is not a
// successful send — failed rows remain pending for the next cron run.
/**
 * The address a reply should go to, bare — no display name.
 *
 * Empty when neither is set, so the payload simply omits it rather than sending
 * an empty reply-to, which some providers treat as an address and others reject.
 */
function replyAddress(env: Env): string {
  const explicit = (env.REPLY_TO || "").trim();
  if (explicit) return explicit.replace(/^.*</, "").replace(/>.*$/, "").trim();
  const from = (env.REMINDER_FROM || "").trim();
  const inAngles = from.match(/<([^>]+)>/);
  const bare = (inAngles ? inAngles[1] : from).trim();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(bare) ? bare : "";
}

async function email(env: Env, to: string, subject: string, html: string): Promise<EmailResult> {
  try {
    if (env.GAS_EMAIL_URL) {
      const response = await fetch(env.GAS_EMAIL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: env.GAS_EMAIL_SECRET || "", to, subject, html,
          from: env.REMINDER_FROM || "",
          replyTo: replyAddress(env),
        }),
      });
      const payload = await response.json().catch(() => ({})) as { id?: string; error?: string; message?: string };
      return response.ok
        ? { ok: true, providerId: payload.id }
        : { ok: false, error: payload.error ?? payload.message ?? `Gmail sender returned ${response.status}` };
    }
    if (!env.RESEND_API_KEY) return { ok: false, error: "No email provider is configured" };
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.REMINDER_FROM || "PocketAthlete <noreply@example.com>",
        to, subject, html,
        ...(replyAddress(env) ? { reply_to: replyAddress(env) } : {}),
      }),
    });
    const payload = await response.json().catch(() => ({})) as { id?: string; message?: string; name?: string };
    return response.ok
      ? { ok: true, providerId: payload.id }
      : { ok: false, error: payload.message ?? payload.name ?? `Resend returned ${response.status}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function listUsers(env: Env): Promise<Map<string, string>> {
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!response.ok) throw new Error(`list auth users: ${response.status}`);
  const payload = (await response.json()) as { users?: { id: string; email: string }[] };
  return new Map((payload.users ?? []).filter((user) => !!user.email).map((user) => [user.id, user.email]));
}
