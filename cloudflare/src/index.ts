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
  AI_DAILY_LIMIT: string;    // max LLM calls per user per day (default 40)
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
      if (pathname.endsWith("/create-checkout")) return await createCheckout(req, env);
      if (pathname.endsWith("/stripe-webhook")) return await stripeWebhook(req, env);
      if (pathname.endsWith("/admin-create-user")) return await adminCreateUser(req, env);
      if (pathname.endsWith("/health")) return json({ ok: true });
      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: String(e) }, 500);
    }
  },

  // Cron triggers (configured in wrangler.toml) → reminder emails.
  async scheduled(event: ScheduledController, env: Env): Promise<void> {
    const isMonday = new Date().getUTCDay() === 1;
    await sendDailyReminders(env);
    await sendDeadlineReminders(env);
    if (isMonday) await sendWeeklySummaries(env);
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

// --- Rate limiting ---------------------------------------------------------
// Per-user daily cap on LLM calls (default 40). Fail-open so a hiccup in usage
// tracking never blocks the coach; requires SUPABASE_SERVICE_ROLE_KEY to enforce.
async function allowAiCall(env: Env, userId: string): Promise<boolean> {
  const limit = Number(env.AI_DAILY_LIMIT || "40");
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return true;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/bump_ai_usage`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_user: userId, p_limit: limit }),
    });
    if (!r.ok) return true;
    return (await r.json()) === true;
  } catch {
    return true;
  }
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

async function openRouterOnce(env: Env, model: string, system: string, user: string, maxTokens: number): Promise<string> {
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
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
    const data = (await r.json()) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
    // OpenRouter can answer 200 with an error body, or with no choices at all
    // when an upstream provider drops the request.
    if (data.error?.message) throw new Error(data.error.message.slice(0, 200));
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) throw new Error("empty completion");
    return text;
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
  opts: { system: string; user: string; maxTokens: number; validate?: (text: string) => boolean }
): Promise<{ text: string; model: string }> {
  const started = Date.now();
  const trail: string[] = [];

  for (const model of modelChain(env)) {
    if (Date.now() - started > CHAIN_BUDGET_MS) {
      trail.push(`${model}: skipped (budget spent)`);
      break;
    }
    try {
      const text = await openRouterOnce(env, model, opts.system, opts.user, opts.maxTokens);
      if (opts.validate && !opts.validate(text)) throw new Error("unusable output");
      return { text, model };
    } catch (e) {
      trail.push(`${model}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(`all models failed — ${trail.join(" | ")}`);
}

async function coachChat(req: Request, env: Env): Promise<Response> {
  const u = await authUser(req, env);
  if (!u) return json({ error: "unauthorized" }, 401);
  if (!(await allowAiCall(env, u.id))) return json({ error: "daily AI limit reached" }, 429);
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
  const { text, model } = await complete(env, {
    system: sys,
    user: `Context:\n${ctx}\n\nQuestion: ${question}`,
    maxTokens: 320,
  });
  return json({ answer: text, model });
}

/**
 * Pulls the program JSON out of a completion. Free models like to wrap JSON in
 * prose or a ```json fence, so we take the outermost braces and parse those.
 * Returns null when the result isn't a usable plan — which tells the chain to
 * try the next model rather than failing the request.
 */
function parseProgram(raw: string): unknown | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const plan = JSON.parse(match[0]) as { weeks?: unknown };
    // A plan with no weeks, or weeks with no sessions, renders as an empty
    // calendar — worse than falling through to the on-device engine.
    const weeks = plan.weeks;
    if (!Array.isArray(weeks) || weeks.length === 0) return null;
    for (const w of weeks) {
      const sessions = (w as { sessions?: unknown })?.sessions;
      if (!Array.isArray(sessions) || sessions.length === 0) return null;
    }
    return plan;
  } catch {
    return null;
  }
}

