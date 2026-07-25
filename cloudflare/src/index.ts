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

export interface Env {
  // AI
  OPENROUTER_API_KEY: string;
  OPENROUTER_MODEL: string; // paid model — the last rung before the on-device engine
  OPENROUTER_FREE_MODELS: string; // comma-separated ":free" slugs, tried first
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
  AI_DAILY_LIMIT: string;       // max LLM calls per user per day (default 40)
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
      if (pathname.endsWith("/create-checkout")) return await createCheckout(req, env);
      if (pathname.endsWith("/stripe-webhook")) return await stripeWebhook(req, env);
      if (pathname.endsWith("/admin-create-user")) return await adminCreateUser(req, env);
      if (pathname.endsWith("/health")) return json({ ok: true });
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
      () => sendDailyReminders(env),
      () => sendDeadlineReminders(env),
      () => purgeExpiredVideos(env),
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
// Requests walk a chain of models: OpenRouter's ":free" tiers first, then the
// paid model. Same key, same account, same provider — so this stays inside
// OpenRouter's terms, unlike stacking other vendors' free tiers behind a proxy.
//
// A rung is abandoned and the next tried when it 429s (free quota spent), 5xxs,
// times out, or hands back something the caller can't use (see `validate`) —
// free models are the ones most likely to ignore "reply with JSON only".
//
// If every rung fails, the endpoint returns an error and the browser drops to
// the on-device engine in lib/coach.ts, which is the real final rung.

// The client (lib/api.ts) aborts at 18s. Stay inside that or the fallback chain
// just burns time the athlete spends watching a spinner: no new attempt starts
// after CHAIN_BUDGET_MS, and no single attempt may run past ATTEMPT_TIMEOUT_MS.
const CHAIN_BUDGET_MS = 15_000;
const ATTEMPT_TIMEOUT_MS = 9_000;

/** Free rungs first, paid last, de-duplicated. */
function modelChain(env: Env): string[] {
  const free = (env.OPENROUTER_FREE_MODELS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const paid = (env.OPENROUTER_MODEL || "deepseek/deepseek-chat").trim();
  return [...free, paid].filter((m, i, all) => m && all.indexOf(m) === i);
}

// Price of the paid rung, in USD per MILLION tokens. Defaults match
// deepseek/deepseek-chat; override in wrangler.toml if you change the model,
// because getting these wrong silently under-counts every bill.
function modelPrice(env: Env, model: string): { prompt: number; completion: number } {
  if (model.endsWith(":free")) return { prompt: 0, completion: 0 };
  return {
    prompt: Number(env.PAID_PROMPT_PER_M || "0.2002"),
    completion: Number(env.PAID_COMPLETION_PER_M || "0.8001"),
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
  env: Env, model: string, system: string, user: string, maxTokens: number, json_mode = false
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
          { role: "user", content: user },
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
  opts: { system: string; user: string; maxTokens: number; validate?: (text: string) => boolean; json?: boolean }
): Promise<{ text: string; model: string; cost: number }> {
  const started = Date.now();
  const trail: string[] = [];
  // Every rung that answered cost something, including ones whose output we
  // rejected. Billing the user only for the rung that succeeded would let a
  // model that reliably returns junk run up an invisible tab.
  let spent = 0;

  const attempt = async (model: string) => {
    const { text, cost } = await openRouterOnce(env, model, opts.system, opts.user, opts.maxTokens, opts.json);
    spent += cost;
    if (opts.validate && !opts.validate(text)) throw new Error("unusable output");
    return { text, model, cost: 0 };
  };

  const chain = modelChain(env);
  const free = chain.filter((m) => m.endsWith(":free"));
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
  opts: { system: string; user: string; maxTokens: number; validate?: (text: string) => boolean; json?: boolean }
): Promise<{ text: string; model: string }> {
  try {
    const { text, model, cost } = await complete(env, opts);
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
  const budget = await checkBudget(env, u.id);
  if (!budget.allowed) return overBudget(budget);
  const { goal, pain_map, notes, in_season, sport, position, focus, days_per_week, split } = (await req.json()) as {
    goal: string; pain_map: Record<string, number>; notes?: string; in_season?: boolean;
    sport?: string; position?: string; focus?: string; days_per_week?: number; split?: string;
  };
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
      `Sport: ${sport || "football"}\nPosition/event: ${position || "unspecified"}\nTraining focus: ${focus || "performance"}\n` +
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
  const budget = await checkBudget(env, u.id);
  if (!budget.allowed) return overBudget(budget);
  const { text } = (await req.json()) as { text?: string };
  const meal = (text ?? "").trim().slice(0, 300);
  if (meal.length < 2) return json({ error: "text required" }, 400);

  const sys =
    "You estimate the nutrition of a meal an athlete describes in plain language. " +
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
    user: `The athlete ate: ${meal}`,
    maxTokens: 700,
    json: true,
    validate: (t) => parseFoodItems(t) !== null,
  });
  const items = parseFoodItems(raw);
  if (!items) return json({ error: "could not read that meal" }, 422); // validate passed, so unreachable
  return json({ items, model });
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

async function generateChallenges(req: Request, env: Env): Promise<Response> {
  const u = await authUser(req, env);
  if (!u) return json({ error: "unauthorized" }, 401);
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
  const { tier } = (await req.json()) as { tier: string };
  if (tier !== "gold" && tier !== "silver") return json({ error: "unknown tier" }, 400);
  const priceId = tier === "gold" ? env.STRIPE_PRICE_GOLD : env.STRIPE_PRICE_SILVER;
  // Distinguish "no such tier" from "price id not set yet" — the latter is a
  // config gap, and saying so plainly beats a confusing Stripe error later.
  if (!priceId) return json({ error: `${tier} price not configured — set STRIPE_PRICE_${tier.toUpperCase()} and redeploy` }, 503);

  // Reuse an existing Stripe customer if we have one.
  const existing = (await (await supa(env, `subscriptions?user_id=eq.${user.id}&select=stripe_customer_id`)).json()) as
    { stripe_customer_id: string | null }[] | null;
  let customerId = existing?.[0]?.stripe_customer_id ?? "";
  if (!customerId) {
    const cust = await stripe(env, "customers", { email: user.email, "metadata[user_id]": user.id });
    customerId = cust.id;
  }
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
  });
  return json({ url: session.url });
}

async function stripeWebhook(req: Request, env: Env): Promise<Response> {
  const sig = req.headers.get("stripe-signature");
  const payload = await req.text();
  if (!sig || !(await verifyStripe(payload, sig, env.STRIPE_WEBHOOK_SECRET))) {
    return new Response("bad signature", { status: 400 });
  }
  const event = JSON.parse(payload);
  const type = event.type as string;
  const obj = event.data.object;

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
  }
  return json({ received: true });
}

async function upsertSub(env: Env, sub: any): Promise<void> {
  const uid = sub.metadata?.user_id;
  const tier = sub.metadata?.tier;
  if (!uid || !tier) return;
  const item = sub.items?.data?.[0];
  const s = sub.status;
  const status = s === "active" || s === "trialing" ? "active" : s === "past_due" || s === "unpaid" ? "past_due" : s === "canceled" ? "canceled" : "incomplete";
  await supa(env, "subscriptions?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{
      user_id: uid,
      tier: status === "active" ? tier : "bronze",
      status,
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
