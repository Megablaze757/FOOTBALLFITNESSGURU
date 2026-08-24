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
): boolean {
  const anchor = lastCheckIn ?? joined;
  const gap = daysBetween(anchor, today);
  // A future date means clocks disagree somewhere; do not mail on it.
  if (gap < CHECKIN_REMINDER_GAP_DAYS) return false;
  if (gap > CHECKIN_REMINDER_STOP_DAYS) return false;
  return gap % CHECKIN_REMINDER_GAP_DAYS === 0;
}

/** The earliest check-in date worth fetching to decide any of this. */
export function checkinReminderSince(today: string): string {
  const t = Date.parse(`${today}T00:00:00Z`);
  return new Date(t - CHECKIN_REMINDER_STOP_DAYS * 86_400_000).toISOString().slice(0, 10);
}
