import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionLoad, computeACWR, checkInStreak, streakState, EARN_EVERY, MAX_BANKED, weeklyReport, tonnage, totalDistanceKm, averagePaceSeconds, hasTrainingContent } from "./load";
import type { DailyCheckIn, NutritionLog, TrainingLog } from "./types";

const day = (offset: number, from = new Date("2026-06-28")) =>
  new Date(from.getTime() - offset * 86400_000).toISOString().slice(0, 10);

function tlog(date: string, minutes: number, intensity: number): TrainingLog {
  return { id: date, user_id: "u", log_date: date, drills: [], total_minutes: minutes, intensity, created_at: date };
}

test("sessionLoad uses sRPE (minutes × intensity)", () => {
  assert.equal(sessionLoad(tlog("d", 60, 7)), 420);
});

test("sessionLoad keeps exact seconds and excludes rest days", () => {
  assert.equal(sessionLoad({ ...tlog("d", 26, 6), duration_seconds: 25 * 60 + 30 }), 153);
  assert.equal(sessionLoad({ ...tlog("rest", 60, 9), session_type: "rest_day" }), 0);
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

test("distance keeps the hundredths accepted by the running log", () => {
  const a: TrainingLog = { ...tlog("a", 40, 6), distance_km: 8.26 };
  const b: TrainingLog = { ...tlog("b", 30, 5), distance_km: 5.1 };
  assert.equal(totalDistanceKm([a, b]), 13.36);
  assert.equal(totalDistanceKm([{ ...tlog("precise", 30, 5), distance_km: 5.66 }]), 5.66);
  assert.equal(totalDistanceKm([tlog("c", 30, 5)]), 0, "no distance logged is 0, not NaN");
});

test("an all-null training row does not count as trained", () => {
  // The case that matters: a row upserted alongside a check-in that touched
  // none of the training fields. Counting it would hide the "add your training"
  // prompt from exactly the people who haven't added any.
  assert.equal(hasTrainingContent({
    drills: [], total_minutes: null, intensity: null,
    distance_km: null, contact_minutes: null,
  }), false);
  assert.equal(hasTrainingContent(null), false);
  assert.equal(hasTrainingContent(undefined), false);
});

test("distance or contact alone counts as trained", () => {
  // A runner logging 8km and nothing else has told us about a session.
  assert.equal(hasTrainingContent({ distance_km: 8 }), true);
  assert.equal(hasTrainingContent({ contact_minutes: 20 }), true);
  assert.equal(hasTrainingContent({ total_minutes: 45 }), true);
  assert.equal(hasTrainingContent({ drills: [{ name: "Squat" }] }), true);
  assert.equal(hasTrainingContent({ duration_seconds: 1546 }), true);
});

test("active rest and rest-day rows both count as an intentional check-in choice", () => {
  assert.equal(hasTrainingContent({ session_type: "active_rest" }), true);
  assert.equal(hasTrainingContent({ session_type: "rest_day" }), true);
});

test("zero is not a logged value", () => {
  // 0 minutes at 0 intensity is an empty form, not a session.
  assert.equal(hasTrainingContent({ total_minutes: 0, intensity: 0, distance_km: 0 }), false);
});

// --- pace ---------------------------------------------------------------------

/**
 * "No runner-specific stats."
 *
 * Distance was there and pace was not, and the reason was upstream: the mm:ss
 * field and the live pace lived only on the runner fast path, so for everybody
 * else the app held a distance and a duration rounded to the nearest minute.
 * With both recorded properly, the number a runner actually talks about can be
 * shown.
 */

const run = (km: number, seconds: number): TrainingLog =>
  ({ distance_km: km, duration_seconds: seconds } as TrainingLog);

test("a week's pace is weighted by distance, not averaged over runs", () => {
  // THE BUG THIS AVOIDS. A 1km strider at 4:00 and a 20km long run at 5:30
  // average to 4:45 if you mean the paces, which describes neither run. Total
  // time over total distance is what a watch reports for one run and what this
  // reports for a week of them.
  const week = [run(1, 240), run(20, 6600)];
  assert.equal(averagePaceSeconds(week), Math.round((240 + 6600) / 21));
  assert.notEqual(averagePaceSeconds(week), 285, "the paces were meaned");
});

test("a run with no time has no pace, and does not drag the week to zero", () => {
  // Absent is not zero. Counting a missing duration as 0 seconds reports a
  // week's pace of nothing at all.
  const week = [run(10, 3000), run(5, 0), { distance_km: 8 } as TrainingLog];
  assert.equal(averagePaceSeconds(week), 300);
  assert.equal(averagePaceSeconds([]), null);
  assert.equal(averagePaceSeconds([run(0, 1800)]), null, "a session with no distance is not a run");
});

test("pace is read to the second, not to the rounded minute", () => {
  // A 5k in 27:34 stored as 28 minutes is a pace six seconds per kilometre out
  // — the difference between a Zone 2 run and a tempo.
  assert.equal(averagePaceSeconds([run(5, 27 * 60 + 34)]), 331);
  assert.equal(averagePaceSeconds([run(5, 28 * 60)]), 336);
});

test("a row written before duration_seconds existed still has a pace", () => {
  // durationSeconds falls back to total_minutes, so old logs keep counting.
  assert.equal(averagePaceSeconds([{ distance_km: 10, total_minutes: 50 } as TrainingLog]), 300);
});

// --- streak insurance --------------------------------------------------------

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE RULES HAVE TO BE MEAN ENOUGH TO MEAN SOMETHING.
 *
 * A forgiving streak is the point; a streak that forgives everything is a
 * participation number. Each test below is one of the four limits, and each one
 * exists because removing it produces something that still looks like it works.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Every day from `from` to `to` inclusive. */
function days(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = new Date(new Date(`${d}T00:00:00Z`).getTime() + 86400_000).toISOString().slice(0, 10)) {
    out.push(d);
  }
  return out;
}

test("a rest day has to be earned before it can be spent", () => {
  // Nine logged days, then a miss. Nothing banked yet — EARN_EVERY is ten.
  const nine = days("2026-06-01", "2026-06-09");
  const after = days("2026-06-11", "2026-06-14");
  assert.equal(checkInStreak([...nine, ...after], "2026-06-14"), 4, "the gap should have broken it");

  // Ten, and the same gap is covered.
  const ten = days("2026-06-01", "2026-06-10");
  assert.equal(checkInStreak([...ten, ...after], "2026-06-14"), 14);
});

test("a covered day is never counted as a day they turned up", () => {
  const s = streakState([...days("2026-06-01", "2026-06-10"), ...days("2026-06-12", "2026-06-14")], "2026-06-14");
  assert.equal(s.streak, 13, "ten plus three logged — the covered day adds nothing");
  assert.deepEqual(s.covered, ["2026-06-11"]);
  assert.equal(s.banked, 0, "and it cost the rest day it had");
});

test("two missed days in a row is a break, however much is banked", () => {
  // Thirty logged days: two banked, which is the cap.
  const month = days("2026-06-01", "2026-06-30");
  const s = streakState([...month, ...days("2026-07-03", "2026-07-05")], "2026-07-05");
  assert.equal(s.streak, 3, "1 and 2 July were both missed — that is a break, not an interruption");
  assert.deepEqual(s.covered, []);
});

test("rest days do not accumulate over a long run", () => {
  // A hundred days would earn ten. Two is the most anyone can hold.
  const s = streakState(days("2026-03-01", "2026-06-08"), "2026-06-08");
  assert.equal(s.banked, MAX_BANKED);
  assert.equal(s.toNextBanked, null, "nothing to work towards when the bank is full");
});

/**
 * Written twice. The first version asserted the bank after a long gap, which
 * proves nothing: four missed days in a row drain the bank on their way past
 * whether or not the break clears it, so leaving the reset out looked correct.
 *
 * This one breaks the chain with the SHORTEST gap that can break it — two days,
 * the first covered and the second fatal — and then hands the new run a missed
 * day it must not be able to cover.
 */
test("insurance does not survive a break", () => {
  const dates = [
    ...days("2026-06-01", "2026-06-30"), // 30 logged: two banked, the cap
    // 1 July covered, 2 July breaks it.
    ...days("2026-07-03", "2026-07-07"), // 5 into the new run — not enough to earn
    // 8 July missed, and there must be nothing left to cover it with.
    ...days("2026-07-09", "2026-07-11"),
  ];
  const s = streakState(dates, "2026-07-11");
  assert.equal(s.streak, 3, "8 July must break the new run, not be quietly insured by the old one");
  assert.equal(s.banked, 0);
  assert.deepEqual(s.covered, []);
});

/**
 * The one that is easiest to get wrong: at 00:01 today is a day with no
 * check-in in it. Spending a rest day on it would take the athlete's insurance
 * for a check-in they are going to make after work.
 */
test("today is not a missed day until it is over", () => {
  const s = streakState(days("2026-06-01", "2026-06-10"), "2026-06-11");
  assert.equal(s.streak, 10, "yesterday was logged — the streak stands");
  assert.equal(s.banked, 1, "and nothing has been spent on a day still in progress");
  assert.deepEqual(s.covered, []);
});

test("what it takes to earn the next one", () => {
  assert.equal(streakState([], "2026-06-10").toNextBanked, EARN_EVERY);
  assert.equal(streakState(days("2026-06-01", "2026-06-04"), "2026-06-04").toNextBanked, 6);
  assert.equal(streakState(days("2026-06-01", "2026-06-10"), "2026-06-10").toNextBanked, 10);
});

test("duplicate and empty dates cannot inflate a streak", () => {
  const doubled = [...days("2026-06-01", "2026-06-05"), ...days("2026-06-01", "2026-06-05"), "", ""];
  assert.equal(checkInStreak(doubled, "2026-06-05"), 5);
});

/** A month boundary is where date arithmetic done by hand goes wrong. */
test("the chain crosses months and years", () => {
  assert.equal(checkInStreak(days("2026-12-20", "2027-01-10"), "2027-01-10"), 22);
  // And a leap day is a day like any other.
  assert.equal(checkInStreak(days("2028-02-26", "2028-03-02"), "2028-03-02"), 6);
});
