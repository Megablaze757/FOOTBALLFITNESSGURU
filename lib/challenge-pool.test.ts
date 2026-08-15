import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CHALLENGE_POOL, pickChallenges, scoreTemplate, toChallenge,
  type ChallengeTemplate, type ChallengeWindow,
} from "./challenge-pool";
import { CHALLENGE_METRICS, EMPTY_WEEK, evaluateChallenge, type WeekActivity } from "./challenges";
import { positionsForSport, GOALS } from "./coach";
import { SPORTS } from "./exercises";

const ctxFor = (over: Partial<Parameters<typeof pickChallenges>[0]> = {}) => ({
  window: "weekly" as ChallengeWindow, week: EMPTY_WEEK, seed: 0, ...over,
});

test("the pool is actually a pool", () => {
  assert.ok(CHALLENGE_POOL.length >= 120, `only ${CHALLENGE_POOL.length} templates`);
  const daily = CHALLENGE_POOL.filter((t) => t.window === "daily");
  const weekly = CHALLENGE_POOL.filter((t) => t.window === "weekly");
  assert.ok(daily.length >= 24, `only ${daily.length} daily`);
  assert.ok(weekly.length >= 90, `only ${weekly.length} weekly`);

  // Spread, not just size. A pool of 136 that is 100 training-session targets
  // is one challenge with 100 names, and the distinct-metric rule means only
  // one of them can ever be on the board at a time.
  const perMetric = new Map<string, number>();
  for (const t of CHALLENGE_POOL) perMetric.set(t.metric, (perMetric.get(t.metric) ?? 0) + 1);
  assert.ok(perMetric.size >= 9, `only ${perMetric.size} metrics represented`);
  const biggest = Math.max(...perMetric.values());
  assert.ok(biggest < CHALLENGE_POOL.length / 3,
    `one metric holds ${biggest} of ${CHALLENGE_POOL.length} templates`);
});

test("ids are unique and every metric is one the app can count", () => {
  const ids = CHALLENGE_POOL.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate template id");
  for (const t of CHALLENGE_POOL) {
    assert.ok(CHALLENGE_METRICS.includes(t.metric), `${t.id} measures "${t.metric}", which nothing tracks`);
    assert.ok(t.target >= 1, `${t.id} has target ${t.target}`);
    assert.ok(t.title.length > 3 && t.blurb.length > 20, `${t.id} is thin`);
    assert.ok(t.icon.length > 0, `${t.id} has no icon`);
  }
});

/**
 * A CHALLENGE NOBODY CAN COMPLETE IS WORSE THAN ONE FEWER CHALLENGE — the rule
 * lib/challenges opens with, applied to the written pool as well as to model
 * output. Every metric must be a real field on WeekActivity, or the evaluator
 * reads `undefined`, scores 0 forever, and the card sits there permanently
 * unearned.
 */
test("every challenge in the pool can actually be completed", () => {
  const maxed: WeekActivity = {
    check_ins: 7, training_sessions: 7, nutrition_logs: 7,
    benchmarks: 7, videos: 7, streak: 60, rest_days: 7, perfect_days: 7,
    calorie_goal_days: 7, easy_sessions: 7,
  };
  const stuck: string[] = [];
  for (const t of CHALLENGE_POOL) {
    const c = toChallenge(t);
    if (!evaluateChallenge(c, maxed).complete) stuck.push(`${t.id} (${t.metric} ${c.target})`);
  }
  assert.deepEqual(stuck, [], "these can never be finished, however good the week");
});

/**
 * And a daily one has to be finishable IN A DAY. Targets are clamped against a
 * week, so a daily template asking for 5 of something is a card that reads as
 * failed every single evening.
 */
test("daily challenges fit inside a day", () => {
  const tooBig = CHALLENGE_POOL
    .filter((t) => t.window === "daily" && toChallenge(t).target > 1)
    .map((t) => `${t.id}: ${toChallenge(t).target}`);
  assert.deepEqual(tooBig, [], "a day holds one of each of these, not several");
});

