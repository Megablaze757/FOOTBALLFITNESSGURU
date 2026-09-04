import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BOARDS, rankBoard, placeOf, boardView, placeAbove, inScope, scopeReady, MIN_FIELD,
  type AthleteStats,
} from "./leaderboard";

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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A RANK IS NOT A POSITION, AND USING IT AS ONE HID PEOPLE FROM THEIR OWN BOARD.
 *
 * Reported as "incorrect ranks on the leaderboard". The board rendered
 * `ranked.slice(0, 10)` and then showed your row underneath when
 * `mine.rank > 10`. Two expressions that had to agree, and the moment anybody
 * ties they do not.
 *
 * Thirteen athletes: three on 7/7, three on 6/7, six on 5/7. The last of the
 * sixes is RANK 7 sitting at INDEX 11 — past the ten rendered rows, and 7 is
 * not greater than 10. They appeared nowhere, while the board in front of them
 * read 1, 1, 1, 4, 4, 4, 7, 7, 7, 7.
 *
 * Ties are not an edge case on a check-ins board. They are the normal state.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("an athlete pushed past the top ten by ties still sees their own row", () => {
  const board = BOARDS.find((b) => b.id === "consistent")!;
  const athletes = [
    ...[7, 7, 7, 6, 6, 6].map((n, i) => athlete({ userId: `top${i}`, name: `top${i}`, checkInsLast7: n })),
    ...[5, 5, 5, 5, 5].map((n, i) => athlete({ userId: `mid${i}`, name: `mid${i}`, checkInsLast7: n })),
    // Named to sort LAST within the five-check-in tie group: rankBoard breaks
    // ties on name, so calling them "me" put them at the front of the group and
    // the fixture stopped reproducing the bug it was written for.
    athlete({ userId: "me", name: "zoe", checkInsLast7: 5 }),
    athlete({ userId: "last", name: "last", checkInsLast7: 4 }),
  ];
  const ranked = rankBoard(board, athletes);
  const me = placeOf(ranked, "me")!;

  // The exact shape of the bug: a good rank, a position beyond the tenth row.
  assert.equal(me.rank, 7, "the fixture no longer reproduces the bug");
  assert.ok(ranked.indexOf(me) > 9, "the fixture no longer pushes them past the slice");
  assert.ok(!(me.rank > 10), "the old condition would have caught this — fixture is wrong");

  const { top, below } = boardView(ranked, "me");
  assert.equal(top.length, 10);
  assert.ok(!top.some((r) => r.stats.userId === "me"), "they are genuinely off the visible list");
  assert.equal(below?.stats.userId, "me", "so their row has to be shown underneath");
});

test("an athlete inside the top ten is not listed twice", () => {
  const board = BOARDS.find((b) => b.id === "consistent")!;
  const ranked = rankBoard(board, [
    athlete({ userId: "me", name: "me", checkInsLast7: 7 }),
    ...[6, 5, 4].map((n, i) => athlete({ userId: `o${i}`, name: `o${i}`, checkInsLast7: n })),
  ]);
  const { top, below } = boardView(ranked, "me");
  assert.ok(top.some((r) => r.stats.userId === "me"));
  assert.equal(below, null, "the row would appear twice");
});

test("somebody not on the board at all gets no row", () => {
  const ranked = rankBoard(BOARDS.find((b) => b.id === "consistent")!, [athlete({ userId: "a", name: "a", checkInsLast7: 5 })]);
  assert.equal(boardView(ranked, "nobody").below, null);
});

test("top and below always agree, at every size and every tie pattern", () => {
  const board = BOARDS.find((b) => b.id === "consistent")!;
  for (let n = 1; n <= 30; n++) {
    for (const spread of [1, 2, 4, 7]) {
      const athletes = Array.from({ length: n }, (_, i) =>
        athlete({ userId: `a${i}`, name: `a${i}`, checkInsLast7: (i % spread) + 1 }));
      const ranked = rankBoard(board, athletes);
      for (const target of athletes) {
        const { top, below } = boardView(ranked, target.userId);
        const shown = top.some((r) => r.stats.userId === target.userId);
        assert.ok(shown !== (below !== null),
          `${target.userId} of ${n} (spread ${spread}) is shown ${shown ? "twice" : "nowhere"}`);
      }
    }
  }
});

/** Ranks skip over ties, so "the place above" is not "my rank minus one". */
test("the place above is found even when that rank does not exist", () => {
  const board = BOARDS.find((b) => b.id === "consistent")!;
  const ranked = rankBoard(board, [
    athlete({ userId: "a", name: "a", checkInsLast7: 7 }),
    athlete({ userId: "b", name: "b", checkInsLast7: 7 }),
    athlete({ userId: "me", name: "me", checkInsLast7: 5 }),
  ]);
  const me = placeOf(ranked, "me")!;
  assert.equal(me.rank, 3, "the fixture should skip rank 2");
  assert.equal(ranked.find((r) => r.rank === me.rank - 1), undefined, "rank 2 should not exist");

  const above = placeAbove(ranked, me.rank);
  assert.ok(above, "the athlete in third was told nothing at all");
  assert.equal(above.rank, 1);

  assert.equal(placeAbove(ranked, 1), null, "nobody is above first");
});

