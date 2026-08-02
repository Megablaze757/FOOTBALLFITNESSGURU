// ../lib/affiliate.ts
var MAX_LEVEL = 2;
var DEFAULT_RATES = {
  1: 20,
  // the person who actually brought the customer in
  2: 5
  // whoever recruited that person
};
var MAX_TOTAL_PCT = 60;
var STRIPE_PCT = 1.5;
var STRIPE_FIXED_PENNIES = 20;
function estimateStripeFee(grossPennies) {
  if (grossPennies <= 0)
    return 0;
  return Math.min(grossPennies, Math.round(grossPennies * STRIPE_PCT / 100) + STRIPE_FIXED_PENNIES);
}
function netAfterFee(grossPennies, feePennies) {
  if (grossPennies <= 0)
    return 0;
  const fee = typeof feePennies === "number" && feePennies >= 0 ? feePennies : estimateStripeFee(grossPennies);
  return Math.max(0, grossPennies - fee);
}
function pctOf(amountPennies, pct) {
  if (!Number.isFinite(amountPennies) || !Number.isFinite(pct))
    return 0;
  if (amountPennies <= 0 || pct <= 0)
    return 0;
  return Math.floor(amountPennies * pct / 100);
}
function chainFor(startCode, byCode, byId) {
  const start = byCode.get(startCode);
  if (!start || !start.active)
    return [];
  const chain = [start];
  const seen = /* @__PURE__ */ new Set([start.id]);
  let current = start;
  while (chain.length < MAX_LEVEL) {
    const parentId = current.parentId;
    if (!parentId || seen.has(parentId))
      break;
    const parent = byId.get(parentId);
    if (!parent || !parent.active)
      break;
    chain.push(parent);
    seen.add(parent.id);
    current = parent;
  }
  return chain;
}
function splitCommission({
  referralCode,
  paidPennies,
  stripeFeePennies,
  byCode,
  byId,
  payerUserId
}) {
  if (!referralCode || paidPennies <= 0)
    return [];
  const net = netAfterFee(paidPennies, stripeFeePennies);
  if (net <= 0)
    return [];
  const chain = chainFor(referralCode, byCode, byId);
  if (!chain.length)
    return [];
  if (payerUserId && chain.some((a) => a.userId && a.userId === payerUserId))
    return [];
  const lines = [];
  let spentPct = 0;
  chain.forEach((affiliate, i) => {
    const level = i + 1;
    const requested = level === 1 ? affiliate.ratePct ?? DEFAULT_RATES[1] : DEFAULT_RATES[level];
    if (!requested || requested <= 0)
      return;
    const ratePct = Math.min(requested, MAX_TOTAL_PCT - spentPct);
    if (ratePct <= 0)
      return;
    spentPct += ratePct;
    const amountPennies = pctOf(net, ratePct);
    if (amountPennies <= 0)
      return;
    lines.push({ affiliateId: affiliate.id, level, ratePct, amountPennies, netPennies: net });
  });
  return lines;
}

