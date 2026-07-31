import { test } from "node:test";
import assert from "node:assert/strict";
import { biometricSignal, parseBiometricCsv, parseOuraSleep, parseIngestPayload } from "./biometrics";

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

test("parseIngestPayload defaults an absent date to today", () => {
  const rows = parseIngestPayload({ hrv: 60 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].metric_date, new Date().toISOString().slice(0, 10));
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
