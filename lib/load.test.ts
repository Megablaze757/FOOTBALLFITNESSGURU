import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionLoad, computeACWR, checkInStreak, weeklyReport, tonnage, totalDistanceKm } from "./load";
import type { DailyCheckIn, NutritionLog, TrainingLog } from "./types";

const day = (offset: number, from = new Date("2026-06-28")) =>
  new Date(from.getTime() - offset * 86400_000).toISOString().slice(0, 10);

function tlog(date: string, minutes: number, intensity: number): TrainingLog {
  return { id: date, user_id: "u", log_date: date, drills: [], total_minutes: minutes, intensity, created_at: date };
}

test("sessionLoad uses sRPE (minutes × intensity)", () => {
  assert.equal(sessionLoad(tlog("d", 60, 7)), 420);
});

test("ACWR flags a load spike as danger", () => {
  const asOf = new Date("2026-06-28");
  // Chronic baseline ~moderate for 28d, then a big recent spike.
  const logs: TrainingLog[] = [];
  for (let i = 7; i < 28; i++) logs.push(tlog(day(i, asOf), 40, 5)); // older: light
  for (let i = 0; i < 7; i++) logs.push(tlog(day(i, asOf), 90, 9)); // recent: heavy
  const a = computeACWR(logs, asOf);
  assert.ok(a.ratio && a.ratio > 1.5, `ratio ${a.ratio}`);
  assert.equal(a.zone, "danger");
});

test("ACWR steady load is optimal", () => {
  const asOf = new Date("2026-06-28");
  const logs: TrainingLog[] = [];
  for (let i = 0; i < 28; i++) if (i % 7 < 5) logs.push(tlog(day(i, asOf), 60, 7));
  const a = computeACWR(logs, asOf);
  assert.equal(a.zone, "optimal");
});

test("ACWR with no chronic data reports building", () => {
  assert.equal(computeACWR([]).zone, "building");
});

test("checkInStreak counts consecutive days ending today", () => {
  const today = "2026-06-28";
  assert.equal(checkInStreak(["2026-06-28", "2026-06-27", "2026-06-26"], today), 3);
  assert.equal(checkInStreak(["2026-06-27", "2026-06-26"], today), 2); // today missing, yesterday ok
  assert.equal(checkInStreak(["2026-06-25"], today), 0); // gap breaks it
});

test("weeklyReport summarises sessions, load trend and a focus", () => {
  const asOf = new Date("2026-06-28");
  const training: TrainingLog[] = [];
  for (let i = 0; i < 6; i++) training.push(tlog(day(i, asOf), 60, 7)); // this week
  for (let i = 7; i < 10; i++) training.push(tlog(day(i, asOf), 30, 5)); // prior week (lighter)
  const checkIns: DailyCheckIn[] = [0, 1, 2, 3, 4].map((i) => ({
    id: `${i}`, user_id: "u", check_in_date: day(i, asOf), pain_map: {}, fatigue_score: 5, sleep_quality: 7,
    nutrition_quality: 7, weight_kg: 75, is_match_day: false, match_minutes_played: 0, created_at: "", updated_at: "",
  }));
  const nutrition: NutritionLog[] = [];
  const r = weeklyReport(checkIns, training, nutrition, asOf);
  assert.equal(r.sessions, 6);
  assert.equal(r.loadTrend, "up");
  assert.ok(r.topWin.length > 0 && r.focus.length > 0);
});

// --- sport-specific load (migration 0062) -----------------------------------
// sessionLoad was one model for six sports. These pin the two places that was
// actively misleading, and the two figures added for the sports sRPE fits worst.

test("contact minutes count double toward load", () => {
  const plain = tlog("d", 80, 7);
  const contact: TrainingLog = { ...plain, contact_minutes: 20 };
  // 80 ordinary minutes + 20 contact counted once more = 100 effective minutes.
  assert.equal(sessionLoad(contact), 100 * 7);
  assert.equal(sessionLoad(plain), 80 * 7);
  assert.ok(
    sessionLoad(contact) > sessionLoad(plain),
    "a contact session must outrank the same minutes of running — collisions are the injury driver"
  );
});

test("contact minutes are additional, not a separate total", () => {
  // A rugby player logging 80 minutes of which 20 were contact has trained for
  // 80 minutes, not 100 — the extra 20 is a weighting, not extra time.
  const t: TrainingLog = { ...tlog("d", 80, 1), contact_minutes: 20 };
  assert.equal(sessionLoad(t), 100, "80 + 20 x (weight - 1)");
});

test("no contact logged behaves exactly as before", () => {
  const t = tlog("d", 60, 7);
  assert.equal(sessionLoad({ ...t, contact_minutes: null }), sessionLoad(t));
  assert.equal(sessionLoad({ ...t, contact_minutes: 0 }), sessionLoad(t));
});

test("a contact week can spike ACWR that minutes alone would miss", () => {
  // Identical minutes every day for four weeks, with contact only in the last
  // week. Minutes alone give a ratio of 1.0; contact should push it up.
  const flat: TrainingLog[] = [];
  const withContact: TrainingLog[] = [];
  for (let i = 0; i < 28; i++) {
    const d = day(i);
    flat.push(tlog(d, 60, 7));
    withContact.push(i < 7 ? { ...tlog(d, 60, 7), contact_minutes: 30 } : tlog(d, 60, 7));
  }
  const asOf = new Date("2026-06-28");
  assert.equal(computeACWR(flat, asOf).ratio, 1);
  const spiked = computeACWR(withContact, asOf).ratio!;
  assert.ok(spiked > 1.2, `expected contact to lift the ratio, got ${spiked}`);
});

test("tonnage sums sets x reps x load", () => {
  const t: TrainingLog = {
    ...tlog("d", 0, 0),
    drills: [
      { name: "Squat", sets: 5, reps: 5, load_kg: 100 },   // 2500
      { name: "Bench", sets: 3, reps: 8, load_kg: 60 },    // 1440
    ],
  };
  assert.equal(tonnage([t]), 3940);
});

test("tonnage ignores bodyweight work rather than counting it as zero-weight reps", () => {
  const t: TrainingLog = {
    ...tlog("d", 0, 0),
    drills: [{ name: "Push-up", sets: 3, reps: 20, load_kg: null }],
  };
  assert.equal(tonnage([t]), 0, "no load means no tonnage — it isn't 60kg of nothing");
});

test("distance sums and rounds to one place", () => {
  // Deliberately off a .x5 boundary: 8.25 + 5.1 is 13.349999… in binary floating
  // point, so toFixed(1) gives 13.3 and asserting 13.4 would be testing a
  // rounding guarantee this function doesn't make.
  const a: TrainingLog = { ...tlog("a", 40, 6), distance_km: 8.26 };
  const b: TrainingLog = { ...tlog("b", 30, 5), distance_km: 5.1 };
  assert.equal(totalDistanceKm([a, b]), 13.4);
  assert.equal(totalDistanceKm([tlog("c", 30, 5)]), 0, "no distance logged is 0, not NaN");
});
