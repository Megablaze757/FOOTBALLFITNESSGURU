import { test } from "node:test";
import assert from "node:assert/strict";
import { selectProfile } from "./profile-columns";

/**
 * This is the bug that took the meal plan page down, so it gets a test.
 *
 * Four columns were added to the client — timezone, meal_plan_swaps,
 * meal_plan_recent, meal_plan_starred — before the migrations creating them had
 * been run. PostgREST does not ignore a column it doesn't know; it rejects the
 * whole query with 42703. The profile came back null and the page rendered an
 * athlete with no height, no weight, no diet and no plan seed: not an error
 * screen, just a stranger.
 *
 * The client and the schema deploy separately and always will, so the window
 * exists on every migration. What has to be true is that landing in it costs
 * one feature, not the page.
 */

/** Minimal PostgREST-shaped stub: rejects any select naming a missing column. */
function stubSupabase(available: string[], row: Record<string, unknown>) {
  const calls: string[] = [];
  const client = {
    from() {
      let requested = "";
      const chain = {
        select(cols: string) { requested = cols; calls.push(cols); return chain; },
        eq() { return chain; },
        async maybeSingle() {
          const asked = requested.split(",").map((c) => c.trim()).filter(Boolean);
          const missing = asked.find((c) => !available.includes(c));
          if (missing) {
            return { data: null, error: { code: "42703", message: `column profiles.${missing} does not exist` } };
          }
          return { data: Object.fromEntries(asked.map((c) => [c, row[c] ?? null])), error: null };
        },
      };
      return chain;
    },
  };
  return { client, calls };
}

const STABLE = "height_cm, diet_pattern, meal_plan_seed";
const OPTIONAL = ["meal_plan_swaps", "meal_plan_recent", "meal_plan_starred"];

test("everything present: one query, all columns", async () => {
  const { client, calls } = stubSupabase(
    ["height_cm", "diet_pattern", "meal_plan_seed", ...OPTIONAL],
    { height_cm: 180, diet_pattern: "vegan", meal_plan_seed: 42, meal_plan_starred: ["a"] },
  );
  const { data, missing } = await selectProfile<Record<string, unknown>>(
    client as never, "u1", STABLE, OPTIONAL);
  assert.equal(calls.length, 1, "no retry needed when the schema is current");
  assert.deepEqual(missing, []);
  assert.equal(data?.height_cm, 180);
  assert.deepEqual(data?.meal_plan_starred, ["a"]);
});

/**
 * The exact production state on the day this broke: 0066-0069 unapplied.
 * The athlete's real profile must still arrive.
 */
test("a column the database hasn't got costs that feature, not the profile", async () => {
  const { client, calls } = stubSupabase(
    ["height_cm", "diet_pattern", "meal_plan_seed"],
    { height_cm: 180, diet_pattern: "vegan", meal_plan_seed: 42 },
  );
  const { data, missing } = await selectProfile<Record<string, unknown>>(
    client as never, "u1", STABLE, OPTIONAL);

  assert.equal(calls.length, 2, "should retry with the stable columns only");
  assert.deepEqual(missing, OPTIONAL, "and say which features are off");
  assert.equal(data?.height_cm, 180, "the profile itself must survive");
  assert.equal(data?.diet_pattern, "vegan");
  assert.equal(data?.meal_plan_seed, 42, "losing the seed is losing their plan");
});

/**
 * A real failure must not be disguised as a missing column. Retrying a network
 * error with fewer columns just fails twice and reports the wrong cause.
 */
test("a non-42703 error is not retried", async () => {
  const calls: string[] = [];
  const client = {
    from() {
      const chain = {
        select(c: string) { calls.push(c); return chain; },
        eq() { return chain; },
        async maybeSingle() {
          return { data: null, error: { code: "PGRST301", message: "JWT expired" } };
        },
      };
      return chain;
    },
  };
  const { data, missing } = await selectProfile(client as never, "u1", STABLE, OPTIONAL);
  assert.equal(calls.length, 1, "an auth failure is not a schema problem");
  assert.equal(data, null);
  assert.deepEqual(missing, []);
});

test("no optional columns behaves like a plain select", async () => {
  const { client, calls } = stubSupabase(["height_cm", "diet_pattern", "meal_plan_seed"], { height_cm: 175 });
  const { data } = await selectProfile<Record<string, unknown>>(client as never, "u1", STABLE, []);
  assert.equal(calls.length, 1);
  assert.equal(data?.height_cm, 175);
});
