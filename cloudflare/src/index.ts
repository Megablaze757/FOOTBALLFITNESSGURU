// =============================================================================
// Fitness Guru API — a single Cloudflare Worker for the app's server-side needs:
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
  OPENROUTER_MODEL: string; // e.g. "anthropic/claude-3.5-sonnet"
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
async function openRouter(env: Env, system: string, user: string, maxTokens = 800): Promise<string> {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": env.APP_URL,
      "X-Title": "Fitness Guru",
    },
    body: JSON.stringify({
      model: env.OPENROUTER_MODEL || "anthropic/claude-3.5-sonnet",
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!r.ok) throw new Error(`openrouter ${r.status}: ${await r.text()}`);
  const data = (await r.json()) as { choices: { message: { content: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
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
  const answer = await openRouter(env, sys, `Context:\n${ctx}\n\nQuestion: ${question}`, 320);
  return json({ answer });
}

async function generateProgram(req: Request, env: Env): Promise<Response> {
  const u = await authUser(req, env);
  if (!u) return json({ error: "unauthorized" }, 401);
  if (!(await allowAiCall(env, u.id))) return json({ error: "daily AI limit reached" }, 429);
  const { goal, pain_map, notes, in_season, sport, position, focus } = (await req.json()) as {
    goal: string; pain_map: Record<string, number>; notes?: string; in_season?: boolean;
    sport?: string; position?: string; focus?: string;
  };
  if (!goal) return json({ error: "goal required" }, 400);
  const sore = Object.entries(pain_map ?? {}).filter(([, v]) => Number(v) >= 4).map(([k, v]) => `${k} (${v})`).join(", ") || "none";
  const season = in_season ? "in-season (taper ~30%, recovery-weighted)" : "out-of-season (build, higher volume)";
  const sys =
    "You are an elite strength & conditioning coach & physio working across sports (football, rugby, weightlifting, gym, basketball, running). " +
    "Choose exercises appropriate to the athlete's SPORT, POSITION and FOCUS (e.g. a weightlifter gets barbell squat/bench/deadlift; a rugby prop gets contact & scrum power; 'muscle & aesthetics' uses hypertrophy rep ranges 8-12; 'general fitness' is conditioning-led). " +
    "Output ONLY valid minified JSON matching this TypeScript type: " +
    "{goal:string;summary:string;constraints:string[];weeks:{week:number;theme:string;intensity:string;sessions:{day:number;title:string;focus:string;drills:{name:string;sets:number;reps:number;cue:string;reason:string}[]}[]}[]}. " +
    "4 periodised weeks (Base→Build→Peak→Deload), 3 sessions/week. Work around sore areas with lower-impact drills. No prose outside the JSON.";
  const raw = await openRouter(env, sys, `Sport: ${sport || "football"}\nPosition/event: ${position || "unspecified"}\nTraining focus: ${focus || "performance"}\nGoal: ${goal}\nSeason: ${season}\nSore: ${sore}\nNotes: ${notes || "none"}`, 4000);
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return json({ error: "bad ai output" }, 422);
  return json({ plan: JSON.parse(match[0]) });
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
  const priceId = tier === "gold" ? env.STRIPE_PRICE_GOLD : tier === "silver" ? env.STRIPE_PRICE_SILVER : null;
  if (!priceId) return json({ error: "unknown tier" }, 400);

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
      current_period_end: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null,
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