test("every athlete gets a full set, whoever they are", () => {
  const thin: string[] = [];
  for (const sport of SPORTS) {
    for (const position of [...positionsForSport(sport.id), undefined]) {
      for (const goal of [...GOALS.map((g) => g.id), null]) {
        for (const window of ["daily", "weekly"] as ChallengeWindow[]) {
          const want = window === "daily" ? 2 : 3;
          const got = pickChallenges(ctxFor({ sport: sport.id, position, goal, window, count: want }));
          if (got.length < want) thin.push(`${sport.id}/${position ?? "-"}/${goal ?? "-"}/${window}: ${got.length}`);
        }
      }
    }
  }
  assert.deepEqual(thin.slice(0, 10), [], `${thin.length} combinations came up short`);
});

/**
 * THE ENGINE HAS TO ACTUALLY READ THE POSITION, or this is a pool with a
 * decorative filter on it — the same mistake the programme engine made, where
 * `position` was read to pick a ball drill and to print a name and nowhere else.
 */
test("a position changes what you are asked to do", () => {
  const names = (position: string) =>
    pickChallenges(ctxFor({ sport: "football", goal: "speed", position, count: 3 })).map((c) => c.id);
  const keeper = names("Goalkeeper");
  const mid = names("Central mid");
  assert.notDeepEqual(keeper, mid, "a goalkeeper and a central midfielder got the same three");

  // And the position-specific ones reach the position they were written for.
  const keeperIds = new Set(keeper);
  assert.ok(
    CHALLENGE_POOL.some((t) => t.positions?.includes("Goalkeeper") && keeperIds.has(t.id)),
    "nothing written for a keeper was picked for a keeper"
  );
});

test("a challenge written for one position never reaches another", () => {
  const leaks: string[] = [];
  for (const sport of SPORTS) {
    for (const position of positionsForSport(sport.id)) {
      for (const window of ["daily", "weekly"] as ChallengeWindow[]) {
        const picked = pickChallenges(ctxFor({ sport: sport.id, position, window, count: 5 }));
        for (const c of picked) {
          const t = CHALLENGE_POOL.find((x) => x.id === c.id)!;
          if (t.positions && !t.positions.includes(position)) leaks.push(`${position} got ${t.id}`);
          if (t.sports && !t.sports.includes(sport.id)) leaks.push(`${sport.id} got ${t.id}`);
        }
      }
    }
  }
  assert.deepEqual(leaks, []);
});

test("a goal-specific challenge never reaches the wrong goal", () => {
  const leaks: string[] = [];
  for (const goal of GOALS.map((g) => g.id)) {
    for (const c of pickChallenges(ctxFor({ goal, count: 5 }))) {
      const t = CHALLENGE_POOL.find((x) => x.id === c.id)!;
      if (t.goals && !t.goals.includes(goal)) leaks.push(`${goal} got ${t.id}`);
    }
  }
  assert.deepEqual(leaks, []);
});

/**
 * AIM AT THE GAP. The point of a challenge is to move something — handing "log
 * your food five days" to someone already logging seven is a tick-box, not a
 * challenge.
 */
/**
 * THE INVARIANT THAT REPLACED "AIM AT THE GAP".
 *
 * Selection used to score every template by how far the athlete was from its
 * target, and dock 12 points from anything already finished. Both sound right.
 * Together they made the feature unwinnable, because the board is rebuilt from
 * current activity on every page load: doing any of the work dropped that
 * challenge below the ones you had not touched, so it left the board and took
 * its XP with it. Measured on a board that opened the week with "train twice",
 * a SINGLE session replaced all three cards.
 *
 * So the board is now fixed for its period. These two tests are the old ones,
 * inverted — they used to assert the board moves with your activity, and they
 * now assert it cannot.
 */
test("progress on a challenge never changes the board", () => {
  const base = { sport: "football" as const, position: "Goalkeeper", count: 3 };
  const start = pickChallenges(ctxFor({ ...base, week: { ...EMPTY_WEEK } }));
  const card = start.find((c) => c.metric === "training_sessions");

  // Every level of progress on every metric on the board, including past the
  // target — the set of questions must be identical each time.
  for (const metric of start.map((c) => c.metric)) {
    for (const n of [1, 2, 3, 5, 7, 12]) {
      const later = pickChallenges(ctxFor({ ...base, week: { ...EMPTY_WEEK, [metric]: n } }));
      assert.deepEqual(later.map((c) => c.id), start.map((c) => c.id),
        `doing ${n} of "${metric}" changed the board from [${start.map((c) => c.id)}] to [${later.map((c) => c.id)}]`);
    }
  }

  // And the specific report: three sessions, and the training card is still
  // there to be completed and paid.
  if (card) {
    const after = pickChallenges(ctxFor({ ...base, week: { ...EMPTY_WEEK, training_sessions: 3 } }));
    assert.ok(after.some((c) => c.id === card.id),
      "the training challenge vanished once the training was done");
  }
});

