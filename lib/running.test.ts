import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ZONES, ZONE_LIST, estimateMaxHr, hrZones, zoneForHr,
  riegel, thresholdPaceFromRace, thresholdPaceFromBenchmarks,
  paceZones, repPace, formatPace, parsePace, formatPaceRange,
  RUN_TYPES, runType, isHardRun, HARD_RUN_TYPES,
  weeklyVolumePlan, buildRunWeek, easyShare, buildRunProgram,
  MAX_HARD_SESSIONS, EASY_SHARE_TARGET,
  intervalEffort, describeShape, shapeMidpoint, formatEffort,
  type RunTypeId,
} from "./running";
import type { ProgramPlan } from "./engine";

// --- Zones -------------------------------------------------------------------

test("zones are ordered, contiguous and cover 50-100% of max HR", () => {
  assert.equal(ZONE_LIST.length, 5);
  for (let i = 0; i < ZONE_LIST.length; i++) {
    const z = ZONE_LIST[i];
    assert.equal(z.id, i + 1);
    assert.ok(z.pctMaxHr[0] < z.pctMaxHr[1], `zone ${z.id} HR band inverted`);
    // Pace factors run fastest-first, so the first number is the SMALLER one.
    assert.ok(z.paceFactor[0] < z.paceFactor[1], `zone ${z.id} pace band inverted`);
    if (i > 0) assert.equal(z.pctMaxHr[0], ZONE_LIST[i - 1].pctMaxHr[1], `gap before zone ${z.id}`);
  }
  assert.equal(ZONE_LIST[0].pctMaxHr[0], 50);
  assert.equal(ZONE_LIST[4].pctMaxHr[1], 100);
});

test("harder zones are faster — pace factor falls as zone rises", () => {
  for (let i = 1; i < ZONE_LIST.length; i++) {
    assert.ok(
      ZONE_LIST[i].paceFactor[1] <= ZONE_LIST[i - 1].paceFactor[0],
      `zone ${i + 1} is not faster than zone ${i}`,
    );
  }
});

test("estimateMaxHr uses 208 - 0.7*age, not 220 - age", () => {
  assert.equal(estimateMaxHr(20), 194);
  assert.equal(estimateMaxHr(40), 180);
  // The whole reason for the formula: it does NOT agree with 220-age for older
  // athletes, and is higher — which is the direction that matters.
  assert.ok(estimateMaxHr(60) > 220 - 60);
});

test("hrZones falls back to percent-of-max without a resting HR", () => {
  const z = hrZones({ maxHr: 200 });
  assert.ok(z);
  assert.deepEqual(z![0], { zone: 1, low: 100, high: 120 });
  assert.deepEqual(z![4], { zone: 5, low: 180, high: 200 });
});

test("hrZones uses heart-rate reserve when resting HR is known", () => {
  // Reserve = 200 - 50 = 150. Zone 2 is 60-70% of reserve, above resting.
  const z = hrZones({ maxHr: 200, restingHr: 50 });
  assert.ok(z);
  assert.deepEqual(z![1], { zone: 2, low: 140, high: 155 });
  // And it must differ from the percent-of-max answer, or the input did nothing.
  const plain = hrZones({ maxHr: 200 })!;
  assert.notDeepEqual(z![1], plain[1]);
});

test("hrZones derives max from age when not measured", () => {
  const z = hrZones({ age: 30 });
  assert.ok(z);
  assert.equal(z![4].high, estimateMaxHr(30));
});

test("hrZones returns null rather than inventing an athlete", () => {
  assert.equal(hrZones({}), null);
  assert.equal(hrZones({ age: 0 }), null);
  assert.equal(hrZones({ maxHr: 0 }), null);
});

test("a resting HR at or above max is ignored rather than producing negative zones", () => {
  const z = hrZones({ maxHr: 180, restingHr: 190 });
  assert.ok(z);
  assert.ok(z!.every((r) => r.low > 0 && r.high >= r.low));
});

