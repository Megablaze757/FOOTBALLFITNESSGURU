/**
 * Which way the weight is going, and by how much.
 *
 * THE PAGE HAD THE DATA AND ANSWERED THE WRONG QUESTION. /body drew a bar chart
 * and printed today's number. Neither of those is what somebody opens the page
 * for — "am I actually losing weight?" is a comparison, and eyeballing the
 * heights of forty bars is not how anybody answers it. The number that matters
 * is the difference between now and a fortnight ago, and the app was holding it
 * and never subtracting.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TWO THINGS THIS REFUSES TO DO, both of which are the easy version.
 *
 * IT WILL NOT REPORT A WINDOW IT CANNOT SEE. If the first weigh-in was nine
 * days ago there is no thirty-day change, and calling the nine-day change a
 * thirty-day one is a lie that gets acted on — somebody cutting reads "−2.1 kg
 * this month" and eats accordingly. A window with nothing old enough behind it
 * returns null, and the UI says nothing rather than something wrong.
 *
 * IT WILL NOT CALL NOISE A DIRECTION. Bodyweight moves a kilo either way on
 * water, salt and what time you stood on the scale. A 0.2 kg "gain" reported
 * with an up-arrow is the app inventing a trend out of hydration, and an
 * athlete who is told they gained every other Tuesday stops believing any of
 * it. Under the noise floor is "steady", which is a real answer.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { Bodyweight } from "@/lib/bodyweight";

/**
 * How much movement counts as movement.
 *
 * A kilo of day-to-day swing is normal, but this compares two DATED points
 * rather than two readings on one morning, so the floor can sit lower than the
 * daily swing without picking up hydration. 0.3 kg is roughly a good week of
 * a careful cut, which is the smallest change worth telling somebody about.
 */
export const NOISE_KG = 0.3;

export type Direction = "up" | "down" | "steady";

export interface TrendWindow {
  /** Days the window asked for: 7, 30, 90. */
  days: number;
  /** kg now minus kg then. Negative is weight lost. */
  change: number;
  direction: Direction;
  /** The entry the comparison was made against, so the UI can date it. */
  from: Bodyweight;
  /** Actual days between the two points, which is rarely exactly `days`. */
  spanDays: number;
  /** Change scaled to a week, for the windows long enough to make that mean anything. */
  perWeek: number | null;
}

export interface WeightTrend {
  latest: Bodyweight | null;
  /** Only the windows there is enough history to answer. */
  windows: TrendWindow[];
  /** Every dated entry, newest first — what the edit list renders. */
  entries: Bodyweight[];
}

/** The windows offered, shortest first. */
export const TREND_WINDOWS = [7, 30, 90] as const;

function dayDiff(a: string, b: string): number {
  const then = Date.parse(`${b}T00:00:00Z`);
  const now = Date.parse(`${a}T00:00:00Z`);
  if (Number.isNaN(then) || Number.isNaN(now)) return 0;
  return Math.round((now - then) / 86_400_000);
}

export function direction(change: number): Direction {
  if (change <= -NOISE_KG) return "down";
  if (change >= NOISE_KG) return "up";
  return "steady";
}

/**
 * Compare the latest weight against what it was N days ago.
 *
 * "N days ago" means the most recent entry AT OR BEFORE that date — not the
 * closest one in either direction. Reaching forwards to a point inside the
 * window shortens the comparison silently: asking for thirty days and being
 * answered with twelve, labelled thirty. Only the entries genuinely old enough
 * can answer.
 *
 * @param series ascending by date, as weightSeries returns it
 */
export function weightTrend(series: Bodyweight[], today: string): WeightTrend {
  const dated = series.filter((w): w is Bodyweight & { date: string } => !!w.date);
  const latest = dated.length ? dated[dated.length - 1] : null;

  const windows: TrendWindow[] = [];
  if (latest) {
    for (const days of TREND_WINDOWS) {
      // Everything at or before the cut-off. The LAST of those is the closest
      // point that is still old enough.
      const cutoffAge = days;
      const candidates = dated.filter((w) => dayDiff(today, w.date) >= cutoffAge);
      const from = candidates.length ? candidates[candidates.length - 1] : null;
      if (!from || from.date === latest.date) continue;

      const change = round1(latest.kg - from.kg);
      const spanDays = dayDiff(latest.date, from.date);
      windows.push({
        days,
        change,
        direction: direction(change),
        from,
        spanDays,
        // A weekly rate off a span shorter than a fortnight multiplies noise
        // rather than describing a trend.
        perWeek: spanDays >= 14 ? round1((change / spanDays) * 7) : null,
      });
    }
  }

  return {
    latest,
    windows,
    // Newest first: the entry somebody wants to fix is almost always the last
    // one they typed.
    entries: [...dated].reverse(),
  };
}

function round1(n: number): number {
  // Weights are recorded to 0.1 kg, so a difference of two of them has no
  // business carrying fifteen decimal places of float error.
  return Math.round(n * 10) / 10;
}

/** "−1.4 kg" / "+0.8 kg" / "steady". The sign is the whole message. */
export function changeLabel(change: number): string {
  if (direction(change) === "steady") return "steady";
  // A real minus sign, not a hyphen: it sits at digit height and reads as a
  // sign rather than as a dash between two things.
  const sign = change < 0 ? "−" : "+";
  return `${sign}${Math.abs(change).toFixed(1)} kg`;
}

/** "over 30 days" / "over 26 days" — says what was actually measured. */
export function spanLabel(w: TrendWindow): string {
  return `over ${w.spanDays} day${w.spanDays === 1 ? "" : "s"}`;
}

/**
 * Whether a change is good news, which depends entirely on what they are doing.
 *
 * DELIBERATELY NOT DECIDED HERE. Losing two kilos is a win on a cut and a
 * problem on a bulk, and a component that colours every drop green tells a
 * teenager trying to add size that they are doing well while they lose it. The
 * caller knows the goal; this returns the direction and stays out of it.
 */
export type DietGoal = "cut" | "maintain" | "build";

export function isTowardGoal(change: number, goal: DietGoal | null): boolean | null {
  const dir = direction(change);
  if (!goal || dir === "steady") return null;
  // "maintain" wants no movement at all, so any direction is away from it.
  if (goal === "maintain") return false;
  return goal === "cut" ? dir === "down" : dir === "up";
}
