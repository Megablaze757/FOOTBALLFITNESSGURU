// =============================================================================
// WHO CAME BACK, AND WHEN THEY STOPPED.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE APP COULD MEASURE EVERY STEP UP TO THE FRONT DOOR AND NOTHING AFTER IT.
//
// lib/funnel.ts records signup, onboarded, first_check_in, paywall_hit,
// checkout_complete — twelve events, every one of them about ACQUISITION. The
// last thing it knows about an athlete is the moment they first checked in.
// Whether anybody was still there a fortnight later has never been a number
// this project could produce.
//
// That is the wrong half to have instrumented. The funnel answers "why don't
// more people arrive", and the answer to "why isn't this growing" is far more
// often that the people who already arrived left.
//
// WHAT COUNTS AS BEING HERE is already settled and this does not get a second
// opinion: migration 0098 replaced "last sign-in" with the later of a check-in
// and a training log, on the grounds that a session refresh counts as a
// sign-in and so does opening the app and closing it again. An athlete who has
// recorded nothing in six weeks but whose phone keeps the session alive reads
// as active. The same definition is used here, for the same reason, and taking
// a different one would give two dashboards that disagree about who is active.
// ═══════════════════════════════════════════════════════════════════════════
//
// Pure. The SQL that gathers the rows is in the migration; every judgement
// about what the rows MEAN is here, where it can be tested.
// =============================================================================

import { daysBetween } from "./days";
import { describeRate, wilson, type Interval } from "./proportions";

export interface Account {
  id: string;
  /** The day the account was created, `YYYY-MM-DD`. */
  joined: string;
  /**
   * Every day this athlete put something in — a check-in or a training log,
   * the definition migration 0098 already settled on. Order does not matter
   * and duplicates are harmless.
   */
  activeDays: readonly string[];
}