test("zoneForHr resolves a boundary beat to the harder zone", () => {
  const ranges = hrZones({ maxHr: 200 })!;
  assert.equal(zoneForHr(120, ranges), 2); // z1 high AND z2 low — the harder wins
  assert.equal(zoneForHr(185, ranges), 5);
  assert.equal(zoneForHr(90, ranges), null); // below zone 1
});

// --- Pace --------------------------------------------------------------------

test("riegel costs more than proportional time over longer distances", () => {
  const t5k = 20 * 60;
  const t10k = riegel(t5k, 5, 10);
  assert.ok(t10k > t5k * 2, "10k should take more than double the 5k time");
  assert.ok(t10k < t5k * 2.2, "but not absurdly more");
});

test("threshold pace from a 20-minute 5k lands where a coach would put it", () => {
  // A 20:00 5k is 4:00/km. Threshold — the pace they could race for an hour —
  // sits a little slower, around 4:15/km. This is the anchor for every other
  // pace in the module, so it is the number most worth pinning.
  const t = thresholdPaceFromRace(20 * 60, 5);
  assert.ok(t);
  assert.ok(t! > 250 && t! < 262, `threshold ${t}s/km outside 4:10-4:22`);
});

test("threshold pace is consistent across equivalent races", () => {
  const from5k = thresholdPaceFromRace(20 * 60, 5)!;
  const equivalent10k = riegel(20 * 60, 5, 10);
  const from10k = thresholdPaceFromRace(equivalent10k, 10)!;
  assert.ok(Math.abs(from5k - from10k) <= 1, `${from5k} vs ${from10k}`);
});

test("thresholdPaceFromBenchmarks prefers the longest race available", () => {
  // The 10k here is deliberately much stronger than the 1500m. If the longest
  // race wins, the derived threshold matches the 10k.
  const metrics = { run_1500m_min: 6, run_10k_min: 40 };
  const got = thresholdPaceFromBenchmarks(metrics);
  assert.equal(got, thresholdPaceFromRace(40 * 60, 10));
  assert.notEqual(got, thresholdPaceFromRace(6 * 60, 1.5));
});

test("thresholdPaceFromBenchmarks handles nothing to work with", () => {
  assert.equal(thresholdPaceFromBenchmarks(null), null);
  assert.equal(thresholdPaceFromBenchmarks({}), null);
  assert.equal(thresholdPaceFromBenchmarks({ squat_1rm: 140 }), null);
  assert.equal(thresholdPaceFromBenchmarks({ run_5k_min: 0 }), null);
});

test("pace zones bracket threshold and get faster as the zone rises", () => {
  const t = 255;
  const z = paceZones(t);
  const z4 = z.find((r) => r.zone === 4)!;
  assert.ok(z4.fastSecPerKm <= t && z4.slowSecPerKm >= t, "threshold pace should sit inside zone 4");
  // Easy running is meaningfully slower than threshold — this is the number
  // runners most often get wrong, so it is worth asserting the direction.
  const z2 = z.find((r) => r.zone === 2)!;
  assert.ok(z2.fastSecPerKm > t, "zone 2 must be slower than threshold");
  assert.ok(repPace(t).fastSecPerKm < z.find((r) => r.zone === 5)!.fastSecPerKm, "rep pace is faster than VO2");
});

test("formatPace renders mm:ss and converts to miles", () => {
  assert.equal(formatPace(255), "4:15");
  assert.equal(formatPace(300), "5:00");
  assert.equal(formatPace(65), "1:05");
  assert.equal(formatPace(0), "–");
  // A mile is longer, so the per-mile pace is a bigger number.
  assert.equal(formatPace(255, "mile"), "6:50");
});

test("parsePace round-trips and rejects junk", () => {
  assert.equal(parsePace("4:15"), 255);
  assert.equal(parsePace(" 4:15/km "), 255);
  assert.equal(parsePace("6:50/mi"), 255);
  assert.equal(parsePace("4:60"), null); // 60 seconds isn't a time
  assert.equal(parsePace("415"), null);
  assert.equal(parsePace(""), null);
});

