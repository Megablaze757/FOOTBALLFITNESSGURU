import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MIN_SAMPLE, rarityLabel, rarityTone, recordUnlocks, fetchRarity,
} from "./achievement-rarity";
import { ACHIEVEMENTS } from "./gamification";

/** Enough of a Supabase client for these two calls, and nothing more. */
function fakeClient(over: {
  upsert?: (rows: unknown[], opts: unknown) => { error: unknown };
  rpc?: () => Promise<{ data: unknown; error: unknown }>;
} = {}) {
  const calls: { rows?: unknown[]; opts?: unknown; rpcs: string[] } = { rpcs: [] };
  const client = {
    from: () => ({
      upsert: (rows: unknown[], opts: unknown) => {
        calls.rows = rows;
        calls.opts = opts;
        return Promise.resolve(over.upsert ? over.upsert(rows, opts) : { error: null });
      },
    }),
    rpc: (name: string) => {
      calls.rpcs.push(name);
      return over.rpc ? over.rpc() : Promise.resolve({ data: [], error: null });
    },
  };
  return { client: client as never, calls };
}

test("recording an unlock writes one row per badge, for this athlete", async () => {
  const { client, calls } = fakeClient();
  await recordUnlocks(client, "u1", ["first_checkin", "streak_7"]);
  assert.deepEqual(calls.rows, [
    { user_id: "u1", achievement_id: "first_checkin" },
    { user_id: "u1", achievement_id: "streak_7" },
  ]);
});

/**
 * `ignoreDuplicates` is what keeps `unlocked_at` meaning "when this happened".
 *
 * The whole unlocked set is posted on every visit — deliberately, so athletes
 * who earned badges before this table existed are backfilled rather than
 * waiting for their next one. Without the flag, that same visit would rewrite
 * every timestamp and the column would silently come to mean "last seen".
 */
test("re-recording does not rewrite when it happened", async () => {
  const { client, calls } = fakeClient();
  await recordUnlocks(client, "u1", ["first_checkin"]);
  assert.deepEqual(calls.opts, { onConflict: "user_id,achievement_id", ignoreDuplicates: true });
});

test("nothing unlocked writes nothing", async () => {
  const { client, calls } = fakeClient();
  await recordUnlocks(client, "u1", []);
  assert.equal(calls.rows, undefined, "an empty list should not reach the database at all");
});

/**
 * A REWARDS PAGE MUST NOT FAIL OVER A DECORATION.
 *
 * Both of these run as a side effect of looking at the page. If 0074 hasn't
 * been applied the table and the RPC do not exist, and every response is an
 * error — which must come out as "no rarity", not as an exception that takes
 * the screen down with it.
 */
test("a database that has never heard of this degrades to nothing", async () => {
  const { client } = fakeClient({
    upsert: () => ({ error: { message: 'relation "achievement_unlocks" does not exist' } }),
    rpc: async () => ({ data: null, error: { message: "function does not exist" } }),
  });
  await recordUnlocks(client, "u1", ["first_checkin"]); // must not throw
  assert.deepEqual(await fetchRarity(client), {});
});

test("rarity comes back keyed by badge", async () => {
  const { client } = fakeClient({
    rpc: async () => ({
      data: [
        { achievement_id: "first_checkin", holders: 900, pct: 90 },
        { achievement_id: "streak_30", holders: 42, pct: 4.2 },
        { achievement_id: null, holders: 1, pct: 1 }, // junk row, dropped
      ],
      error: null,
    }),
  });
  const map = await fetchRarity(client);
  assert.deepEqual(Object.keys(map).sort(), ["first_checkin", "streak_30"]);
  assert.deepEqual(map.streak_30, { holders: 42, pct: 4.2 });
});

/**
 * A MISSING ENTRY IS NOT 0%.
 *
 * "Nobody has recorded this yet" and "nobody has earned this" render
 * identically if the map is read with `?? 0`, and only one of them is true.
 * The card takes `rarity` as optional for that reason; this pins that
 * fetchRarity never invents a zero to fill the gap.
 */
test("badges nobody holds are absent, not zero", async () => {
  const { client } = fakeClient({
    rpc: async () => ({ data: [{ achievement_id: "first_checkin", holders: 9, pct: 100 }], error: null }),
  });
  const map = await fetchRarity(client);
  assert.equal(map.streak_30, undefined);
});

/**
 * The sample floor. With four athletes on the table, one holder reads as "25%
 * of athletes" — arithmetically true, and it tells you only how new the app is.
 */
test("the sample floor is high enough to mean something", () => {
  assert.ok(MIN_SAMPLE >= 20, "below this a single athlete moves the number by whole percent");
});

test("the words match the number, and get louder as it gets rarer", () => {
  assert.equal(rarityLabel(95), "Common");
  assert.equal(rarityLabel(45), "Uncommon");
  assert.equal(rarityLabel(12), "Rare");
  assert.equal(rarityLabel(0.4), "Very rare");
  // Every band has a colour, and no two adjacent bands share one.
  const bands = [95, 45, 12, 0.4].map(rarityTone);
  assert.equal(new Set(bands).size, bands.length);
});

/**
 * The ids written to the database come from ACHIEVEMENTS, and the rarity map is
 * keyed by them. Two badges sharing an id would silently merge into one row and
 * each would report the other's rarity.
 */
test("badge ids are unique, since they are the primary key", () => {
  const ids = ACHIEVEMENTS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    assert.match(id, /^[a-z0-9_]+$/, `${id} should be a stable slug — it is stored`);
  }
});
