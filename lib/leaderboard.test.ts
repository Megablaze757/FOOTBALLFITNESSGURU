import { test } from "node:test";
import assert from "node:assert/strict";
import { BOARDS, rankBoard, placeOf, type AthleteStats } from "./leaderboard";

const athlete = (over: Partial<AthleteStats> & { userId: string; name: string }): AthleteStats => ({
  checkInsLast7: 0, avgSleep: null, sessionsLast7: 0, minutesLast7: 0,
  streak: 0, completedLast7: 0, xp: 0, level: 1, ...over,
});

const board = (id: string) => BOARDS.find((b) => b.id === id)!;

test("ranks highest first", () => {
  const out = rankBoard(board("consistent"), [
    athlete({ userId: "a", name: "Amy", checkInsLast7: 3 }),
    athlete({ userId: "b", name: "Ben", checkInsLast7: 7 }),
  ]);
  assert.deepEqual(out.map((r) => r.stats.name), ["Ben", "Amy"]);
  assert.equal(out[0].display, "7/7 days");
});

test("no data means left off, not ranked last", () => {
  // Someone who has never logged sleep is not the worst sleeper in the squad.
  const out = rankBoard(board("sleep"), [
    athlete({ userId: "a", name: "Amy", avgSleep: 8, checkInsLast7: 5 }),
    athlete({ userId: "b", name: "Ben" }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].stats.name, "Amy");
});

test("sleep needs enough check-ins to count", () => {
  // One good night isn't a sleep record.
  const out = rankBoard(board("sleep"), [
    athlete({ userId: "a", name: "Amy", avgSleep: 10, checkInsLast7: 1 }),
    athlete({ userId: "b", name: "Ben", avgSleep: 7, checkInsLast7: 6 }),
  ]);
  assert.deepEqual(out.map((r) => r.stats.name), ["Ben"]);
});

test("ties share a rank and the next place skips", () => {
  const out = rankBoard(board("streak"), [
    athlete({ userId: "a", name: "Amy", streak: 10 }),
    athlete({ userId: "b", name: "Ben", streak: 10 }),
    athlete({ userId: "c", name: "Cal", streak: 4 }),
  ]);
  assert.deepEqual(out.map((r) => r.rank), [1, 1, 3]);
});

test("zero doesn't earn a place on the board", () => {
  const out = rankBoard(board("work"), [athlete({ userId: "a", name: "Amy", minutesLast7: 0 })]);
  assert.equal(out.length, 0);
});

test("every board formats its number readably", () => {
  const full = athlete({
    userId: "a", name: "Amy", checkInsLast7: 7, avgSleep: 8.25, sessionsLast7: 4,
    minutesLast7: 185, streak: 12, completedLast7: 3, xp: 4210, level: 9,
  });
  for (const b of BOARDS) {
    const out = rankBoard(b, [full]);
    assert.equal(out.length, 1, `${b.id} excluded a fully-populated athlete`);
    assert.ok(out[0].display.length > 0, `${b.id} has no display value`);
    assert.doesNotMatch(out[0].display, /NaN|undefined/, `${b.id} formatted badly`);
  }
});

test("placeOf finds you, or admits you're not on the board", () => {
  const out = rankBoard(board("streak"), [
    athlete({ userId: "a", name: "Amy", streak: 5 }),
    athlete({ userId: "b", name: "Ben", streak: 2 }),
  ]);
  assert.equal(placeOf(out, "b")?.rank, 2);
  assert.equal(placeOf(out, "nobody"), null);
});

test("an empty squad doesn't throw", () => {
  for (const b of BOARDS) assert.deepEqual(rankBoard(b, []), []);
});
