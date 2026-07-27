import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  saveDraft, loadDraft, clearDraft, clearAllDrafts, draftAge, describeAge,
} from "./drafts";

// A minimal localStorage. The module reaches for the global, so tests provide
// one rather than the module taking an injection parameter it would never use
// in production.
function fakeStorage() {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    _map: m,
  };
}

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = fakeStorage();
});

test("a draft round-trips", () => {
  saveDraft("checkin", "u1", { fatigue: 7, note: "sore" }, "2026-07-27");
  assert.deepEqual(loadDraft("checkin", "u1", "2026-07-27"), { fatigue: 7, note: "sore" });
});

test("drafts are scoped to the user", () => {
  // A shared phone must not hand one athlete another's half-written check-in.
  saveDraft("checkin", "u1", { fatigue: 7 }, "2026-07-27");
  assert.equal(loadDraft("checkin", "u2", "2026-07-27"), null);
});

test("drafts are scoped to the day", () => {
  // Yesterday's answers reappearing as today's would be worse than losing them.
  saveDraft("checkin", "u1", { fatigue: 7 }, "2026-07-26");
  assert.equal(loadDraft("checkin", "u1", "2026-07-27"), null);
});

test("a stale draft is discarded, not restored", () => {
  const s = fakeStorage();
  (globalThis as { localStorage?: unknown }).localStorage = s;
  s.setItem("pa:draft:checkin:u1:2026-07-27", JSON.stringify({
    savedAt: Date.now() - 48 * 60 * 60 * 1000, value: { fatigue: 7 },
  }));
  assert.equal(loadDraft("checkin", "u1", "2026-07-27"), null);
  assert.equal(s.getItem("pa:draft:checkin:u1:2026-07-27"), null, "and it's cleaned up");
});

test("a recent draft survives", () => {
  const s = fakeStorage();
  (globalThis as { localStorage?: unknown }).localStorage = s;
  s.setItem("pa:draft:checkin:u1:d", JSON.stringify({
    savedAt: Date.now() - 30 * 60 * 1000, value: { fatigue: 3 },
  }));
  assert.deepEqual(loadDraft("checkin", "u1", "d"), { fatigue: 3 });
});

test("corrupt JSON is binned rather than breaking the form forever", () => {
  const s = fakeStorage();
  (globalThis as { localStorage?: unknown }).localStorage = s;
  s.setItem("pa:draft:checkin:u1:d", "{not json");
  assert.equal(loadDraft("checkin", "u1", "d"), null);
  assert.equal(s.getItem("pa:draft:checkin:u1:d"), null);
  // …and saving still works afterwards.
  saveDraft("checkin", "u1", { ok: true }, "d");
  assert.deepEqual(loadDraft("checkin", "u1", "d"), { ok: true });
});

test("storage that throws never breaks the caller", () => {
  (globalThis as { localStorage?: unknown }).localStorage = {
    length: 0,
    key: () => null,
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("quota"); },
    removeItem: () => { throw new Error("blocked"); },
  };
  assert.doesNotThrow(() => saveDraft("checkin", "u1", { a: 1 }));
  assert.equal(loadDraft("checkin", "u1"), null);
  assert.doesNotThrow(() => clearDraft("checkin", "u1"));
  assert.doesNotThrow(() => clearAllDrafts("u1"));
});

test("clearDraft removes only the one asked for", () => {
  saveDraft("checkin", "u1", { a: 1 }, "d1");
  saveDraft("checkin", "u1", { a: 2 }, "d2");
  clearDraft("checkin", "u1", "d1");
  assert.equal(loadDraft("checkin", "u1", "d1"), null);
  assert.deepEqual(loadDraft("checkin", "u1", "d2"), { a: 2 });
});

test("signing out clears that user's drafts and leaves others alone", () => {
  saveDraft("checkin", "u1", { a: 1 }, "d");
  saveDraft("checkin", "u2", { a: 2 }, "d");
  clearAllDrafts("u1");
  assert.equal(loadDraft("checkin", "u1", "d"), null);
  assert.deepEqual(loadDraft("checkin", "u2", "d"), { a: 2 }, "another account's draft is not theirs to delete");
});

test("clearAllDrafts also reaps other users' expired drafts", () => {
  const s = fakeStorage();
  (globalThis as { localStorage?: unknown }).localStorage = s;
  s.setItem("pa:draft:checkin:u2:d", JSON.stringify({ savedAt: Date.now() - 72 * 3600_000, value: {} }));
  s.setItem("pa:draft:checkin:u3:d", JSON.stringify({ savedAt: Date.now(), value: { keep: true } }));
  clearAllDrafts("u1");
  assert.equal(s.getItem("pa:draft:checkin:u2:d"), null, "stale draft should be reaped");
  assert.ok(s.getItem("pa:draft:checkin:u3:d"), "a fresh one belonging to someone else stays");
});

test("draftAge reports roughly how long ago", () => {
  saveDraft("checkin", "u1", { a: 1 }, "d");
  const age = draftAge("checkin", "u1", "d");
  assert.ok(age !== null && age >= 0 && age < 1000);
  assert.equal(draftAge("checkin", "nobody", "d"), null);
});

test("describeAge reads like a person wrote it", () => {
  assert.equal(describeAge(10_000), "just now");
  assert.equal(describeAge(60_000), "1 minute ago");
  assert.equal(describeAge(5 * 60_000), "5 minutes ago");
  assert.equal(describeAge(60 * 60_000), "1 hour ago");
  assert.equal(describeAge(3 * 60 * 60_000), "3 hours ago");
});
