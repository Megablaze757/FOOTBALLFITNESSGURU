// =============================================================================
// THE ONE MESSAGE AFTER THE APP HAS STOPPED TALKING.
//
// ═══════════════════════════════════════════════════════════════════════════
// PAST THIRTY DAYS, NOTHING REACHES ANYBODY. THAT WAS NEVER A DECISION.
//
// lib/checkin-reminder.ts stops at CHECKIN_REMINDER_STOP_DAYS and its reason is
// correct: "somebody who has not opened the app in a month is not going to be
// brought back by the thirtieth identical email, and continuing to mail them is
// how a sending domain earns a spam reputation". Every sender in the app
// inherits that line.
//
// What follows from it was never written down. Everybody past thirty days is
// out of contact permanently — not de-prioritised, not mailed less often, but
// never contacted again by anything. lib/retention.ts can now count them.
//
// The fix is NOT to restart the reminders. The reminder was right to stop: it
// had nothing to say. A thirty-first "you have not checked in" is the same
// email that already failed thirty times.
//
// ═══════════════════════════════════════════════════════════════════════════
// SO THE RULE IS: IF THERE IS NOTHING SPECIFIC TO SAY, SEND NOTHING.
//
// This is the whole design. A win-back with no statistic in it is "we miss
// you", which is the email everybody deletes and the one that costs the
// sending domain. An athlete who logged four sessions and left has no story
// worth telling and gets no email; an athlete who logged forty-seven has one
// sentence that nothing else in their inbox can say, because nothing else in
// their inbox knows what they lifted.
//
// The statistic is the message. Not decoration on a re-engagement email — the
// reason the email exists at all.
// ═══════════════════════════════════════════════════════════════════════════
//
// FACTS IN, NOT IMPORTS. Same reasoning as lib/growth-digest.ts: the Worker
// sends this and cannot pull the app's module graph in to do it. Everything
// here is arithmetic on numbers the caller already has.
// =============================================================================

import { daysBetween } from "./retention";
import { STREAK_MILESTONES } from "./milestones";

/**
 * Only once.
 *
 * NOT A CADENCE. Every other sender in this app repeats on a gap, and that is
 * right for somebody who is still around. This one is aimed at people who have
 * already stopped, and a second copy of "here is your best lift" a fortnight
 * later is precisely the nagging the thirty-day line exists to prevent. One
 * message, and then the silence that lib/checkin-reminder.ts chose on purpose.
 */
export const WIN_BACK_ONCE = true;

/**
 * How long after they go quiet.
 *
 * Thirty-five, not thirty: the reminders stop AT thirty, and landing on the
 * same day would put two emails from the same app in one inbox on one morning
 * — the exact failure lib/reminder-plan.ts was written to fix, repeated one
 * level out. Five days later it is unambiguously the only thing being sent.
 */
export const WIN_BACK_AFTER_DAYS = 35;

/**
 * And a ceiling, because there is a point where this is just cold mail.
 *
 * Six months after somebody last opened an app, a message about their training
 * from last spring is not a reminder, it is a stranger with their data. The
 * honest end state is still silence.
 */
export const WIN_BACK_UNTIL_DAYS = 180;

/** Sessions worth marking. The same shape as STREAK_MILESTONES, for the same reason. */
export const SESSION_MILESTONES = [10, 25, 50, 100, 200, 365, 500] as const;

/** How close to the next milestone still counts as "nearly". */
export const NEARLY = 5;

export interface Facts {
  /** For the greeting. A blank name is fine and is handled. */
  name?: string | null;
  /** `YYYY-MM-DD`, the last day they put anything in. Null: they never did. */
  lastActive: string | null;
  /** Training sessions logged, ever. */
  sessions: number;
  /** The longest run of consecutive check-ins they ever put together. */
  longestStreak: number;
  /**
   * Their best lift, if they ever recorded one.
   *
   * `label` is the human name of the metric — lib/milestones.ts already owns
   * that mapping, and the caller has applied it.
   */
  best?: { label: string; value: number; unit: string; on: string } | null;
  /** Whether they have said yes to this kind of mail. */
  wantsEmail: boolean;
  /** Whether one has already gone out. See WIN_BACK_ONCE. */
  alreadySent: boolean;
}

