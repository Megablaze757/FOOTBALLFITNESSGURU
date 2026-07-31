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
  OPENROUTER_VISION_MODELS: string; // comma-separated vision slugs, for the meal-photo path
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
  GAS_EMAIL_URL: string;     // Google Apps Script web-app URL (preferred email sender)
  GAS_EMAIL_SECRET: string;  // shared secret the GAS script checks
  VAPID_PUBLIC_KEY: string;  // base64url P-256 point; must match NEXT_PUBLIC_VAPID_PUBLIC_KEY
  VAPID_PRIVATE_KEY: string; // base64url 'd' of the same key pair — secret
  VAPID_SUBJECT: string;     // mailto: contact, required by the push services
  AI_DAILY_LIMIT: string;       // max LLM calls per user per day (default 40)
  TRIAL_DAYS: string;           // free-trial length in days (default 7; 0 disables)
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
      if (pathname.endsWith("/connect-wearable")) return await connectWearable(req, env);
      if (pathname.endsWith("/ingest-token")) return await mintIngestToken(req, env);
      // NOT session-authenticated — see the function. An Apple Shortcut cannot
      // hold a Supabase JWT, so this one carries its own bearer token.
      if (pathname.endsWith("/wearable-ingest")) return await wearableIngest(req, env);
      // WORKER_VERSION is bumped whenever this file changes in a way that
      // matters. The Worker is pasted into the dashboard by hand, so "is the
      // fix actually live?" was previously unanswerable without an authorised
      // request — and I twice reasoned about behaviour from source that wasn't
      // deployed. curl the health route and you know.
      if (pathname.endsWith("/health")) {
        return json({ ok: true, version: WORKER_VERSION, model: modelChain(env)[0], vision: visionChain(env)[0] });
      }
      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: String(e) }, 500);
    }
  },

  // Cron triggers (configured in wrangler.toml) → reminder emails + storage cleanup.
  async scheduled(event: ScheduledController, env: Env): Promise<void> {
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
      () => purgeExpiredVideos(env),
      () => emailNotifications(env),
      ...(isMonday ? [() => sendWeeklySummaries(env)] : []),
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
const WORKER_VERSION = "2026-07-31.1";

const CHAIN_BUDGET_MS = 55_000;
const ATTEMPT_TIMEOUT_MS = 30_000;

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
function modelChain(env: Env): string[] {
  const configured = (env.OPENROUTER_FREE_MODELS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const fallbacks = configured.length ? configured : DEFAULT_FALLBACK_MODELS;
  const primary = (env.OPENROUTER_MODEL || "deepseek/deepseek-chat").trim();
  return [primary, ...fallbacks].filter((m, i, all) => m && all.indexOf(m) === i);
}

/**
 * Models that can actually look at a photo.
 *
 * A SEPARATE CHAIN, because none of the text rungs can. Sending an image to
 * deepseek/deepseek-chat doesn't error usefully — it answers about nothing, or
 * fails, and then the request walks the rest of the chain doing the same thing
 * until the budget runs out. So the photo path never touches the text models.
 *
 * Same reasoning as DEFAULT_FALLBACK_MODELS for hard-coding a default: this
 * Worker gets pasted into the Cloudflare dashboard, which applies nothing from
 * wrangler.toml, so a var that is only set there is unset in production.
 *
 * Vision slugs get retired like any other. `/health` reports which one is
 * configured, and estimateFood says plainly when the whole chain failed rather
 * than pretending the photo was unreadable.
 */
const DEFAULT_VISION_MODELS = [
  "google/gemini-2.5-flash",
  "openai/gpt-4.1-mini",
];

function visionChain(env: Env): string[] {
  const configured = (env.OPENROUTER_VISION_MODELS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return (configured.length ? configured : DEFAULT_VISION_MODELS).filter((m, i, all) => all.indexOf(m) === i);
}

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

function modelPrice(env: Env, model: string): { prompt: number; completion: number } {
  if (model.endsWith(":free")) return { prompt: 0, completion: 0 };
  // Number("") is 0 and Number(undefined) is NaN, either of which would price
  // every call at zero — fall back unless the override actually parses.
  const num = (v: string | undefined, fallback: number) => {
    const n = Number(v);
    return v && Number.isFinite(n) && n >= 0 ? n : fallback;
  };
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
  model: string,
  usage: { prompt_tokens?: number; completion_tokens?: number; cost?: number } | undefined,
  maxTokens: number
): number {
  if (typeof usage?.cost === "number" && usage.cost >= 0) return usage.cost;
  const price = modelPrice(env, model);
  if (price.prompt === 0 && price.completion === 0) return 0;
  const promptTokens = usage?.prompt_tokens ?? 2000;
  const completionTokens = usage?.completion_tokens ?? maxTokens;
  return (promptTokens * price.prompt + completionTokens * price.completion) / 1_000_000;
}

interface Attempt { text: string; cost: number }

async function openRouterOnce(
  env: Env, model: string, system: string, user: string, maxTokens: number, json_mode = false,
  /** A data: URL. Present only for the photo path — see `estimateFood`. */
  image?: string | null,
): Promise<Attempt> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ATTEMPT_TIMEOUT_MS);
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": env.APP_URL,
        "X-Title": "PocketAthlete",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        // Ask OpenRouter to report what it charged, so accounting uses their
        // number rather than our reconstruction of it.
        usage: { include: true },
        // Constrains the decoder to valid JSON. Without it the cheap models
        // wrap their answer in prose or a ``` fence often enough that a rung
        // fails validation and we pay the latency of trying another one.
        ...(json_mode ? { response_format: { type: "json_object" } } : {}),
        messages: [
          { role: "system", content: system },
          // A plain string when there's no picture, so the text path is byte
          // for byte what it was. The array form is the multimodal shape and
          // some providers reject it when it holds only text.
          {
            role: "user",
            content: image
              ? [{ type: "text", text: user }, { type: "image_url", image_url: { url: image } }]
              : user,
          },
        ],
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
    const data = (await r.json()) as {
      choices?: { message?: { content?: string } }[];
      error?: { message?: string };
      usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
    };
    // OpenRouter can answer 200 with an error body, or with no choices at all
    // when an upstream provider drops the request.
    if (data.error?.message) throw new Error(data.error.message.slice(0, 200));
    const text = data.choices?.[0]?.message?.content ?? "";
    const cost = costOf(env, model, data.usage, maxTokens);
    // An empty completion still consumed tokens, so it is thrown AFTER the cost
    // is known — the caller adds it to the running total either way.
    if (!text.trim()) throw Object.assign(new Error("empty completion"), { cost });
    return { text, cost };
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
    /** A data: URL. Switches the chain to the vision models. */
    image?: string | null;
  }
): Promise<{ text: string; model: string; cost: number }> {
  const started = Date.now();
  const trail: string[] = [];
  // Every rung that answered cost something, including ones whose output we
  // rejected. Billing the user only for the rung that succeeded would let a
  // model that reliably returns junk run up an invisible tab.
  let spent = 0;

  const attempt = async (model: string) => {
    const { text, cost } = await openRouterOnce(env, model, opts.system, opts.user, opts.maxTokens, opts.json, opts.image);
    spent += cost;
    if (opts.validate && !opts.validate(text)) throw new Error("unusable output");
    return { text, model, cost: 0 };
  };

  // A picture needs a model that can see. The text chain's primary is
  // text-only, so sending an image down it fails on every rung and the athlete
  // waits out the whole budget to be told nothing worked.
  const chain = opts.image ? visionChain(env) : modelChain(env);
  // Priority AI is Gold's, and it's a real difference rather than a label: the
  // free rungs are rate-limited shared capacity with no SLA, so skipping them
  // is the difference between a program in ~3s and one that sometimes takes 15
  // or falls back to the on-device engine. It costs about half a penny.
  const free = opts.priority ? [] : chain.filter((m) => m.endsWith(":free"));
  const paid = chain.filter((m) => !m.endsWith(":free"));

  // The free rungs are RACED, not queued. Trying them one after another means
  // the athlete waits for each slow model to finish being wrong before the next
  // one starts, and three sequential timeouts is the whole budget gone. They
  // cost nothing, so there is no reason to be polite about it: fire them
  // together and take the first answer that validates.
  if (free.length) {
    try {
      const winner = await Promise.any(free.map(attempt));
      return { ...winner, cost: spent };
    } catch (e) {
      const errs = (e as AggregateError)?.errors ?? [];
      free.forEach((m, i) => trail.push(`${m}: ${errs[i]?.message ?? "failed"}`));
      spent += errs.reduce((n: number, err: { cost?: number }) => n + (typeof err?.cost === "number" ? err.cost : 0), 0);
    }
  }

  // Paid rungs stay sequential — each one is real money, so we only reach for
  // the next if the previous actually failed.
  for (const model of paid) {
    if (Date.now() - started > CHAIN_BUDGET_MS) {
      trail.push(`${model}: skipped (budget spent)`);
      break;
    }
    try {
      const winner = await attempt(model);
      return { ...winner, cost: spent };
    } catch (e) {
      spent += typeof (e as { cost?: number })?.cost === "number" ? (e as { cost: number }).cost : 0;
      trail.push(`${model}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
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
  const body = (await req.json()) as { question: string; context: Record<string, unknown> };
  const question = (body.question ?? "").slice(0, 600); // cap input for speed + abuse control
  const context = body.context;
  if (!question) return json({ error: "question required" }, 400);
  const sys =
    "You are the athlete's personal football S&C coach and physio. Answer directly and practically " +
    "in 2–4 sentences, grounded in their context. Explain the 'why' behind drills, respect any pain by " +
    "favouring lower-impact options, and advise seeing a physio for sharp/persistent pain. No diagnosis.";
  const ctx =
    `Goal: ${context?.goal ?? "general"}\nSore areas: ${(context?.soreAreas as string[])?.join(", ") || "none"}\n` +
    `Readiness: ${context?.readinessStatus ?? "unknown"}\nPlan drills: ${(context?.programDrills as string[])?.join(", ") || "none"}`;
  const { text, model } = await meteredComplete(env, u.id, {
    system: sys,
    user: `Context:\n${ctx}\n\nQuestion: ${question}`,
    maxTokens: 320,
  });
  return json({ answer: text, model });
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
  if (!photo && meal.length < 2) return json({ error: "text or image required" }, 400);

  const sys =
    (photo
      ? "You estimate the nutrition of a meal an athlete has photographed. Identify each food you can " +
        "see and estimate its portion from the picture, using the plate, cutlery or hand for scale. " +
        "Judge portions conservatively. If part of the plate is unclear, still include it with your best " +
        "estimate and say so in the name (e.g. \"Rice (part hidden, estimated)\"). " +
        "Do NOT invent foods that are not visible. "
      : "You estimate the nutrition of a meal an athlete describes in plain language. ") +
    "Output ONLY valid minified JSON: {items:[{name:string,qty:number,unit:\"g\"|\"ml\"|\"each\",kcal:number,protein:number,carbs:number,fats:number}]}. " +
    "One entry per distinct food. If no portion is stated, assume a normal adult serving and say so in the name " +
    "(e.g. \"Chicken breast (medium portion)\"). Use UK supermarket foods and typical home cooking. " +
    // Weights of cooked grains vary hugely with water; the app's own database is
    // dry-weight, so mixing the two silently doubles someone's carbs.
    "For rice, pasta and oats give the DRY weight. " +
    "kcal must be the total for the stated qty, not per 100g, and must be greater than zero. " +
    "No prose outside the JSON.";

  const { text: raw, model } = await meteredComplete(env, u.id, {
    system: sys,
    user: photo
      ? meal
        ? `Estimate this meal. The athlete also says: ${meal}`
        : "Estimate this meal from the photo."
      : `The athlete ate: ${meal}`,
    // A photo produces more items than a typed sentence usually does, so it
    // needs a little more room to finish the JSON — but not so much that a
    // rambling model burns the latency budget.
    maxTokens: photo ? 900 : 700,
    json: true,
    validate: (t) => parseFoodItems(t) !== null,
    image: photo,
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

  const { description, area, weeks, sport } = (await req.json()) as {
    description?: string; area?: string; weeks?: number; sport?: string;
  };
  const desc = (description ?? "").trim().slice(0, 600);
  if (desc.length < 10) return json({ error: "Tell me a bit more about it — what hurts, when, and for how long." }, 400);
  const duration = Math.max(0, Math.min(520, Number(weeks) || 0));
  const chronic = duration >= 6;

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
      `How long: ${duration ? `${duration} week(s)` : "not stated"}\nDescription: ${desc}`,
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
  const trialDays = Math.max(0, Math.min(90, Number(env.TRIAL_DAYS ?? "7") || 0));
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
  // promising "free for 7 days" to someone who is about to be billed today is
  // the kind of thing that produces chargebacks.
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

// --- Notification emails -----------------------------------------------------
//
// A nudge for anything still unread. Only unread ones: if they've already seen
// it in the app, emailing about it is nagging rather than notifying. Marked as
// emailed either way so nobody is told twice.

async function emailNotifications(env: Env): Promise<void> {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return;
  const r = await svcRpc(env, "pending_notification_emails", {});
  if (!r.ok) {
    console.error(`pending_notification_emails unavailable (${r.status}) — is migration 0040 applied?`);
    return;
  }
  const rows = (await r.json()) as { id: string; user_id: string; title: string; body: string | null; href: string | null }[];
  if (!Array.isArray(rows) || rows.length === 0) return;

  const emails = await listUsers(env);
  const sent: string[] = [];
  for (const n of rows) {
    const addr = emails.get(n.user_id);
    // No address means nothing to send — but still mark it, or this row is
    // retried every night forever.
    if (addr) {
      const link = `${env.APP_URL}${n.href ?? "/home"}`;
      await email(env, addr, n.title,
        `<p>${n.body ?? ""}</p><p><a href="${link}">Open PocketAthlete →</a></p>`);
    }
    sent.push(n.id);
  }
  if (sent.length) {
    await supa(env, `notifications?id=in.(${sent.join(",")})`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ emailed_at: new Date().toISOString() }),
    });
  }
  console.log(`notifications: emailed ${sent.length}`);
}

// --- Email reminders --------------------------------------------------------
// Preferred sender is a Google Apps Script web app (free, uses your Gmail) when
// GAS_EMAIL_URL is set; otherwise falls back to Resend if configured.
async function email(env: Env, to: string, subject: string, html: string): Promise<void> {
  if (env.GAS_EMAIL_URL) {
    await fetch(env.GAS_EMAIL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: env.GAS_EMAIL_SECRET || "", to, subject, html, from: env.REMINDER_FROM || "" }),
    });
    return;
  }
  if (!env.RESEND_API_KEY) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.REMINDER_FROM || "AI Coach <noreply@example.com>", to, subject, html }),
  });
}
async function listUsers(env: Env): Promise<Map<string, string>> {
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  const j = (await r.json()) as { users?: { id: string; email: string }[] };
  return new Map((j.users ?? []).map((u) => [u.id, u.email]));
}
async function sendDailyReminders(env: Env): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const done = (await (await supa(env, `daily_check_ins?check_in_date=eq.${today}&select=user_id`)).json()) as
    { user_id: string }[] | null;
  const checked = new Set((done ?? []).map((r) => r.user_id));
  const emails = await listUsers(env);
  for (const [id, addr] of emails) {
    if (checked.has(id) || !addr) continue;
    await email(env, addr, "Your daily check-in 🏃", `<p>Log how you feel today.</p><p><a href="${env.APP_URL}/journal">Check in →</a></p>`);
  }
}
async function sendDeadlineReminders(env: Env): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const in7 = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
  const progs = (await (await supa(env, `programs?status=eq.active&target_date=gte.${today}&target_date=lte.${in7}&select=user_id,goal_type,target_date`)).json()) as
    { user_id: string; goal_type: string; target_date: string }[] | null;
  const emails = await listUsers(env);
  for (const p of progs ?? []) {
    const addr = emails.get(p.user_id);
    if (!addr) continue;
    const days = Math.ceil((new Date(p.target_date).getTime() - Date.now()) / 86400_000);
    await email(env, addr, `⏳ ${days} days left on your ${p.goal_type} goal`, `<p>${days} day(s) to your target. Finish strong — <a href="${env.APP_URL}/coach">open your program</a>.</p>`);
  }
}
async function sendWeeklySummaries(env: Env): Promise<void> {
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const rows = (await (await supa(env, `daily_check_ins?check_in_date=gte.${weekAgo}&select=user_id`)).json()) as
    { user_id: string }[] | null;
  const counts = new Map<string, number>();
  for (const r of rows ?? []) counts.set(r.user_id, (counts.get(r.user_id) ?? 0) + 1);
  const emails = await listUsers(env);
  for (const [id, n] of counts) {
    const addr = emails.get(id);
    if (addr) await email(env, addr, "Your weekly recovery summary 📊", `<p>You logged ${n} check-in(s) this week. <a href="${env.APP_URL}/dashboard">See your dashboard →</a></p>`);
  }
}