test("formatPaceRange reads fastest-first", () => {
  const z = paceZones(255).find((r) => r.zone === 2)!;
  assert.equal(formatPaceRange(z), `${formatPace(z.fastSecPerKm)}–${formatPace(z.slowSecPerKm)}`);
});

// --- Run types ---------------------------------------------------------------

test("every run type is complete and internally consistent", () => {
  for (const r of RUN_TYPES) {
    assert.ok(r.label && r.purpose && r.howTo && r.watchFor, `${r.id} missing copy`);
    assert.ok(r.zones.length > 0, `${r.id} has no zones`);
    assert.ok(r.zones.includes(r.primaryZone), `${r.id} primary zone not among its zones`);
    assert.ok(r.minutes[0] <= r.minutes[1], `${r.id} minute range inverted`);
    assert.ok(r.recoveryDays >= 0 && r.recoveryDays <= 3, `${r.id} implausible recovery`);
    assert.ok(r.hardFraction >= 0 && r.hardFraction <= 1, `${r.id} hardFraction out of range`);
    // The two flags have to agree, or the week builder and the 80/20 report
    // disagree about the same session.
    assert.equal(r.hardFraction > 0, r.hard, `${r.id}: hard flag and hardFraction disagree`);
  }
});

test("run type ids are unique", () => {
  assert.equal(new Set(RUN_TYPES.map((r) => r.id)).size, RUN_TYPES.length);
});

test("the easy end of the catalogue is not marked hard", () => {
  // These four are what fills 80% of a week. If any of them counts as hard,
  // buildRunWeek's budget maths is wrong and every plan gets too easy.
  for (const id of ["recovery", "easy", "long", "shakeout"] as RunTypeId[]) {
    assert.equal(isHardRun(id), false, `${id} should not be hard`);
  }
  // Strides are fast but too short to cost anything — the distinction the
  // `hard` flag exists to make.
  assert.equal(isHardRun("strides"), false);
  assert.equal(runType("strides")!.primaryZone, 5);
});

test("the sessions that need recovery are marked hard", () => {
  for (const id of ["tempo", "vo2", "reps", "hills", "cruise"] as RunTypeId[]) {
    assert.equal(isHardRun(id), true, `${id} should be hard`);
  }
  assert.ok(HARD_RUN_TYPES.length >= 5);
});

test("runType returns null for an unknown id instead of throwing", () => {
  assert.equal(runType("nonsense" as RunTypeId), null);
  assert.equal(isHardRun("nonsense" as RunTypeId), false);
});

/**
 * THE LIST IN THE DATABASE AND THE LIST IN THE CODE ARE ONE LIST.
 *
 * `training_logs_run_type_check` enumerates the run type ids. The dropdown on
 * the check-in is built from RUN_TYPES. When 'incline' was added to RUN_TYPES
 * and not to the constraint, it became selectable and unsaveable — a run type
 * you could pick and then lose, with a database error for an explanation.
 *
 * This reads the migrations rather than restating the list, so it fails when
 * they drift instead of when somebody remembers to update a copy.
 */
test("every run type the app offers is allowed by the database", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const dir = new URL("../supabase/migrations/", import.meta.url).pathname;

  // The last migration that defines the constraint wins — 0084 replaces 0064's.
  let allowed: Set<string> | null = null;
  for (const file of readdirSync(dir).sort()) {
    const sql = readFileSync(dir + file, "utf8");
    const m = /add constraint training_logs_run_type_check\s+check\s*\([^)]*run_type in \(([^)]*)\)/i.exec(sql);
    // [a-z0-9_], with the digit: 'vo2' is a run type id, and a pattern without
    // it drops exactly one entry and still parses a plausible-looking list.
    if (m) allowed = new Set([...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]));
  }

  assert.ok(allowed, "no migration defines training_logs_run_type_check — did it get renamed?");
  assert.equal(allowed!.size, RUN_TYPES.length,
    `parsed ${allowed!.size} ids against ${RUN_TYPES.length} run types — check the regex before the schema`);
  for (const r of RUN_TYPES) {
    assert.ok(allowed!.has(r.id), `run type '${r.id}' is offered in the app but rejected by the database`);
  }
});

