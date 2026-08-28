// =============================================================================
// When the check-in reminder EMAIL is due.
//
// It used to be "every morning you have not checked in yet", which is a fine
// in-app nudge and a bad email. Somebody who checks in most days got a mail on
// the one morning they were late; somebody who stopped using the app got one
// every single day, forever. The second is the worse failure — the people it
// reaches hardest are exactly the people already ignoring it.
//
// So the email now waits for a real absence: three days with no check-in.
//
// AND THEN IT WAITS AGAIN. "Only email after three days" on its own just moves
// the daily nagging to day three and carries on — day 3, day 4, day 5, one
// every morning, at the person least likely to want them. Sending only when the
// gap is a MULTIPLE of three gives at most one email every three days, and it
// needs no state of its own: the gap is derivable from the last check-in, so
// nothing has to be remembered between runs and two different senders reading
// the same rows agree without coordinating.
//
// The in-app reminder is deliberately left alone. A notification inside an app
// somebody has chosen to open is not the same intrusion as mail, and the same
// -day nudge is the whole point of it.
//
// Pure + tested.
// =============================================================================

/** Days of silence before the first email, and the gap between repeats. */
export const CHECKIN_REMINDER_GAP_DAYS = 3;

/**
 * After this long, stop.
 *
 * Somebody who has not opened the app in a month is not going to be brought
 * back by the thirtieth identical email, and continuing to mail them is how a
 * sending domain earns a spam reputation — which costs the athletes who DO want
 * their password reset and their receipts. Silence is the honest end state.
 */
export const CHECKIN_REMINDER_STOP_DAYS = 30;

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. Negative if `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Is a check-in reminder email due today?
 *
 * `lastCheckIn` is the athlete's most recent check-in date, or null if they
 * have never made one — in which case the clock starts when they joined, so a
 * new account gets the same three days of grace as everybody else rather than
 * an email on day one.
 */
export function checkinReminderDue(
  lastCheckIn: string | null,
  joined: string,
  today: string,
  /**
   * Check-ins ever. Absent means "we did not look", which is treated as an
   * established athlete — a missing count must not put somebody with a
   * two-year habit back on the new-joiner cadence.
   */
  checkInsEver?: number,
): boolean {
  const anchor = lastCheckIn ?? joined;
  const gap = daysBetween(anchor, today);
  const step = reminderStep(joined, today, checkInsEver);
  // A future date means clocks disagree somewhere; do not mail on it.
  if (gap < step) return false;
  if (gap > CHECKIN_REMINDER_STOP_DAYS) return false;
  return gap % step === 0;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A DAY-ONE ATHLETE IS NOT A LAPSED REGULAR, AND THREE DAYS TREATS THEM AS ONE.
 *
 * Three days of grace is exactly right for somebody with a habit who missed a
 * Tuesday: the gap is unusual, they know what the app is, and a mail on the
 * first quiet morning would be nagging.
 *
 * For somebody who signed up yesterday it is a week of silence across the only
 * days that decide anything. They check in once on Monday, hear nothing Tuesday
 * or Wednesday, and the first contact is a Thursday email to a person who has
 * forgotten they signed up. That is the whole "they use it once and never come
 * back" shape, and the app was sitting quietly through it by design.
 *
 * Every day for the first week, then the normal three. NOT more mail in total —
 * the thirty-day stop is unchanged — it is the same reminders moved to where
 * they can still do something.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const NEW_JOINER_GAP_DAYS = 1;
export const NEW_JOINER_WINDOW_DAYS = 7;

export function reminderStep(joined: string, today: string, checkInsEver?: number): number {
  const age = daysBetween(joined, today);
  const stillNew = age >= 0 && age <= NEW_JOINER_WINDOW_DAYS
    && (checkInsEver === undefined ? false : checkInsEver <= NEW_JOINER_WINDOW_DAYS);
  return stillNew ? NEW_JOINER_GAP_DAYS : CHECKIN_REMINDER_GAP_DAYS;
}

/** The earliest check-in date worth fetching to decide any of this. */
export function checkinReminderSince(today: string): string {
  const t = Date.parse(`${today}T00:00:00Z`);
  return new Date(t - CHECKIN_REMINDER_STOP_DAYS * 86_400_000).toISOString().slice(0, 10);
}