/**
 * WHAT THE OLD SCORING WAS HIDING.
 *
 * Rotation ran over the top ten TEMPLATES and the board then discarded anything
 * sharing a metric with an earlier pick. For an athlete with no sport, goal or
 * position every generic template scored the same, so the sort fell back to
 * alphabetical by id — and the top ten ids were three benchmark variants, four
 * calorie variants and three check-in variants. Ten templates, three metrics.
 *
 * training_sessions ranked THIRTY-FIRST, with 26 templates in the pool, more
 * than any other metric. It could never be offered to a general athlete. Nor
 * could rest days, videos, streaks, perfect days or food logging.
 */
test("every metric can actually reach a general athlete's board", () => {
  const seen = new Set<string>();
  for (let seed = 0; seed < 40; seed++) {
    for (const c of pickChallenges(ctxFor({ week: { ...EMPTY_WEEK }, seed, count: 3 }))) {
      seen.add(c.metric);
    }
  }
  const reachable = [...new Set(CHALLENGE_POOL.filter((t) => t.window === "weekly" && !t.sports && !t.goals && !t.positions && !t.focus).map((t) => t.metric))];
  const missing = reachable.filter((m) => !seen.has(m));
  assert.deepEqual(missing, [],
    `these metrics have generic weekly templates that no rotation can ever reach: ${missing.join(", ")}`);
  assert.ok(seen.has("training_sessions"),
    "a fitness app never offers a training challenge, which is how this was found");
});

test("three challenges are three different things", () => {
  for (const window of ["daily", "weekly"] as ChallengeWindow[]) {
    const picked = pickChallenges(ctxFor({ window, count: 3, sport: "rugby", position: "Prop" }));
    const metrics = picked.map((c) => c.metric);
    assert.equal(new Set(metrics).size, metrics.length, `${window}: ${metrics.join(", ")}`);
  }
});

/**
 * Deterministic. A board that reshuffles on every page load is not a board, and
 * it is the first thing anyone notices.
 */
test("the same athlete in the same week gets the same set", () => {
  const a = pickChallenges(ctxFor({ sport: "rugby", position: "Flanker", goal: "speed", seed: 12 }));
  const b = pickChallenges(ctxFor({ sport: "rugby", position: "Flanker", goal: "speed", seed: 12 }));
  assert.deepEqual(a, b);
});

test("but it moves on from week to week", () => {
  const sets = [0, 1, 2, 3].map((seed) =>
    pickChallenges(ctxFor({ sport: "football", position: "Winger", seed })).map((c) => c.id).join()
  );
  assert.ok(new Set(sets).size > 1, "four consecutive weeks served the identical three");
});

test("an athlete with no sport, position or goal still gets challenges", () => {
  for (const window of ["daily", "weekly"] as ChallengeWindow[]) {
    const picked = pickChallenges(ctxFor({ window, count: 3 }));
    assert.ok(picked.length >= (window === "daily" ? 2 : 3), `${window}: ${picked.length}`);
  }
});