// --- Interval sessions -------------------------------------------------------

test("interval shapes are ordered and plausible", () => {
  for (const r of RUN_TYPES) {
    if (!r.interval) continue;
    const { reps, seconds, recovery } = r.interval;
    assert.ok(reps[0] <= reps[1] && reps[0] >= 1, `${r.id} rep range`);
    assert.ok(seconds[0] <= seconds[1] && seconds[0] > 0, `${r.id} effort range`);
    if (recovery) assert.ok(recovery[0] <= recovery[1] && recovery[0] >= 0, `${r.id} recovery range`);
    // The work has to fit inside the session it belongs to.
    const workMin = (reps[1] * seconds[1]) / 60;
    assert.ok(workMin <= r.minutes[1], `${r.id}: ${workMin} min of efforts inside a ${r.minutes[1]} min session`);
  }
});

test("the runs with no reps have no shape", () => {
  // Fartlek is the one worth pinning: it HAS surges, and the whole point is
  // that they're unplanned. Asking someone to count them would turn the only
  // unstructured session in the list into homework.
  for (const id of ["easy", "long", "recovery", "fartlek", "progression"] as RunTypeId[]) {
    assert.equal(runType(id)!.interval, undefined, `${id} should not prescribe reps`);
  }
});

/**
 * THE BUG THIS WHOLE THING EXISTS TO FIX.
 *
 * Session load is duration x intensity, and people rate an interval session by
 * how hard the REPS felt — so twelve minutes of efforts inside fifty minutes got
 * a 9, and the session outscored a 90-minute long run. It should not.
 */
test("an interval session does not cost more than a long run", () => {
  const hills = intervalEffort({ intervals: 8, effortSeconds: 90, recoverySeconds: 120, totalMinutes: 50, type: "hills" })!;
  const byFeel = 50 * 9;
  const derived = 50 * hills.intensity;
  assert.ok(derived < byFeel, `derived ${derived} should be under the by-feel ${byFeel}`);
  assert.ok(derived < 90 * 4, "a 50-minute hill session still outscores a 90-minute easy run");
});

test("more efforts is more work, and the old constant could not tell", () => {
  const small = intervalEffort({ intervals: 6, effortSeconds: 45, totalMinutes: 50, type: "hills" })!;
  const big = intervalEffort({ intervals: 12, effortSeconds: 90, totalMinutes: 50, type: "hills" })!;
  assert.ok(big.hardFraction > small.hardFraction * 3, "four times the work should not read as the same session");
  assert.ok(big.intensity > small.intensity);
  // And the type's flat estimate sat between them, matching neither.
  assert.equal(runType("hills")!.hardFraction, 0.2);
  assert.ok(small.hardFraction < 0.2 && big.hardFraction > 0.2);
});

test("recovery is counted between the efforts, not after the last one", () => {
  // 5 efforts have 4 gaps. Counting 5 inflates every session by one rest.
  const e = intervalEffort({ intervals: 5, effortSeconds: 60, recoverySeconds: 60, totalMinutes: 40, type: "vo2" })!;
  assert.equal(e.recoveryMinutes, 4);
});

test("a single continuous block has no recovery at all", () => {
  const tempo = intervalEffort({ intervals: 1, effortSeconds: 1800, recoverySeconds: 90, totalMinutes: 60, type: "tempo" })!;
  assert.equal(tempo.recoveryMinutes, 0, "one effort cannot have a gap between efforts");
  assert.equal(tempo.workMinutes, 30);
  assert.equal(tempo.hardFraction, 0.5);
});

test("short rests score higher than full recovery", () => {
  // Same efforts, same session length. Cruise intervals off 60s keep the heart
  // rate up; rep work off 3 minutes does not, and that is the actual difference
  // between the two sessions.
  const short = intervalEffort({ intervals: 5, effortSeconds: 300, recoverySeconds: 60, totalMinutes: 70, zone: 4 })!;
  const full = intervalEffort({ intervals: 5, effortSeconds: 300, recoverySeconds: 600, totalMinutes: 70, zone: 4 })!;
  assert.equal(short.incompleteRecovery, true);
  assert.equal(full.incompleteRecovery, false);
  assert.ok(short.intensity >= full.intensity);
});

