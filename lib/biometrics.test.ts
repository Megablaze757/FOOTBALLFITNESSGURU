import { test } from "node:test";
import assert from "node:assert/strict";
import { biometricSignal, parseBiometricCsv } from "./biometrics";

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