export interface Window {
  label: string;
  /** Days since joining, inclusive. Day 0 is the day they signed up. */
  from: number;
  to: number;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE WINDOWS, AND WHY DAY 0 IS NOT ONE OF THEM.
 *
 * Activity on the day somebody signs up is signing up. Counting it would give
 * a retention curve that starts at nearly 100% and falls off a cliff, and the
 * cliff would be the definition rather than the product.
 *
 * WIDENING WITH AGE, deliberately. A fortnight-old account either used it this
 * week or did not; a six-month-old account that trains twice a month is a
 * success and a narrow window would score it as churned. The windows are the
 * question "were they still here at all around then", which needs more room
 * the further out it is asked.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const WINDOWS: readonly Window[] = [
  { label: "the day after", from: 1, to: 1 },
  { label: "their first week", from: 2, to: 7 },
  { label: "week two", from: 8, to: 14 },
  { label: "weeks three and four", from: 15, to: 28 },
  { label: "month two", from: 29, to: 56 },
  { label: "month three", from: 57, to: 84 },
];

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. Negative if `to` is earlier. */
/**
 * Re-exported so every caller keeps working, and defined once.
 *
 * This was a local copy. lib/days.ts explains what five copies of eight
 * lines cost: three were signed, two silently clamped at zero, and one
 * took its arguments the other way round.
 */
export { daysBetween };

export interface WindowResult {
  window: Window;
  /**
   * Accounts old enough to have had the chance.
   *
   * THE DENOMINATOR IS THE WHOLE GAME. Counting every account would mix in
   * people who signed up yesterday as though they had failed to return in
   * month two, and every window would then read lower the faster the app grew
   * — a retention chart that falls when things go well.
   */
  eligible: number;
  /** Of those, how many put something in during the window. */
  returned: number;
  interval: Interval;
  /** The count, the rate and the range it could be. */
  reading: string;
}

/**
 * The retention curve, as of `asOf`.
 *
 * Accounts that joined in the future are dropped rather than trusted: a clock
 * disagreement somewhere upstream should not be able to produce a negative age
 * and quietly land in the day-one bucket.
 */
export function retentionCurve(
  accounts: readonly Account[],
  asOf: string,
  windows: readonly Window[] = WINDOWS,
): WindowResult[] {
  const usable = (accounts ?? []).filter((a) => a?.joined && daysBetween(a.joined, asOf) >= 0);

  return windows.map((window) => {
    let eligible = 0;
    let returned = 0;
    for (const account of usable) {
      // The whole window has to be in the past, or the account has not had the
      // chance to fail it yet.
      if (daysBetween(account.joined, asOf) < window.to) continue;
      eligible += 1;
      const came = (account.activeDays ?? []).some((day) => {
        const age = daysBetween(account.joined, day);
        return age >= window.from && age <= window.to;
      });
      if (came) returned += 1;
    }
    return {
      window,
      eligible,
      returned,
      interval: wilson(returned, eligible),
      reading: describeRate(returned, eligible),
    };
  });
}

/**
 * How long ago each account last put something in, as of `asOf`.
 *
 * Null for an account that never has — which is a different thing from a long
 * silence and is counted separately everywhere below. Somebody who signed up
 * and never returned is a failure of the first session; somebody who logged
 * for three months and stopped is a failure of the ninetieth. The two need
 * opposite fixes and averaging them together hides both.
 */
export function daysSinceActive(account: Account, asOf: string): number | null {
  let best: number | null = null;
  for (const day of account.activeDays ?? []) {
    const gap = daysBetween(day, asOf);
    if (gap < 0) continue;
    if (best === null || gap < best) best = gap;
  }
  return best;
}

/**
 * The longest run of consecutive days in a set.
 *
 * lib/milestones.ts already has currentStreak, and this is deliberately not
 * it: that answers "how many in a row right now", which is zero for everybody
 * this module is about. The longest run they ever put together is a fact that
 * survives them stopping, which is the only kind of fact a message to somebody
 * who has stopped can be built on.
 *
 * Duplicates and disorder are harmless — the days are sorted and de-duplicated
 * here, because the callers gather them from two tables and a set union is not
 * something worth asking each of them to remember.
 */
export function longestStreak(days: readonly string[]): number {
  const sorted = [...new Set((days ?? []).filter(Boolean))].sort();
  let best = 0;
  let run = 0;
  let previous: number | null = null;
  for (const day of sorted) {
    const at = Date.parse(`${day}T00:00:00Z`);
    if (!Number.isFinite(at)) continue;
    run = previous !== null && at - previous === 86_400_000 ? run + 1 : 1;
    previous = at;
    if (run > best) best = run;
  }
  return best;
}

export interface Standing {
  /** Put something in within `activeWithin` days. */
  active: Account[];
  /** Has been quiet longer than that, but did arrive at some point. */
  slipping: Account[];
  /** Quiet longer than `lapsedAfter`. The people nothing currently reaches. */
  lapsed: Account[];
  /** Signed up and never put anything in at all. */
  neverStarted: Account[];
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THIRTY DAYS IS NOT AN ARBITRARY LINE — IT IS WHERE THE APP GOES SILENT.
 *
 * lib/checkin-reminder.ts stops emailing at CHECKIN_REMINDER_STOP_DAYS, and
 * its reasoning is right: "somebody who has not opened the app in a month is
 * not going to be brought back by the thirtieth identical email, and
 * continuing to mail them is how a sending domain earns a spam reputation".
 *
 * So the app deliberately stops talking to anybody past thirty days, and
 * nothing was ever built to replace it. Everybody past that line is, by
 * design, out of contact forever. Splitting the standing here rather than at
 * some rounder number makes that group countable, which is the first step to
 * it being worth doing something about.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const LAPSED_AFTER_DAYS = 30;
/** A week of silence is a normal week off. It is not yet a problem. */
export const ACTIVE_WITHIN_DAYS = 7;

export function standing(
  accounts: readonly Account[],
  asOf: string,
  activeWithin: number = ACTIVE_WITHIN_DAYS,
  lapsedAfter: number = LAPSED_AFTER_DAYS,
): Standing {
  const out: Standing = { active: [], slipping: [], lapsed: [], neverStarted: [] };
  for (const account of accounts ?? []) {
    if (!account?.joined) continue;
    const gap = daysSinceActive(account, asOf);
    if (gap === null) out.neverStarted.push(account);
    else if (gap <= activeWithin) out.active.push(account);
    else if (gap <= lapsedAfter) out.slipping.push(account);
    else out.lapsed.push(account);
  }
  return out;
}

/**
 * The one number worth putting at the top: did they ever come back at all?
 *
 * Not a window and not a rate over time — just whether an account has a second
 * active day after the one it started on. It is the cheapest possible summary
 * of whether the product works, and it is the number a retention curve is a
 * more detailed answer to.
 */
export function everReturned(accounts: readonly Account[]): { of: number; did: number; reading: string } {
  const usable = (accounts ?? []).filter((a) => a?.joined);
  let did = 0;
  for (const account of usable) {
    const after = new Set((account.activeDays ?? []).filter((d) => daysBetween(account.joined, d) >= 1));
    if (after.size > 0) did += 1;
  }
  return { of: usable.length, did, reading: describeRate(did, usable.length) };
}

/**
 * The whole picture as lines somebody can read, for the weekly digest.
 *
 * WRITTEN AS A REPORT, NOT AS A TABLE. The admin panel can draw a chart; this
 * has to survive being an email, and an email that opens with a grid of
 * percentages is an email that gets skimmed past. Each line is a sentence with
 * its own count in it.
 */
export function retentionReport(accounts: readonly Account[], asOf: string): string[] {
  const usable = (accounts ?? []).filter((a) => a?.joined);
  if (!usable.length) return ["No accounts yet."];

  const where = standing(usable, asOf);
  const back = everReturned(usable);
  const lines: string[] = [
    `${usable.length} accounts. ${where.active.length} put something in this week, `
    + `${where.slipping.length} have gone quiet, ${where.lapsed.length} are past the `
    + `${LAPSED_AFTER_DAYS} days after which nothing reaches them, and `
    + `${where.neverStarted.length} never logged anything at all.`,
    `Came back at least once after signing up: ${back.reading}.`,
  ];

  for (const result of retentionCurve(usable, asOf)) {
    // A window nobody is old enough for is not a zero — it is not a question
    // that can be asked yet, and printing "0 of 0" invites reading it as bad.
    if (!result.eligible) {
      lines.push(`${capitalise(result.window.label)}: no account is old enough to say.`);
      continue;
    }
    lines.push(`Still there ${result.window.label}: ${result.reading}.`);
  }
  return lines;
}

const capitalise = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
