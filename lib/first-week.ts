/**
 * The first week, which is the only week most people ever have.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * "THEY USE IT ONCE AND NEVER COME BACK."
 *
 * Three things were true of a brand new athlete's first session, and each one
 * is a separate reason not to return:
 *
 *   1. NOTHING TOLD THEM TO. The done screen renders a streak chip when
 *      `streak > 1` and an empty span otherwise — so the very first check-in,
 *      the one moment somebody has just done the thing and is looking for a
 *      sign it mattered, ended in blank space.
 *
 *   2. NOTHING REACHED THEM. Push notifications exist and live on the Profile
 *      page, which nobody visits in their first session. The only other contact
 *      is an email after three days of silence.
 *
 *   3. THAT EMAIL TREATS THEM LIKE A REGULAR. Three days of grace is right for
 *      somebody with a habit who missed a Tuesday. It is wrong for somebody on
 *      day one, who has no habit to fall back on and will have forgotten the
 *      app exists by Thursday.
 *
 * WHAT THIS FILE WILL NOT DO is promise something that does not happen. "Come
 * back tomorrow for more insights" is the sort of line that gets written into
 * apps like this one, and the second day is where it is found out — somebody
 * returns, gets the same screen, and now knows the app will say anything. Every
 * promise here names a thing the app genuinely does on that specific day.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** How long "new" lasts. After this they have a habit or they do not. */
export const FIRST_WEEK_DAYS = 7;

export interface FirstWeekContext {
  /** Check-ins ever, including today's. */
  checkIns: number;
  /** Days since the account was created. */
  daysSinceJoined: number;
  /** Whether they have a training programme. */
  hasProgram: boolean;
}

export function isNew(ctx: FirstWeekContext): boolean {
  return ctx.daysSinceJoined <= FIRST_WEEK_DAYS && ctx.checkIns <= FIRST_WEEK_DAYS;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A MILESTONE IS A CLAIM ABOUT THE ENGINE, SO THE ENGINE HAS TO BACK IT.
 *
 * The first version of this file said the rule out loud — "every promise names
 * a thing the app genuinely does on that specific day" — and then broke it
 * three times out of three, because a rule a person holds is a rule that lasts
 * exactly as long as their attention:
 *
 *   "the second check-in is when readiness starts comparing you against your
 *   own normal"      — assessReadiness reads today's answers and nothing else.
 *                      It has never compared anybody against anything.
 *
 *   "three days is the fewest that can draw a direction"
 *                    — computeFatigueTrend returns "stable" until it has FOUR
 *                      points. Three shows nothing.
 *
 *   "a full week of load is what the readiness score is built to read"
 *                    — load needs a 28-day chronic window before it reports at
 *                      all. A week gives you nothing.
 *
 * So the promises are no longer prose. Each one names the count it needs, and
 * first-week.test.ts drives the real engine at `at - 1` and at `at` and fails
 * unless the thing genuinely appears exactly there. The copy cannot drift from
 * the app, and the app cannot drift from the copy — whichever one moves, the
 * build stops.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export interface Milestone {
  /** Check-ins required before this becomes true. */
  at: number;
  /** What appears then, in the athlete's words. */
  promise: string;
}

export const MILESTONES: Milestone[] = [
  {
    at: 2,
    // computeWeightDelta needs two weights to subtract. Verified in the test.
    promise: "Log again tomorrow and you have two weights to compare — which is the first thing here that can show a direction rather than a number.",
  },
  {
    at: 4,
    // computeFatigueTrend returns "stable" below four points. Verified.
    promise: "Two more and your fatigue trend can actually report — it needs four days before it will say whether you are climbing or recovering.",
  },
];

/**
 * The next real thing, and when it lands.
 *
 * Returns null when there is nothing left in the first week to promise, which
 * is the honest answer rather than a fabricated one — see the header for what
 * happened when this file was willing to invent.
 */
export function nextMilestone(checkIns: number): Milestone | null {
  return MILESTONES.find((m) => m.at > checkIns) ?? null;
}

/**
 * What tomorrow actually gives them, in one line.
 *
 * Null once they are past the first week, and null when the next milestone is
 * more than a couple of days out — a promise four days away is not a reason to
 * open the app tomorrow.
 */
export function whatTomorrowBrings(ctx: FirstWeekContext): string | null {
  if (!isNew(ctx)) return null;
  if (ctx.checkIns === 0) return null; // nothing logged — there is no tomorrow to promise

  const next = nextMilestone(ctx.checkIns);
  if (!next) {
    // Past every milestone but still inside the first week: say the true thing
    // about the week rather than inventing a fourth feature.
    return ctx.hasProgram
      ? "Keep going — a week of logs is what lets the programme adjust to how you are actually recovering."
      : "Keep going — a week of logs is what the weekly summary is built from.";
  }
  // More than two days out is not a reason to open it tomorrow.
  return next.at - ctx.checkIns <= 2 ? next.promise : null;
}

/**
 * Is this the moment to ask for notification permission?
 *
 * ONCE, AND AT THE MOMENT IT MAKES SENSE. Asking on load is how an app gets
 * denied forever: the browser remembers a refusal, there is no second prompt,
 * and the athlete had no idea what they were being asked about. Asking straight
 * after the first check-in is the one moment the answer is obvious — they have
 * just done the thing the reminder is about.
 *
 * Not on the very first one, though. Somebody who has checked in exactly once
 * has not decided anything yet, and a permission dialogue on top of their first
 * result is the app asking for something before it has given anything. The
 * second check-in is a returning athlete, which is a different question.
 */
export function shouldAskForPush(ctx: FirstWeekContext): boolean {
  return isNew(ctx) && ctx.checkIns === 2;
}

/**
 * How long a brand new athlete gets before the first reminder.
 *
 * ONE DAY, NOT THREE. Three is right for somebody with a habit who missed a
 * Tuesday — the gap is unusual and they know what the app is. For somebody on
 * day one it is a week of silence at exactly the point the habit is either
 * formed or lost, and by Thursday they have forgotten they signed up.
 *
 * This is not more nagging. It is the same total number of reminders, moved to
 * where they can still do something.
 */
export const NEW_ATHLETE_GRACE_DAYS = 1;

export function reminderGraceDays(ctx: FirstWeekContext): number {
  return isNew(ctx) ? NEW_ATHLETE_GRACE_DAYS : 3;
}
