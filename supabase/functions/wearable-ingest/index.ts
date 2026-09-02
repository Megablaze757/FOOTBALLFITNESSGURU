// =============================================================================
// Supabase Edge Function: wearable-ingest (Deno)
//
// The morning sync. An Apple Shortcut (or Tasker, or curl) sends last night's
// sleep, HRV and resting heart rate here and it lands in public.biometrics.
//
// Two ways in, deliberately:
//
//   GET  /wearable-ingest?t=<token>&sleep=7.5&hrv=55&rhr=48
//   POST /wearable-ingest   Authorization: Bearer <token>   {"sleepHours": 7.5}
//
// The GET is the one the setup guide teaches, because it is one action in
// Shortcuts instead of six — see the long note above `Deno.serve`. Both go
// through the same parser, so they cannot disagree about what a payload meant.
//
// WHY THIS IS A SUPABASE FUNCTION AND NOT A CLOUDFLARE ROUTE.
//
// Historically: the Worker in production was built from source nobody had, so
// pasting the repo's bundle would have fixed the sync and deleted the live AI
// provider chain at the same time. The morning sync shares nothing with those
// routes but a Supabase key, so it shipped here and went live on its own.
//
// That reason has expired — the Worker and the repo are in sync (check with
// `npm run worker:drift <url>`) and cloudflare/src/index.ts DOES serve
// /wearable-ingest today. Two things keep this the athlete-facing one anyway:
//
//   1. The Worker's copy accepts POST + `Authorization: Bearer` ONLY. The
//      setup guide teaches a bare GET with `?t=`, because that is one action in
//      Shortcuts instead of six. A link pointed at the Worker 401s.
//   2. NEXT_PUBLIC_SUPABASE_URL is always set; NEXT_PUBLIC_API_URL is not, and
//      a sync that silently stops when a build variable is missing is the
//      failure mode this feature already had once.
//
// components/WearableConnect builds every athlete's link from the Supabase URL
// and never from the Worker, so nothing reaches the Worker's copy. If that ever
// changes, teach it the GET form first.
//
// Deploy:
//   supabase functions deploy wearable-ingest --no-verify-jwt
//
// --no-verify-jwt IS REQUIRED AND IS NOT A SECURITY HOLE. The caller is an
// Apple Shortcut, which has no Supabase session and no way to refresh one. It
// authenticates with the athlete's ingest token instead — see below. With JWT
// verification on, Supabase rejects the request before this code runs and every
// morning silently 401s.
//
// Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the
// platform. Nothing else is needed.
// =============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface BiometricRow {
  metric_date: string;
  hrv_ms: number | null;
  resting_hr: number | null;
  sleep_hours: number | null;
  source: string;
}

/**
 * A DUPLICATE OF `parseIngestPayload` IN lib/biometrics.ts, and it has to be.
 *
 * Edge Functions run in Deno with their own module graph; they cannot import
 * from the Next.js app's `lib/`. The alternative is a build step that inlines
 * it, which is a lot of machinery for eighty lines.
 *
 * So: `lib/biometrics.test.ts` is the specification. If you change how a
 * payload is read, change it in both places and run that suite — the behaviour
 * below is deliberately identical, down to the minutes-vs-hours heuristic.
 */
