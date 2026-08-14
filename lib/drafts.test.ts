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

// --- the form that uses them --------------------------------------------------

import { readFileSync } from "node:fs";
const FORM = readFileSync(new URL("../components/JournalForm.tsx", import.meta.url), "utf8");

/**
 * A DEBOUNCED SAVE THAT GETS CANCELLED IS NOT A SAVE.
 *
 * The draft is written on a 400ms timer whose cleanup clears it. Log a set,
 * switch to the timer app inside 400ms, and nothing was ever stored — which is
 * precisely when it matters, because logging set by set means leaving the app
 * mid-session is the normal case. A backgrounded mobile PWA is also frozen, so
 * a pending timer may never fire however long it had left.
 */
test("the draft is flushed before the app can be backgrounded", () => {
  assert.match(FORM, /addEventListener\("visibilitychange"/,
    "nothing writes the draft when the phone is backgrounded");
  assert.match(FORM, /addEventListener\("pagehide", flushDraft\)/,
    "nothing writes the draft when the page is discarded");
  assert.match(FORM, /visibilityState === "hidden"/,
    "visibilitychange fires on becoming visible too — flushing then is pointless work");
  // The cleanup must flush, not merely unsubscribe: navigating to another
  // screen inside the app unmounts the form.
  const effect = FORM.slice(FORM.indexOf('addEventListener("visibilitychange"'));
  assert.match(effect.slice(0, 600), /removeEventListener[\s\S]{0,220}flushDraft\(\);/,
    "unmount tears down the listeners without saving what was in the form");
});

/**
 * AND IT MUST NOT WRITE THE DRAFT BACK AFTER SUBMITTING.
 *
 * The flush effect's cleanup runs whenever its dependencies change, closing over
 * the previous render's values — so keying it on `result` would fire with
 * result still null immediately after handleSubmit cleared the draft, and
 * restore the whole thing on the next visit. A ref is read at call time.
 */
test("a flush cannot resurrect a draft that was already saved", () => {
  assert.match(FORM, /submittedRef\.current = true;\s*\n\s*clearDraft/,
    "the submitted flag is not set before the draft is cleared, so a flush can race it back in");
  assert.match(FORM, /if \(submittedRef\.current\) return;/,
    "the flush does not check whether the check-in was already stored");
});

/**
 * RESTORED BUT INVISIBLE IS THE SAME AS LOST.
 *
 * `logTraining` is seeded from the SAVED entry, and a draft is read later in an
 * effect — so drills came back into state behind a collapsed panel. The athlete
 * sees an empty form either way.
 */
test("restoring a draft opens the training panel it restored into", () => {
  const restore = FORM.slice(FORM.indexOf("if (draft.training)"), FORM.indexOf("const age = draftAge"));
  assert.match(restore, /setTraining\(draft\.training\)/, "the draft's training is not restored");
  assert.match(restore, /setLogTraining\(true\)/,
    "the panel stays shut, so restored drills are invisible");
  assert.match(restore, /drills\?\.length \?\? 0\) > 0 \|\| draft\.training\.total_minutes != null/,
    "the panel is opened even for an empty training log, which is noise");
});