// --- who you are ranked against ---------------------------------------------

const member = (over: Partial<AthleteStats> & { userId: string }): AthleteStats => ({
  name: over.userId, checkInsLast7: 5, avgSleep: 7, sessionsLast7: 3, minutesLast7: 180,
  streak: 5, completedLast7: 2, xp: 100, level: 2, ...over,
});

const FIELD: AthleteStats[] = [
  member({ userId: "me", sport: "football", position: "Centre back" }),
  member({ userId: "b", sport: "football", position: "Centre back" }),
  member({ userId: "c", sport: "football", position: "Striker" }),
  member({ userId: "d", sport: "rugby", position: "Centre back" }),
  member({ userId: "e", sport: null, position: null }),
];

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A GLOBAL BOARD IS A BOARD ALMOST NOBODY IS ON.
 *
 * One list for everybody means the same ten names every week. The whole value
 * of a smaller field is that an ordinary athlete can be near the top of it —
 * so the filter has to actually be the field, and the rank has to be computed
 * over the field rather than sliced out of the world's.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a scope narrows to people like you, taken from your own row", () => {
  assert.deepEqual(inScope(FIELD, "sport", "me").map((a) => a.userId), ["me", "b", "c"]);
  assert.deepEqual(inScope(FIELD, "position", "me").map((a) => a.userId), ["me", "b", "d"]);
  assert.equal(inScope(FIELD, "world", "me").length, FIELD.length);
  assert.equal(inScope(FIELD, "squad", "me").length, FIELD.length, "squad is filtered by the query, not here");
});

test("nobody is ranked against a field they are not in", () => {
  // An athlete who never set a position gets an empty board, not everyone else's.
  assert.deepEqual(inScope(FIELD, "position", "e"), []);
  assert.deepEqual(inScope(FIELD, "sport", "e"), []);
  // And a viewer who is not in the rows at all.
  assert.deepEqual(inScope(FIELD, "sport", "nobody"), []);
});

/** "Centre back" and "centre back" are one position. A board that splits them
 *  in two is worse than no board. */
test("case and spacing do not fork a position into two boards", () => {
  const messy = [
    member({ userId: "me", position: "Centre back" }),
    member({ userId: "b", position: "centre back" }),
    member({ userId: "c", position: "  Centre Back " }),
  ];
  assert.equal(inScope(messy, "position", "me").length, 3);
});

test("the rank is computed over the field, not sliced out of the world's", () => {
  const board = BOARDS.find((b) => b.id === "work")!;
  const world = [
    member({ userId: "x", minutesLast7: 900, sport: "rugby" }),
    member({ userId: "y", minutesLast7: 800, sport: "rugby" }),
    member({ userId: "me", minutesLast7: 100, sport: "football" }),
    member({ userId: "b", minutesLast7: 50, sport: "football" }),
    member({ userId: "c", minutesLast7: 10, sport: "football" }),
  ];
  assert.equal(rankBoard(board, world).find((r) => r.stats.userId === "me")!.rank, 3);
  assert.equal(
    rankBoard(board, inScope(world, "sport", "me")).find((r) => r.stats.userId === "me")!.rank, 1,
    "top of your own sport must read as 1st, not as your position in the world list",
  );
});

/** A tab that opens onto "nobody here" reads as broken, not as a fact about
 *  how many other left-backs have signed up. */
test("a scope is only offered when there is a field to rank against", () => {
  assert.equal(scopeReady(FIELD, "sport", "me"), true, "three footballers is a board");
  assert.equal(scopeReady(FIELD, "position", "me"), true);
  assert.equal(scopeReady(FIELD, "sport", "c"), true);

  const thin = FIELD.filter((a) => a.userId !== "c");
  assert.equal(scopeReady(thin, "sport", "me"), false, `two is below MIN_FIELD (${MIN_FIELD})`);
  assert.equal(scopeReady(thin, "world", "me"), true);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AND THE COMPONENT HAS TO ACTUALLY USE IT.
 *
 * Every rule above passes with `inScope` written, exported, tested and called
 * by nobody — the mutation that swapped the component back to ranking the
 * whole world went straight through a green suite. This is the same guard
 * lib/xp-publish.test.ts keeps over the badge, for the same reason: a pure
 * function is only as good as the one line that reaches for it.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the board ranks the field it is showing", () => {
  const src = readFileSync(new URL("../components/Leaderboards.tsx", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

  assert.match(src, /inScope\(athletes, scope, userId\)/,
    "the field is not narrowed to the selected scope");
  assert.match(src, /rankBoard\(board, field\)/,
    "the rows are ranked against the world and then filtered, so the best centre back is 47th");
  assert.ok(!/rankBoard\(board, athletes\)/.test(src),
    "the displayed board is ranked over every athlete, not the field on screen");
  // The XP ladder behind the rank badge is the one thing that MUST stay global.
  assert.match(src, /rankBoard\(BOARDS\.find\(\(b\) => b\.id === "xp"\)!, athletes\)/,
    "standing is being computed over the filtered field — top of the centre backs is not no. 1 in the world");
  assert.match(src, /scopeReady\(athletes, "position", userId\)/,
    "a scope tab is offered without checking there is anybody on it");
});