test("the zone the efforts were actually run at drives the intensity", () => {
  const z5 = intervalEffort({ intervals: 6, effortSeconds: 180, totalMinutes: 50, zone: 5 })!;
  const z3 = intervalEffort({ intervals: 6, effortSeconds: 180, totalMinutes: 50, zone: 3 })!;
  assert.ok(z5.intensity > z3.intensity, "an effort run easier should cost less");
});

test("a duration shorter than the work in it raises the duration, not the fraction", () => {
  // 8 x 3 min is 24 minutes. "20 minutes" is a mistyped duration, and the
  // efforts are the half worth trusting.
  const e = intervalEffort({ intervals: 8, effortSeconds: 180, totalMinutes: 20, type: "vo2" })!;
  assert.ok(e.hardFraction <= 1, `hardFraction was ${e.hardFraction}`);
  assert.equal(e.easyMinutes, 0);
  assert.equal(e.workMinutes, 24);
});

test("no duration means the session is the efforts and the rests", () => {
  const e = intervalEffort({ intervals: 8, effortSeconds: 90, recoverySeconds: 120, type: "hills" })!;
  assert.equal(e.workMinutes, 12);
  assert.equal(e.recoveryMinutes, 14);
  assert.equal(e.easyMinutes, 0);
});

test("intensity stays inside the 1-10 the slider uses", () => {
  const all = [
    intervalEffort({ intervals: 1, effortSeconds: 3600, totalMinutes: 60, zone: 5 })!,
    intervalEffort({ intervals: 2, effortSeconds: 20, totalMinutes: 120, zone: 1 })!,
  ];
  for (const e of all) assert.ok(e.intensity >= 1 && e.intensity <= 10, `intensity ${e.intensity}`);
});

test("nothing usable returns null rather than a zero-interval session", () => {
  // Absent is not zero: a run with no interval data must keep its old
  // behaviour everywhere, not be scored as having done no work.
  assert.equal(intervalEffort({}), null);
  assert.equal(intervalEffort({ intervals: 8, effortSeconds: null }), null);
  assert.equal(intervalEffort({ intervals: 0, effortSeconds: 90 }), null);
  assert.equal(intervalEffort({ intervals: -3, effortSeconds: 90 }), null);
  assert.equal(intervalEffort({ intervals: 8, effortSeconds: 0 }), null);
});

test("a mis-keyed effort length is refused rather than believed", () => {
  // "90" meaning 90 MINUTES in a seconds field would report 8 x 90 minutes of
  // threshold work and hand ACWR twenty times the athlete's real week — which
  // is the number that tells them to rest.
  assert.equal(intervalEffort({ intervals: 8, effortSeconds: 90 * 60 * 2, totalMinutes: 50 }), null);
  assert.equal(intervalEffort({ intervals: 500, effortSeconds: 60, totalMinutes: 50 }), null);
});

test("easyShare measures the session it was given over the average of its kind", () => {
  const flat = easyShare([{ type: "hills", minutes: 50 }])!;
  const small = easyShare([{ type: "hills", minutes: 50, intervals: 6, effortSeconds: 45 }])!;
  const big = easyShare([{ type: "hills", minutes: 50, intervals: 12, effortSeconds: 90 }])!;
  assert.ok(small.hardPct < flat.hardPct, "a short hill session should read easier than the type's average");
  assert.ok(big.hardPct > flat.hardPct, "a long one should read harder");
});

test("describeShape reads the way a runner says it", () => {
  assert.equal(describeShape(runType("hills")!.interval!), "6–10 × 45–90s off 60–120s");
  // "1 × 20:00" is how a spreadsheet writes a tempo run, not how anyone says it.
  assert.equal(describeShape(runType("tempo")!.interval!), "20:00–40:00 continuous");
  assert.equal(describeShape({ reps: [8, 8], seconds: [60, 60], recovery: null }), "8 × 60s");
});

