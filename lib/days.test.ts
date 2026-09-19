import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { daysAgo, daysBetween } from "./days";

// ═══════════════════════════════════════════════════════════════════════════
// THE SIGNED ONE. Every case the three copies were collectively tested for,
// now applied to the single implementation under all of them.
// ═══════════════════════════════════════════════════════════════════════════

test("days between two dates, both ways", () => {
  assert.equal(daysBetween("2026-01-01", "2026-01-08"), 7);
  assert.equal(daysBetween("2026-01-08", "2026-01-01"), -7);
  assert.equal(daysBetween("2026-01-01", "2026-01-01"), 0);
});

/**
 * A month boundary and a leap year, because an off-by-one here silently shifts
 * every account into the neighbouring retention window and every athlete one
 * day nearer or further from a reminder.
 */
test("month boundaries and leap days are whole days like any other", () => {
  assert.equal(daysBetween("2026-01-31", "2026-02-01"), 1);
  assert.equal(daysBetween("2024-02-28", "2024-03-01"), 2);
  assert.equal(daysBetween("2023-02-28", "2023-03-01"), 1, "a non-leap year gained a day");
  assert.equal(daysBetween("2025-12-31", "2026-01-01"), 1);
});

/**
 * The exact case lib/checkin-reminder.test.ts pins: a check-in dated tomorrow
 * is a negative gap, and nothing is due on it.
 */
test("a date in the future is a negative gap, not zero", () => {
  assert.equal(daysBetween("2026-03-15", "2026-03-10"), -5);
});

/**
 * NaN would propagate silently: `NaN > 30` is false, so an athlete with a
 * corrupt date is never due for anything, forever, with nothing logged.
 */
test("something unparseable is zero rather than NaN", () => {
  assert.equal(daysBetween("nonsense", "2026-03-10"), 0);
  assert.equal(daysBetween("2026-03-10", ""), 0);
  assert.equal(daysBetween("not a date", "2026-06-01"), 0);
});

/** A year is a year however the dates are spelled, and daylight saving is not a day. */
test("a span across a daylight-saving change is still whole days", () => {
  // The UK moves its clocks on the last Sunday of March and October. Parsed at
  // UTC midnight, neither is a 23- or 25-hour day.
  assert.equal(daysBetween("2026-03-28", "2026-03-30"), 2);
  assert.equal(daysBetween("2026-10-24", "2026-10-26"), 2);
  assert.equal(daysBetween("2026-01-01", "2027-01-01"), 365);
});

// ═══════════════════════════════════════════════════════════════════════════
// THE CLAMPED ONE, AND THE REASON IT IS A SEPARATE NAME.
// ═══════════════════════════════════════════════════════════════════════════

test("how long ago is never negative", () => {
  assert.equal(daysAgo("2026-08-20", "2026-08-15"), 0, "a future date produced a negative age");
  assert.equal(daysAgo("2026-08-15", "2026-08-20"), 5);
  assert.equal(daysAgo("2026-08-15", "2026-08-15"), 0);
});

/**
 * THE POINT OF HAVING BOTH. The same inputs, deliberately different answers,
 * and each is correct for the question its name asks. This is the collision
 * that used to live under one name in two modules.
 */
test("the two disagree on a future date, on purpose", () => {
  const future = ["2026-03-15", "2026-03-10"] as const;
  assert.equal(daysBetween(...future), -5);
  assert.equal(daysAgo(...future), 0);
  assert.notEqual(daysBetween(...future), daysAgo(...future),
    "the clamped version stopped clamping, so there is no reason for two functions");
});

