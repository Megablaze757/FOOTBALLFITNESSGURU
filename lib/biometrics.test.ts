import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { biometricSignal, parseBiometricCsv, parseOuraSleep, parseIngestPayload, syncHealth, daysSinceSync } from "./biometrics";
import { todayLocal } from "./day";

const hist = (hrv: number, days = 20) =>
  Array.from({ length: days }, (_, i) => ({
    metric_date: `2026-06-${String(i + 1).padStart(2, "0")}`,
    hrv_ms: hrv, resting_hr: 52, sleep_hours: 8,
  }));

test("suppressed HRV lowers readiness with a note", () => {
  const s = biometricSignal(
    { metric_date: "2026-07-01", hrv_ms: 40, resting_hr: 52, sleep_hours: 8 },
    hist(60)
  );
  assert.equal(s.hrvBaseline, 60);
  assert.ok(s.hrvDeviationPct! <= -30);
  assert.ok(s.adjustment < 0);
  assert.match(s.note ?? "", /below your norm/);
});

test("good HRV + sleep nudges readiness up", () => {
  const s = biometricSignal(
    { metric_date: "2026-07-01", hrv_ms: 72, resting_hr: 52, sleep_hours: 8 },
    hist(60)
  );
  assert.ok(s.adjustment > 0);
});

test("poor sleep and elevated resting HR both penalise", () => {
  const s = biometricSignal(
    { metric_date: "2026-07-01", hrv_ms: 60, resting_hr: 60, sleep_hours: 5 },
    hist(60)
  );
  assert.ok(s.adjustment <= -10);
  assert.match(s.note ?? "", /sleep/);
});

test("adjustment is clamped to [-15, 5]", () => {
  const s = biometricSignal(
    { metric_date: "2026-07-01", hrv_ms: 20, resting_hr: 70, sleep_hours: 3 },
    hist(60)
  );
  assert.ok(s.adjustment >= -15);
});

test("parses a Whoop-style CSV", () => {
  const csv = "Cycle start,HRV (ms),Resting heart rate,Sleep duration (h)\n" +
    "2026-06-30,58,53,7.5\n2026-07-01,42,58,5.9";
  const rows = parseBiometricCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].hrv_ms, 42);
  assert.equal(rows[1].resting_hr, 58);
  assert.equal(rows[1].sleep_hours, 5.9);
});

test("parser ignores rows with no usable metrics + no date column returns []", () => {
  assert.deepEqual(parseBiometricCsv("foo,bar\n1,2"), []);
});

// --- Connected wearables -----------------------------------------------------

test("parseOuraSleep maps a night to a day's biometrics", () => {
  const rows = parseOuraSleep([
    { day: "2026-07-30", type: "long_sleep", average_hrv: 62, lowest_heart_rate: 48, total_sleep_duration: 27000 },
  ]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    metric_date: "2026-07-30", hrv_ms: 62, resting_hr: 48, sleep_hours: 7.5, source: "oura",
  });
});

