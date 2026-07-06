// =============================================================================
// Wearable biometrics — HRV / resting HR / sleep from a watch. Pure helpers:
// rolling baselines, a readiness adjustment vs your own norms, and a flexible
// CSV parser for Garmin/Whoop/Apple-Health exports. Tested; runs on Pages.
// =============================================================================

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
