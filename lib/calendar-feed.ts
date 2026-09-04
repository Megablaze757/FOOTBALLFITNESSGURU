// =============================================================================
// THE TRAINING PLAN, AS A CALENDAR YOU CAN SUBSCRIBE TO.
//
// ═══════════════════════════════════════════════════════════════════════════
// A FEED, NOT AN API, BECAUSE A CALENDAR APP CANNOT LOG IN.
//
// Apple Calendar, Google Calendar and Outlook all subscribe to a URL and poll
// it; none of them can hold a session or refresh a token. So the thing to build
// is an .ics feed at an address that is itself the credential — the same
// constraint the Apple Health shortcut hit, and the same answer.
//
// ─────────────────────────────────────────────────────────────────────────
// THE APP DOES NOT KNOW WHAT DAY A SESSION IS ON, AND THIS HAS TO SAY SO.
//
// A program is an ORDERED LIST. `session.day` is the nth session of its week,
// not a weekday, and nothing anywhere maps a session to a date — you do the
// next one when you next train. That is a deliberate design and it is why the
// app has no calendar of its own.
//
// A calendar cannot be ordered-without-dates, so this places them: evenly
// spread across each week from the program's start date, which is what a plan
// looks like when you write it down. That spacing is THIS FILE'S invention,
// not something the app decided, so every event says so in its description.
// Quietly presenting an invented schedule as the app's own would make the
// calendar disagree with the product every week the athlete trained on a
// different day.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

export interface PlannedSession {
  /** "w3d2" — the same key completed_sessions uses, so a UID is stable. */
  key: string;
  title: string;
  week: number;
  /** Nth session of the week, from 1. */
  day: number;
  drills: string[];
  done: boolean;
}

export interface CalendarEvent {
  uid: string;
  /** YYYY-MM-DD. All-day: the app has no session times to offer. */
  date: string;
  title: string;
  description: string;
  url: string;
}

/**
 * Where the nth of `count` sessions falls in a seven-day week.
 *
 * Spread with rest between them rather than stacked at the front: three
 * sessions are Monday, Wednesday, Friday, not Monday, Tuesday, Wednesday. The
 * arithmetic is `round(i * 7 / count)`, which gives 0,2,4 for three and
 * 0,1,2,3,4,5,6 for seven, and never repeats a day for any count up to seven.
 */
export function dayOffset(index: number, count: number): number {
  if (count <= 1) return 0;
  const spread = Math.min(count, 7);
  return Math.min(6, Math.round((index * 7) / spread));
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export const APP_URL = "https://pocketathlete.com";

/**
 * Sessions placed on dates.
 *
 * Completed ones are kept, not dropped: a calendar that erases what you did is
 * a calendar with no record in it, and the whole point of having training in
 * there is looking back at the month.
 */
export function planEvents(
  startDate: string,
  weeks: { week: number; sessions: PlannedSession[] }[],
): CalendarEvent[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return [];
  const out: CalendarEvent[] = [];

  for (const w of weeks) {
    const count = w.sessions.length;
    w.sessions.forEach((session, i) => {
      const date = addDays(startDate, (w.week - 1) * 7 + dayOffset(i, count));
      const drills = session.drills.filter(Boolean);
      out.push({
        // Stable across polls, so a calendar UPDATES the event rather than
        // adding a second copy every time it refreshes. Getting this wrong
        // produces a calendar that fills with duplicates and gets unsubscribed.
        uid: `${session.key}@pocketathlete.com`,
        date,
        title: `${session.done ? "✓ " : ""}${session.title}`,
        description: [
          drills.length ? `${drills.length} exercises: ${drills.slice(0, 8).join(", ")}` : "Session",
          "",
          "Planned day — the app tracks your programme in order, not by date,",
          "so move this if you train on a different day.",
        ].join("\n"),
        url: `${APP_URL}/train`,
      });
    });
  }
  return out;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RFC 5545 IS FUSSY IN FOUR WAYS AND EVERY ONE OF THEM SILENTLY BREAKS A FEED.
 *
 * A calendar app does not report a parse error. It shows an empty calendar, or
 * it refuses the subscription with no reason, so each of these fails as "it
 * just didn't work":
 *
 *   CRLF, not LF. The spec says CRLF and several parsers enforce it.
 *   FOLDED at 75 octets, continuation lines beginning with a space.
 *   ESCAPED text — a comma or semicolon in a session title is a field
 *     separator, so "Squat, bench" becomes two fields and the event is junk.
 *   A STABLE UID, or every poll adds another copy of the same session.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function escapeText(value: string): string {
  return value
    // The backslash FIRST, or the escapes added below get escaped again.
    .replace(/\\/g, "\\\\")
    // "\\;" and not "\;" — the second is just a semicolon, because \; is not a
    // JavaScript escape sequence. It compiled, it looked right, and semicolons
    // reached the file unescaped: the exact silent break this function exists
    // to prevent, written into the function itself.
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Fold at 75 OCTETS, not characters — an emoji is four bytes and a fold in
 *  the middle of one produces mojibake in the calendar's own display. */
export function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let width = 0;
  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    // 74 on continuation lines: the leading space counts toward the 75.
    if (width + size > (out.length === 0 ? 75 : 74)) {
      out.push(current);
      current = "";
      width = 0;
    }
    current += char;
    width += size;
  }
  if (current) out.push(current);
  return out.map((part, i) => (i === 0 ? part : ` ${part}`)).join("\r\n");
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function buildIcs(events: CalendarEvent[], name: string, now = new Date()): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PocketAthlete//Training//EN",
    "CALSCALE:GREGORIAN",
    // Not in the spec, and every major client reads it. Without it the
    // subscription is named after the URL.
    `X-WR-CALNAME:${escapeText(name)}`,
    // How often to poll. Clients treat it as a hint; saying nothing means
    // some of them poll once a day and some once a week.
    "X-PUBLISHED-TTL:PT6H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
  ];

  for (const event of events) {
    const day = event.date.replace(/-/g, "");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTAMP:${stamp(now)}`,
      // All-day. The app has no session times, and inventing 18:00 would be a
      // fact it does not have — DTEND is exclusive, so it is the next day.
      `DTSTART;VALUE=DATE:${day}`,
      `DTEND;VALUE=DATE:${event.date.replace(/-/g, "") === day ? nextDay(event.date) : day}`,
      `SUMMARY:${escapeText(event.title)}`,
      `DESCRIPTION:${escapeText(event.description)}`,
      `URL:${escapeText(event.url)}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

function nextDay(iso: string): string {
  return addDays(iso, 1).replace(/-/g, "");
}
