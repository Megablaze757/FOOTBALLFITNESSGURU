// =============================================================================
// Supabase Edge Function: sync-oura (Deno)
//
// The nightly pull. For every athlete who has connected an Oura ring, fetch the
// last few days of sleep from Oura's API and write it into public.biometrics,
// so readiness is already right when they open the app in the morning.
//
// WHY THIS EXISTS WHEN THE WORKER ALREADY HAS IT.
//
// `syncWearables` in cloudflare/src/index.ts does exactly this and runs from
// the Worker's cron. That code has never been deployed: the Worker running in
// production is built from source that is NOT in this repository, and pasting
// this repo's bundle over it would delete work nobody has a copy of. The same
// blockage produced `wearable-ingest`, and the same argument applies here — the
// nightly pull shares nothing with the AI routes but a Supabase key, so it can
// ship today without waiting for that merge.
//
// If and when the Worker source is reconciled, delete ONE of the two. Running
// both is harmless — the upsert is idempotent and both write the same rows from
// the same API — but two schedules writing the same table is the kind of thing
// that is confusing at 2am.
//
// Deploy:
//   supabase functions deploy sync-oura
//   supabase secrets set CRON_SECRET=$(openssl rand -hex 32)
//
// Then schedule it — see supabase/migrations/0083_schedule_oura_sync.sql.
//
// NOT --no-verify-jwt, and that is the difference from wearable-ingest. Nothing
// here is called by a phone: the only caller is the scheduler, which can hold a
// secret. A public endpoint that reads every athlete's access token and writes
// their biometrics is not something to leave open, so it authenticates with
// CRON_SECRET and refuses without it.
// =============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

/** How many days to ask Oura for on each run. */
const LOOKBACK_DAYS = 7;

/**
 * Why seven and not one: a ring uploads when it next reaches a phone, so a
 * night spent on a charger arrives a day or two late. Asking only for yesterday
 * would permanently lose those nights. Seven costs one request and the upsert
 * makes re-writing a day we already have a no-op.
 */

interface BiometricRow {
  user_id: string;
  metric_date: string;
  hrv_ms: number | null;
  resting_hr: number | null;
  sleep_hours: number | null;
  source: string;
}

/** Oura's documented v2 sleep record — only the fields we read. */
interface OuraSleepRecord {
  day?: string;
  average_hrv?: number | null;
  lowest_heart_rate?: number | null;
  average_heart_rate?: number | null;
  total_sleep_duration?: number | null; // seconds
  type?: string;
}

/**
 * A DUPLICATE OF `parseOuraSleep` IN lib/biometrics.ts, and it has to be — Edge
 * Functions run in Deno with their own module graph and cannot import from the
 * Next.js app's lib/. Same reasoning, and same arrangement, as the duplicated
 * parser in wearable-ingest.
 *
 * `lib/biometrics.test.ts` is the specification. If you change how an Oura
 * record is read, change it in both places and run that suite. The behaviour
 * below is deliberately identical, including both of the things it has to get
 * right:
 *
 *   NAPS. Oura returns one record per sleep PERIOD, not per day, so an
 *   afternoon nap arrives as a second record for the same date. The longest
 *   period for each date wins — taking the last would report a 40-minute nap as
 *   the night's sleep and read its HRV as the day's baseline.
 *
 *   RESTING HEART RATE. `lowest_heart_rate` is what Oura shows as resting HR.
 *   `average_heart_rate` over a night is several beats higher, and mixing the
 *   two across days shows a rising trend that is really a change of field.
 */
function parseOuraSleep(records: OuraSleepRecord[] | null | undefined, userId: string): BiometricRow[] {
  const byDate = new Map<string, { b: BiometricRow; seconds: number }>();

  for (const r of records ?? []) {
    const date = toISODate(r?.day ?? "");
    if (!date) continue;
    if (r.type && !/long_sleep|sleep/i.test(r.type)) continue;

    const seconds = Number(r.total_sleep_duration) || 0;
    const existing = byDate.get(date);
    if (existing && existing.seconds >= seconds) continue;

    const hrv = numOrNull(r.average_hrv);
    const rhr = numOrNull(r.lowest_heart_rate ?? r.average_heart_rate);
    const b: BiometricRow = {
      user_id: userId,
      metric_date: date,
      hrv_ms: hrv,
      resting_hr: rhr == null ? null : Math.round(rhr),
      sleep_hours: seconds > 0 ? +(seconds / 3600).toFixed(2) : null,
      source: "oura",
    };
    if (b.hrv_ms == null && b.resting_hr == null && b.sleep_hours == null) continue;
    byDate.set(date, { b, seconds });
  }

  return [...byDate.values()].map((v) => v.b).sort((a, b) => a.metric_date.localeCompare(b.metric_date));
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function toISODate(s: string): string | null {
  const t = String(s ?? "").trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  const secret = Deno.env.get("CRON_SECRET");
  /**
   * No secret configured means REFUSE, not "let everyone in". A misconfigured
   * deploy that silently opens an endpoint reading every athlete's ring token
   * is the worst possible way to fail, and it is the default if you write
   * `if (secret && header !== secret)`.
   */
  if (!secret) return json({ error: "CRON_SECRET is not set" }, 500);
  if (req.headers.get("x-cron-secret") !== secret) return json({ error: "forbidden" }, 403);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: conns, error: connErr } = await supabase
    .from("wearable_connections")
    .select("user_id, access_token")
    .eq("provider", "oura")
    .not("access_token", "is", null);

  if (connErr) return json({ error: connErr.message }, 500);

  const start = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const end = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  let synced = 0;
  let failed = 0;

  for (const c of (conns ?? []) as { user_id: string; access_token: string }[]) {
    let error: string | null = null;
    try {
      const res = await fetch(
        `https://api.ouraring.com/v2/usercollection/sleep?start_date=${start}&end_date=${end}`,
        { headers: { Authorization: `Bearer ${c.access_token}` } },
      );
      if (!res.ok) {
        /**
         * 401 is the one worth naming. A personal access token is revoked from
         * Oura's own site, and the athlete has no way to know it broke the app
         * — "sync failed: 401" tells them nothing, "your Oura token was
         * revoked" tells them exactly what to do.
         */
        throw new Error(
          res.status === 401
            ? "Your Oura token is no longer valid — create a new one and reconnect."
            : `Oura returned ${res.status}`,
        );
      }
      const body = (await res.json()) as { data?: OuraSleepRecord[] };
      const rows = parseOuraSleep(body?.data, c.user_id);

      if (rows.length > 0) {
        const { error: upErr } = await supabase
          .from("biometrics")
          .upsert(rows, { onConflict: "user_id,metric_date" });
        if (upErr) throw new Error(upErr.message);
      }
      synced++;
    } catch (e) {
      error = (e instanceof Error ? e.message : String(e)).slice(0, 200);
      failed++;
    }

    /**
     * The outcome is WRITTEN TO THE ROW, success or failure, every run.
     *
     * last_sync_at advancing is what the app uses to tell a working connection
     * from one that quietly stopped — see syncHealth in lib/biometrics.ts. A
     * run that writes nothing is indistinguishable from a cron that never
     * fired, so this is not optional bookkeeping.
     */
    await supabase
      .from("wearable_connections")
      .update({ last_sync_at: new Date().toISOString(), last_error: error })
      .eq("user_id", c.user_id)
      .eq("provider", "oura");
  }

  return json({ connections: (conns ?? []).length, synced, failed });
});
