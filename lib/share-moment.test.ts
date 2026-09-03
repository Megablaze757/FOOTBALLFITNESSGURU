import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shareMoment, pendingMoment, browserStore, STREAK_MILESTONES,
  type MomentInput, type MomentStore,
} from "./share-moment";

const memory = (): MomentStore => {
  const seen: string[] = [];
  return { seen: () => [...seen], remember: (id) => { seen.push(id); } };
};

const base: MomentInput = { name: "Sam" };

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ONE PROMPT. THE MOMENT. ONCE.
 *
 * The moment is derived from STATE, not from an event, so it stays true for as
 * long as the state holds — a Gold II athlete is Gold II tomorrow. Without a
 * record of what has been offered, the prompt reappears on every page load for
 * as long as the rank lasts, which is a nag and gets the feature switched off
 * within a week.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("asked once, then never again for the same thing", () => {
  const store = memory();
  const input = { ...base, rank: "Gold II", tier: "Gold" };

  const first = pendingMoment(input, store);
  assert.ok(first, "nothing was offered at all");
  store.remember(first!.id);

  assert.equal(pendingMoment(input, store), null, "offered the same rank twice");
  // …but a NEW achievement still gets its turn.
  assert.ok(pendingMoment({ ...input, rank: "Gold I" }, store), "a new rank was suppressed");
});

test("the id is stable, so the same achievement is one achievement", () => {
  const input = { ...base, lift: { name: "Bench press", tier: "Advanced", weightKg: 100 } };
  assert.equal(shareMoment(input)!.id, shareMoment(input)!.id);
  // Rounded, so 100.4kg and 100kg are not two different prompts.
  assert.equal(
    shareMoment({ ...input, lift: { ...input.lift!, weightKg: 100.4 } })!.id,
    shareMoment(input)!.id,
  );
});

/** Ordered by how much a person would want to tell somebody. */
test("a lift beats a rank, and a rank beats a streak", () => {
  const all: MomentInput = {
    ...base,
    lift: { name: "Squat", tier: "Advanced", weightKg: 180 },
    rank: "Gold II", tier: "Gold", streak: 30,
  };
  assert.match(shareMoment(all)!.id, /^lift:/);
  assert.match(shareMoment({ ...all, lift: null })!.id, /^rank:/);
  assert.match(shareMoment({ ...all, lift: null, rank: null, tier: null })!.id, /^streak:/);
});

test("nothing worth saying is null, not a prompt about nothing", () => {
  assert.equal(shareMoment(base), null);
  assert.equal(shareMoment({ ...base, streak: 0 }), null);
  assert.equal(shareMoment({ ...base, streak: 3 }), null, "day three is not an achievement");
  assert.equal(shareMoment({ ...base, streak: 8 }), null, "the day after a milestone is not one");
});

test("only round streaks, and each exactly once", () => {
  for (const m of STREAK_MILESTONES) {
    const moment = shareMoment({ ...base, streak: m });
    assert.ok(moment, `${m} days should be worth a word`);
    assert.equal(moment!.id, `streak:${m}`);
  }
  // Between milestones, silence.
  for (const n of [1, 6, 15, 29, 99, 200]) {
    assert.equal(shareMoment({ ...base, streak: n }), null, `${n} days prompted`);
  }
});

test("the card says something specific about them", () => {
  const m = shareMoment({ ...base, lift: { name: "Bench press", tier: "Advanced", weightKg: 100 } })!;
  assert.equal(m.stats.name, "Sam");
  assert.equal(m.stats.headlineValue, "100kg");
  assert.ok(m.headline.length > 10 && m.headline.length < 80, m.headline);
  assert.ok(!/\bundefined\b|\bNaN\b|\bnull\b/.test(JSON.stringify(m)), JSON.stringify(m));
});

test("a missing name does not put 'undefined' on a shared card", () => {
  const m = shareMoment({ name: "", streak: 7 })!;
  assert.equal(m.stats.name, "Athlete");
});

/** Storage can throw or hold junk. Neither is worth a crash on the home page. */
test("a broken store degrades to asking, never to failing", () => {
  const hostile: MomentStore = {
    seen: () => { throw new Error("private mode"); },
    remember: () => { throw new Error("private mode"); },
  };
  assert.throws(() => pendingMoment({ ...base, streak: 7 }, hostile));

  // The real one swallows it, which is what ships.
  const original = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: () => "not json", setItem: () => { throw new Error("full"); } },
  });
  try {
    const store = browserStore();
    assert.deepEqual(store.seen(), [], "junk in storage should read as nothing seen");
    store.remember("x"); // must not throw
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", { configurable: true, value: original });
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});
