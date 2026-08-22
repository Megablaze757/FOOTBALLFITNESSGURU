// Home's three numbers: which ones an athlete gets, and whether they are true.
//
// The bug this file mostly guards is "absent is not zero" — a lifter who never
// typed a weight has no tonnage, which is a different thing from having moved
// nothing, and leading their homepage with "0 kg" reads as a failed week.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { homeStats, primaryActivity } from "./home-stats";
import type { TrainingLog } from "./types";

let n = 0;
const log = (over: Partial<TrainingLog> = {}): TrainingLog => ({
  id: `t${n++}`,
  user_id: "u",
  log_date: "2026-08-20",
  drills: [],
  total_minutes: 60,
  intensity: 6,
  created_at: "2026-08-20T10:00:00Z",
  ...over,
} as TrainingLog);

const lift = (kg: number, sets = 5, reps = 5) =>
  log({ drills: [{ name: "Back squat", sets, reps, load_kg: kg }] as TrainingLog["drills"] });

test("an empty week and an empty week before it show nothing at all", () => {
  // Three zeros under a heading is worse than no card. Home has its own
  // first-run call to action for this case.
  assert.deepEqual(homeStats("football", []), []);
  assert.deepEqual(homeStats("football", [log({ session_type: "rest_day" })]), []);
});

test("a runner leads with distance and pace", () => {
  const week = [
    log({ distance_km: 10, run_seconds: 3000 }),
    log({ distance_km: 5, run_seconds: 1500 }),
  ];
  const keys = homeStats("running", week).map((s) => s.key);
  assert.deepEqual(keys, ["distance", "avgPace", "sessions"]);
  const [distance, pace] = homeStats("running", week);
  assert.equal(distance.value, "15.0 km");
  // 4500s over 15km is 300s/km.
  assert.equal(pace.value, "5:00/km");
});

test("a lifter leads with weight moved, in tonnes once it is big", () => {
  const week = [lift(100), lift(100)];
  const [top] = homeStats("weightlifting", week);
  assert.equal(top.key, "tonnage");
  // 2 sessions x 5 x 5 x 100kg = 5000kg.
  assert.equal(top.value, "5.0t");
});

test("a lifter who never typed a weight is not shown zero kilos", () => {
  // The whole "absent is not zero" family. No load on any drill means the app
  // does not know what they moved — so it shows what it does know instead.
  const week = [log(), log(), log()];
  const stats = homeStats("weightlifting", week);
  assert.ok(!stats.some((s) => s.key === "tonnage"), `tonnage was shown anyway: ${JSON.stringify(stats)}`);
  assert.equal(stats[0].key, "sessions");
  assert.equal(stats.length, 3);
});

test("what you actually do beats what you signed up as", () => {
  // Signed up for the gym, logged nothing but runs. Mileage is the honest
  // headline; the profile is the tie-break, not the answer.
  const runs = [log({ distance_km: 8, run_seconds: 2400 }), log({ distance_km: 6, run_seconds: 1800 }), log({ distance_km: 12, run_seconds: 3600 })];
  assert.equal(primaryActivity("gym", runs), "running");
  assert.equal(homeStats("gym", runs)[0].key, "distance");
});

test("one stray run does not re-label a footballer", () => {
  // A clear majority, not a plurality — switching someone's homepage away from
  // their stated sport on a minority of sessions is the app arguing with them.
  const week = [log({ distance_km: 5, run_seconds: 1500 }), log(), log(), log()];
  assert.equal(primaryActivity("football", week), "football");
});

test("two sessions is not enough evidence to re-label anyone", () => {
  const week = [log({ distance_km: 5 }), log({ distance_km: 5 })];
  assert.equal(primaryActivity("football", week), "football");
});

test("the comparison says faster and slower for pace, not more and less", () => {
  const week = [log({ distance_km: 10, run_seconds: 2700 })];      // 4:30/km
  const before = [log({ distance_km: 10, run_seconds: 3000 })];    // 5:00/km
  const pace = homeStats("running", week, before).find((s) => s.key === "avgPace")!;
  assert.match(pace.sub!, /faster than last week/);
  assert.equal(pace.trend, "down");
  // And down is the good direction, so nothing colours this as a decline.
  assert.equal(pace.goodWhen, "down");
});

