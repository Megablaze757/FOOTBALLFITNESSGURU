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
 * What tomorrow actually gives them, in one line.
 *
 * Ordered by how soon it lands, so the nearest real thing is always the one
 * offered — a promise four days out is not a reason to open the app tomorrow.
 * Returns null once they are past the first week: at that point the app has
 * plenty to say and does not need to keep advertising itself.
 */
export function whatTomorrowBrings(ctx: FirstWeekContext): string | null {
  if (!isNew(ctx)) return null;

  switch (ctx.checkIns) {
    case 0:
      return null; // nothing logged yet — there is no "tomorrow" to promise.
    case 1:
      /**
       * Readiness is scored from today's answers alone until there is history
       * to compare against — so the second check-in is the first one that
       * changes what the score MEANS. That is true, specific, and happens
       * tomorrow.
       */
      return "Log again tomorrow and your readiness stops being a snapshot — it starts comparing today against your own normal.";
    case 2:
      // Three points is the fewest that can draw a direction rather than a dot.
      return "One more and your trend lines appear on Progress — three days is the fewest that can show a direction.";
    case 3:
      return "Four in a row. Two more days and you have a full week of load, which is what the readiness score is built to read.";
    default:
      return ctx.hasProgram
        ? "Keep going — a week of logs is what lets the programme adjust to how you are actually recovering."
        : "Keep going — a week of logs is what the weekly summary is built from.";
  }
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