test("scoring refuses a template that is not for this athlete", () => {
  for (const window of ["daily", "weekly"] as ChallengeWindow[]) {
    const gk = CHALLENGE_POOL.find((t) => t.window === window && t.positions?.includes("Goalkeeper"))!;
    assert.ok(gk, `no ${window} goalkeeper template to test with`);
    const fits = { window, sport: "football" as const, position: "Goalkeeper" };
    assert.notEqual(scoreTemplate(gk, ctxFor(fits)), null, `${gk.id} refused its own keeper`);
    // Each filter refused on its own, so one of them passing cannot hide the rest.
    assert.equal(scoreTemplate(gk, ctxFor({ ...fits, position: "Striker" })), null, "wrong position");
    assert.equal(scoreTemplate(gk, ctxFor({ ...fits, sport: "rugby" })), null, "wrong sport");
    assert.equal(scoreTemplate(gk, ctxFor({ ...fits, position: null })), null, "no position at all");
    // Wrong window too, or a daily card fills with weekly targets.
    const other: ChallengeWindow = window === "daily" ? "weekly" : "daily";
    assert.equal(scoreTemplate(gk, ctxFor({ ...fits, window: other })), null, "wrong window");
  }
  // And a goal-tagged template is refused when the goal is absent, not just wrong.
  const goalOnly = CHALLENGE_POOL.find((t) => t.goals && !t.positions && !t.sports)!;
  assert.equal(scoreTemplate(goalOnly, ctxFor({ window: goalOnly.window, goal: null })), null);
});

test("XP scales with how much work the challenge is", () => {
  for (const t of CHALLENGE_POOL) {
    const c = toChallenge(t);
    assert.ok(c.xp > 0, `${t.id} pays nothing`);
    assert.ok(c.xp <= 500, `${t.id} pays ${c.xp}, which would outrun the level curve`);
  }
});

/**
 * The app tells people to back off — ACWR flags load spikes, readiness calls a
 * Red day, every block has a deload. The challenge board is the loudest voice
 * in the app and it must not argue with that.
 */
test("the board pays for recovery, not only for accumulation", () => {
  const recovery = CHALLENGE_POOL.filter((t) => t.metric === "rest_days" || t.metric === "easy_sessions");
  assert.ok(recovery.length >= 6, `only ${recovery.length} challenges reward backing off`);
  assert.ok(recovery.some((t) => t.window === "daily"), "no daily challenge rewards resting");
});

/**
 * THE BUG THIS EXISTS TO STOP RECURRING.
 *
 * `WeekActivity` and `ActivityStats` are both bags of numbers with overlapping
 * names, and the rewards page builds both from the same queries a few lines
 * apart. So `benchmarks: stats.benchmarks` typechecks perfectly and is wrong:
 * ActivityStats.benchmarks is the LIFETIME count, and feeding it to a weekly
 * challenge made "one benchmark test this week" read as already complete for
 * anyone who had ever recorded one. With the completed-challenge penalty in the
 * selector, that turned into a permanent exclusion — those athletes would never
 * be offered the challenge again.
 *
 * Nothing in the type system can catch that, so the guard reads the page.
 */
test("the rewards page never feeds a lifetime total to a weekly challenge", () => {
  const src = readFileSync(new URL("../app/(app)/rewards/page.tsx", import.meta.url), "utf8");
  const start = src.indexOf("): WeekActivity => ({");
  assert.ok(start > 0, "the week is not built where this guard expects it");
  // Comments stripped first: the block explains which fields it is deliberately
  // NOT using, and a guard that trips over its own documentation gets deleted.
  const block = src.slice(start, src.indexOf("});", start))
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  // Every ActivityStats field that counts all of history, not the window.
  const LIFETIME = [
    "checkIns", "trainingSessions", "completedSessions", "completedBlocks",
    "benchmarks", "videos", "nutritionLogs", "restDaysLogged", "longestStreak", "weeksActive",
  ];
  const used = LIFETIME.filter((f) => new RegExp(`stats\\.${f}\\b`).test(block));
  assert.deepEqual(used, [], "these are lifetime counts being passed off as this week's");

  // `streak` is the one legitimate carry-over — a running total means the same
  // thing in both windows. Asserted positively so the guard fails loudly if the
  // block moves, rather than silently passing over source it is no longer reading.
  assert.ok(/stats\.streak\b/.test(block), "streak should still come from stats");
  // And `perfectDaysLast7` must NOT be here: it is fixed to a 7-day window, so
  // the daily board would read the week's complete days as today's.
  assert.ok(!/stats\.perfectDaysLast7\b/.test(block),
    "perfect days must come from the date list, or the daily window is wrong");
});

/**
 * EVERY POSITION HAS SOMETHING OF ITS OWN. The complaint that started the
 * position work was that a prop's programme was identical to a flanker's, and a
 * challenge board that says the same thing to both would be the same failure in
 * a different place. Sport-level templates are the backbone; this is about
 * whether anyone was left with nothing but the backbone.
 */