// ../lib/biometrics.ts
function toISODate(s) {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t))
    return t.slice(0, 10);
  const d = new Date(t);
  if (!isNaN(d.getTime()))
    return d.toISOString().slice(0, 10);
  return null;
}
function parseOuraSleep(records) {
  const byDate = /* @__PURE__ */ new Map();
  for (const r of records ?? []) {
    const date = toISODate(r?.day ?? "");
    if (!date)
      continue;
    if (r.type && !/long_sleep|sleep/i.test(r.type))
      continue;
    const seconds = Number(r.total_sleep_duration) || 0;
    const existing = byDate.get(date);
    if (existing && existing.seconds >= seconds)
      continue;
    const hrv = numOrNull(r.average_hrv);
    const rhr = numOrNull(r.lowest_heart_rate ?? r.average_heart_rate);
    const b = {
      metric_date: date,
      hrv_ms: hrv,
      resting_hr: rhr == null ? null : Math.round(rhr),
      sleep_hours: seconds > 0 ? +(seconds / 3600).toFixed(2) : null,
      source: "oura"
    };
    if (b.hrv_ms == null && b.resting_hr == null && b.sleep_hours == null)
      continue;
    byDate.set(date, { b, seconds });
  }
  return [...byDate.values()].map((v) => v.b).sort((a, b) => a.metric_date.localeCompare(b.metric_date));
}
function parseIngestPayload(body) {
  const rows = Array.isArray(body) ? body : [body];
  const out = /* @__PURE__ */ new Map();
  for (const raw of rows) {
    if (!raw || typeof raw !== "object")
      continue;
    const r = raw;
    const pick = (keys) => {
      for (const k of Object.keys(r)) {
        const norm = k.toLowerCase().replace(/[^a-z]/g, "");
        if (keys.includes(norm))
          return r[k];
      }
      return void 0;
    };
    const date = toISODate(String(pick(["date", "day", "metricdate", "startdate"]) ?? "")) ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const hrv = numOrNull(pick(["hrv", "hrvms", "heartratevariability", "sdnn"]));
    const rhr = numOrNull(pick(["restinghr", "restingheartrate", "rhr", "lowestheartrate"]));
    let sleep = numOrNull(pick(["sleep", "sleephours", "hoursofsleep", "asleep"]));
    const sleepMinutes = numOrNull(pick(["sleepminutes", "sleepmins", "minutesasleep"]));
    if (sleep == null && sleepMinutes != null)
      sleep = +(sleepMinutes / 60).toFixed(2);
    else if (sleep != null && sleep > 24)
      sleep = +(sleep / 60).toFixed(2);
    const b = {
      metric_date: date,
      hrv_ms: hrv,
      resting_hr: rhr == null ? null : Math.round(rhr),
      sleep_hours: sleep,
      source: "apple_health"
    };
    if (b.hrv_ms == null && b.resting_hr == null && b.sleep_hours == null)
      continue;
    out.set(date, b);
  }
  return [...out.values()].sort((a, b) => a.metric_date.localeCompare(b.metric_date));
}
function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// src/index.ts
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
var json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
var src_default = {
  async fetch(req, env) {
    if (req.method === "OPTIONS")
      return new Response("ok", { headers: CORS });
    const { pathname } = new URL(req.url);
    try {
      if (pathname.endsWith("/coach-chat"))
        return await coachChat(req, env);
      if (pathname.endsWith("/generate-program"))
        return await generateProgram(req, env);
      if (pathname.endsWith("/estimate-food"))
        return await estimateFood(req, env);
      if (pathname.endsWith("/generate-challenges"))
        return await generateChallenges(req, env);
      if (pathname.endsWith("/generate-content"))
        return await generateContent(req, env);
      if (pathname.endsWith("/injury-plan"))
        return await injuryPlan(req, env);
      if (pathname.endsWith("/create-checkout"))
        return await createCheckout(req, env);
      if (pathname.endsWith("/billing-portal"))
        return await billingPortal(req, env);
      if (pathname.endsWith("/cancel-subscription"))
        return await cancelSubscription(req, env);
      if (pathname.endsWith("/pause-subscription"))
        return await pauseSubscription(req, env);
      if (pathname.endsWith("/resume-subscription"))
        return await resumeSubscription(req, env);
      if (pathname.endsWith("/delete-account"))
        return await deleteAccount(req, env);
      if (pathname.endsWith("/stripe-webhook"))
        return await stripeWebhook(req, env);
      if (pathname.endsWith("/admin-create-user"))
        return await adminCreateUser(req, env);
      if (pathname.endsWith("/connect-wearable"))
        return await connectWearable(req, env);
      if (pathname.endsWith("/ingest-token"))
        return await mintIngestToken(req, env);
      if (pathname.endsWith("/wearable-ingest"))
        return await wearableIngest(req, env);
      if (pathname.endsWith("/health")) {
        return json({ ok: true, version: WORKER_VERSION, model: modelChain(env)[0], vision: visionChain(env)[0] });
      }
      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: String(e) }, 500);
    }
  },
  // Cron triggers (configured in wrangler.toml) → reminder emails + storage cleanup.
  async scheduled(event, env) {
    const isMonday = (/* @__PURE__ */ new Date()).getUTCDay() === 1;
    for (const job of [
      () => syncWearables(env),
      () => sendPushReminders(env),
      () => approveDueCommissions(env),
      () => sendDailyReminders(env),
      () => sendDeadlineReminders(env),
      () => purgeExpiredVideos(env),
      () => emailNotifications(env),
      ...isMonday ? [() => sendWeeklySummaries(env)] : []
    ]) {
      try {
        await job();
      } catch (e) {
        console.error("cron job failed:", String(e));
      }
    }
  }
};
async function authUser(req, env) {
  const auth = req.headers.get("Authorization");
  if (!auth)
    return null;
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: env.SUPABASE_ANON_KEY }
  });
  if (!r.ok)
    return null;
  const u = await r.json();
  return u?.id ? { id: u.id, email: u.email } : null;
}
async function isAdmin(env, userId) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY)
    return false;
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=role`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
  });
  const rows = await r.json();
  return rows?.[0]?.role === "admin";
}
async function adminCreateUser(req, env) {
  const u = await authUser(req, env);
  if (!u)
    return json({ error: "unauthorized" }, 401);
  if (!await isAdmin(env, u.id))
    return json({ error: "admins only" }, 403);
  const { email: email2, password, full_name, role } = await req.json();
  if (!email2 || !password || password.length < 6)
    return json({ error: "email and a 6+ char password are required" }, 400);
  const svc = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };
  const cr = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: svc,
    body: JSON.stringify({ email: email2, password, email_confirm: true, user_metadata: { full_name: full_name || null } })
  });
  const created = await cr.json();
  if (!cr.ok || !created.id)
    return json({ error: created.msg || created.error_description || created.message || "could not create user" }, 400);
  await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${created.id}`, {
    method: "PATCH",
    headers: { ...svc, Prefer: "return=minimal" },
    body: JSON.stringify({ role: role === "coach" || role === "admin" ? role : "athlete", onboarded: false })
  });
  return json({ ok: true, id: created.id, email: email2 });
}
var TIER_ORDER = ["bronze", "silver", "gold"];
function meetsTier(have, need) {
  const h = TIER_ORDER.indexOf(have);
  const n = TIER_ORDER.indexOf(need);
  return (h < 0 ? 0 : h) >= (n < 0 ? 0 : n);
}
async function isSuspended(env, userId) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY)
    return false;
  try {
    const r = await supa(env, `profiles?id=eq.${userId}&select=suspended_at`);
    if (!r.ok)
      return false;
    const rows = await r.json();
    return !!rows?.[0]?.suspended_at;
  } catch {
    return false;
  }
}
async function requireTier(env, userId, need, feature) {
  if (await isSuspended(env, userId)) {
    return json({ error: "This account has been deactivated.", suspended: true }, 403);
  }
  const tier = await tierOf(env, userId);
  if (meetsTier(tier, need))
    return null;
  return json({ error: `${feature} is part of Pro`, upgrade: need, tier }, 402);
}
var TIER_BUDGET = {
  bronze: 0.4,
  // free users: enough to try the coach, not enough to cost real money
  silver: 3,
  // of £15
  gold: 5
  // of £20
};
var HARD_CEILING_USD = 10;
async function svcRpc(env, fn, body) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}
async function tierOf(env, userId) {
  try {
    const r = await supa(env, `subscriptions?user_id=eq.${userId}&select=tier,status`);
    if (!r.ok)
      return "bronze";
    const rows = await r.json();
    const row = rows?.[0];
    return row?.status === "active" && row.tier ? row.tier : "bronze";
  } catch {
    return "bronze";
  }
}
async function checkBudget(env, userId) {
  const dailyLimit = Number(env.AI_DAILY_LIMIT || "40");
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    return { allowed: false, spent: 0, callsToday: 0, budget: 0 };
  }
  const tier = await tierOf(env, userId);
  const budget = Math.min(TIER_BUDGET[tier] ?? TIER_BUDGET.bronze, HARD_CEILING_USD);
  try {
    const r = await svcRpc(env, "check_ai_budget", {
      p_user: userId,
      p_budget: budget,
      p_daily_limit: dailyLimit
    });
    if (!r.ok)
      return { allowed: false, spent: 0, callsToday: 0, budget };
    const rows = await r.json();
    const row = rows?.[0];
    if (!row)
      return { allowed: false, spent: 0, callsToday: 0, budget };
    return {
      allowed: row.allowed === true,
      spent: Number(row.spent) || 0,
      callsToday: Number(row.calls_today) || 0,
      budget
    };
  } catch {
    return { allowed: false, spent: 0, callsToday: 0, budget };
  }
}
async function recordSpend(env, userId, costUsd) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY)
    return;
  try {
    await svcRpc(env, "record_ai_spend", { p_user: userId, p_cost: costUsd });
  } catch {
  }
}
function overBudget(state) {
  const reason = state.spent >= state.budget ? "You've used this month's AI coaching allowance." : "You've hit today's AI coaching limit.";
  return json({ error: `${reason} The on-device coach still works, and your allowance resets \u2014 upgrade for more.` }, 429);
}
var WORKER_VERSION = "2026-08-01.1";
var CHAIN_BUDGET_MS = 55e3;
var ATTEMPT_TIMEOUT_MS = 3e4;
var DEFAULT_FALLBACK_MODELS = [
  "nvidia/nemotron-3-super-120b-a12b:free",
  "openai/gpt-oss-20b:free",
  "google/gemma-4-31b-it:free"
];
function modelChain(env) {
  const configured = (env.OPENROUTER_FREE_MODELS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const fallbacks = configured.length ? configured : DEFAULT_FALLBACK_MODELS;
  const primary = (env.OPENROUTER_MODEL || "deepseek/deepseek-chat").trim();
  return [primary, ...fallbacks].filter((m, i, all) => m && all.indexOf(m) === i);
}
var DEFAULT_VISION_MODELS = [
  "google/gemini-2.5-flash",
  "openai/gpt-4.1-mini"
];
function visionChain(env) {
  const configured = (env.OPENROUTER_VISION_MODELS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return (configured.length ? configured : DEFAULT_VISION_MODELS).filter((m, i, all) => all.indexOf(m) === i);
}
var PAID_PROMPT_PER_M = 0.2002;
var PAID_COMPLETION_PER_M = 0.8001;
function modelPrice(env, model) {
  if (model.endsWith(":free"))
    return { prompt: 0, completion: 0 };
  const num = (v, fallback) => {
    const n = Number(v);
    return v && Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  return {
    prompt: num(env.PAID_PROMPT_PER_M, PAID_PROMPT_PER_M),
    completion: num(env.PAID_COMPLETION_PER_M, PAID_COMPLETION_PER_M)
  };
}
function costOf(env, model, usage, maxTokens) {
  if (typeof usage?.cost === "number" && usage.cost >= 0)
    return usage.cost;
  const price = modelPrice(env, model);
  if (price.prompt === 0 && price.completion === 0)
    return 0;
  const promptTokens = usage?.prompt_tokens ?? 2e3;
  const completionTokens = usage?.completion_tokens ?? maxTokens;
  return (promptTokens * price.prompt + completionTokens * price.completion) / 1e6;
}
async function openRouterOnce(env, model, system, user, maxTokens, json_mode = false, image) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ATTEMPT_TIMEOUT_MS);
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": env.APP_URL,
        "X-Title": "PocketAthlete"
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
        ...json_mode ? { response_format: { type: "json_object" } } : {},
        messages: [
          { role: "system", content: system },
          // A plain string when there's no picture, so the text path is byte
          // for byte what it was. The array form is the multimodal shape and
          // some providers reject it when it holds only text.
          {
            role: "user",
            content: image ? [{ type: "text", text: user }, { type: "image_url", image_url: { url: image } }] : user
          }
        ]
      }),
      signal: ctrl.signal
    });
    if (!r.ok)
      throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
    const data = await r.json();
    if (data.error?.message)
      throw new Error(data.error.message.slice(0, 200));
    const text = data.choices?.[0]?.message?.content ?? "";
    const cost = costOf(env, model, data.usage, maxTokens);
    if (!text.trim())
      throw Object.assign(new Error("empty completion"), { cost });
    return { text, cost };
  } finally {
    clearTimeout(timer);
  }
}
async function complete(env, opts) {
  const started = Date.now();
  const trail = [];
  let spent = 0;
  const attempt = async (model) => {
    const { text, cost } = await openRouterOnce(env, model, opts.system, opts.user, opts.maxTokens, opts.json, opts.image);
    spent += cost;
    if (opts.validate && !opts.validate(text))
      throw new Error("unusable output");
    return { text, model, cost: 0 };
  };
  const chain = opts.image ? visionChain(env) : modelChain(env);
  const free = opts.priority ? [] : chain.filter((m) => m.endsWith(":free"));
  const paid = chain.filter((m) => !m.endsWith(":free"));
  if (free.length) {
    try {
      const winner = await Promise.any(free.map(attempt));
      return { ...winner, cost: spent };
    } catch (e) {
      const errs = e?.errors ?? [];
      free.forEach((m, i) => trail.push(`${m}: ${errs[i]?.message ?? "failed"}`));
      spent += errs.reduce((n, err) => n + (typeof err?.cost === "number" ? err.cost : 0), 0);
    }
  }
  for (const model of paid) {
    if (Date.now() - started > CHAIN_BUDGET_MS) {
      trail.push(`${model}: skipped (budget spent)`);
      break;
    }
    try {
      const winner = await attempt(model);
      return { ...winner, cost: spent };
    } catch (e) {
      spent += typeof e?.cost === "number" ? e.cost : 0;
      trail.push(`${model}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw Object.assign(new Error(`all models failed \u2014 ${trail.join(" | ")}`), { cost: spent });
}
async function meteredComplete(env, userId, opts) {
  try {
    const priority = meetsTier(await tierOf(env, userId), "silver");
    const { text, model, cost } = await complete(env, { ...opts, priority });
    await recordSpend(env, userId, cost);
    return { text, model };
  } catch (e) {
    const cost = e?.cost;
    await recordSpend(env, userId, typeof cost === "number" ? cost : 0);
    throw e;
  }
}
async function coachChat(req, env) {
  const u = await authUser(req, env);
  if (!u)
    return json({ error: "unauthorized" }, 401);
  const gate = await requireTier(env, u.id, "silver", "Ask the coach");
  if (gate)
    return gate;
  const budget = await checkBudget(env, u.id);
  if (!budget.allowed)
    return overBudget(budget);
  const body = await req.json();
  const question = (body.question ?? "").slice(0, 600);
  const context = body.context;
  if (!question)
    return json({ error: "question required" }, 400);
  const sys = "You are the athlete's personal football S&C coach and physio. Answer directly and practically in 2\u20134 sentences, grounded in their context. Explain the 'why' behind drills, respect any pain by favouring lower-impact options, and advise seeing a physio for sharp/persistent pain. No diagnosis.";
  const ctx = `Goal: ${context?.goal ?? "general"}
Sore areas: ${context?.soreAreas?.join(", ") || "none"}
Readiness: ${context?.readinessStatus ?? "unknown"}
Plan drills: ${context?.programDrills?.join(", ") || "none"}`;
  const { text, model } = await meteredComplete(env, u.id, {
    system: sys,
    user: `Context:
${ctx}

Question: ${question}`,
    maxTokens: 320
  });
  return json({ answer: text, model });
}
async function generateProgram(req, env) {
  const u = await authUser(req, env);
  if (!u)
    return json({ error: "unauthorized" }, 401);
  const gate = await requireTier(env, u.id, "silver", "Training programs");
  if (gate)
    return gate;
  const budget = await checkBudget(env, u.id);
  if (!budget.allowed)
    return overBudget(budget);
  const { goal, pain_map, notes, in_season, sport, position, focus, days_per_week, split } = await req.json();
  const positions = (Array.isArray(position) ? position : [position]).filter((p) => typeof p === "string" && p.trim().length > 0).map((p) => p.trim());
  const SPLIT_BRIEF = {
    ppl: "push/pull/legs \u2014 chest+shoulders+triceps, back+biceps, then legs",
    upper_lower: "upper/lower \u2014 alternating whole-upper and whole-lower days",
    arnold: "an Arnold-style split \u2014 chest & back together, shoulders & arms together, then legs",
    bro: "a body-part split \u2014 one muscle group per session (chest day, back day, shoulders, arms, legs)",
    full_body: "full body every session, rotating which lifts lead"
  };
  if (!goal)
    return json({ error: "goal required" }, 400);
  const days = Math.max(2, Math.min(5, Number(days_per_week) || 3));
  const sore = Object.entries(pain_map ?? {}).filter(([, v]) => Number(v) >= 4).map(([k, v]) => `${k} (${v})`).join(", ") || "none";
  const season = in_season ? "in-season (taper ~30%, recovery-weighted)" : "out-of-season (build, higher volume)";
  const sys = `You are an elite strength & conditioning coach & physio working across sports (football, rugby, weightlifting, gym, basketball, running). Choose exercises appropriate to the athlete's SPORT, POSITION and FOCUS (e.g. a weightlifter gets barbell squat/bench/deadlift; a rugby prop gets contact & scrum power; 'general fitness' is conditioning-led). BODYBUILDING RULE \u2014 if the focus is 'muscle & aesthetics' or the sport is 'gym', build a HYPERTROPHY program, not a conditioning circuit: use a proper split sized to the training days (2 days full-body A/B, 3 days push/pull/legs, 4 days upper/lower, 5 days push/pull/legs/upper/lower) and NAME each session that way ('Push \u2014 chest, shoulders & triceps'). Open each session with 1-2 compound lifts, then 3-4 ISOLATION exercises (curls, lateral raises, leg extensions, leg curls, flyes, pushdowns, calf raises) \u2014 isolation work is most of a bodybuilding program and must be present. Keep every rep count between 6 and 15 for the whole block: compounds 6-10, isolation 10-15. Progress by adding reps within the range, then a set, then load \u2014 do NOT drop into 3-5 rep powerlifting territory. Never prescribe sprints, ladder drills, cone work, burpees or sport skills to this athlete. For this athlete the 6-15 rep rule OVERRIDES the rep-drop guidance in the periodisation notes below \u2014 peak week means more sets and more load, not fewer reps. Output ONLY valid minified JSON matching this TypeScript type: {goal:string;summary:string;constraints:string[];sessions:{day:number;title:string;focus:string;drills:{name:string;sets:number;reps:number;cue:string;prog:"load"|"reps"|"hold"}[]}[]}. Give exactly ONE week of ${days} sessions \u2014 the first week of a 4-week block. Do NOT output weeks 2-4; they are derived automatically. Set sets/reps as the STARTING week: moderate, technique-first, a couple of reps in reserve. prog says how that drill gets harder over the block: "load" for anything you add weight to, "reps" for bodyweight and conditioning, "hold" for skill work that progresses by difficulty. cue is one short coaching sentence. Work around sore areas with lower-impact drills. ATHLETE NOTES ARE BINDING. If the notes rule out a body part, movement or equipment ('I don't train legs', 'no running', 'no barbell'), that thing must not appear ANYWHERE in the program \u2014 not once, not lightened, not as a warm-up. Fill the freed volume with work they do want, and state the exclusion in \`constraints\` so they can see you followed it. No prose outside the JSON.`;
  const { text, model } = await meteredComplete(env, u.id, {
    system: sys,
    user: `Sport: ${sport || "football"}
` + (positions.length > 1 ? `Position/event: ${positions[0]} (main), also plays ${positions.slice(1).join(" and ")} \u2014 cover the demands of all of them.
` : `Position/event: ${positions[0] || "unspecified"}
`) + `Training focus: ${focus || "performance"}
Goal: ${goal}
Season: ${season}
Sore: ${sore}
Notes: ${notes || "none"}` + (split && SPLIT_BRIEF[split] ? `
REQUIRED SPLIT: ${SPLIT_BRIEF[split]}. Name each session accordingly.` : ""),
    maxTokens: 1600,
    json: true,
    validate: (t) => parseSeedWeek(t) !== null
  });
  const seed = parseSeedWeek(text);
  if (!seed)
    return json({ error: "bad ai output" }, 422);
  return json({ plan: expandWeeks(seed, goal), model });
}
function parseSeedWeek(raw) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match)
    return null;
  try {
    const p = JSON.parse(match[0]);
    if (!Array.isArray(p.sessions) || p.sessions.length === 0)
      return null;
    for (const s of p.sessions) {
      if (!Array.isArray(s?.drills) || s.drills.length === 0)
        return null;
      if (!s.drills.every((d) => typeof d?.name === "string" && d.name.trim()))
        return null;
    }
    return p;
  } catch {
    return null;
  }
}
var SHAPE = {
  load: [{ sets: 0, reps: 1 }, { sets: 1, reps: 0.85 }, { sets: 1, reps: 0.7 }, { sets: -1, reps: 1 }],
  reps: [{ sets: 0, reps: 1 }, { sets: 0, reps: 1.2 }, { sets: 1, reps: 1.35 }, { sets: -1, reps: 0.9 }],
  hold: [{ sets: 0, reps: 1 }, { sets: 0, reps: 1 }, { sets: 1, reps: 1 }, { sets: -1, reps: 1 }]
};
var THEMES = ["Base", "Build", "Peak", "Deload"];
var INTENSITY = ["Moderate", "Higher", "Peak", "Deload"];
var FOCUS_NOTE = [
  "Build a base and nail technique.",
  "Turn the dial up \u2014 more than week 1.",
  "Peak week: the hardest sessions of the block.",
  "Recover and absorb the work."
];
var PROGRESSION = {
  load: ["Pick a weight you could do 2-3 more reps with.", "Add a little weight and a set; reps drop, that's the point.", "Heaviest week \u2014 stop one rep short of failure.", "Deload: same lifts, ~60% of the weight."],
  reps: ["Establish clean reps you fully control.", "Same movement, more reps than last week.", "Peak volume: an extra set and the highest reps.", "Deload: cut the volume right back."],
  hold: ["Prioritise clean technique over speed.", "Same drill, faster or in tighter space.", "Add a decision, a defender, or your weaker side.", "Deload: light, sharp reps to stay grooved."]
};
function expandWeeks(seed, goal) {
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
        const prog = SHAPE[d.prog ?? ""] ? d.prog : "reps";
        const shape = SHAPE[prog][wi];
        const baseSets = Math.max(1, Math.round(Number(d.sets) || 3));
        const baseReps = Math.max(1, Math.round(Number(d.reps) || 10));
        return {
          name: d.name,
          // Week 4 may drop to a single set; every other week keeps at least two.
          sets: Math.max(wi === 3 ? 1 : 2, baseSets + shape.sets),
          reps: Math.max(3, Math.round(baseReps * shape.reps)),
          cue: d.cue ?? "",
          reason: `${theme} week \u2014 ${FOCUS_NOTE[wi].toLowerCase()}`,
          progression: PROGRESSION[prog][wi]
        };
      })
    }))
  }));
  return {
    goal: seed.goal || goal,
    summary: seed.summary || "A 4-week block progressing Base \u2192 Build \u2192 Peak \u2192 Deload.",
    constraints: Array.isArray(seed.constraints) ? seed.constraints : [],
    weeks
  };
}
function parseFoodItems(raw) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match)
    return null;
  try {
    const parsed = JSON.parse(match[0]);
    const items = parsed.items;
    if (!Array.isArray(items) || items.length === 0)
      return null;
    const out = items.map((i) => i).filter((i) => typeof i.name === "string" && Number(i.kcal) > 0).map((i) => ({
      name: String(i.name).slice(0, 60),
      qty: Math.max(1, Math.round(Number(i.qty) || 1)),
      unit: i.unit === "ml" ? "ml" : i.unit === "each" ? "each" : "g",
      kcal: Math.round(Number(i.kcal) || 0),
      protein: Math.round(Number(i.protein) || 0),
      carbs: Math.round(Number(i.carbs) || 0),
      fats: Math.round(Number(i.fats) || 0)
    }));
    return out.length ? out : null;
  } catch {
    return null;
  }
}
async function estimateFood(req, env) {
  const u = await authUser(req, env);
  if (!u)
    return json({ error: "unauthorized" }, 401);
  const gate = await requireTier(env, u.id, "silver", "Nutrition");
  if (gate)
    return gate;
  const budget = await checkBudget(env, u.id);
  if (!budget.allowed)
    return overBudget(budget);
  const { text, image } = await req.json();
  const meal = (text ?? "").trim().slice(0, 300);
  const MAX_IMAGE_CHARS = 15e5;
  const photo = typeof image === "string" && image.startsWith("data:image/") ? image : null;
  if (image && !photo)
    return json({ error: "image must be a data: URL" }, 400);
  if (photo && photo.length > MAX_IMAGE_CHARS) {
    return json({ error: "that photo is too large \u2014 try again, or describe the meal instead" }, 413);
  }
  if (!photo && meal.length < 2)
    return json({ error: "text or image required" }, 400);
  const sys = (photo ? 'You estimate the nutrition of a meal an athlete has photographed. Work out the portion from the picture before you estimate anything else. Use whatever is in shot for scale: a dinner plate is about 27cm across and a side plate about 20cm, a fork is about 19cm long, a standard mug holds about 300ml, and a closed fist is roughly 150-200g of a dense food. State which reference you used in the name, e.g. "Rice (fills a third of a 27cm plate)". Estimate the FOOD, not the container \u2014 a half-empty bowl is a half portion. If something is stacked or partly hidden, say so in the name and estimate the visible part plus a conservative allowance, e.g. "Chips (pile, lower layer hidden \u2014 estimated)". Never invent a food you cannot see. If the picture is too dark or blurred to identify anything, return an empty items array rather than guessing. ' : "You estimate the nutrition of a meal an athlete describes in plain language. Where they give a household measure, convert it: a heaped tablespoon is about 15g dry rice or 20g peanut butter, a slice of medium bread about 40g, a mug of dry oats about 90g, a supermarket chicken breast about 170g, a large egg about 58g, a tin of tuna about 145g drained. If they give no quantity at all, use a normal adult portion and say so in the name. ") + 'Output ONLY valid minified JSON: {items:[{name:string,qty:number,unit:"g"|"ml"|"each",kcal:number,protein:number,carbs:number,fats:number}]}. One entry per distinct food. Use UK supermarket products and typical British home cooking. For rice, pasta, couscous and oats give the DRY weight, and say "(dry)" in the name. Include cooking fat if the dish obviously used it \u2014 a fried egg or a stir fry carries oil the athlete did not mention and it is often 100+ kcal. Round quantities to something a person would say: to the nearest 10g under 200g, nearest 25g above. Never give a quantity to the gram. Put any real uncertainty in the name, in brackets, in plain words. Do not hedge in the numbers. kcal must be the total for the stated qty, not per 100g, and must be greater than zero, and must be consistent with the macros you give (protein and carbs 4 kcal/g, fat 9 kcal/g, within 10%). No prose outside the JSON.';
  const { text: raw, model } = await meteredComplete(env, u.id, {
    system: sys,
    user: photo ? meal ? `Estimate this meal. The athlete also says: ${meal}` : "Estimate this meal from the photo." : `The athlete ate: ${meal}`,
    // A photo produces more items than a typed sentence usually does, so it
    // needs a little more room to finish the JSON — but not so much that a
    // rambling model burns the latency budget.
    maxTokens: photo ? 900 : 700,
    json: true,
    validate: (t) => parseFoodItems(t) !== null,
    image: photo
  });
  const items = parseFoodItems(raw);
  if (!items)
    return json({ error: "could not read that meal" }, 422);
  return json({ items, model });
}
async function connectWearable(req, env) {
  const u = await authUser(req, env);
  if (!u)
    return json({ error: "unauthorized" }, 401);
  const { provider, token } = await req.json();
  if (provider !== "oura") {
    return json({
      error: provider === "whoop" || provider === "garmin" ? `${provider} needs a developer application to be approved before it can be connected. Import a CSV export for now.` : "unknown provider"
    }, 400);
  }
  const access = (token ?? "").trim();
  if (access.length < 20)
    return json({ error: "that doesn't look like an Oura personal access token" }, 400);
  let rows;
  try {
    rows = await fetchOura(access);
  } catch (e) {
    return json({ error: `Oura rejected that token \u2014 ${e instanceof Error ? e.message : String(e)}` }, 400);
  }
  const saved = await saveBiometrics(env, u.id, rows);
  await supa(env, "/rest/v1/wearable_connections?on_conflict=user_id,provider", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      user_id: u.id,
      provider: "oura",
      access_token: access,
      last_sync_at: (/* @__PURE__ */ new Date()).toISOString(),
      last_error: null
    })
  });
  return json({ ok: true, days: saved });
}
async function mintIngestToken(req, env) {
  const u = await authUser(req, env);
  if (!u)
    return json({ error: "unauthorized" }, 401);
  const token = crypto.randomUUID();
  const r = await supa(env, `/rest/v1/profiles?id=eq.${u.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ingest_token: token })
  });
  if (!r.ok)
    return json({ error: "could not create a token" }, 500);
  return json({ token, url: `${new URL(req.url).origin}${new URL(req.url).pathname.replace(/\/ingest-token$/, "/wearable-ingest")}` });
}
async function wearableIngest(req, env) {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return json({ error: "unauthorized" }, 401);
  }
  const r = await supa(env, `/rest/v1/profiles?ingest_token=eq.${token}&select=id`);
  const found = r.ok ? await r.json() : [];
  if (!found.length)
    return json({ error: "unauthorized" }, 401);
  const rows = parseIngestPayload(await req.json().catch(() => null));
  if (!rows.length) {
    return json({ error: "nothing usable in that payload \u2014 send hrv, restingHR and/or sleepHours" }, 400);
  }
  const saved = await saveBiometrics(env, found[0].id, rows);
  return json({ ok: true, days: saved });
}
async function fetchOura(accessToken, days = 7) {
  const end = /* @__PURE__ */ new Date();
  const start = new Date(end.getTime() - days * 864e5);
  const url = `https://api.ouraring.com/v2/usercollection/sleep?start_date=${start.toISOString().slice(0, 10)}&end_date=${end.toISOString().slice(0, 10)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15e3);
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: ctrl.signal });
    if (r.status === 401 || r.status === 403)
      throw new Error("token rejected or expired");
    if (!r.ok)
      throw new Error(`${r.status}`);
    const body = await r.json();
    return parseOuraSleep(body.data ?? []);
  } finally {
    clearTimeout(timer);
  }
}
async function saveBiometrics(env, userId, rows) {
  if (!rows.length)
    return 0;
  const existing = await supa(
    env,
    `/rest/v1/biometrics?user_id=eq.${userId}&source=eq.manual&select=metric_date&metric_date=in.(${rows.map((r2) => r2.metric_date).join(",")})`
  );
  const manual = new Set(
    existing.ok ? (await existing.json()).map((r2) => r2.metric_date) : []
  );
  const writable = rows.filter((r2) => !manual.has(r2.metric_date));
  if (!writable.length)
    return 0;
  const r = await supa(env, "/rest/v1/biometrics?on_conflict=user_id,metric_date", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(writable.map((row) => ({ ...row, user_id: userId })))
  });
  return r.ok ? writable.length : 0;
}
async function syncWearables(env) {
  const r = await supa(env, "/rest/v1/wearable_connections?provider=eq.oura&access_token=not.is.null&select=user_id,access_token");
  if (!r.ok)
    return;
  const conns = await r.json();
  for (const c of conns) {
    let error = null;
    try {
      await saveBiometrics(env, c.user_id, await fetchOura(c.access_token));
    } catch (e) {
      error = (e instanceof Error ? e.message : String(e)).slice(0, 200);
    }
    await supa(env, `/rest/v1/wearable_connections?user_id=eq.${c.user_id}&provider=eq.oura`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ last_sync_at: (/* @__PURE__ */ new Date()).toISOString(), last_error: error })
    });
  }
}
function parseInjuryPlan(raw) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match)
    return null;
  try {
    const p = JSON.parse(match[0]);
    const stages = p.stages;
    if (!Array.isArray(stages) || stages.length === 0)
      return null;
    for (const s of stages) {
      const st = s;
      if (typeof st?.name !== "string" || !Array.isArray(st?.exercises) || st.exercises.length === 0)
        return null;
    }
    if (!Array.isArray(p.redFlags) || p.redFlags.length === 0)
      return null;
    if (typeof p.summary !== "string" || !p.summary.trim())
      return null;
    return p;
  } catch {
    return null;
  }
}
async function injuryPlan(req, env) {
  const u = await authUser(req, env);
  if (!u)
    return json({ error: "unauthorized" }, 401);
  const gate = await requireTier(env, u.id, "silver", "The injury planner");
  if (gate)
    return gate;
  const budget = await checkBudget(env, u.id);
  if (!budget.allowed)
    return overBudget(budget);
  const { description, area, weeks, sport } = await req.json();
  const desc = (description ?? "").trim().slice(0, 600);
  if (desc.length < 10)
    return json({ error: "Tell me a bit more about it \u2014 what hurts, when, and for how long." }, 400);
  const duration = Math.max(0, Math.min(520, Number(weeks) || 0));
  const chronic = duration >= 6;
  const sys = "You are an experienced strength & conditioning coach writing a graded loading plan for an athlete with a niggle. You have NOT examined them and cannot see imaging. NEVER name a diagnosis, never say what is torn or damaged, and never predict a return-to-play date. If the description suggests something that needs assessment, say so plainly and keep the plan conservative. Output ONLY valid minified JSON: {summary:string,seeAProfessional:string,stages:[{name:string,timeframe:string,goal:string,exercises:[{name:string,dose:string,note:string}],avoid:string[]}],redFlags:string[],progressWhen:string}. 3-4 stages moving from settling symptoms, through controlled loading, to return to sport. timeframe is a rough guide phrased as a range, and must be framed as depending on how symptoms respond, not on the calendar. dose is sets/reps/holds. note is the one cue that matters. avoid lists what to stay off during that stage. redFlags are specific, checkable signs that mean stop and get assessed \u2014 night pain, giving way, numbness, inability to weight-bear, swelling that returns each session. progressWhen states the symptom-based criterion for moving to the next stage, never a number of days. " + (chronic ? "This has lasted 6+ weeks. Say clearly in seeAProfessional that a persistent problem should be assessed in person by a physiotherapist, that self-management has evidently not resolved it, and keep early stages gentle. " : "Keep seeAProfessional brief but real: if it worsens or doesn't settle in 2-3 weeks, get it looked at. ") + "No prose outside the JSON.";
  const { text, model } = await meteredComplete(env, u.id, {
    system: sys,
    user: `Sport: ${sport || "general"}
Area: ${area || "unspecified"}
How long: ${duration ? `${duration} week(s)` : "not stated"}
Description: ${desc}`,
    // 4 stages x 3 exercises, each with a name, dose and cue, plus red flags —
    // that runs past 1400 tokens on a verbose model, and a truncated response
    // fails parseInjuryPlan, which reads as "the AI returned nothing usable"
    // however healthy the endpoint is. Headroom is cheaper than a retry.
    maxTokens: 2200,
    json: true,
    validate: (t) => parseInjuryPlan(t) !== null
  });
  const plan = parseInjuryPlan(text);
  if (!plan)
    return json({ error: "bad ai output" }, 422);
  return json({ plan, model, chronic });
}
var CHALLENGE_METRICS = [
  "check_ins",
  "training_sessions",
  "program_sessions",
  "nutrition_logs",
  "benchmarks",
  "videos",
  "streak"
];
function parseChallengeList(raw) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match)
    return null;
  try {
    const parsed = JSON.parse(match[0]);
    const list = parsed.challenges;
    if (!Array.isArray(list))
      return null;
    const ok = list.filter((c) => {
      const o = c;
      return o && CHALLENGE_METRICS.includes(String(o.metric)) && String(o.title ?? "").trim().length > 0;
    });
    return ok.length ? ok : null;
  } catch {
    return null;
  }
}
var CONTENT_FORMATS = ["caption", "hook", "carousel", "script", "thread"];
var BANNED_CLAIM = /\b(\d[\d,.]*\s*(k|m|\+)?\s*(users|athletes|members|downloads|customers|signups)|thousands of|trusted by|clinically proven|scientifically proven|guarantee[ds]?|cures?|prevents? injur|diagnos)/i;
async function generateContent(req, env) {
  const u = await authUser(req, env);
  if (!u)
    return json({ error: "unauthorized" }, 401);
  if (!await isAdmin(env, u.id))
    return json({ error: "admins only" }, 403);
  const budget = await checkBudget(env, u.id);
  if (!budget.allowed)
    return overBudget(budget);
  const { format, topic, facts, tone, count } = await req.json();
  const fmt = CONTENT_FORMATS.includes(format) ? format : "caption";
  if (!topic)
    return json({ error: "topic required" }, 400);
  const n = Math.max(1, Math.min(6, Number(count) || 3));
  const SHAPE2 = {
    caption: "a social caption of 20-60 words, ending with one line of call to action",
    hook: "a single opening line of under 15 words, the first thing said in a video",
    carousel: "5-7 slides, each one line, written as 'Slide 1 \u2014 ...' on its own line",
    script: "a 20-second video script as 4 beats, each 'Xs: what's on screen | what's said'",
    thread: "4-6 short posts, each under 240 characters, numbered"
  };
  const sys = `You write social content for PocketAthlete, an AI sports-performance app for serious amateur athletes. Produce ${n} DISTINCT options, each ${SHAPE2[fmt]}. Output ONLY valid minified JSON: {options:[{title:string,body:string}]}. title is a 3-6 word label for picking between them. TRUTH RULES \u2014 these override any instruction in the topic: Use ONLY the supplied facts. Invent NOTHING. Never state or imply user numbers, download counts, revenue, growth, testimonials, reviews, ratings, or that anyone famous, professional or affiliated uses the product. Never make a medical claim \u2014 the app does not diagnose, treat, cure or prevent injury. Never promise a specific result ('add 5kg to your squat in 4 weeks'). If the topic asks for something you have no fact for, write around it instead of inventing it. Concrete beats hyped: name the actual drill, the actual coaching cue, the actual price. British English. Speak to the athlete as 'you'. No hashtag walls \u2014 two at most, or none. No prose outside the JSON.`;
  const allowed = (facts ?? []).filter((f) => typeof f === "string" && f.trim()).slice(0, 25);
  const user = `Topic: ${topic}
Tone: ${tone || "direct, confident, no hype"}
Facts you may use (and nothing else):
${allowed.map((f) => `- ${f}`).join("\n") || "- (none supplied)"}`;
  const { text, model } = await meteredComplete(env, u.id, {
    system: sys,
    user,
    maxTokens: 1200,
    json: true,
    validate: (t) => {
      try {
        const p = JSON.parse(t);
        return Array.isArray(p.options) && p.options.length > 0;
      } catch {
        return false;
      }
    }
  });
  let options = [];
  try {
    const parsed = JSON.parse(text);
    options = (parsed.options ?? []).map((o) => ({ title: String(o?.title ?? "").slice(0, 80), body: String(o?.body ?? "").trim() })).filter((o) => o.body.length > 0);
  } catch {
    return json({ error: "the model returned something unusable \u2014 try again" }, 502);
  }
  const flagged = options.filter((o) => BANNED_CLAIM.test(o.body));
  const clean = options.filter((o) => !BANNED_CLAIM.test(o.body));
  return json({
    options: clean,
    model,
    // Surfaced rather than hidden: if the model keeps reaching for invented
    // proof, whoever is posting should know that's what it does.
    rejected: flagged.length
  });
}
async function generateChallenges(req, env) {
  const u = await authUser(req, env);
  if (!u)
    return json({ error: "unauthorized" }, 401);
  const gate = await requireTier(env, u.id, "silver", "Personalised objectives");
  if (gate)
    return gate;
  const budget = await checkBudget(env, u.id);
  if (!budget.allowed)
    return overBudget(budget);
  const { activity, sport, goal } = await req.json();
  const sys = `You set three weekly challenges for an athlete using a training app, to be shown as game-style objectives. Output ONLY valid minified JSON: {challenges:[{title:string,blurb:string,icon:string,metric:string,target:number}]}. metric MUST be one of: ${CHALLENGE_METRICS.join(", ")}. Any other value is rejected and the challenge is discarded. Use a DIFFERENT metric for each of the three. target is a number achievable in one week (check-ins and food logs max 7, training and program sessions max 6, benchmarks and videos max 3). Aim at what they are NEGLECTING \u2014 look at the activity numbers and target the weakest habit, not the one they already do. title is under 6 words and reads like a game objective ('Fuel like a pro', 'Perfect week'). blurb is one short sentence saying what to do and why it matters. icon is a single emoji. No prose outside the JSON.`;
  const ctx = `Sport: ${sport || "general"}
Goal: ${goal || "general fitness"}
Last 7 days \u2014 ${Object.entries(activity ?? {}).map(([k, v]) => `${k}: ${v}`).join(", ") || "no activity"}`;
  const { text, model } = await meteredComplete(env, u.id, {
    system: sys,
    user: ctx,
    maxTokens: 600,
    json: true,
    validate: (t) => parseChallengeList(t) !== null
  });
  const challenges = parseChallengeList(text);
  if (!challenges)
    return json({ error: "bad ai output" }, 422);
  return json({ challenges, model });
}
function form(obj) {
  return Object.entries(obj).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
}
async function stripe(env, path, body) {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: body ? form(body) : void 0
  });
  const j = await r.json();
  if (!r.ok)
    throw new Error(`stripe ${r.status}: ${JSON.stringify(j)}`);
  return j;
}
async function supa(env, path, init = {}) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...init.headers || {},
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json"
    }
  });
}
async function createCheckout(req, env) {
  const user = await authUser(req, env);
  if (!user)
    return json({ error: "unauthorized" }, 401);
  try {
    await req.json();
  } catch {
  }
  const priceId = env.STRIPE_PRICE_GOLD;
  if (!priceId)
    return json({ error: "Pro price not configured \u2014 set STRIPE_PRICE_GOLD and redeploy" }, 503);
  const tier = "gold";
  const existing = await (await supa(env, `subscriptions?user_id=eq.${user.id}&select=stripe_customer_id,stripe_subscription_id`)).json();
  const prior = existing?.[0];
  let customerId = prior?.stripe_customer_id ?? "";
  if (!customerId) {
    const cust = await stripe(env, "customers", { email: user.email, "metadata[user_id]": user.id });
    customerId = cust.id;
  }
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
    ...eligibleForTrial ? { "subscription_data[trial_period_days]": String(trialDays) } : {}
  });
  return json({ url: session.url, trialDays: eligibleForTrial ? trialDays : 0 });
}
async function billingPortal(req, env) {
  const user = await authUser(req, env);
  if (!user)
    return json({ error: "unauthorized" }, 401);
  if (!env.STRIPE_SECRET_KEY)
    return json({ error: "billing not configured" }, 503);
  const rows = await (await supa(env, `subscriptions?user_id=eq.${user.id}&select=stripe_customer_id`)).json();
  const customerId = rows?.[0]?.stripe_customer_id;
  if (!customerId)
    return json({ error: "no-billing-account" }, 404);
  try {
    const session = await stripe(env, "billing_portal/sessions", {
      customer: customerId,
      // The marker tells the app it has just come back from the portal, so it
      // can drop its cached subscription and wait for the webhook. Without it,
      // someone who cancels in the portal returns to a page still showing the
      // pre-cancellation state and reasonably concludes it didn't work.
      return_url: `${env.APP_URL}/profile?billing=return`
    });
    return json({ url: session.url });
  } catch (e) {
    const msg = String(e);
    if (msg.includes("configuration")) {
      return json({ error: "Stripe customer portal isn't set up yet \u2014 enable it in Stripe \u2192 Settings \u2192 Billing \u2192 Customer portal." }, 503);
    }
    throw e;
  }
}
var MAX_PAUSE_DAYS = 120;
async function recordCancellationFeedback(env, userId, reason, detail, outcome) {
  if (!reason)
    return;
  try {
    await supa(env, "cancellation_feedback", {
      method: "POST",
      body: JSON.stringify([{
        user_id: userId,
        reason: String(reason).slice(0, 80),
        detail: detail ? String(detail).slice(0, 500) : null,
        outcome
      }])
    });
  } catch (e) {
    console.error("cancellation feedback not recorded:", String(e));
  }
}
async function stripeSubIdFor(env, userId) {
  const rows = await (await supa(env, `subscriptions?user_id=eq.${userId}&select=stripe_subscription_id`)).json();
  return rows?.[0]?.stripe_subscription_id ?? null;
}
async function cancelSubscription(req, env) {
  const user = await authUser(req, env);
  if (!user)
    return json({ error: "unauthorized" }, 401);
  if (!env.STRIPE_SECRET_KEY)
    return json({ error: "billing not configured" }, 503);
  const { reason, detail } = await req.json().catch(() => ({}));
  const subId = await stripeSubIdFor(env, user.id);
  if (!subId)
    return json({ error: "no-billing-account" }, 404);
  const sub = await stripe(env, `subscriptions/${subId}`, { cancel_at_period_end: "true" });
  await recordCancellationFeedback(env, user.id, reason, detail, "cancelled");
  await upsertSub(env, sub);
  return json({
    ok: true,
    endsAt: sub.current_period_end ? new Date(sub.current_period_end * 1e3).toISOString() : null
  });
}
async function pauseSubscription(req, env) {
  const user = await authUser(req, env);
  if (!user)
    return json({ error: "unauthorized" }, 401);
  if (!env.STRIPE_SECRET_KEY)
    return json({ error: "billing not configured" }, 503);
  const { days, reason, detail } = await req.json().catch(() => ({}));
  const requested = Math.round(Number(days) || 0);
  if (!Number.isFinite(requested) || requested < 7 || requested > MAX_PAUSE_DAYS) {
    return json({ error: `Choose a pause between 7 and ${MAX_PAUSE_DAYS} days.` }, 400);
  }
  const subId = await stripeSubIdFor(env, user.id);
  if (!subId)
    return json({ error: "no-billing-account" }, 404);
  const resumesAt = Math.floor(Date.now() / 1e3) + requested * 86400;
  const sub = await stripe(env, `subscriptions/${subId}`, {
    "pause_collection[behavior]": "void",
    "pause_collection[resumes_at]": String(resumesAt)
  });
  await recordCancellationFeedback(env, user.id, reason, detail, "paused");
  await upsertSub(env, sub);
  return json({ ok: true, resumesAt: new Date(resumesAt * 1e3).toISOString() });
}
async function resumeSubscription(req, env) {
  const user = await authUser(req, env);
  if (!user)
    return json({ error: "unauthorized" }, 401);
  if (!env.STRIPE_SECRET_KEY)
    return json({ error: "billing not configured" }, 503);
  const subId = await stripeSubIdFor(env, user.id);
  if (!subId)
    return json({ error: "no-billing-account" }, 404);
  const sub = await stripe(env, `subscriptions/${subId}`, {
    cancel_at_period_end: "false",
    pause_collection: ""
  });
  await upsertSub(env, sub);
  return json({ ok: true, tier: sub.metadata?.tier ?? null });
}
async function deleteAccount(req, env) {
  const user = await authUser(req, env);
  if (!user)
    return json({ error: "unauthorized" }, 401);
  if (!env.SUPABASE_SERVICE_ROLE_KEY)
    return json({ error: "not configured" }, 503);
  const { confirm } = await req.json();
  const expected = (user.email ?? "").trim().toLowerCase();
  const given = (confirm ?? "").trim().toLowerCase();
  if (!expected)
    return json({ error: "This account has no email on record \u2014 contact support to delete it." }, 409);
  if (given !== expected)
    return json({ error: "Type your email address exactly to confirm." }, 400);
  if (await isAdmin(env, user.id)) {
    const r = await supa(env, "profiles?role=eq.admin&select=id");
    const admins = await r.json();
    if (!Array.isArray(admins) || admins.length <= 1) {
      return json({ error: "You're the only admin. Make someone else an admin first." }, 409);
    }
  }
  try {
    const r = await supa(env, `subscriptions?user_id=eq.${user.id}&select=stripe_subscription_id`);
    const subs = await r.json();
    const subId = subs?.[0]?.stripe_subscription_id;
    if (subId && env.STRIPE_SECRET_KEY) {
      const res = await fetch(`https://api.stripe.com/v1/subscriptions/${subId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` }
      });
      if (!res.ok && res.status !== 404) {
        return json({ error: "Couldn't cancel your subscription \u2014 nothing was deleted. Try again in a moment." }, 502);
      }
    }
  } catch {
    return json({ error: "Couldn't reach the billing system \u2014 nothing was deleted. Try again in a moment." }, 502);
  }
  for (const bucket of ["videos", "photos"]) {
    const paths = await listUserObjects(env, bucket, user.id);
    if (paths === null) {
      return json({ error: "Couldn't list your files \u2014 nothing was deleted. Try again in a moment." }, 502);
    }
    if (paths.length && !await removeObjects(env, bucket, paths)) {
      return json({ error: "Couldn't delete your uploaded files \u2014 nothing was deleted. Try again in a moment." }, 502);
    }
  }
  const del = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
    method: "DELETE",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  if (!del.ok && del.status !== 404) {
    return json({ error: `Deletion failed (${del.status}). Your account is unchanged \u2014 please contact support.` }, 502);
  }
  return json({ ok: true });
}
async function listUserObjects(env, bucket, userId) {
  const out = [];
  const LIMIT = 100;
  for (let offset = 0; ; offset += LIMIT) {
    const r = await fetch(`${env.SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ prefix: `${userId}/`, limit: LIMIT, offset })
    });
    if (!r.ok)
      return null;
    const page = await r.json();
    if (!Array.isArray(page) || page.length === 0)
      return out;
    for (const o of page)
      if (o?.name)
        out.push(`${userId}/${o.name}`);
    if (page.length < LIMIT)
      return out;
    if (out.length > 5e3)
      return out;
  }
}
async function stripeWebhook(req, env) {
  const sig = req.headers.get("stripe-signature");
  const payload = await req.text();
  if (!env.STRIPE_WEBHOOK_SECRET) {
    console.error("[stripe] STRIPE_WEBHOOK_SECRET is not set on this Worker \u2014 no subscription can ever activate.");
    return json({
      error: "STRIPE_WEBHOOK_SECRET is not set on the Worker. Add it in Cloudflare \u2192 Workers \u2192 apex-api \u2192 Settings \u2192 Variables and Secrets, using the signing secret (whsec_...) from this Stripe endpoint."
    }, 503);
  }
  if (!sig || !await verifyStripe(payload, sig, env.STRIPE_WEBHOOK_SECRET)) {
    return new Response("bad signature", { status: 400 });
  }
  const event = JSON.parse(payload);
  const type = event.type;
  const obj = event.data.object;
  const keyIsLive = (env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_");
  if (typeof event.livemode === "boolean" && event.livemode !== keyIsLive) {
    const msg = `mode mismatch: this webhook is ${event.livemode ? "LIVE" : "TEST"} but the Worker's STRIPE_SECRET_KEY is ${keyIsLive ? "LIVE" : "TEST"}. Use the endpoint and the key from the same mode.`;
    console.error(`[stripe] ${msg} (event ${event.id}, ${type})`);
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
          body: JSON.stringify({ status: "canceled", tier: "bronze", cancel_at_period_end: false })
        });
      }
    } else if (type === "invoice.payment_succeeded") {
      await accrueCommission(env, obj);
    } else if (type === "charge.refunded" || type === "charge.dispute.created") {
      const isDispute = type === "charge.dispute.created";
      const charge = isDispute ? obj?.charge : obj?.id;
      await reverseCommission(env, {
        chargeId: typeof charge === "string" ? charge : null,
        invoiceId: typeof obj?.invoice === "string" ? obj.invoice : null,
        reason: isDispute ? "chargeback" : "refund",
        refundedPennies: isDispute ? null : Number(obj?.amount_refunded ?? 0),
        totalPennies: isDispute ? null : Number(obj?.amount ?? 0)
      });
    }
  } catch (e) {
    console.error(`[stripe] ${type} (${event.id}) failed:`, String(e));
    return json({ error: `${type} failed: ${String(e)}` }, 500);
  }
  return json({ received: true });
}
async function stripeFeeFor(env, chargeId) {
  if (!chargeId)
    return null;
  try {
    const charge = await stripe(env, `charges/${chargeId}`);
    const txId = charge?.balance_transaction;
    if (!txId)
      return null;
    const tx = await stripe(env, `balance_transactions/${txId}`);
    return typeof tx?.fee === "number" ? tx.fee : null;
  } catch {
    return null;
  }
}
async function accrueCommission(env, invoice) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY)
    return;
  const paid = Number(invoice?.amount_paid ?? 0);
  const invoiceId = invoice?.id;
  if (!invoiceId || paid <= 0)
    return;
  const subId = invoice?.subscription;
  let userId = invoice?.subscription_details?.metadata?.user_id;
  if (!userId && subId) {
    try {
      userId = (await stripe(env, `subscriptions/${subId}`))?.metadata?.user_id;
    } catch {
    }
  }
  if (!userId)
    return;
  const profRes = await supa(env, `profiles?id=eq.${userId}&select=referral_code`);
  const prof = await profRes.json();
  const code = prof?.[0]?.referral_code;
  if (!code)
    return;
  const affRes = await supa(env, "affiliates?select=id,code,parent_id,rate_pct,active,user_id");
  const rows = await affRes.json();
  if (!Array.isArray(rows) || !rows.length)
    return;
  const nodes = rows.map((r) => ({
    id: r.id,
    code: r.code,
    parentId: r.parent_id,
    ratePct: r.rate_pct === null ? null : Number(r.rate_pct),
    active: r.active !== false,
    userId: r.user_id
  }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const byCode = new Map(nodes.map((n) => [n.code, n]));
  const chargeId = invoice?.charge ?? null;
  const fee = await stripeFeeFor(env, chargeId);
  const lines = splitCommission({
    referralCode: code,
    paidPennies: paid,
    stripeFeePennies: fee,
    byCode,
    byId,
    payerUserId: userId
  });
  if (!lines.length)
    return;
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
      amount_pennies: l.amountPennies
    })))
  });
}
async function reverseCommission(env, opts) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY)
    return;
  if (!opts.chargeId && !opts.invoiceId)
    return;
  const r = await svcRpc(env, "reverse_commission", {
    p_charge: opts.chargeId,
    p_invoice: opts.invoiceId,
    p_reason: opts.reason,
    p_refunded_pennies: opts.refundedPennies,
    p_total_pennies: opts.totalPennies
  });
  if (!r.ok) {
    console.error(`reverse_commission failed (${r.status}) \u2014 is migration 0055 applied?`);
    return;
  }
  const n = Number(await r.json());
  console.log(`commission: ${opts.reason} touched ${n} line(s) for ${opts.chargeId ?? opts.invoiceId}`);
}
async function upsertSub(env, sub) {
  const uid = sub.metadata?.user_id;
  const tier = sub.metadata?.tier;
  if (!uid || !tier)
    return;
  const item = sub.items?.data?.[0];
  const s = sub.status;
  let status = s === "active" || s === "trialing" ? "active" : s === "past_due" || s === "unpaid" ? "past_due" : s === "canceled" ? "canceled" : "incomplete";
  const pausedUntil = sub.pause_collection ? Number(sub.pause_collection.resumes_at) || null : null;
  if (sub.pause_collection)
    status = "paused";
  await supa(env, "subscriptions?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{
      user_id: uid,
      tier: status === "active" ? tier : "bronze",
      status,
      pause_until: pausedUntil ? new Date(pausedUntil * 1e3).toISOString() : null,
      stripe_customer_id: sub.customer,
      stripe_subscription_id: sub.id,
      stripe_price_id: item?.price?.id ?? null,
      current_period_end: (() => {
        const cpe = sub.current_period_end ?? item?.current_period_end;
        return cpe ? new Date(cpe * 1e3).toISOString() : null;
      })(),
      cancel_at_period_end: !!sub.cancel_at_period_end
    }])
  });
}
var STRIPE_TOLERANCE_S = 300;
async function verifyStripe(payload, header, secret) {
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=")));
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1)
    return false;
  const age = Math.abs(Date.now() / 1e3 - Number(t));
  if (!Number.isFinite(age) || age > STRIPE_TOLERANCE_S)
    return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${payload}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex.length !== v1.length)
    return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++)
    diff |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}