function parseIngestPayload(body: unknown, todayLocalDate: string): BiometricRow[] {
  const rows = Array.isArray(body) ? body : [body];
  const out = new Map<string, BiometricRow>();

  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    // Key matching is case- and punctuation-insensitive because a Shortcut's
    // JSON keys are typed by hand on a phone: "Resting HR", "restingHR" and
    // "resting_hr" are all the same intent.
    const pick = (keys: string[]): unknown => {
      for (const k of Object.keys(r)) {
        const norm = k.toLowerCase().replace(/[^a-z]/g, "");
        if (keys.includes(norm)) return r[k];
      }
      return undefined;
    };

    const date = toISODate(String(pick(["date", "day", "metricdate", "startdate"]) ?? "")) ?? todayLocalDate;

    let sleepAlreadyHours = false;
    const hrv = numOrNull(pick(["hrv", "hrvms", "heartratevariability", "sdnn"]));
    const rhr = numOrNull(pick(["restinghr", "restingheartrate", "rhr", "lowestheartrate"]));
    /**
     * A FORMATTED DURATION IS TRIED FIRST, and it has to be.
     *
     * iOS renders a Health sample's Duration as "7 hr 32 min", and numOrNull
     * strips every non-digit — so that arrives as 732, lands in the range read
     * as minutes, and is stored as twelve and a quarter hours of sleep. It then
     * feeds readiness, ACWR and the coach's advice, all of them confidently
     * wrong. See durationTextToHours.
     */
    const sleepRaw = pick(["sleep", "sleephours", "hoursofsleep", "asleep"]);
    let sleep = durationTextToHours(String(sleepRaw ?? ""));
    if (sleep == null) sleep = numOrNull(sleepRaw);
    else sleepAlreadyHours = true;
    const sleepMinutes = numOrNull(pick(["sleepminutes", "sleepmins", "minutesasleep"]));
    if (sleep == null && sleepMinutes != null) sleep = +(sleepMinutes / 60).toFixed(2);
    else if (sleep != null && !sleepAlreadyHours) sleep = sleepToHours(sleep);

    const b: BiometricRow = {
      metric_date: date,
      hrv_ms: hrv,
      resting_hr: rhr == null ? null : Math.round(rhr),
      sleep_hours: sleep,
      source: "apple_health", // biometrics_source_check permits this, NOT 'healthkit'
    };
    if (b.hrv_ms == null && b.resting_hr == null && b.sleep_hours == null) continue;
    out.set(date, b); // a later row for the same date wins
  }

  return [...out.values()].sort((a, b) => a.metric_date.localeCompare(b.metric_date));
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  // Strip first: a Shortcut can hand over "55 ms" or "48 bpm" depending on
  // which Health detail was dragged in, and the unit is not the athlete's
  // mistake.
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.-]/g, ""));
  /**
   * ZERO IS A SENSOR THAT DID NOT READ, NOT A MEASUREMENT.
   *
   * The two copies of this disagreed here, and the Edge one — the one that
   * WRITES — accepted it. A watch that fails to get a reading reports 0, that
   * landed in biometrics as hrv_ms: 0, and biometricSignal then computed a
   * deviation of -100% against the athlete's baseline and took ten points off
   * readiness. There is no resting heart rate of zero and no HRV of zero in
   * anyone this app is for.
   */
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * A DURATION AS SHORTCUTS ACTUALLY WRITES IT.
 *
 * iOS renders a Health sample's Duration as "7 hr 32 min", not as a bare
 * number. That breaks twice: the space makes the URL invalid, so Shortcuts
 * refuses to send it at all — and if one ever arrives another way, numOrNull
 * strips the non-digits, yielding 732, which sleepToHours reads as minutes and
 * stores as twelve and a quarter hours of sleep. Wrong data that looks
 * plausible is worse than none: it feeds readiness, ACWR and the coach.
 *
 * Mirrors `durationTextToHours` in lib/biometrics.ts, which is the spec and has
 * the tests — change both.
 */
function durationTextToHours(text: string): number | null {
  const t = String(text ?? "").trim().toLowerCase();
  if (!t) return null;

  const clock = /^(\d{1,2}):([0-5]?\d)(?::([0-5]?\d))?$/.exec(t);
  if (clock) {
    const h = Number(clock[1]) + Number(clock[2]) / 60 + Number(clock[3] ?? 0) / 3600;
    return +h.toFixed(2);
  }

  const hours = /(\d+(?:\.\d+)?)\s*(?:h\b|hr|hrs|hour|hours)/.exec(t);
  const mins = /(\d+(?:\.\d+)?)\s*(?:m\b|min|mins|minute|minutes)/.exec(t);
  const secs = /(\d+(?:\.\d+)?)\s*(?:s\b|sec|secs|second|seconds)/.exec(t);
  if (!hours && !mins && !secs) return null;

  const h = Number(hours?.[1] ?? 0) + Number(mins?.[1] ?? 0) / 60 + Number(secs?.[1] ?? 0) / 3600;
  return Number.isFinite(h) && h > 0 ? +h.toFixed(2) : null;
}