test("parseOuraSleep keeps the night, not the nap", () => {
  // Oura returns one record per sleep PERIOD. Taking the last one would report
  // a 40-minute nap as the night's sleep and read its HRV as the baseline.
  const rows = parseOuraSleep([
    { day: "2026-07-30", type: "long_sleep", average_hrv: 62, lowest_heart_rate: 48, total_sleep_duration: 27000 },
    { day: "2026-07-30", type: "sleep", average_hrv: 40, lowest_heart_rate: 61, total_sleep_duration: 2400 },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sleep_hours, 7.5);
  assert.equal(rows[0].hrv_ms, 62);
});

test("parseOuraSleep prefers lowest heart rate over the night's average", () => {
  // Mixing the two across days shows a rising trend that is really a change of
  // field. lowest_heart_rate is what Oura calls resting HR.
  const rows = parseOuraSleep([
    { day: "2026-07-30", average_hrv: 55, lowest_heart_rate: 47, average_heart_rate: 58, total_sleep_duration: 25200 },
  ]);
  assert.equal(rows[0].resting_hr, 47);
});

test("parseOuraSleep falls back to average heart rate when there's no low", () => {
  const rows = parseOuraSleep([
    { day: "2026-07-30", average_heart_rate: 58.4, total_sleep_duration: 25200 },
  ]);
  assert.equal(rows[0].resting_hr, 58);
});

test("parseOuraSleep ignores records with nothing in them", () => {
  assert.deepEqual(parseOuraSleep([]), []);
  assert.deepEqual(parseOuraSleep(null), []);
  assert.deepEqual(parseOuraSleep([{ day: "2026-07-30" }]), []);
  assert.deepEqual(parseOuraSleep([{ average_hrv: 60 }]), []); // no date
});

test("parseOuraSleep returns days in order", () => {
  const rows = parseOuraSleep([
    { day: "2026-07-30", average_hrv: 60, total_sleep_duration: 25200 },
    { day: "2026-07-28", average_hrv: 58, total_sleep_duration: 25200 },
    { day: "2026-07-29", average_hrv: 59, total_sleep_duration: 25200 },
  ]);
  assert.deepEqual(rows.map((r) => r.metric_date), ["2026-07-28", "2026-07-29", "2026-07-30"]);
});

test("parseIngestPayload accepts the key names a Shortcut actually sends", () => {
  // The thing on the other end was assembled by dragging boxes around; a strict
  // schema would fail on restingHR vs resting_hr with no way to debug it.
  for (const body of [
    { date: "2026-07-30", hrv: 62, restingHR: 48, sleepHours: 7.5 },
    { day: "2026-07-30", HRV_ms: 62, resting_heart_rate: 48, sleep: 7.5 },
    { startDate: "2026-07-30", heartRateVariability: 62, lowestHeartRate: 48, asleep: 7.5 },
  ]) {
    const rows = parseIngestPayload(body);
    assert.equal(rows.length, 1, JSON.stringify(body));
    assert.equal(rows[0].hrv_ms, 62);
    assert.equal(rows[0].resting_hr, 48);
    assert.equal(rows[0].sleep_hours, 7.5);
  }
});

test("parseIngestPayload works out sleep units from the magnitude", () => {
  // Apple reports minutes as often as hours. Nobody sleeps 450 hours and
  // nobody sleeps 7 minutes, so the number settles it — safer than trusting a
  // key name we didn't choose.
  assert.equal(parseIngestPayload({ date: "2026-07-30", sleep: 450 })[0].sleep_hours, 7.5);
  assert.equal(parseIngestPayload({ date: "2026-07-30", sleep: 7.5 })[0].sleep_hours, 7.5);
  assert.equal(parseIngestPayload({ date: "2026-07-30", minutesAsleep: 450 })[0].sleep_hours, 7.5);
});

test("parseIngestPayload defaults an absent date to the athlete's local today", () => {
  const rows = parseIngestPayload({ hrv: 60 });
  assert.equal(rows.length, 1);
  // LOCAL, not `toISOString()`. This assertion used to be the UTC day, which
  // meant it encoded the bug rather than catching it: a Shortcut firing at 7am
  // in Sydney reports this morning's sleep, and UTC files it against last
  // night. The test only started failing once the code was fixed — in
  // America/Los_Angeles, where UTC is already tomorrow.
  assert.equal(rows[0].metric_date, todayLocal());
});

test("parseIngestPayload takes an array or a single object", () => {
  const rows = parseIngestPayload([
    { date: "2026-07-29", hrv: 58 },
    { date: "2026-07-30", hrv: 62 },
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.metric_date), ["2026-07-29", "2026-07-30"]);
});

test("parseIngestPayload returns nothing rather than an empty row", () => {
  // The caller answers 400 on an empty result, so a Shortcut sending junk shows
  // a failure instead of reporting success on nothing.
  assert.deepEqual(parseIngestPayload(null), []);
  assert.deepEqual(parseIngestPayload({}), []);
  assert.deepEqual(parseIngestPayload("nonsense"), []);
  assert.deepEqual(parseIngestPayload({ date: "2026-07-30", hrv: 0, restingHR: 0 }), []);
});

// --- sync freshness ----------------------------------------------------------

test("a sync that quietly stopped is reported as stale, not as syncing", () => {
  const now = new Date("2026-08-15T09:00:00Z");
  const at = (iso: string) => syncHealth(iso, now);
  assert.equal(at("2026-08-15T04:00:00Z"), "fresh", "this morning");
  assert.equal(at("2026-08-14T04:00:00Z"), "fresh", "yesterday morning");
  // Two nights is still fine — a ring charging on a bedside table has not synced
  // and has not broken either.
  assert.equal(at("2026-08-13T10:00:00Z"), "fresh", "47 hours");
  assert.equal(at("2026-08-13T08:00:00Z"), "stale", "49 hours");
  assert.equal(at("2026-07-01T04:00:00Z"), "stale", "six weeks");
  assert.equal(syncHealth(null, now), "never");
  assert.equal(syncHealth("not a date", now), "never");
});

test("a clock skew does not read as a sync from the future", () => {
  const now = new Date("2026-08-15T09:00:00Z");
  assert.equal(syncHealth("2026-08-16T09:00:00Z", now), "fresh");
  assert.equal(daysSinceSync("2026-08-16T09:00:00Z", now), 0);
});

test("days since sync counts whole days", () => {
  const now = new Date("2026-08-15T09:00:00Z");
  assert.equal(daysSinceSync("2026-08-15T04:00:00Z", now), 0);
  assert.equal(daysSinceSync("2026-08-11T04:00:00Z", now), 4);
  assert.equal(daysSinceSync(null, now), null);
});

/**
 * THE TWO COPIES OF THE OURA PARSER MUST NOT DRIFT.
 *
 * Edge Functions run in Deno with their own module graph and cannot import
 * from this app's lib/, so supabase/functions/sync-oura/index.ts carries its
 * own copy of parseOuraSleep — the same arrangement wearable-ingest already
 * has for the push parser. A duplicate nobody checks is a duplicate that
 * quietly diverges, and the symptom here would be a nap counted as a night's
 * sleep for anyone whose data came through the cron rather than the backfill.
 *
 * This does not prove the two behave identically — nothing short of running
 * the Deno function could — but it does prove the parts most likely to be
 * dropped in a rewrite are still present on both sides.
 */
test("the edge function's copy of the Oura parser keeps the rules that matter", () => {
  const src = readFileSync(new URL("../supabase/functions/sync-oura/index.ts", import.meta.url), "utf8");

  // Naps: the longest sleep period for a date wins.
  assert.match(src, /existing\.seconds >= seconds/,
    "the nap rule is gone — an afternoon nap will be recorded as the night's sleep");
  // Resting HR comes from the lowest heart rate, not the average.
  assert.match(src, /lowest_heart_rate \?\? r\.average_heart_rate/,
    "resting HR no longer prefers lowest_heart_rate, so the trend will drift by several bpm");
  // Non-sleep records are skipped.
  assert.match(src, /long_sleep\|sleep/,
    "rest periods are no longer filtered out");
  // Seconds to hours.
  assert.match(src, /seconds \/ 3600/, "sleep is no longer converted from seconds");
  // And it still points at the real API.
  assert.match(src, /api\.ouraring\.com\/v2\/usercollection\/sleep/, "the Oura endpoint changed");
});

test("the sync function refuses to run without a configured secret", () => {
  // A misconfigured deploy must fail closed. `if (secret && ...)` would leave
  // an endpoint that reads every athlete's ring token wide open.
  const src = readFileSync(new URL("../supabase/functions/sync-oura/index.ts", import.meta.url), "utf8");
  assert.match(src, /if \(!secret\) return json\(\{ error: "CRON_SECRET is not set" \}, 500\)/,
    "the function no longer fails closed when CRON_SECRET is missing");
  assert.match(src, /x-cron-secret/, "the shared-secret check is gone");
});
