// =============================================================================
// Supabase Edge Function: wearable-ingest (Deno)
//
// The morning sync. An Apple Shortcut (or Tasker, or curl) POSTs last night's
// sleep, HRV and resting heart rate here and it lands in public.biometrics.
//
// WHY THIS IS A SUPABASE FUNCTION AND NOT A CLOUDFLARE ROUTE.
//
// The Cloudflare Worker already has this code — `wearableIngest` in
// cloudflare/src/index.ts — and it has never been deployed. Worse, the Worker
// running in production (2026-08-04.2) is built from source that is NOT in this
// repository: it carries a three-provider, eight-model AI fallback chain that
// `cloudflare/src/index.ts` has never heard of. Pasting the repo's bundle would
// fix the sync and simultaneously delete that work.
//
// So the merge is blocked on someone who has the other source. The morning sync
// is not: it shares nothing with the AI routes but a Supabase key. Shipping it
// here means it can go live today, by whoever has the Supabase login, without
// touching the Worker or waiting for anyone.
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

    const hrv = numOrNull(pick(["hrv", "hrvms", "heartratevariability", "sdnn"]));
    const rhr = numOrNull(pick(["restinghr", "restingheartrate", "rhr", "lowestheartrate"]));
    let sleep = numOrNull(pick(["sleep", "sleephours", "hoursofsleep", "asleep"]));
    // Apple reports sleep in minutes as often as hours. Nobody sleeps 400
    // hours and nobody sleeps 7 minutes, so magnitude is a safer signal than a
    // key name we didn't choose.
    const sleepMinutes = numOrNull(pick(["sleepminutes", "sleepmins", "minutesasleep"]));
    if (sleep == null && sleepMinutes != null) sleep = +(sleepMinutes / 60).toFixed(2);
    else if (sleep != null && sleep > 24) sleep = +(sleep / 60).toFixed(2);

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
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  /**
   * Authenticated by the athlete's ingest token, not a user JWT.
   *
   * The token identifies the athlete. A token matching nobody is a 401 rather
   * than a silent no-op, so a mistyped Shortcut fails visibly on the first run
   * instead of appearing to work for a month.
   */
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
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

  const payload = await req.json().catch(() => null);
  const rows = parseIngestPayload(payload, todayLocalDate);
  if (!rows.length) {
    return json({
      error: "nothing usable in that payload — send sleepHours, hrv and/or restingHR",
      hint: "Keys are matched loosely: 'Resting HR', restingHR and resting_hr all work.",
    }, 400);
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
  return json({ ok: true, days: writable.length, dates: writable.map((r) => r.metric_date) });
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
