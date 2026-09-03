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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A BASELINE MADE OF TWO READINGS IS NOT A BASELINE.
 *
 * This averaged whatever it had. On the second day of wearing a watch your
 * "norm" was yesterday, and a 12% night-to-night HRV swing — which is ordinary,
 * healthy variation — read as "your body is under strain" and took 10 points
 * off readiness. The first week with a new watch is exactly when somebody is
 * deciding whether to trust any of this.
 *
 * Seven readings before a deviation means anything. Below that the baseline is
 * null, which suppresses the HRV and resting-HR adjustments entirely and shows
 * no baseline in the trends card. Sleep hours are unaffected because they are
 * an absolute threshold, not a deviation — so a short night still registers
 * from day one and the feature is not dead while the history builds.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const MIN_BASELINE_DAYS = 7;

/** Rolling average of a metric over history, optionally excluding one date. */
function baseline(history: Biometric[], field: "hrv_ms" | "resting_hr", excludeDate?: string): number | null {
  const vals = history
    .filter((b) => b.metric_date !== excludeDate)
    .map((b) => b[field])
    // Same rule as the reading itself: a zero in the history drags the norm
    // down and makes every honest morning after it look suppressed.
    .filter((v): v is number => v != null && v > 0);
  const window = vals.slice(-28);
  return window.length >= MIN_BASELINE_DAYS ? mean(window) : null;
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
  /**
   * Non-positive is absent, HERE TOO — not only at the door.
   *
   * numOrNull now refuses to store a zero, but rows written before it did are
   * in the table, and this function is what turns a row into a readiness
   * penalty. A stored hrv_ms of 0 reads as 100% below any baseline, which is
   * the maximum penalty this scale can apply, for a morning the sensor simply
   * missed. The parser stops new ones arriving; this stops the existing ones
   * counting.
   */
  const positive = (v: number | null | undefined) => (v != null && v > 0 ? v : null);
  const hrv = positive(today?.hrv_ms);
  const rhr = positive(today?.resting_hr);
  const sleep = positive(today?.sleep_hours);

  const hrvDev = hrv != null && hrvBase ? Math.round(((hrv - hrvBase) / hrvBase) * 100) : null;

  let adj = 0;
  const notes: string[] = [];
  if (hrvDev != null) {
    if (hrvDev <= -12) { adj -= 10; notes.push(`HRV ${Math.abs(hrvDev)}% below your norm`); }
    else if (hrvDev >= 10) { adj += 3; notes.push(`HRV ${hrvDev}% above your norm`); }
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
 * A sleep figure in hours, whatever unit it arrived in.
 *
 * WHY THE MAGNITUDE DECIDES AND NOT THE KEY NAME. The thing on the other end is
 * a Shortcut somebody assembled by dragging boxes around, and the field it hands
 * over depends on which Health detail they picked. All three units turn up:
 * hours from a hand-typed value, minutes from `Minutes Asleep`, and SECONDS from
 * a sleep sample's Duration — which is what the setup guide now tells people to
 * use, because it is one tap instead of a conversion.
 *
 * The ranges cannot overlap, which is what makes this safe rather than clever:
 * nobody sleeps more than 24 hours, more than 1440 minutes, or fewer than 1440
 * seconds and calls it a night. Getting it wrong is not cosmetic — 27000
 * seconds read as minutes is 450 hours of sleep, and readiness would carry that
 * for a month.
 */
/**
 * A DURATION AS SHORTCUTS ACTUALLY WRITES IT.
 *
 * The setup guide has people insert a Health sample's Duration into the sync
 * URL. iOS does not render that as a bare number — it formats it, as
 * "7 hr 32 min", and that is how the reported failure begins: a URL containing
 * spaces, which Shortcuts refuses to accept at all.
 *
 * The quieter half is what happened when such a value DID arrive. The numeric
 * parser strips every non-digit, so "7 hr 32 min" became 732, and 732 is inside
 * the range read as minutes — twelve and a quarter hours of sleep, recorded
 * without complaint and carried into readiness, ACWR and the coach's advice.
 * Wrong data that looks plausible is worse than none.
 *
 * Handles "7 hr 32 min", "7h 32m", "7 hours 32 minutes" and "7:32", returning
 * hours. Null when there is no duration in the text, so the caller can fall
 * back to the plain-number path rather than being handed a guess.
 */
export function durationTextToHours(text: string): number | null {
  const t = String(text ?? "").trim().toLowerCase();
  if (!t) return null;

  // "7:32" or "7:32:15" — hours:minutes[:seconds].
  const clock = /^(\d{1,2}):([0-5]?\d)(?::([0-5]?\d))?$/.exec(t);
  if (clock) {
    const h = Number(clock[1]) + Number(clock[2]) / 60 + Number(clock[3] ?? 0) / 3600;
    return +h.toFixed(2);
  }

  // "7 hr 32 min", "7h32m", "7 hours 32 minutes", "45 min", "27000 sec".
  const hours = /(\d+(?:\.\d+)?)\s*(?:h\b|hr|hrs|hour|hours)/.exec(t);
  const mins = /(\d+(?:\.\d+)?)\s*(?:m\b|min|mins|minute|minutes)/.exec(t);
  const secs = /(\d+(?:\.\d+)?)\s*(?:s\b|sec|secs|second|seconds)/.exec(t);
  if (!hours && !mins && !secs) return null;

  const h = Number(hours?.[1] ?? 0) + Number(mins?.[1] ?? 0) / 60 + Number(secs?.[1] ?? 0) / 3600;
  return Number.isFinite(h) && h > 0 ? +h.toFixed(2) : null;
}

export function sleepToHours(n: number): number {
  if (n <= 24) return +n.toFixed(2);          // already hours
  if (n <= 1440) return +(n / 60).toFixed(2); // minutes
  return +(n / 3600).toFixed(2);              // seconds
}

// --- is the ring still actually syncing? -------------------------------------

/**
 * A nightly sync that quietly stops is the worst state a connection can be in.
 *
 * The row records `last_error` when a sync FAILS, and the UI shows it. But the
 * common failure is not a failure — it is a sync that never runs at all: the
 * cron is not deployed, the trigger was removed, the Worker was rebuilt from
 * different source. Nothing errors, so `last_error` stays null and the card
 * goes on saying "Syncing" over a date that never moves.
 *
 * That matters more here than almost anywhere else in the app, because
 * readiness keeps reporting on the last night it received as though it were
 * last night. Stale data presented as current is worse than no data: no data
 * shows an empty state, stale data shows a confident wrong answer.
 *
 * Two nights, not one. Oura uploads when the ring next reaches a phone, so a
 * night charging on a bedside table is a normal missed day rather than a fault.
 */
export const SYNC_STALE_HOURS = 48;

export type SyncHealth = "never" | "fresh" | "stale";

export function syncHealth(lastSyncAt: string | null | undefined, now: Date = new Date()): SyncHealth {
  if (!lastSyncAt) return "never";
  const then = Date.parse(lastSyncAt);
  if (Number.isNaN(then)) return "never";
  const hours = (now.getTime() - then) / 3_600_000;
  // A future timestamp is a clock difference, not a sync from tomorrow.
  return hours <= SYNC_STALE_HOURS ? "fresh" : "stale";
}

/** Whole days since the last sync, for saying so plainly. */
export function daysSinceSync(lastSyncAt: string | null | undefined, now: Date = new Date()): number | null {
  if (!lastSyncAt) return null;
  const then = Date.parse(lastSyncAt);
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}