test("formatEffort switches to mm:ss once seconds stop being readable", () => {
  assert.equal(formatEffort(45), "45s");
  assert.equal(formatEffort(90), "90s");
  assert.equal(formatEffort(120), "2:00");
  assert.equal(formatEffort(305), "5:05");
  assert.equal(formatEffort(0), "–");
});

test("a prescription can be pre-filled into a log", () => {
  const mid = shapeMidpoint(runType("hills")!.interval!);
  assert.equal(mid.intervals, 8);
  assert.ok(mid.effortSeconds >= 45 && mid.effortSeconds <= 90);
  assert.ok(mid.recoverySeconds! > 0);
  assert.equal(shapeMidpoint(runType("tempo")!.interval!).recoverySeconds, null);
});

// --- Week structure ----------------------------------------------------------

test("weekly volume grows by at most 10% and deloads on week 4", () => {
  const plan = weeklyVolumePlan(40);
  assert.equal(plan.length, 4);
  assert.equal(plan[0].targetKm, 40);
  assert.ok(plan[1].targetKm <= 40 * 1.1 + 0.01);
  assert.ok(plan[2].targetKm <= plan[1].targetKm * 1.1 + 0.01);
  assert.equal(plan[3].deload, true);
  assert.ok(plan[3].targetKm < plan[2].targetKm);
});

test("weekly volume from zero doesn't produce negatives or NaN", () => {
  for (const p of weeklyVolumePlan(0)) {
    assert.ok(p.targetKm >= 0 && isFinite(p.targetKm));
  }
});

test("a built week never exceeds the level's hard-session budget", () => {
  for (const level of ["beginner", "intermediate", "advanced"] as const) {
    const week = buildRunWeek({ weeklyKm: 50, daysPerWeek: 6, level });
    const hard = week.filter((s) => s.hard).length;
    assert.ok(hard <= MAX_HARD_SESSIONS[level], `${level}: ${hard} hard sessions`);
  }
});

test("hard days are never back to back", () => {
  const week = buildRunWeek({ weeklyKm: 60, daysPerWeek: 6, level: "advanced" });
  for (let i = 1; i < week.length; i++) {
    assert.ok(!(week[i].hard && week[i - 1].hard), `days ${i} and ${i + 1} are both hard`);
  }
});

test("a built week ends on the long run and respects the day count", () => {
  const week = buildRunWeek({ weeklyKm: 50, daysPerWeek: 5, level: "intermediate" });
  assert.equal(week.length, 5);
  assert.equal(week[week.length - 1].type, "long");
  assert.deepEqual(week.map((s) => s.day), [1, 2, 3, 4, 5]);
});

test("a built week is deterministic", () => {
  const a = buildRunWeek({ weeklyKm: 45, daysPerWeek: 5, level: "intermediate", week: 2 });
  const b = buildRunWeek({ weeklyKm: 45, daysPerWeek: 5, level: "intermediate", week: 2 });
  assert.deepEqual(a, b);
});

test("consecutive weeks rotate the hard session rather than repeating it", () => {
  const opts = { weeklyKm: 50, daysPerWeek: 5, level: "intermediate" as const };
  const w1 = buildRunWeek({ ...opts, week: 1 }).filter((s) => s.hard).map((s) => s.type);
  const w2 = buildRunWeek({ ...opts, week: 2 }).filter((s) => s.hard).map((s) => s.type);
  assert.notDeepEqual(w1, w2, "week 2 repeats week 1's hard sessions");
});

test("a three-day week can only hold one hard session", () => {
  const week = buildRunWeek({ weeklyKm: 25, daysPerWeek: 3, level: "advanced" });
  assert.ok(week.filter((s) => s.hard).length <= 1);
});

test("a one-day week is just the long run", () => {
  const week = buildRunWeek({ weeklyKm: 10, daysPerWeek: 1, level: "beginner" });
  assert.equal(week.length, 1);
  assert.equal(week[0].type, "long");
});