/** The next milestone above `count`, or null if they are past the last one. */
export function nextMilestone(count: number, ladder: readonly number[] = SESSION_MILESTONES): number | null {
  for (const step of ladder) if (step > count) return step;
  return null;
}

export interface WinBack {
  subject: string;
  /** One or two sentences. The statistic, and what it is short of. */
  body: string;
  href: string;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE LINES, IN THE ORDER THEY ARE WORTH SENDING.
 *
 * Ranked by how hard the sentence is to ignore, which is not the same as how
 * impressive the number is:
 *
 *   1  unfinished business   "47 sessions. Three off fifty."
 *   2  a record still standing   "Your 100kg bench is still your best."
 *   3  a streak they beat once   "Your longest run was 23 days."
 *   4  nothing                   send nothing
 *
 * An unfinished thing outranks a bigger finished one on purpose. "You logged
 * 200 sessions" is a compliment and compliments are easy to read and close;
 * "three off fifty" is a thing left undone, and the reason to open the app is
 * in the sentence rather than appended to it as a link.
 * ═══════════════════════════════════════════════════════════════════════════
 */
function line(facts: Facts, today: string): { subject: string; body: string } | null {
  const quiet = facts.lastActive ? daysBetween(facts.lastActive, today) : null;
  const weeks = quiet === null ? null : Math.floor(quiet / 7);

  const next = nextMilestone(facts.sessions);
  const short = next === null ? null : next - facts.sessions;
  if (facts.sessions > 0 && short !== null && short <= NEARLY) {
    return {
      subject: `${facts.sessions} sessions. ${short} off ${next}.`,
      body: `You logged ${facts.sessions} sessions and stopped ${short} short of ${next}. `
        + `They are still there when you want them.`,
    };
  }

  if (facts.best && facts.best.value > 0) {
    const ago = weeks && weeks > 1 ? ` — ${weeks} weeks ago` : "";
    return {
      subject: `Your ${facts.best.label} is still ${facts.best.value}${facts.best.unit}`,
      body: `Your best ${facts.best.label} is ${facts.best.value}${facts.best.unit}, set on `
        + `${facts.best.on}${ago}. Nothing has beaten it because nothing has been logged since.`,
    };
  }

  // A streak worth naming is one that cleared the app's own lowest milestone.
  // Below that it is not a run, it is a few days in a row.
  if (facts.longestStreak >= STREAK_MILESTONES[0]) {
    return {
      subject: `You once checked in ${facts.longestStreak} days running`,
      body: `Your longest run of check-ins was ${facts.longestStreak} days. `
        + `It starts again at one.`,
    };
  }

  // Nothing specific. This is where most lapsed accounts land, and the correct
  // email for them is no email.
  return null;
}

/**
 * Is a win-back due, and what does it say?
 *
 * Null means send nothing, and every null here is a decision rather than a
 * failure: too soon, too long ago, already sent, not consented, or — the one
 * that matters — nothing worth saying.
 */
export function winBack(facts: Facts, today: string, href = "/journal"): WinBack | null {
  if (!facts?.wantsEmail) return null;
  if (facts.alreadySent && WIN_BACK_ONCE) return null;
  if (!facts.lastActive) return null;

  const quiet = daysBetween(facts.lastActive, today);
  // A clock disagreement upstream must not be able to mail somebody who was
  // active this morning.
  if (quiet < WIN_BACK_AFTER_DAYS) return null;
  if (quiet > WIN_BACK_UNTIL_DAYS) return null;

  const said = line(facts, today);
  if (!said) return null;
  return { subject: said.subject, body: said.body, href };
}

/**
 * Did this athlete come back because of it?
 *
 * The outcome for lib/experiment.ts. Deliberately narrow: activity within
 * `window` days of the send, and nothing else. Not opens, not clicks —
 * somebody who opened the email and did not train is a person the email failed
 * to bring back, and counting them as a success is how a re-engagement
 * campaign reports 40% engagement while the retention curve does not move.
 */
export const RETURN_WINDOW_DAYS = 14;

export function returnedAfter(
  sentOn: string,
  activeDays: readonly string[],
  window: number = RETURN_WINDOW_DAYS,
): boolean {
  return (activeDays ?? []).some((day) => {
    const gap = daysBetween(sentOn, day);
    return gap >= 0 && gap <= window;
  });
}
