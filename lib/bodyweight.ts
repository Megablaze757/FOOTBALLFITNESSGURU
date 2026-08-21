// =============================================================================
// What does this athlete weigh?
//
// WHY A MODULE FOR ONE NUMBER.
//
// Because the app had three answers and they disagreed. Bodyweight was being
// written to two tables and read from a third:
//
//   daily_check_ins.weight_kg   written by the check-in    read by nutrition,
//                                                          coach, report, home
//   body_logs.weight_kg         written by /body           read by the /body
//                                                          chart, nothing else
//   profiles.weight_kg          DOES NOT EXIST             read by Progress
//                                                          ranks and Rewards
//
// The third row is the bug, and it is worse than it first looked. profiles has
// never had a weight_kg column in any migration — it is on daily_check_ins and
// body_logs only. PostgREST rejects a request that names a column it does not
// know, so those two screens were not reading a null: their whole profile query
// was failing, which took the athlete's name, sex, sport and position with it. Strength ranks are multiples of
// bodyweight, so the Progress tab has spent its whole life showing "add your
// bodyweight in your profile", pointing at a field that does not exist, to
// people who had already entered their weight twice somewhere else. The Rewards
// page had it worse: it passes `weight_kg ?? 0`, and every lift divided by a
// zero bodyweight ranks as nothing, so no strength badge could ever be earned.
//
// The fix is not to point Progress at a different table. That just moves the
// disagreement — weigh in on /body and the nutrition page still would not see
// it. One resolver, every source, freshest wins, and every reader calls it.
// =============================================================================

/** Where a weight came from, in the athlete's own words rather than a table name. */
export type WeightSource = "check-in" | "weigh-in" | "profile";

export interface Bodyweight {
  kg: number;
  /** ISO local day, or null for the undated profile fallback. */
  date: string | null;
  source: WeightSource;
}

/** A dated row from either of the two tables that record a weight. */
export interface WeightRow {
  date: string;
  kg: number | null | undefined;
}

/**
 * The most recent weight this athlete has recorded anywhere.
 *
 * FRESHEST WINS, AND A TIE GOES TO THE WEIGH-IN. Same-day entries in both
 * places mean they stood on a scale for /body and also answered the check-in
 * slider from memory; the scale is the instrument, so it wins.
 *
 * THE PROFILE IS A FALLBACK, NOT A PEER. It carries no date, so it cannot be
 * compared against anything — it only answers when nothing dated exists. It is
 * kept at all because a value set by an admin or by an import should still work
 * rather than be silently ignored.
 *
 * Zero and negative are treated as absent. `weight_kg ?? 0` is exactly how the
 * Rewards page turned a missing weight into a real-looking one, and a 0kg
 * athlete ranks every lift as infinite bodyweight multiples — absent is not
 * zero, which is a mistake this codebase has made before.
 */
export function latestBodyweight(sources: {
  checkIns?: WeightRow[] | null;
  weighIns?: WeightRow[] | null;
  profileKg?: number | null;
}): Bodyweight | null {
  // Built from the same series the chart draws, so the headline number and the
  // last bar can never be two different weights.
  const series = weightSeries(sources);
  if (series.length > 0) return series[series.length - 1];

  if (isRealWeight(sources.profileKg)) {
    return { kg: sources.profileKg, date: null, source: "profile" };
  }
  return null;
}

/**
 * Every weight this athlete has recorded, oldest first, one per day.
 *
 * THE OTHER HALF OF THE SAME BUG. The readers were taught to look in both
 * tables; the chart on /body was not. It plots `body_logs` and nothing else, so
 * an athlete who answers the weight question in their daily check-in — the
 * quicker of the two, and the one the app asks them for — opens Body and sees a
 * trend that stops at whenever they last visited that page. Weeks of weights
 * the app is holding, and asking about every morning, are not on the graph:
 * "shows old data instead of the most recent", exactly.
 *
 * ONE POINT PER DAY, and a tie goes to the weigh-in for the same reason it does
 * above — the scale is the instrument, the check-in slider is memory. Two bars
 * for one Tuesday would also read as a two-kilo swing inside a day.
 */
export function weightSeries(sources: {
  checkIns?: WeightRow[] | null;
  weighIns?: WeightRow[] | null;
}): Bodyweight[] {
  const byDay = new Map<string, Bodyweight>();
  const offer = (row: WeightRow, source: WeightSource) => {
    if (!isRealWeight(row.kg) || !row.date) return;
    const held = byDay.get(row.date);
    if (held && rank(held.source) >= rank(source)) return;
    byDay.set(row.date, { kg: row.kg, date: row.date, source });
  };
  for (const r of sources.checkIns ?? []) offer(r, "check-in");
  for (const r of sources.weighIns ?? []) offer(r, "weigh-in");

  // ISO dates sort lexicographically, which is the whole reason this codebase
  // stores local days as strings — see lib/day.ts. Ascending, because a chart
  // reads left to right and the caller should not have to reverse it.
  return [...byDay.values()].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
}

/** Narrowing guard: a usable weight is a positive, finite number. */
function isRealWeight(kg: number | null | undefined): kg is number {
  return typeof kg === "number" && Number.isFinite(kg) && kg > 0;
}

/** Tie-break order within a single day. Higher wins. */
function rank(source: WeightSource): number {
  return source === "weigh-in" ? 2 : source === "check-in" ? 1 : 0;
}

/**
 * How old the number is, in days, or null if it has no date.
 *
 * Ranks do not hide behind this — a rank built on a three-month-old weight is
 * far better than no rank, and refusing to show one is how this feature became
 * invisible in the first place. It exists so the UI can SAY how old the number
 * is and offer to update it, which is a prompt rather than a wall.
 */
export function weightAgeDays(w: Bodyweight | null, today: string): number | null {
  if (!w?.date) return null;
  const then = Date.parse(`${w.date}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(then) || Number.isNaN(now)) return null;
  return Math.max(0, Math.round((now - then) / 86_400_000));
}

/** "from your weigh-in on 3 Aug" — so a rank can show its working. */
export function weightProvenance(w: Bodyweight | null, today: string): string | null {
  if (!w) return null;
  const age = weightAgeDays(w, today);
  const where = w.source === "weigh-in" ? "weigh-in" : w.source === "check-in" ? "check-in" : "profile";
  if (age == null) return `from your ${where}`;
  if (age === 0) return `from today's ${where}`;
  if (age === 1) return `from yesterday's ${where}`;
  if (age < 14) return `from your ${where} ${age} days ago`;
  if (age < 60) return `from your ${where} ${Math.round(age / 7)} weeks ago`;
  return `from your ${where} ${Math.round(age / 30)} months ago`;
}

/**
 * Weight is stale enough to be worth a nudge.
 *
 * Six weeks: long enough that a training block has changed the number, short
 * enough that the ranks built on it are still about the person standing there.
 */
export const WEIGHT_STALE_DAYS = 42;

export function weightIsStale(w: Bodyweight | null, today: string): boolean {
  const age = weightAgeDays(w, today);
  return age != null && age >= WEIGHT_STALE_DAYS;
}
