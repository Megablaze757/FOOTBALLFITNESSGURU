import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planEvents, buildIcs, escapeText, fold, dayOffset, type PlannedSession } from "./calendar-feed";

const session = (key: string, title: string, week: number, day: number, done = false): PlannedSession =>
  ({ key, title, week, day, drills: ["Back squat", "Bench press"], done });

const week = (n: number, count: number) => ({
  week: n,
  sessions: Array.from({ length: count }, (_, i) => session(`w${n}d${i + 1}`, `Session ${i + 1}`, n, i + 1)),
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RFC 5545 IS FUSSY IN FOUR WAYS AND EVERY ONE SILENTLY BREAKS A FEED.
 *
 * A calendar app does not report a parse error. It shows an empty calendar, or
 * refuses the subscription with no reason — so each of these fails as "it just
 * didn't work", with nothing to read.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the feed is CRLF throughout, which several parsers enforce", () => {
  const ics = buildIcs(planEvents("2026-09-07", [week(1, 3)]), "Training");
  assert.ok(ics.includes("\r\n"), "no CRLF at all");
  assert.ok(!/[^\r]\n/.test(ics), "a bare LF — some clients reject the whole file");
  assert.ok(ics.endsWith("\r\n"), "the last line is unterminated");
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.match(ics, /END:VCALENDAR\r\n$/);
});

/**
 * A comma or semicolon in a session title is a FIELD SEPARATOR. Unescaped,
 * "Squat, bench" becomes two fields and the event is junk.
 */
test("text that would split a field is escaped", () => {
  assert.equal(escapeText("Squat, bench"), "Squat\\, bench");
  assert.equal(escapeText("A;B"), "A\\;B");
  assert.equal(escapeText("back\\slash"), "back\\\\slash");
  assert.equal(escapeText("two\nlines"), "two\\nlines");

  const ics = buildIcs(
    planEvents("2026-09-07", [{ week: 1, sessions: [session("w1d1", "Push, pull; legs", 1, 1)] }]),
    "Training",
  );
  assert.ok(ics.includes("SUMMARY:Push\\, pull\\; legs"), `escaping did not reach the file:\n${ics}`);
  assert.ok(!/SUMMARY:Push, pull/.test(ics), "an unescaped comma reached the file");
});

/** Long lines must fold at 75 OCTETS with a leading space on continuations. */
test("long lines are folded, and folded by bytes not characters", () => {
  const long = fold(`DESCRIPTION:${"x".repeat(200)}`);
  for (const line of long.split("\r\n")) {
    assert.ok(new TextEncoder().encode(line).length <= 75, `${line.length} chars is over the limit`);
  }
  assert.ok(long.split("\r\n").slice(1).every((l) => l.startsWith(" ")), "a continuation has no leading space");

  // An emoji is four bytes. Folding by character count would split one and
  // produce mojibake in the calendar's own display.
  const emoji = fold(`SUMMARY:${"🏋".repeat(40)}`);
  for (const line of emoji.split("\r\n")) {
    assert.ok(new TextEncoder().encode(line).length <= 75);
  }
  assert.equal(emoji.replace(/\r\n /g, ""), `SUMMARY:${"🏋".repeat(40)}`, "folding lost or mangled a character");
});

/**
 * THE UID IS WHAT STOPS A CALENDAR FILLING WITH DUPLICATES.
 *
 * A feed is polled every few hours. An unstable UID means every poll adds
 * another copy of every session, and the athlete unsubscribes within a week.
 */
