import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { publishXp, shouldPublish, type PublishedStats, type PublishedStore, type XpWriter } from "./xp-publish";

/** localStorage does not exist here, so the memory is injected. */
const memoryStore = (): PublishedStore => {
  const seen = new Map<string, PublishedStats>();
  return { get: (id) => seen.get(id) ?? null, set: (id, stats) => { seen.set(id, stats); } };
};

const strip = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^\s*\/\/.*$/gm, " ");

const BOARD = strip(readFileSync(new URL("../components/Leaderboards.tsx", import.meta.url), "utf8"));
const MIGRATION = readFileSync(
  new URL("../supabase/migrations/0105_leaderboard_rank.sql", import.meta.url), "utf8");

function fakeClient() {
  const writes: Record<string, number>[] = [];
  const client = {
    from: () => ({
      update: (values: Record<string, number>) => {
        writes.push(values);
        return { eq: async () => ({ error: null }) };
      },
    }),
  } as unknown as XpWriter;
  return { client, writes };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * "RANK ON LEADERBOARD SHOWING EVERYONE IRON WHEN I'M GOLD."
 *
 * The board built an ActivityStats out of what leaderboard_stats returns —
 * SEVEN DAYS of activity — and ran computeXp on it. A week is a few hundred
 * XP, a few hundred XP is level 1, and level 1 is Iron. So every athlete wore
 * an Iron badge whatever they had actually done.
 *
 * The real number cannot be computed by the board and cannot be computed in
 * SQL without duplicating the strength standards, so the athlete's own client
 * publishes it from the one place it exists.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the badge reads lifetime XP, never the week the boards rank on", () => {
  assert.match(BOARD, /const xp = xpFor\(r\);/,
    "the badge no longer goes through the lifetime-XP lookup");
  assert.match(BOARD, /lifetimeXp/,
    "the badge no longer distinguishes lifetime XP from this week's");
  assert.ok(!/levelFor\(r\.stats\.xp/.test(BOARD),
    "the badge is being computed from the seven-day XP again — that is level 1 for everybody");
  assert.match(BOARD, /lifetimeXp: r\.xp \?\? null/,
    "the row's lifetime XP is not carried through from the RPC");
});