test("recoveryBias swaps the easy filler days for recovery runs", () => {
  const week = buildRunWeek({ weeklyKm: 40, daysPerWeek: 5, level: "intermediate", recoveryBias: true });
  const filler = week.filter((s) => !s.hard && s.type !== "long");
  assert.ok(filler.length > 0);
  assert.ok(filler.every((s) => s.type === "recovery"), "expected every filler day to be a recovery run");
});

test("a built week clears the 80/20 split", () => {
  const week = buildRunWeek({ weeklyKm: 50, daysPerWeek: 5, level: "intermediate" });
  const share = easyShare(week.map((s) => ({ type: s.type, km: s.km, minutes: s.minutes })));
  assert.ok(share);
  assert.ok(share!.meetsTarget, `plan is only ${share!.easyPct}% easy`);
});

test("easyShare calls out a week that is too hard", () => {
  const share = easyShare([
    { type: "vo2", minutes: 60 },
    { type: "tempo", minutes: 60 },
    { type: "easy", minutes: 40 },
  ]);
  assert.ok(share);
  assert.equal(share!.meetsTarget, false);
  assert.ok(share!.hardPct > (1 - EASY_SHARE_TARGET) * 100);
  assert.match(share!.note, /slowing the easy days down/);
});

test("easyShare weights by minutes, not session count", () => {
  // Three short easy runs and one very long threshold run. By session count
  // this is 75% easy; by time it is well under that. Time is the honest measure.
  const share = easyShare([
    { type: "easy", minutes: 10 },
    { type: "easy", minutes: 10 },
    { type: "easy", minutes: 10 },
    { type: "tempo", minutes: 120 },
  ]);
  assert.ok(share);
  assert.ok(share!.easyPct < 70, `got ${share!.easyPct}%, expected well below the 75% a session count would give`);
});

test("easyShare counts only the hard PART of a hard session", () => {
  // A single hour-long tempo run is about 25 minutes at threshold wrapped in
  // easy running. Counting the whole hour as hard reported 0% easy, which is
  // both wrong and the sort of wrong that makes someone train less.
  const share = easyShare([{ type: "tempo", minutes: 60 }]);
  assert.ok(share);
  assert.ok(share!.easyPct > 40, `an hour of tempo is not ${share!.easyPct}% easy`);
  assert.ok(share!.hardPct > 0, "…but it is not all easy either");

  // An equal number of minutes of VO2 work contains LESS time at intensity than
  // a tempo run, because the reps are short and the recoveries are not.
  const vo2 = easyShare([{ type: "vo2", minutes: 60 }])!;
  assert.ok(vo2.easyPct > share!.easyPct);
});

test("easyShare falls back to distance when minutes are missing", () => {
  const byKm = easyShare([{ type: "easy", km: 10 }, { type: "vo2", km: 10 }]);
  assert.ok(byKm, "distance alone should still produce an answer");
  // 10km at 6 min/km is 60 minutes, so this must agree with the minutes form.
  const byMinutes = easyShare([{ type: "easy", minutes: 60 }, { type: "vo2", minutes: 60 }])!;
  assert.equal(byKm!.easyPct, byMinutes.easyPct);
});

test("easyShare returns null on an empty week rather than 0%", () => {
  assert.equal(easyShare([]), null);
  assert.equal(easyShare([{ type: "easy", km: 0, minutes: 0 }]), null);
});

// --- The 4-week block --------------------------------------------------------

test("a run program is a real 4-week block", () => {
  const p = buildRunProgram({ weeklyKm: 40, daysPerWeek: 5, level: "intermediate", goalId: "10k" });
  assert.equal(p.weeks.length, 4);
  assert.deepEqual(p.weeks.map((w) => w.week), [1, 2, 3, 4]);
  assert.deepEqual(p.weeks.map((w) => w.theme), ["Base", "Build", "Peak", "Deload"]);
  for (const w of p.weeks) {
    assert.equal(w.sessions.length, 5);
    assert.ok(w.sessions.every((s) => s.drills.length === 1), "one run per day");
  }
});