test("they agree whenever the date is in the past, which is almost always", () => {
  for (let n = 0; n <= 400; n++) {
    const from = new Date(Date.UTC(2026, 0, 1)).toISOString().slice(0, 10);
    const to = new Date(Date.UTC(2026, 0, 1) + n * 86_400_000).toISOString().slice(0, 10);
    assert.equal(daysBetween(from, to), daysAgo(from, to), `they differ at ${n} days`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// AND THE COPIES MUST NOT COME BACK.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FIVE MODULES WROTE THESE EIGHT LINES, AND A SIXTH COPY WOULD BE FREE TO
 * DISAGREE WITH ALL OF THEM.
 *
 * MATCHED ON THE COMPUTATION, NOT ON THE CONSTANT. The first version of this
 * flagged any file containing 86_400_000 near a parsed date, and reported
 * eight — four of them wrongly. lib/milestones.ts walks a streak backwards a
 * day at a time, lib/post-plan.ts indexes days from a fixed epoch,
 * lib/challenge-pool.ts seeds a daily board, lib/gamification.ts keeps a
 * DAY_MS. All use the constant; none of them computes the gap between two
 * given dates.
 *
 * It also MISSED lib/strength-progress.ts, whose copy was real, because the
 * constant did not fall where the pattern expected it.
 *
 * So this looks for the thing itself: a function whose body parses two date
 * strings and divides their difference by a day. That is "days between two
 * dates" whatever it is called — which matters, because one of the five was
 * called dayDiff and took its arguments the other way round.
 * ═══════════════════════════════════════════════════════════════════════════
 */
function daysApartFunctions(src: string): string[] {
  const out: string[] = [];
  const declaration = /(?:export\s+)?(?:const\s+(\w+)\s*=\s*(?:\([^)]*\)|\w+)\s*(?::[^=]*)?=>|function\s+(\w+)\s*\()/g;
  const starts: { name: string; at: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = declaration.exec(src))) starts.push({ name: m[1] ?? m[2], at: m.index });

  for (let i = 0; i < starts.length; i++) {
    const body = src.slice(starts[i].at, starts[i + 1]?.at ?? src.length);
    const parsed = (body.match(/Date\.parse\(`\$\{\w+\}T00:00:00Z`\)/g) ?? []).length;
    const divided = /\(\s*\w+\s*-\s*\w+\s*\)\s*\/\s*86_400_000/.test(body);
    if (parsed >= 2 && divided) out.push(starts[i].name);
  }
  return out;
}

test("only lib/days.ts computes the gap between two dates", () => {
  const offenders: string[] = [];
  for (const file of readdirSync("lib")) {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts") || file === "days.ts") continue;
    for (const name of daysApartFunctions(readFileSync(`lib/${file}`, "utf8"))) {
      offenders.push(`${file}: ${name}`);
    }
  }
  assert.deepEqual(offenders, [],
    "lib/days.ts owns this. Five modules wrote it themselves — three signed, two\n"
    + "  clamped at zero, one with its arguments reversed — and the only place any\n"
    + `  of that showed was an import line:\n  ${offenders.join("\n  ")}`);
});

/** The check on the check: a detector that matches nothing passes forever. */
test("the detector recognises the shape it is looking for", () => {
  const real = `function whatever(from: string, to: string): number {
    const a = Date.parse(\`\${from}T00:00:00Z\`);
    const b = Date.parse(\`\${to}T00:00:00Z\`);
    return Math.round((b - a) / 86_400_000);
  }`;
  assert.deepEqual(daysApartFunctions(real), ["whatever"],
    "a copy under a different name is no longer detected");

  // And the four it used to flag wrongly: one parsed date, or none, is not
  // the gap between two of them.
  const epochIndex = `function dayIndex(date: string): number {
    const t = Date.parse(\`\${date}T00:00:00Z\`);
    return Math.floor((t - EPOCH) / 86_400_000);
  }`;
  assert.deepEqual(daysApartFunctions(epochIndex), [],
    "indexing days from a fixed epoch is being reported as a duplicate");

  assert.deepEqual(daysApartFunctions("const DAY_MS = 86_400_000;"), []);
});

/**
 * lib/days.ts itself must keep containing it, or the test above passes because
 * the implementation moved rather than because the copies went away.
 */
test("the one that is allowed to have it still does", () => {
  assert.deepEqual(daysApartFunctions(readFileSync("lib/days.ts", "utf8")), ["daysBetween"],
    "lib/days.ts no longer holds the implementation everything else defers to");
});