/** Null is not zero, and drawing the lowest badge for it is the original bug. */
test("no badge at all when nobody has computed a rank yet", () => {
  assert.match(BOARD, /xp == null \? null : levelFor\(xp/,
    "levelOf does not return null for an athlete with no published XP");
  assert.match(BOARD, /\{lvl && <RankBadge/, "your own row draws a badge with no rank behind it");
  assert.ok((BOARD.match(/if \(!lvl\) return null;/g) ?? []).length >= 2,
    "some row still renders a badge without checking there is a rank");

  // And the column must not paper over it in SQL either.
  assert.ok(!/coalesce\(pe\.lifetime_xp/.test(MIGRATION),
    "the migration coalesces missing XP to a number, which is the Iron badge again");
  assert.match(MIGRATION, /xp integer check \(xp is null or xp >= 0\)/,
    "the column is not nullable, so 'never computed' cannot be told from zero");
});

test("publishing writes once, then only when the number moves", async () => {
  const { client, writes } = fakeClient();
  const store = memoryStore();

  assert.equal(await publishXp(client, "a", { xp: 4820, streak: 12 }, store), true, "the first publish should write");
  assert.deepEqual(writes, [{ xp: 4820, streak: 12 }]);

  assert.equal(await publishXp(client, "a", { xp: 4820, streak: 12 }, store), false, "an unchanged total should not write again");
  assert.equal(writes.length, 1);

  assert.equal(await publishXp(client, "a", { xp: 4835, streak: 12 }, store), true);
  assert.deepEqual(writes[1], { xp: 4835, streak: 12 });

  // THE STREAK ON ITS OWN IS ENOUGH TO WRITE. A day where somebody checked in
  // and did nothing else moves the streak and not the XP, and that is exactly
  // the day the board would otherwise be behind by.
  assert.equal(await publishXp(client, "a", { xp: 4835, streak: 13 }, store), true);
  assert.deepEqual(writes[2], { xp: 4835, streak: 13 });

  // A different athlete on the same device is a different memory.
  assert.equal(await publishXp(client, "b", { xp: 4820, streak: 1 }, store), true);
});

test("a value the column would reject is never sent", async () => {
  const { client, writes } = fakeClient();
  for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(await publishXp(client, `bad-${bad}`, { xp: bad, streak: 3 }, memoryStore()), false, `xp ${bad} was published`);
    assert.equal(await publishXp(client, `bads-${bad}`, { xp: 10, streak: bad }, memoryStore()), false, `streak ${bad} was published`);
  }
  assert.deepEqual(writes, [], "a rejected write is a console error on a screen somebody is looking at");
  assert.equal(shouldPublish({ xp: 0, streak: 0 }, null), true, "zero is a real value and must publish");
});

/**
 * The key held a bare number before the streak went in, and real browsers
 * still hold one. Reading it as corrupt would look harmless — the next publish
 * is unconditional either way — but it would throw away a known XP and make
 * every returning athlete write again for nothing.
 */
test("the old single-number memory still means what it said", () => {
  assert.equal(shouldPublish({ xp: 4820, streak: 12 }, { xp: 4820, streak: Number.NaN }), true,
    "an unknown streak must publish — that is how it reaches the board at all");
  assert.equal(shouldPublish({ xp: 4820, streak: 12 }, { xp: 4820, streak: 12 }), false);
});

test("a database without the column does not break the screen", async () => {
  const failing = {
    from: () => ({ update: () => ({ eq: async () => ({ error: { message: "column does not exist" } }) }) }),
  } as unknown as XpWriter;
  assert.equal(await publishXp(failing, "someone", { xp: 100, streak: 2 }, memoryStore()), false);

  const throwing = { from: () => { throw new Error("offline"); } } as unknown as XpWriter;
  assert.equal(await publishXp(throwing, "someone-else", { xp: 100, streak: 2 }, memoryStore()), false,
    "an offline athlete must not see an error for a badge on somebody else's board");
});

/** The board that says "total" must rank on a total, or say what it does rank on. */
test("the Overall board no longer promises a lifetime total it never used", async () => {
  const { BOARDS } = await import("./leaderboard");
  const overall = BOARDS.find((b) => b.id === "xp")!;
  assert.ok(!/total xp/i.test(overall.blurb),
    `"${overall.blurb}" promises a lifetime total, and the value is a seven-day window`);
  assert.match(overall.blurb, /week/i);
});

/** The function was rebuilt from the original body; only the column is new. */
test("the migration changes the return type and nothing else about the query", () => {
  assert.match(MIGRATION, /streak int,\n  xp int\n\)/, "the xp column is not in the return type");
  assert.match(MIGRATION, /p\.xp as lifetime_xp/, "the profile column is not selected");
  // The parts of the original that decide who appears and what the boards show.
  for (const original of [
    "leaderboard_opt_out = false",
    "sleep_quality",
    "jsonb_array_length(pr.completed_sessions)",
    "s.check_in_date = current_date - ((s.rn - 1))::int",
  ]) {
    assert.ok(MIGRATION.includes(original),
      `the rewritten function lost "${original}" — it must be the original body plus one column`);
  }
});


/**
 * Your own rank does not need the database.
 *
 * Everyone else's lifetime XP has to be published and read back. Yours was
 * computed on this device the last time Rewards was open, so your own badge
 * should be right whether or not that publish reached the server and whether
 * or not migration 0105 has been applied.
 */
test("your own badge falls back to what this device computed", () => {
  assert.match(BOARD, /const ownXp = useMemo\(\(\) => lastPublished\(userId\), \[userId\]\)/,
    "the board no longer reads the XP this device already computed");
  assert.match(BOARD, /r\.stats\.userId === userId \? r\.stats\.lifetimeXp \?\? ownXp : r\.stats\.lifetimeXp/,
    "the local fallback is applied to other athletes too, which would badge them with your rank");

  // Still null-not-zero: never computed is not the lowest tier.
  assert.match(BOARD, /xp == null \? null : levelFor\(xp/,
    "a missing rank draws a badge again");
});
