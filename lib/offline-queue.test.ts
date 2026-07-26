import { test } from "node:test";
import assert from "node:assert/strict";
import {
  enqueue, readQueue, removeFromQueue, clearQueue, queueCount, flushQueue,
  type Storage, type QueuedCheckIn,
} from "./offline-queue";

const mem = (): Storage => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } };
};

const item = (over: Partial<QueuedCheckIn> = {}): QueuedCheckIn => ({
  kind: "check_in", date: "2026-07-27", userId: "u1",
  payload: { fatigue_score: 3 }, queuedAt: "2026-07-27T07:00:00Z", ...over,
});

test("an empty store reads as an empty queue", () => {
  assert.deepEqual(readQueue(mem()), []);
});

test("queued entries come back", () => {
  const s = mem();
  enqueue(s, item());
  assert.equal(queueCount(s), 1);
  assert.equal(readQueue(s)[0].date, "2026-07-27");
});

test("editing the same day replaces rather than stacking", () => {
  const s = mem();
  enqueue(s, item({ payload: { fatigue_score: 3 } }));
  enqueue(s, item({ payload: { fatigue_score: 5 } }));
  const q = readQueue(s);
  assert.equal(q.length, 1, "same day should not queue twice");
  assert.deepEqual(q[0].payload, { fatigue_score: 5 }, "the last answer wins");
});

test("different days and different users both stay", () => {
  const s = mem();
  enqueue(s, item({ date: "2026-07-26" }));
  enqueue(s, item({ date: "2026-07-27" }));
  enqueue(s, item({ date: "2026-07-27", userId: "u2" }));
  assert.equal(queueCount(s), 3);
});

test("corrupt storage reads as empty instead of throwing", () => {
  const s = mem();
  s.setItem("pa:offline-queue", "{not json");
  assert.deepEqual(readQueue(s), []);
  // …and is still writable afterwards.
  enqueue(s, item());
  assert.equal(queueCount(s), 1);
});

test("non-check-in junk is filtered out", () => {
  const s = mem();
  s.setItem("pa:offline-queue", JSON.stringify([{ kind: "nonsense" }, null, item()]));
  assert.equal(readQueue(s).length, 1);
});

test("a write that throws doesn't crash the caller", () => {
  const broken: Storage = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
  assert.doesNotThrow(() => enqueue(broken, item()));
});

test("the queue is capped", () => {
  const s = mem();
  for (let d = 1; d <= 20; d++) enqueue(s, item({ date: `2026-07-${String(d).padStart(2, "0")}` }));
  assert.ok(queueCount(s) <= 14, `queue grew to ${queueCount(s)}`);
  // The cap must drop the OLDEST, not the newest.
  assert.equal(readQueue(s).at(-1)?.date, "2026-07-20");
});

test("flush sends everything and empties the queue", async () => {
  const s = mem();
  enqueue(s, item({ date: "2026-07-26" }));
  enqueue(s, item({ date: "2026-07-27" }));
  const seen: string[] = [];
  const res = await flushQueue(s, async (i) => { seen.push(i.date); return true; });
  assert.deepEqual(seen, ["2026-07-26", "2026-07-27"], "oldest first");
  assert.deepEqual(res, { sent: 2, remaining: 0 });
});

test("what fails to send stays queued", async () => {
  const s = mem();
  enqueue(s, item({ date: "2026-07-26" }));
  enqueue(s, item({ date: "2026-07-27" }));
  const res = await flushQueue(s, async (i) => i.date === "2026-07-26");
  assert.equal(res.sent, 1);
  assert.equal(res.remaining, 1);
  assert.equal(readQueue(s)[0].date, "2026-07-27", "the failed one is still there");
});

test("one bad entry doesn't block the ones behind it", async () => {
  const s = mem();
  enqueue(s, item({ date: "2026-07-25" }));
  enqueue(s, item({ date: "2026-07-26" }));
  enqueue(s, item({ date: "2026-07-27" }));
  const res = await flushQueue(s, async (i) => {
    if (i.date === "2026-07-25") throw new Error("gone");
    return true;
  });
  assert.equal(res.sent, 2, "a throwing entry must not stop the rest");
  assert.equal(res.remaining, 1);
});

test("clear empties it", () => {
  const s = mem();
  enqueue(s, item());
  clearQueue(s);
  assert.equal(queueCount(s), 0);
});

test("removing is scoped to one day and one user", () => {
  const s = mem();
  enqueue(s, item({ date: "2026-07-27", userId: "u1" }));
  enqueue(s, item({ date: "2026-07-27", userId: "u2" }));
  removeFromQueue(s, "2026-07-27", "u1");
  const q = readQueue(s);
  assert.equal(q.length, 1);
  assert.equal(q[0].userId, "u2");
});