/**
 * A sleep figure in hours, whatever unit it arrived in. Hours, minutes and
 * seconds all turn up — the setup guide sends a sleep sample's Duration, which
 * is seconds — and the ranges cannot overlap, which is what makes reading the
 * magnitude safe. Mirrors `sleepToHours` in lib/biometrics.ts; change both.
 * 27000 seconds read as minutes is 450 hours of sleep, carried for a month.
 */
function sleepToHours(n: number): number {
  if (n <= 24) return +n.toFixed(2);
  if (n <= 1440) return +(n / 60).toFixed(2);
  return +(n / 3600).toFixed(2);
}

function toISODate(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });

/**
 * WHY A GET WITH QUERY PARAMETERS IS ACCEPTED, AND WHY IT IS THE MAIN PATH NOW.
 *
 * The setup guide for this used to be five steps, and step four was: add Get
 * Contents of URL, tap Show More, change the method to POST, add an
 * Authorization header, switch the request body to JSON, then add three JSON
 * fields and map each one to a different Health result. On a phone. With one
 * hand. Most people did not finish it, and a setup nobody completes is a
 * feature nobody has.
 *
 * Every one of those sub-steps exists to satisfy the transport, not the
 * athlete. A GET removes all of them: the whole shortcut becomes one URL with
 * the values dropped into it, which is the one thing Shortcuts makes genuinely
 * easy — you type text and tap a variable.
 *
 * THE COST, STATED PLAINLY: the token travels in the URL, so it can land in a
 * browser history or a request log in a way an Authorization header mostly does
 * not. It is a write-only credential scoped to one athlete's biometrics — it
 * cannot read anything, and the UI tells people to treat the link like a
 * password. The POST-with-header path still works and is still documented for
 * anyone who would rather use it. That trade buys a setup people actually
 * finish, and data that arrives beats data that is protected slightly better
 * and never sent.
 *
 * Link previewers are the one real hazard of a GET that writes, and this one is
 * safe from them by construction: the upsert is idempotent per (user, date), so
 * a preview bot fetching the URL writes exactly the values that were already
 * going to be written. A bare link with no metrics on it writes nothing at all.
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      },
    });
  }
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "method not allowed" }, 405);
  }

  const url = new URL(req.url);

  /**
   * Authenticated by the athlete's ingest token, not a user JWT.
   *
   * The token identifies the athlete. A token matching nobody is a 401 rather
   * than a silent no-op, so a mistyped Shortcut fails visibly on the first run
   * instead of appearing to work for a month.
   */
  const token = (
    req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ??
    url.searchParams.get("t") ??
    url.searchParams.get("token") ??
    ""
  ).trim();
  // Format-checked before querying: a malformed value can match nothing, and
  // PostgREST errors on a non-uuid comparison rather than returning empty.
  if (!UUID.test(token)) return json({ error: "unauthorized" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: profile } = await admin
    .from("profiles").select("id, timezone").eq("ingest_token", token).maybeSingle();
  if (!profile) return json({ error: "unauthorized" }, 401);

  /**
   * "Today" is the ATHLETE's today, not the server's.
   *
   * This function runs in UTC on Supabase's infrastructure. A Shortcut firing
   * at 7am in Sydney is reporting that morning — and 7am in Sydney is still
   * yesterday in UTC, so defaulting to the server's date files every morning's
   * sleep against the night before. That is the same bug lib/day.ts fixes in
   * the app, and it bites hardest exactly here.
   *
   * The Shortcut can send an explicit `date` and should; this is the fallback
   * for the ones that don't. `profiles.timezone` is used when we know it.
   */
  const tz = (profile as { timezone?: string }).timezone;
  const todayLocalDate = localDateIn(tz);

  /**
   * Query parameters go through the SAME parser as a JSON body.
   *
   * `?sleep=7.5&hrv=55&rhr=48` becomes `{sleep: "7.5", hrv: "55", rhr: "48"}`
   * and everything below is unchanged — including the loose key matching, the
   * minutes-vs-hours heuristic and the "never overwrite a manual entry" rule.
   * Two transports, one set of rules, so a GET and a POST can never disagree
   * about what a payload meant.
   */
  const query: Record<string, string> = {};
  for (const [k, v] of url.searchParams) {
    if (k === "t" || k === "token") continue; // the credential, not a metric
    query[k] = v;
  }
  const body = req.method === "POST" ? await req.json().catch(() => null) : null;
  const payload = body ?? (Object.keys(query).length ? query : null);

  const rows = parseIngestPayload(payload, todayLocalDate);
  if (!rows.length) {
    /**
     * A bare link with no numbers on it is somebody CHECKING the setup, not a
     * failed sync — it is what happens when they tap their own link in Safari
     * to see whether it works. Telling them the token is good and nothing was
     * sent is the answer to the question they were asking.
     */
    const bare = req.method === "GET" && Object.keys(query).length === 0;
    return json({
      ok: bare,
      error: bare ? undefined : "nothing usable in that payload — send sleep, hrv and/or rhr",
      message: bare
        ? "Your link works and it found your account. Nothing was sent with it — add your numbers and it will save them."
        : undefined,
      hint: "Keys are matched loosely: 'Resting HR', restingHR and resting_hr all work.",
    }, bare ? 200 : 400);
  }

  /**
   * Never overwrite a hand-typed value.
   *
   * Someone who corrects a bad sleep reading should not have the correction
   * replaced by the next sync of the same day. The watch is the default, the
   * human is the override.
   */
  const dates = rows.map((r) => r.metric_date);
  const { data: manualRows } = await admin
    .from("biometrics").select("metric_date")
    .eq("user_id", profile.id).eq("source", "manual").in("metric_date", dates);
  const manual = new Set((manualRows ?? []).map((r: { metric_date: string }) => r.metric_date));

  const writable = rows.filter((r) => !manual.has(r.metric_date));
  if (!writable.length) {
    // Not an error: they typed it in themselves and we respected that.
    return json({ ok: true, days: 0, skipped: rows.length, reason: "manual entries kept" });
  }

  const { error } = await admin
    .from("biometrics")
    .upsert(writable.map((r) => ({ ...r, user_id: profile.id })), { onConflict: "user_id,metric_date" });

  if (error) return json({ error: error.message }, 500);

  /**
   * A sentence, not just a count.
   *
   * Testing the setup means tapping the link and reading what comes back, and
   * `{"ok":true,"days":1}` does not tell somebody whether the number that
   * arrived is the one they meant to send. Echoing the values back is how they
   * catch a sleep figure that came through as 450 because the field was in
   * minutes, on the first run rather than in a month.
   */
  const first = writable[0];
  const said = [
    first.sleep_hours != null ? `${first.sleep_hours}h sleep` : null,
    first.hrv_ms != null ? `HRV ${first.hrv_ms}ms` : null,
    first.resting_hr != null ? `resting HR ${first.resting_hr}` : null,
  ].filter(Boolean).join(", ");

  return json({
    ok: true,
    days: writable.length,
    dates: writable.map((r) => r.metric_date),
    message: `Saved ${said} for ${first.metric_date}.`,
  });
});

/** `yyyy-mm-dd` in an IANA zone, falling back to UTC when we don't know it. */
function localDateIn(timeZone: string | undefined | null): string {
  if (!timeZone) return new Date().toISOString().slice(0, 10);
  try {
    // en-CA gives ISO order (yyyy-mm-dd) directly, which avoids reassembling
    // parts by hand.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
  } catch {
    // An unknown zone string must not take the whole sync down.
    return new Date().toISOString().slice(0, 10);
  }
}