test("no position was left without a challenge written for it", () => {
  const named = new Set<string>();
  for (const t of CHALLENGE_POOL) for (const p of t.positions ?? []) named.add(p);
  const gaps: string[] = [];
  for (const sport of SPORTS) {
    for (const p of positionsForSport(sport.id)) if (!named.has(p)) gaps.push(`${sport.id}/${p}`);
  }
  assert.deepEqual(gaps, [], "these positions only ever see the generic pool");
});

test("two positions in the same sport do not get the same board", () => {
  const same: string[] = [];
  for (const sport of SPORTS) {
    const positions = positionsForSport(sport.id);
    const boards = new Map<string, string>();
    for (const p of positions) {
      const key = pickChallenges(ctxFor({ sport: sport.id, position: p, count: 3 })).map((c) => c.id).join();
      const twin = boards.get(key);
      if (twin) same.push(`${sport.id}: ${twin} and ${p}`);
      else boards.set(key, p);
    }
  }
  // Some overlap is honest — a 5k runner and a 10k runner really do want the
  // same things — so this allows a little, but not a sport where position is
  // decorative. Anything above a third identical means the filter is not biting.
  const total = SPORTS.reduce((n, s) => n + positionsForSport(s.id).length, 0);
  assert.ok(same.length * 3 < total, `${same.length} of ${total} positions share a board: ${same.join("; ")}`);
});

/**
 * A DAILY CARD IS SCORED AGAINST TODAY, NOT AGAINST THE WEEK.
 *
 * Both boards were handed the same seven-day counters, and the daily one was
 * worthless that way — "take the rest day" rendered 4/1 and complete on a
 * Tuesday morning, because four rest days had happened somewhere in the
 * previous seven. A card that is already ticked before you get out of bed is a
 * receipt, not a challenge. Found by rendering the page, not by a unit test,
 * which is why there is now a unit test.
 */
test("a busy week does not tick off today's card", () => {
  const busyWeek: WeekActivity = {
    check_ins: 7, training_sessions: 5, nutrition_logs: 6, benchmarks: 2, videos: 2,
    streak: 30, rest_days: 4, perfect_days: 3, calorie_goal_days: 5, easy_sessions: 3,
  };
  // Nothing done yet today, which is what a morning looks like.
  const freshDay = EMPTY_WEEK;

  const scoredOnTheWeek = pickChallenges(ctxFor({ window: "daily", week: busyWeek, count: 2 }));
  const scoredOnToday = pickChallenges(ctxFor({ window: "daily", week: freshDay, count: 2 }));

  const doneAlready = (list: typeof scoredOnToday, w: WeekActivity) =>
    list.filter((c) => (w[c.metric] ?? 0) >= c.target).length;

  // The bug, stated: pass the week to a daily board and its cards read complete.
  assert.ok(doneAlready(scoredOnTheWeek, busyWeek) > 0,
    "this assertion documents the failure mode — if it stops holding, the metrics changed");
  // The fix: scored against today, nothing is complete before the day starts.
  assert.equal(doneAlready(scoredOnToday, freshDay), 0, "today's card was pre-ticked");
});

/**
 * The page has to hand `boardsFor` the two windows the right way round.
 *
 * `week` and `today` are the same type, so transposing them typechecks and puts
 * every daily card back to arriving pre-ticked. The arguments are named for
 * that reason — this checks the names are actually used, and used correctly,
 * since `{ week: today, today: week }` is still writable.
 */