test("the run program is assignable to the shared ProgramPlan shape", () => {
  // The whole point of matching ./engine's shape is that the calendar, the
  // workout player and session ticking work unchanged. If ProgramPlan gains a
  // required field this stops compiling, which is the intent — it should fail
  // here rather than render a hole on /coach.
  const plan: ProgramPlan = buildRunProgram({ weeklyKm: 30, daysPerWeek: 4, level: "beginner" });
  assert.ok(plan.weeks[0].sessions[0].drills[0].name);
  assert.equal(plan.goal, "endurance");
});

test("week 4 of a block is a genuine down week", () => {
  const p = buildRunProgram({ weeklyKm: 50, daysPerWeek: 5, level: "advanced" });
  const hardIn = (w: number) =>
    p.weeks[w].sessions.filter((s) => /Threshold|VO2|Cruise|repeat|Fartlek|Steady|Progression/i.test(s.title)).length;

  // One quality session, not none: a week with no intensity leaves people flat
  // rather than fresh. The volume drop is what does the recovering.
  assert.equal(hardIn(3), 1, "the deload week should keep exactly one hard session");
  assert.ok(hardIn(1) > 1, "…and the build week should carry more");

  const km = (w: number) => Number(/([\d.]+)km target/.exec(p.weeks[w].focusNote)![1]);
  assert.ok(km(3) < km(2), "deload volume must actually come down");
});

test("each block picks up above the last", () => {
  const one = buildRunProgram({ weeklyKm: 40, daysPerWeek: 5, level: "intermediate", block: 1 });
  const two = buildRunProgram({ weeklyKm: 40, daysPerWeek: 5, level: "intermediate", block: 2 });
  const km = (p: typeof one) => Number(/([\d.]+)km target/.exec(p.weeks[0].focusNote)![1]);
  assert.ok(km(two) > km(one), `block 2 (${km(two)}) should exceed block 1 (${km(one)})`);
  assert.equal(two.block, 2);
});

test("a race goal changes which hard sessions appear", () => {
  const opts = { weeklyKm: 50, daysPerWeek: 5, level: "advanced" as const };
  const titles = (goalId: string) =>
    buildRunProgram({ ...opts, goalId }).weeks.flatMap((w) => w.sessions.map((s) => s.title)).join(" ");
  // A 5k block leads with VO2 work; a marathon block leads with marathon effort.
  assert.match(titles("5k"), /VO2/);
  assert.match(titles("marathon"), /Steady/);
  assert.doesNotMatch(titles("marathon"), /VO2/);
});

test("prescriptions carry real paces once a threshold is known", () => {
  const withPace = buildRunProgram({
    weeklyKm: 40, daysPerWeek: 4, level: "intermediate", thresholdSecPerKm: 255,
  });
  const withoutPace = buildRunProgram({ weeklyKm: 40, daysPerWeek: 4, level: "intermediate" });

  const first = (p: typeof withPace) => p.weeks[0].sessions[0].drills[0].prescription!;
  assert.match(first(withPace), /\d+:\d\d–\d+:\d\d\/km/, "expected a pace range");
  assert.doesNotMatch(first(withoutPace), /\/km/);
  // Both must still name the zone — that's the part that works without a watch.
  assert.match(first(withPace), /Zone \d/);
  assert.match(first(withoutPace), /Zone \d/);
});

test("the program explains itself honestly when it has no paces", () => {
  const p = buildRunProgram({ weeklyKm: 40, daysPerWeek: 4, level: "intermediate" });
  assert.ok(p.constraints.some((c) => /Log a 5k or 10k/.test(c)));
  assert.ok(p.constraints.some((c) => /80% of the running is easy/.test(c)));
});

test("building a program is deterministic", () => {
  const a = buildRunProgram({ weeklyKm: 44, daysPerWeek: 5, level: "intermediate", goalId: "half", block: 2 });
  const b = buildRunProgram({ weeklyKm: 44, daysPerWeek: 5, level: "intermediate", goalId: "half", block: 2 });
  assert.deepEqual(a, b);
});

test("an unknown race goal falls back rather than throwing", () => {
  const p = buildRunProgram({ weeklyKm: 30, daysPerWeek: 4, level: "beginner", goalId: "ultra-moon-marathon" });
  assert.equal(p.weeks.length, 4);
});
