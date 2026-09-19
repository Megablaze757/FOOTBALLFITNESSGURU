// =============================================================================
// WHOLE DAYS BETWEEN TWO `YYYY-MM-DD` DATES, AND THE TWO ANSWERS THAT QUESTION
// HAS.
//
// ═══════════════════════════════════════════════════════════════════════════
// THIS ARITHMETIC EXISTED THREE TIMES, UNDER ONE NAME, WITH TWO BEHAVIOURS.
//
// lib/checkin-reminder.ts, lib/pain.ts and lib/retention.ts each exported a
// `daysBetween`. Two of them were byte-identical. The third was not, and the
// difference is visible in their own tests:
//
//   checkin-reminder  daysBetween("2026-03-15", "2026-03-10") === -5
//   pain              daysBetween("2026-08-20", "2026-08-15") === 0
//
// The same question, the same shape of input, opposite answers. Both are
// RIGHT about their own domain — a check-in dated tomorrow is a negative gap
// and nothing is due on it, while a pain report dated tomorrow is a device
// clock askew and must not produce a negative age or a confidence above 1 —
// and the name said neither.
//
// So the two behaviours get two names, and the name says which one it is.
// This is the same fix MAX_REEL_MS needed: both numbers were correct about
// their own question, and a name that does not say which question it answers
// is the defect.
//
// ───────────────────────────────────────────────────────────────────────────
// AND THE DUPLICATE WAS NOT EVENLY TESTED.
//
// lib/retention.test.ts exercised its copy across leap years, month
// boundaries, negative gaps and unparseable input. lib/checkin-reminder.ts
// held a byte-identical copy with a fraction of that, and it is the one
// lib/reminder-plan.ts uses to decide WHO GETS EMAILED. The consumer with the
// most at stake was leaning on the least-covered copy of the same eight lines.
//
// One implementation now, with the thorough tests, under everything.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

/**
 * Whole days from `from` to `to`, both `YYYY-MM-DD`. NEGATIVE when `to` is
 * earlier, which is the point of this one.
 *
 * UTC MIDNIGHT ON BOTH SIDES, so a run in any timezone gives the same answer
 * and a date never shifts by one on the way through. These are calendar dates
 * rather than instants; the time of day is not part of the question.
 *
 * ZERO FOR SOMETHING UNPARSEABLE, rather than NaN. NaN propagates silently
 * through every comparison — `NaN > 30` is false, so an athlete with a corrupt
 * date would simply never be due for anything, forever, with nothing logged.
 * Zero is wrong in an obvious direction instead of invisible in a subtle one.
 */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * How long ago `from` was, as of `to`. NEVER NEGATIVE — the clamp is the whole
 * reason this is a second function and is why it is in the name.
 *
 * A phone with a clock set ahead produces a record dated tomorrow. Read as a
 * signed gap that is a negative age, and a negative age runs backwards through
 * anything that decays with time: lib/pain.ts's confidence curve would return
 * more than 1 for a report that has not been made yet. Something dated in the
 * future is, for these purposes, something that happened just now.
 */
export function daysAgo(from: string, to: string): number {
  return Math.max(0, daysBetween(from, to));
}