test("the rewards page builds the boards from the right windows", () => {
  const src = readFileSync(new URL("../app/(app)/rewards/page.tsx", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const call = src.match(/boardsFor\(\{[^}]*\}\)/);
  assert.ok(call, "boardsFor is not called where this guard expects it");
  // Shorthand (`week,`) is safe by definition; the explicit form has to name
  // the right variable. Both accepted, a transposition caught either way.
  const weekOk = /[{,]\s*week\s*[,}]/.test(call[0]) || /week:\s*week\b/.test(call[0]);
  const todayOk = /today:\s*todayActivity\b/.test(call[0]) || /[{,]\s*today\s*[,}]/.test(call[0]);
  assert.ok(weekOk, `the week window is not the week: ${call[0]}`);
  assert.ok(todayOk, `the daily window is not today: ${call[0]}`);
});

/**
 * A MISSPELLED POSITION IS A TEMPLATE NOBODY EVER SEES.
 *
 * `positions` is matched by exact string against POSITIONS_BY_SPORT, so
 * "Goalkeepr" does not throw, does not fail to compile, and does not show up in
 * any other test — the template simply scores `null` for every athlete alive
 * and sits in the file looking like content. This was a live gap: an injected
 * typo went undetected because a SECOND keeper template covered for it, so the
 * keeper still got keeper challenges and every other guard stayed green.
 */
test("every position a template names is a real position", () => {
  const bySport = new Map(SPORTS.map((s) => [s.id, new Set(positionsForSport(s.id))]));
  const all = new Set([...bySport.values()].flatMap((set) => [...set]));

  const bogus: string[] = [];
  for (const t of CHALLENGE_POOL) {
    for (const p of t.positions ?? []) {
      if (!all.has(p)) { bogus.push(`${t.id} names "${p}", which no sport has`); continue; }
      // And it must belong to a sport the template is FOR, or it is equally
      // unreachable: "Centre" exists in rugby and basketball, so a template
      // tagged sports:["football"] with positions:["Centre"] matches nobody.
      if (t.sports && !t.sports.some((s) => bySport.get(s)?.has(p))) {
        bogus.push(`${t.id} names "${p}", which is not a ${t.sports.join("/")} position`);
      }
    }
  }
  assert.deepEqual(bogus, []);
});

/**
 * And the component must score each board against the activity that board was
 * PICKED with, never against anything handed to it separately — that pairing is
 * the entire reason `Board` carries its own activity.
 */
test("the challenge component scores each board against the window it picked", () => {
  const src = readFileSync(new URL("../components/WeeklyChallenges.tsx", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.ok(/evaluateChallenges\(board\.list,\s*board\.activity\)/.test(src),
    "a board is scored against something other than its own window");
  // And it must not be picking at all — one pick site, in the lib, or the page
  // awards XP for a set the athlete was never shown.
  assert.ok(!/pickChallenges\(/.test(src), "the component picks its own challenges again");
});

/**
 * THE CORE HABIT IS NOT LEFT TO A ROTATION.
 *
 * Rotating fairly over ten metrics moves the window by one per week, so any
 * one metric shows up three weeks in ten. For filming a set that is correct.
 * For training it means that seven weeks out of ten a TRAINING app asks an
 * athlete for everything except training — which, combined with the two bugs
 * above, is why three logged sessions could earn nothing at all.
 */
test("the weekly board always asks you to train", () => {
  for (let seed = 0; seed < 30; seed++) {
    const picked = pickChallenges(ctxFor({ week: { ...EMPTY_WEEK }, seed, count: 3 }));
    assert.ok(picked.some((c) => c.metric === "training_sessions"),
      `week ${seed} has no training challenge: ${picked.map((c) => c.metric).join(", ")}`);
    assert.equal(new Set(picked.map((c) => c.metric)).size, picked.length, "duplicate metric on the board");
  }
});

test("but the daily board is not pinned, so the two never say the same thing", () => {
  // Only two slots there; pinning one would leave a single rotating card and
  // both boards would open with the same question every single day.
  const dailyMetrics = new Set<string>();
  for (let seed = 0; seed < 30; seed++) {
    for (const c of pickChallenges(ctxFor({ window: "daily", week: { ...EMPTY_WEEK }, seed, count: 2 }))) {
      dailyMetrics.add(c.metric);
    }
  }
  assert.ok(dailyMetrics.size >= 5, `the daily board only ever shows ${dailyMetrics.size} metrics`);
});

test("the training target moves week to week", () => {
  const targets = new Set<number>();
  for (let seed = 0; seed < 20; seed++) {
    const c = pickChallenges(ctxFor({ week: { ...EMPTY_WEEK }, seed, count: 3 }))
      .find((x) => x.metric === "training_sessions");
    if (c) targets.add(c.target);
  }
  assert.ok(targets.size >= 3,
    `the pinned training slot always asks for the same thing: ${[...targets].join(", ")}`);
});
