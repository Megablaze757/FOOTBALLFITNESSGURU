/**
 * What day it is, for the athlete holding the phone.
 *
 * THE BUG THIS EXISTS TO FIX. Every "what day is it" in the app was
 * `new Date().toISOString().slice(0, 10)`, which is the day in **UTC**, not the
 * day where the person is standing. Reads and writes agreed with each other, so
 * it looked correct — and it silently lost check-ins:
 *
 *   Sydney, 08:00 Tuesday. `toISOString()` says Monday, so the check-in is
 *   filed under Monday. At 11:00 the same morning UTC ticks over, the page
 *   starts querying Tuesday, finds nothing, and shows an empty form. The
 *   athlete checked in and the app forgot.
 *
 *   UK on BST, 00:30 Tuesday. Filed under Monday. Blank again by 01:00.
 *
 * The further east, the wider the window: at UTC+10 every check-in before 10am
 * local — which is when a morning check-in actually happens — lands on the
 * wrong day.
 *
 * A "day" in this app is a human unit. It is the day you trained, the day you
 * slept badly, the day your streak counts. That is always the local day, and
 * the athlete's own device is the only thing that knows which one that is.
 *
 * NOT FOR TIMESTAMPS. `created_at`, `queuedAt` and friends are moments in time
 * and stay as full ISO strings in UTC, which is correct for them. This module
 * is only for the `*_date` columns — `check_in_date`, `log_date`,
 * `metric_date`, `test_date` — which are Postgres `date`, not `timestamptz`.
 */

/** `yyyy-mm-dd` for a Date, in the device's timezone. */
export function toLocalDay(d: Date = new Date()): string {
  // Built from the local getters rather than by shifting a UTC string: any
  // offset arithmetic reintroduces exactly the bug this replaces, and these
  // three calls are the timezone-correct answer by definition.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Today, where the athlete is. */
export function todayLocal(): string {
  return toLocalDay();
}

/**
 * `n` days back, on the local calendar.
 *
 * `setDate` rather than subtracting `n * 86400_000` milliseconds. The two agree
 * until a clock change, and then they don't: the day a DST transition happens
 * is 23 or 25 hours long, so millisecond arithmetic lands on the wrong date
 * twice a year. `setDate` counts calendar days, which is what "28 days of
 * history" means.
 */
export function daysAgoLocal(n: number, from: Date = new Date()): string {
  const d = new Date(from.getTime());
  d.setDate(d.getDate() - n);
  return toLocalDay(d);
}

/**
 * The last `n` local calendar days, oldest first, ending today.
 *
 * WHY THIS IS HERE AND NOT INLINE. It was inline, on Home, and it had both of
 * the bugs this module exists to prevent:
 *
 *   const d = new Date(Date.now() - (6 - i) * 86400_000);
 *   const iso = d.toISOString().slice(0, 10);              // UTC
 *   letter: d.toLocaleDateString(undefined, { weekday: "narrow" });  // local
 *
 * The key was the UTC day and the label was the LOCAL day, so for anyone whose
 * local date differs from UTC's — everyone east of the meridian in the morning,
 * everyone west of it in the evening — the seven dots were looked up under the
 * wrong dates and the cell marked "today" was not today. Reported as "the last
 * 7 days thing highlights the wrong day", and that is exactly what it did.
 *
 * The millisecond arithmetic is the second bug, and `daysAgoLocal` above
 * already spells it out: a DST-transition day is 23 or 25 hours long, so
 * subtracting 86,400,000ms per day lands on the wrong calendar date twice a
 * year — a strip that shows the same weekday twice, or skips one.
 *
 * Returns the Date too, at LOCAL midnight, so a caller formatting a weekday
 * name is formatting the same day it just keyed on rather than a near-miss.
 */
export function lastNDaysLocal(n: number, from: Date = new Date()): { iso: string; date: Date }[] {
  return Array.from({ length: Math.max(0, n) }, (_, i) => {
    const d = new Date(from.getTime());
    // setDate counts calendar days; setHours(0,0,0,0) puts it at local midnight
    // so toLocaleDateString cannot be pushed over a boundary by the time of day.
    d.setDate(d.getDate() - (n - 1 - i));
    d.setHours(0, 0, 0, 0);
    return { iso: toLocalDay(d), date: d };
  });
}