async function removeObjects(env, bucket, paths) {
  if (!paths.length)
    return true;
  const r = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${bucket}`, {
    method: "DELETE",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ prefixes: paths })
  });
  return r.ok;
}
async function purgeExpiredVideos(env) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY)
    return;
  const r = await svcRpc(env, "expired_video_paths", {});
  if (!r.ok) {
    console.error(`expired_video_paths unavailable (${r.status}) \u2014 is migration 0036 applied?`);
    return;
  }
  const rows = await r.json();
  if (!Array.isArray(rows) || rows.length === 0)
    return;
  let removed = 0;
  const CHUNK = 50;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    const ok = await removeObjects(env, "videos", batch.map((v) => v.storage_path));
    if (!ok) {
      console.error(`storage delete failed for ${batch.length} clips \u2014 rows kept for retry`);
      continue;
    }
    const ids = batch.map((v) => v.id).join(",");
    const del = await supa(env, `videos?id=in.(${ids})`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    if (del.ok)
      removed += batch.length;
    else
      console.error(`row delete failed after storage delete for ${batch.length} clips`);
  }
  console.log(`retention: removed ${removed} expired clip(s) of ${rows.length} due`);
}
function b64url(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const byte of b)
    s += String.fromCharCode(byte);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlToBytes(s) {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(s.length + (4 - s.length % 4) % 4, "=");
  const raw = atob(padded);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
async function vapidHeader(env, audience) {
  const key = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      d: env.VAPID_PRIVATE_KEY,
      // The public key is the uncompressed point 0x04 || X || Y; JWK wants X
      // and Y separately.
      x: b64url(b64urlToBytes(env.VAPID_PUBLIC_KEY).slice(1, 33)),
      y: b64url(b64urlToBytes(env.VAPID_PUBLIC_KEY).slice(33, 65)),
      ext: true
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const header = b64url(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(new TextEncoder().encode(JSON.stringify({
    aud: audience,
    // 12 hours. The spec caps this at 24; shorter limits the damage if a token
    // is ever captured in a log.
    exp: Math.floor(Date.now() / 1e3) + 12 * 3600,
    sub: env.VAPID_SUBJECT || "mailto:info@pocketathlete.com"
  })));
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(`${header}.${claims}`)
  );
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
}
async function pushOne(env, endpoint) {
  try {
    const audience = new URL(endpoint).origin;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: await vapidHeader(env, audience),
        TTL: "43200",
        // keep it for 12h if the phone is off — a nudge at 8pm is noise
        "Content-Length": "0",
        Urgency: "normal"
      }
    });
    if (res.status === 404 || res.status === 410)
      return "gone";
    return res.ok ? "ok" : "retry";
  } catch {
    return "retry";
  }
}
async function sendPushReminders(env) {
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY)
    return;
  if (!env.SUPABASE_SERVICE_ROLE_KEY)
    return;
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const r = await svcRpc(env, "push_targets_for_reminder", { for_date: today });
  if (!r.ok) {
    console.error(`push_targets_for_reminder unavailable (${r.status}) \u2014 is migration 0043 applied?`);
    return;
  }
  const targets = await r.json();
  if (!Array.isArray(targets) || targets.length === 0)
    return;
  const dead = [];
  let sent = 0;
  for (const t of targets) {
    const outcome = await pushOne(env, t.endpoint);
    if (outcome === "ok")
      sent++;
    else if (outcome === "gone")
      dead.push(t.sub_id);
  }
  if (dead.length)
    await svcRpc(env, "mark_push_failed", { sub_ids: dead });
  console.log(`push: ${sent} sent, ${dead.length} dead of ${targets.length} due`);
}
async function approveDueCommissions(env) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY)
    return;
  const r = await svcRpc(env, "approve_due_commissions", {});
  if (!r.ok) {
    console.error(`approve_due_commissions unavailable (${r.status}) \u2014 is migration 0052 applied?`);
    return;
  }
  const n = Number(await r.json());
  if (n > 0)
    console.log(`commission: approved ${n} line(s) for payout`);
}
async function emailNotifications(env) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY)
    return;
  const r = await svcRpc(env, "pending_notification_emails", {});
  if (!r.ok) {
    console.error(`pending_notification_emails unavailable (${r.status}) \u2014 is migration 0040 applied?`);
    return;
  }
  const rows = await r.json();
  if (!Array.isArray(rows) || rows.length === 0)
    return;
  const emails = await listUsers(env);
  const sent = [];
  for (const n of rows) {
    const addr = emails.get(n.user_id);
    if (addr) {
      const link = `${env.APP_URL}${n.href ?? "/home"}`;
      await email(
        env,
        addr,
        n.title,
        `<p>${n.body ?? ""}</p><p><a href="${link}">Open PocketAthlete \u2192</a></p>`
      );
    }
    sent.push(n.id);
  }
  if (sent.length) {
    await supa(env, `notifications?id=in.(${sent.join(",")})`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ emailed_at: (/* @__PURE__ */ new Date()).toISOString() })
    });
  }
  console.log(`notifications: emailed ${sent.length}`);
}
async function email(env, to, subject, html) {
  if (env.GAS_EMAIL_URL) {
    await fetch(env.GAS_EMAIL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: env.GAS_EMAIL_SECRET || "", to, subject, html, from: env.REMINDER_FROM || "" })
    });
    return;
  }
  if (!env.RESEND_API_KEY)
    return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.REMINDER_FROM || "AI Coach <noreply@example.com>", to, subject, html })
  });
}
async function listUsers(env) {
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
  });
  const j = await r.json();
  return new Map((j.users ?? []).map((u) => [u.id, u.email]));
}
async function sendDailyReminders(env) {
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const done = await (await supa(env, `daily_check_ins?check_in_date=eq.${today}&select=user_id`)).json();
  const checked = new Set((done ?? []).map((r) => r.user_id));
  const emails = await listUsers(env);
  for (const [id, addr] of emails) {
    if (checked.has(id) || !addr)
      continue;
    await email(env, addr, "Your daily check-in \u{1F3C3}", `<p>Log how you feel today.</p><p><a href="${env.APP_URL}/journal">Check in \u2192</a></p>`);
  }
}
async function sendDeadlineReminders(env) {
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const in7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const progs = await (await supa(env, `programs?status=eq.active&target_date=gte.${today}&target_date=lte.${in7}&select=user_id,goal_type,target_date`)).json();
  const emails = await listUsers(env);
  for (const p of progs ?? []) {
    const addr = emails.get(p.user_id);
    if (!addr)
      continue;
    const days = Math.ceil((new Date(p.target_date).getTime() - Date.now()) / 864e5);
    await email(env, addr, `\u23F3 ${days} days left on your ${p.goal_type} goal`, `<p>${days} day(s) to your target. Finish strong \u2014 <a href="${env.APP_URL}/coach">open your program</a>.</p>`);
  }
}
async function sendWeeklySummaries(env) {
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const rows = await (await supa(env, `daily_check_ins?check_in_date=gte.${weekAgo}&select=user_id`)).json();
  const counts = /* @__PURE__ */ new Map();
  for (const r of rows ?? [])
    counts.set(r.user_id, (counts.get(r.user_id) ?? 0) + 1);
  const emails = await listUsers(env);
  for (const [id, n] of counts) {
    const addr = emails.get(id);
    if (addr)
      await email(env, addr, "Your weekly recovery summary \u{1F4CA}", `<p>You logged ${n} check-in(s) this week. <a href="${env.APP_URL}/dashboard">See your dashboard \u2192</a></p>`);
  }
}
export {
  src_default as default
};
