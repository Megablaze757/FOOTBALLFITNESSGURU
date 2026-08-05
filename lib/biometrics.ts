// =============================================================================
// Wearable biometrics — HRV / resting HR / sleep from a watch. Pure helpers:
// rolling baselines, a readiness adjustment vs your own norms, and a flexible
// CSV parser for Garmin/Whoop/Apple-Health exports. Tested; runs on Pages.
// =============================================================================

import { todayLocal } from "./day";

export interface Biometric {
  metric_date: string;         // YYYY-MM-DD
  hrv_ms: number | null;
  resting_hr: number | null;
  sleep_hours: number | null;
  source?: string;
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

/** Rolling average of a metric over history, optionally excluding one date. */
function baseline(history: Biometric[], field: "hrv_ms" | "resting_hr", excludeDate?: string): number | null {
  const vals = history
    .filter((b) => b.metric_date !== excludeDate)
    .map((b) => b[field])
    .filter((v): v is number => v != null);
  return mean(vals.slice(-28));
}

export interface BiometricSignal {
  hrv: number | null;
  hrvBaseline: number | null;
  hrvDeviationPct: number | null; // vs personal baseline
  restingHr: number | null;
  restingHrBaseline: number | null;
  sleepHours: number | null;
  adjustment: number;             // -15..+5 applied to readiness
  note: string | null;
}

/**
 * Turn today's biometrics (vs the athlete's own baseline) into a readiness
 * adjustment and a plain-English note. Suppressed HRV / poor sleep / elevated
 * resting HR all suggest easing off.
 */
export function biometricSignal(today: Biometric | null, history: Biometric[]): BiometricSignal {
  const hrvBase = baseline(history, "hrv_ms", today?.metric_date);
  const rhrBase = baseline(history, "resting_hr", today?.metric_date);
  const hrv = today?.hrv_ms ?? null;
  const rhr = today?.resting_hr ?? null;
  const sleep = today?.sleep_hours ?? null;

  const hrvDev = hrv != null && hrvBase ? Math.round(((hrv - hrvBase) / hrvBase) * 100) : null;

  let adj = 0;
  const notes: string[] = [];
  if (hrvDev != null) {
    if (hrvDev <= -12) { adj -= 10; notes.push(`HRV is ${Math.abs(hrvDev)}% below your norm — your body is under strain`); }
    else if (hrvDev >= 10) { adj += 3; notes.push(`HRV is ${hrvDev}% above your norm — you're well recovered`); }
  }
  if (sleep != null && sleep < 6) { adj -= 5; notes.push(`only ${sleep}h sleep`); }
  else if (sleep != null && sleep >= 8) { adj += 2; }
  if (rhr != null && rhrBase && rhr - rhrBase >= 5) { adj -= 5; notes.push(`resting HR up ${Math.round(rhr - rhrBase)}bpm`); }

  adj = Math.max(-15, Math.min(5, adj));
  const note = notes.length ? notes.join("; ") + "." : null;
  return { hrv, hrvBaseline: hrvBase, hrvDeviationPct: hrvDev, restingHr: rhr, restingHrBaseline: rhrBase, sleepHours: sleep, adjustment: adj, note };
}

// --- CSV import -------------------------------------------------------------

const DATE_KEYS = ["date", "day", "cycle start", "cycle_start", "start"];
const HRV_KEYS = ["hrv", "rmssd", "heart rate variability", "hrv (ms)", "hrv_ms"];
const RHR_KEYS = ["resting hr", "resting heart rate", "rhr", "restingheartrate", "resting_hr"];
const SLEEP_KEYS = ["sleep", "sleep hours", "asleep", "sleep duration", "hours of sleep", "sleep_hours"];

function findCol(header: string[], keys: string[]): number {
  return header.findIndex((h) => keys.some((k) => h === k || h.includes(k)));
}

function toISODate(s: string): string | null {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const d = new Date(t);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function num(s: string | undefined): number | null {
  if (s == null) return null;
  const v = parseFloat(s.replace(/[^0-9.\-]/g, ""));
  return isNaN(v) ? null : v;
}

/** Parse an exported CSV (Garmin/Whoop/Apple/generic) into daily biometrics. */
export function parseBiometricCsv(text: string): Biometric[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
  const di = findCol(header, DATE_KEYS);
  const hi = findCol(header, HRV_KEYS);
  const ri = findCol(header, RHR_KEYS);
  const si = findCol(header, SLEEP_KEYS);
  if (di < 0) return [];

  const byDate = new Map<string, Biometric>();
  for (const line of lines.slice(1)) {
    const cells = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const date = toISODate(cells[di] ?? "");
    if (!date) continue;
    const b: Biometric = {
      metric_date: date,
      hrv_ms: hi >= 0 ? num(cells[hi]) : null,
      resting_hr: ri >= 0 ? Math.round(num(cells[ri]) ?? NaN) || null : null,
      sleep_hours: si >= 0 ? num(cells[si]) : null,
      source: "import",
    };
    if (b.hrv_ms == null && b.resting_hr == null && b.sleep_hours == null) continue;
    byDate.set(date, b); // last row for a date wins
  }
  return [...byDate.values()].sort((a, b) => a.metric_date.localeCompare(b.metric_date));
}

// =============================================================================
// Connected wearables.
//
// The CSV path above is user-initiated, and the honest thing to say about a
// daily habit that needs a manual export is that it happens once. These are the
// two shapes that can arrive on their own.
//
// Parsing lives here rather than in the Worker for the same reason the
// commission maths does: this is the code that decides what someone's readiness
// is built from, so it should be the code the unit tests cover. The Worker
// imports it and esbuild inlines it.
// =============================================================================

/** Oura's documented v2 sleep record — only the fields we read. */
export interface OuraSleepRecord {
  day?: string;
  average_hrv?: number | null;
  lowest_heart_rate?: number | null;
  average_heart_rate?: number | null;
  total_sleep_duration?: number | null; // seconds
  type?: string;
}

/**
 * Oura `/v2/usercollection/sleep` → daily biometrics.
 *
 * Two things this has to get right:
 *
 *   NAPS. Oura returns one record per sleep PERIOD, not per day, so an
 *   afternoon nap arrives as a second record for the same date. Taking the last
 *   one would report a 40-minute nap as the night's sleep and read its HRV as
 *   the day's baseline. The longest period for each date wins.
 *
 *   RESTING HEART RATE. `lowest_heart_rate` during sleep is what Oura shows as
 *   resting HR and what the rest of this module means by it. `average_heart_rate`
 *   over a night is several beats higher, and mixing the two across days would
 *   show a rising trend that is really just a change of field.
 */
export function parseOuraSleep(records: OuraSleepRecord[] | null | undefined): Biometric[] {
  const byDate = new Map<string, { b: Biometric; seconds: number }>();

  for (const r of records ?? []) {
    const date = toISODate(r?.day ?? "");
    if (!date) continue;
    // Oura marks naps and rest periods; only real sleep should set a baseline.
    if (r.type && !/long_sleep|sleep/i.test(r.type)) continue;

    const seconds = Number(r.total_sleep_duration) || 0;
    const existing = byDate.get(date);
    if (existing && existing.seconds >= seconds) continue;

    const hrv = numOrNull(r.average_hrv);
    const rhr = numOrNull(r.lowest_heart_rate ?? r.average_heart_rate);
    const b: Biometric = {
      metric_date: date,
      hrv_ms: hrv,
      resting_hr: rhr == null ? null : Math.round(rhr),
      sleep_hours: seconds > 0 ? +(seconds / 3600).toFixed(2) : null,
      source: "oura",
    };
    if (b.hrv_ms == null && b.resting_hr == null && b.sleep_hours == null) continue;
    byDate.set(date, { b, seconds });
  }

  return [...byDate.values()]
    .map((v) => v.b)
    .sort((a, b) => a.metric_date.localeCompare(b.metric_date));
}

/**
 * A pushed payload — an Apple Shortcut, a Tasker job, a script.
 *
 * Deliberately forgiving about key names and shape. The thing on the other end
 * is a Shortcut someone assembled by dragging boxes around, and a strict schema
 * would fail on `restingHR` vs `resting_hr` with no way for them to debug it.
 * Accepts one object or an array, and ignores anything it doesn't recognise
 * rather than rejecting the batch.
 *
 * Returns [] when nothing usable was found; the caller answers 400 so the
 * Shortcut shows a failure rather than reporting success on an empty push.
 */
export function parseIngestPayload(body: unknown): Biometric[] {
  const rows = Array.isArray(body) ? body : [body];
  const out = new Map<string, Biometric>();

  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const pick = (keys: string[]): unknown => {
      for (const k of Object.keys(r)) {
        const norm = k.toLowerCase().replace(/[^a-z]/g, "");
        if (keys.includes(norm)) return r[k];
      }
      return undefined;
    };

    // No date means today — a Shortcut running at 7am is reporting this
    // morning, and making people compute a date string is how it goes wrong.
    //
    // The LOCAL today, which matters most here of anywhere: a 7am Shortcut is
    // exactly the case UTC got wrong. East of UTC, 7am local is still yesterday
    // in UTC, so every morning's sleep was filed against the night before.
    const date = toISODate(String(pick(["date", "day", "metricdate", "startdate"]) ?? "")) ??
      todayLocal();

    const hrv = numOrNull(pick(["hrv", "hrvms", "heartratevariability", "sdnn"]));
    const rhr = numOrNull(pick(["restinghr", "restingheartrate", "rhr", "lowestheartrate"]));
    let sleep = numOrNull(pick(["sleep", "sleephours", "hoursofsleep", "asleep"]));
    // Apple reports sleep in minutes as often as hours. Nobody sleeps 400
    // hours, and nobody sleeps 7 minutes — the units are unambiguous from the
    // magnitude, which is safer than trusting a key name we didn't choose.
    const sleepMinutes = numOrNull(pick(["sleepminutes", "sleepmins", "minutesasleep"]));
    if (sleep == null && sleepMinutes != null) sleep = +(sleepMinutes / 60).toFixed(2);
    else if (sleep != null && sleep > 24) sleep = +(sleep / 60).toFixed(2);

    const b: Biometric = {
      metric_date: date,
      hrv_ms: hrv,
      resting_hr: rhr == null ? null : Math.round(rhr),
      sleep_hours: sleep,
      source: "apple_health",
    };
    if (b.hrv_ms == null && b.resting_hr == null && b.sleep_hours == null) continue;
    out.set(date, b); // a later row for the same date wins
  }

  return [...out.values()].sort((a, b) => a.metric_date.localeCompare(b.metric_date));
}

/** Number, or null for anything that isn't a usable one (including 0 and NaN). */
function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}