test("the same session keeps the same id across polls", () => {
  const a = planEvents("2026-09-07", [week(1, 3), week(2, 3)]);
  const b = planEvents("2026-09-07", [week(1, 3), week(2, 3)]);
  assert.deepEqual(a.map((e) => e.uid), b.map((e) => e.uid));
  assert.equal(new Set(a.map((e) => e.uid)).size, a.length, "two sessions share a UID");
  assert.match(a[0].uid, /^w1d1@/, "the UID is not the key completed_sessions uses");
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE APP DOES NOT KNOW WHAT DAY A SESSION IS ON.
 *
 * `session.day` is the nth session of its week, not a weekday, and nothing
 * anywhere maps a session to a date. The spread is this file's invention, so
 * it has to be a sensible one — and every event has to say it is a suggestion.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("sessions are spread across the week with rest between them", () => {
  assert.deepEqual([0, 1, 2].map((i) => dayOffset(i, 3)), [0, 2, 5], "three sessions are stacked together");
  assert.deepEqual([0, 1].map((i) => dayOffset(i, 2)), [0, 4]);
  assert.equal(dayOffset(0, 1), 0);
  // Never past the end of the week, and never two on one day.
  for (let count = 1; count <= 7; count++) {
    const days = Array.from({ length: count }, (_, i) => dayOffset(i, count));
    assert.ok(days.every((d) => d >= 0 && d <= 6), `count ${count} ran past the week: ${days}`);
    assert.equal(new Set(days).size, count, `count ${count} put two sessions on one day: ${days}`);
  }
});

test("every event admits the day is a suggestion", () => {
  for (const e of planEvents("2026-09-07", [week(1, 4)])) {
    assert.match(e.description, /Planned day/, "the calendar presents an invented date as fact");
    assert.match(e.url, /^https:\/\/pocketathlete\.com\//, "no way back into the app");
  }
});

test("weeks land a week apart, from the programme's own start date", () => {
  const events = planEvents("2026-09-07", [week(1, 3), week(2, 3), week(3, 3)]);
  assert.equal(events[0].date, "2026-09-07");
  assert.equal(events[3].date, "2026-09-14", "week 2 did not start seven days later");
  assert.equal(events[6].date, "2026-09-21");
});

/** A calendar that erases what you did has no record in it. */
test("completed sessions stay, and say so", () => {
  const done = planEvents("2026-09-07", [{ week: 1, sessions: [session("w1d1", "Lower", 1, 1, true)] }]);
  assert.equal(done.length, 1, "a finished session vanished from the calendar");
  assert.match(done[0].title, /^✓ /);
});

test("a malformed start date produces nothing, not events in 1970", () => {
  for (const bad of ["", "not a date", "2026-9-7", "07/09/2026"]) {
    assert.deepEqual(planEvents(bad, [week(1, 3)]), [], `"${bad}" produced events`);
  }
});

/** All-day, because the app has no session times — and DTEND is exclusive. */
test("events are all-day and end the following day", () => {
  const ics = buildIcs(planEvents("2026-09-07", [{ week: 1, sessions: [session("w1d1", "Lower", 1, 1)] }]), "Training");
  assert.match(ics, /DTSTART;VALUE=DATE:20260907/);
  assert.match(ics, /DTEND;VALUE=DATE:20260908/, "a one-day event that ends the day it starts renders as nothing");
  assert.match(ics, /DTSTAMP:\d{8}T\d{6}Z/, "DTSTAMP is required and some clients drop events without it");
  assert.match(ics, /X-WR-CALNAME:Training/, "the subscription would be named after its URL");
});

// --- the endpoint that serves it ---------------------------------------------

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE URL IS THE CREDENTIAL, SO THE RULES AROUND IT ARE THE FEATURE.
 *
 * A calendar app cannot log in — none of them hold a session or refresh a
 * token — so the only thing that can identify the athlete is the address. That
 * makes three things load-bearing: it must be unguessable, it must grant
 * nothing but a read of one plan, and a wrong one must FAIL rather than serve
 * an empty calendar. A silent empty feed is indistinguishable from "no sessions
 * yet", so a mistyped URL would look like it worked for weeks.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a token that matches nobody is a 404, never an empty calendar", () => {
  const src = readFileSync(new URL("../cloudflare/src/index.ts", import.meta.url), "utf8");
  /**
   * Bounded by the NEXT function, not by a named neighbour.
   *
   * This used to slice from `calendarFeed` to `mintCalendarToken`, which are
   * adjacent only by habit. Adding an unrelated function between them widened
   * the slice to cover it — and the read-only assertion below then failed on a
   * route that is supposed to write, reporting the calendar feed for somebody
   * else's code.
   */
  const at = src.indexOf("async function calendarFeed");
  const next = src.indexOf("\nasync function ", at + 1);
  const body = src.slice(at, next < 0 ? undefined : next);
  assert.ok(at >= 0 && body.length > 200, "calendarFeed is not in the Worker any more");

  assert.match(body, /if \(!profile\) return new Response\("Not found", \{ status: 404 \}\)/,
    "an unknown token gets a calendar instead of a refusal");
  assert.match(body, /\[0-9a-f-\]\{36\}/, "the token is not format-checked before it hits the database");
  assert.match(body, /status: eq\.active|status=eq\.active/, "it would serve an archived programme");
  assert.match(body, /text\/calendar/, "the wrong content type — clients will not subscribe");
  // Read-only: this endpoint must never write.
  assert.ok(!/method: "(POST|PATCH|DELETE|PUT)"/.test(body),
    "the feed writes something — the URL is a credential that travels");
});

test("minting is admin-only and revokes the previous link", () => {
  const src = readFileSync(new URL("../cloudflare/src/index.ts", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("async function mintCalendarToken"), src.indexOf("async function mintIngestToken"));

  assert.match(body, /isAdmin\(env, u\.id\)/, "anybody signed in can mint one");
  assert.match(body, /crypto\.randomUUID\(\)/, "the token is not unguessable");
  // Re-minting overwrites, which is the only way to un-share a link already
  // given out.
  assert.match(body, /method: "PATCH"/);
  assert.match(body, /webcal:/, "no webcal link — https hands a phone a file it imports once");
});

/**
 * Separate from ingest_token on purpose: that one WRITES biometrics. One key
 * for both would make a leaked calendar URL a way to write to somebody's
 * record, and revoking a shared calendar would break the health import.
 */
test("the calendar key is its own key, and is not readable from the browser", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0110_calendar_token.sql", import.meta.url), "utf8");
  assert.match(sql, /add column if not exists calendar_token uuid/);
  assert.match(sql, /revoke select \(calendar_token\) on public\.profiles from authenticated, anon/,
    "a long-lived credential would sit in every cached profile payload in the app");
  assert.match(sql, /create unique index[\s\S]*?calendar_token/,
    "two athletes could share a token and be served each other's programme");
  assert.ok(!/ingest_token/.test(sql.replace(/--[^\n]*/g, "")),
    "the calendar reuses the write-scoped health token");
});