test("a 5% deadband stops noise reading as a trend", () => {
  const week = [log({ distance_km: 32.1, run_seconds: 9630 })];
  const before = [log({ distance_km: 32, run_seconds: 9600 })];
  const distance = homeStats("running", week, before).find((s) => s.key === "distance")!;
  assert.equal(distance.trend, "flat");
  assert.equal(distance.sub, "Same as last week");
});

test("nothing to compare against says nothing", () => {
  // A first week has no previous week. "100% more than last week" from a base
  // of zero is arithmetic, not information.
  const [first] = homeStats("running", [log({ distance_km: 10, run_seconds: 3000 })]);
  assert.equal(first.sub, null);
  assert.equal(first.trend, null);
});

test("rest days count towards neither the totals nor the sessions", () => {
  const week = [log(), log({ session_type: "rest_day", total_minutes: 0 })];
  const sessions = homeStats("football", week).find((s) => s.key === "sessions")!;
  assert.equal(sessions.value, "1");
});

test("time reads as hours and minutes once there is an hour of it", () => {
  const week = [log({ total_minutes: 95 })];
  const time = homeStats("football", week).find((s) => s.key === "minutes")!;
  assert.equal(time.value, "1h 35m");
  const short = homeStats("football", [log({ total_minutes: 40 })]).find((s) => s.key === "minutes")!;
  assert.equal(short.value, "40m");
});

test("a rugby player gets contact, and only when there is any", () => {
  const withContact = homeStats("rugby", [log({ contact_minutes: 25 })]);
  const contact = withContact.find((s) => s.key === "contactLoad")!;
  assert.equal(contact.value, "25 min");
  // More contact is load to manage, not an achievement.
  assert.equal(contact.goodWhen, "either");
  const without = homeStats("rugby", [log()]);
  assert.ok(!without.some((s) => s.key === "contactLoad"));
  assert.equal(without.length, 3);
});

test("there are always three, or none", () => {
  for (const sport of ["football", "rugby", "basketball", "running", "weightlifting", "gym", "nonsense"]) {
    const stats = homeStats(sport, [log({ distance_km: 4, contact_minutes: 3, intensity: 9 }), lift(80)]);
    assert.equal(stats.length, 3, `${sport} produced ${stats.length}`);
    assert.equal(new Set(stats.map((s) => s.key)).size, 3, `${sport} repeated a stat`);
  }
});

// --- how Home renders them ---------------------------------------------------

test("Home no longer computes an XP level", () => {
  // The spec asked for stats relevant to what the athlete does, with the XP
  // removed. Both halves matter: a rank badge and "480 XP to go" is a number
  // about USING THE APP, on the screen you open to find out how your training
  // is going. It has a page of its own, one tap away on Performance.
  const home = readFileSync(new URL("../app/(app)/home/page.tsx", import.meta.url), "utf8");
  // Comments stripped first. The note explaining WHY the XP machinery went
  // names the functions it removed, and a test that trips on its own
  // explanation is a test that punishes writing one.
  const code = home.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  for (const gone of ["levelFor", "computeXp", "fetchXpExtras", "challengeXp"]) {
    assert.ok(!code.includes(gone), `Home still computes ${gone}`);
  }
  assert.ok(home.includes("<HomeStats"), "Home does not render the stats that replaced it");
});

test("the daily card no longer prices the day in XP", () => {
  const card = readFileSync(new URL("../components/TodayCard.tsx", import.meta.url), "utf8");
  const body = card.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  assert.ok(!/\+\{q\.xp\}/.test(body), "the day's rows still carry a +XP badge");
  assert.ok(!/RankBadge/.test(body), "the day's card still closes on a rank");
});

test("the ladder heartbeat survives the rank coming off Home", () => {
  // record_ladder_standing is a WRITE, not a read: it recomputes the athlete's
  // position server-side and records that they held it today, which is what the
  // Elite and Apex badges count. Home is the page people open daily, so
  // dropping it with the rank would leave those badges accruing only on the
  // days somebody happened to visit Rewards.
  const home = readFileSync(new URL("../app/(app)/home/page.tsx", import.meta.url), "utf8");
  assert.ok(home.includes("record_ladder_standing"), "the days-held counter has no daily heartbeat any more");
});