async function generateProgram(req: Request, env: Env): Promise<Response> {
  const u = await authUser(req, env);
  if (!u) return json({ error: "unauthorized" }, 401);
  if (!(await allowAiCall(env, u.id))) return json({ error: "daily AI limit reached" }, 429);
  const { goal, pain_map, notes, in_season, sport, position, focus, days_per_week } = (await req.json()) as {
    goal: string; pain_map: Record<string, number>; notes?: string; in_season?: boolean;
    sport?: string; position?: string; focus?: string; days_per_week?: number;
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
    "Output ONLY valid minified JSON matching this TypeScript type: " +
    "{goal:string;summary:string;constraints:string[];weeks:{week:number;theme:string;intensity:string;focusNote:string;sessions:{day:number;title:string;focus:string;drills:{name:string;sets:number;reps:number;cue:string;reason:string;progression:string}[]}[]}[]}. " +
    `4 weeks, ${days} sessions/week (exactly ${days} sessions in every week). CRITICAL: the weeks must be genuinely DIFFERENT, not the same session relabelled. Apply real periodisation: ` +
    "Week 1 Base — moderate sets/reps, groove technique. " +
    "Week 2 Build — more than week 1: for weighted lifts add a set and a little load while reps drop 1-2; for bodyweight/conditioning add reps or time. " +
    "Week 3 Peak — the hardest week: heaviest loads (lowest reps) on lifts, highest volume on everything else, usually one extra set. " +
    "Week 4 Deload — cut volume ~40%, lighter, to recover. " +
    "So a barbell lift might read 4x8 (w1) -> 5x6 (w2) -> 5x5 (w3) -> 3x8 (w4), and a bodyweight drill 3x10 -> 3x12 -> 4x14 -> 2x10. Vary the actual numbers every week. " +
    "Set each week's focusNote to its one-line job, and each drill's progression to what to change that week (add weight, add reps, go faster). " +
    "Work around sore areas with lower-impact drills. " +
    // Without this the model treated the athlete's note as flavour text: someone
    // who wrote "I don't train legs" still got squats in week 1.
    "ATHLETE NOTES ARE BINDING. If the notes rule out a body part, movement or " +
    "equipment ('I don't train legs', 'no running', 'no barbell'), that thing must " +
    "not appear ANYWHERE in the program — not once, not lightened, not as a warm-up. " +
    "Fill the freed volume with work they do want, and state the exclusion in " +
    "`constraints` so they can see you followed it. " +
    "No prose outside the JSON.";
  const { text, model } = await complete(env, {
    system: sys,
    user: `Sport: ${sport || "football"}\nPosition/event: ${position || "unspecified"}\nTraining focus: ${focus || "performance"}\nGoal: ${goal}\nSeason: ${season}\nSore: ${sore}\nNotes: ${notes || "none"}`,
    maxTokens: 5000,
    validate: (t) => parseProgram(t) !== null,
  });
  const plan = parseProgram(text);
  if (!plan) return json({ error: "bad ai output" }, 422); // validate passed, so unreachable
  return json({ plan, model });
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
  const existing = await (await supa(env, `subscriptions?user_id=eq.${user.id}&select=stripe_customer_id`)).json();
  let customerId: string = existing?.[0]?.stripe_customer_id;
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

async function verifyStripe(payload: string, header: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=")));
  const t = parts["t"]; const v1 = parts["v1"];
  if (!t || !v1) return false;
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
  const done = await (await supa(env, `daily_check_ins?check_in_date=eq.${today}&select=user_id`)).json();
  const checked = new Set((done ?? []).map((r: { user_id: string }) => r.user_id));
  const emails = await listUsers(env);
  for (const [id, addr] of emails) {
    if (checked.has(id) || !addr) continue;
    await email(env, addr, "Your daily check-in 🏃", `<p>Log how you feel today.</p><p><a href="${env.APP_URL}/journal">Check in →</a></p>`);
  }
}
async function sendDeadlineReminders(env: Env): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const in7 = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
  const progs = await (await supa(env, `programs?status=eq.active&target_date=gte.${today}&target_date=lte.${in7}&select=user_id,goal_type,target_date`)).json();
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
  const rows = await (await supa(env, `daily_check_ins?check_in_date=gte.${weekAgo}&select=user_id`)).json();
  const counts = new Map<string, number>();
  for (const r of rows ?? []) counts.set(r.user_id, (counts.get(r.user_id) ?? 0) + 1);
  const emails = await listUsers(env);
  for (const [id, n] of counts) {
    const addr = emails.get(id);
    if (addr) await email(env, addr, "Your weekly recovery summary 📊", `<p>You logged ${n} check-in(s) this week. <a href="${env.APP_URL}/dashboard">See your dashboard →</a></p>`);
  }
}
