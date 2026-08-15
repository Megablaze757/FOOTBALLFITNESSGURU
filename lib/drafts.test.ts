import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  saveDraft, loadDraft, clearDraft, clearAllDrafts, draftAge, describeAge, checkInIsDirty,
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
  // The guard may carry other conditions alongside it — it also skips an
  // untouched form — so this pins that the flag is consulted, not the line.
  assert.match(FORM, /if \(submittedRef\.current[^)]*\) return;/,
    "the flush does not check whether the check-in was already stored");
});

/**
 * RESTORED BUT INVISIBLE IS THE SAME AS LOST.
 *
 * `logTraining` is seeded from the SAVED entry, and a draft is read later in an
 * effect — so drills came back into state behind a collapsed panel. The athlete
 * sees an empty form either way.
 */
test("restoring a draft puts the form back where it was, not just what was typed", () => {
  const restore = FORM.slice(FORM.indexOf("const applyDraft"), FORM.indexOf("const [pendingDraft"));
  assert.ok(restore.length > 0, "applyDraft has been renamed or moved");

  assert.match(restore, /setTraining\(draft\.training\)/, "the draft's training is not restored");
  assert.match(restore, /setLogTraining\(/, "the panel stays shut, so restored drills are invisible");
  assert.match(restore, /drills\?\.length \?\? 0\) > 0 \|\| draft\.training\?\.total_minutes != null/,
    "the panel is opened even for an empty training log, which is noise");

  /**
   * THE POSITION IS PART OF THE WORK.
   *
   * `sore` is the loud one: without it the body map is hidden and a marked-up
   * knee sits in `painMap` invisible, which from the athlete's side is
   * identical to the soreness having been thrown away. `detailed` is the other
   * — halfway through the full check-in, back to the quick one.
   */
  assert.match(restore, /setSore\(/, "soreness is not restored, so the body map hides the marks");
  assert.match(restore, /setDetailed\(/, "quick/full mode is not restored");
  assert.match(restore, /setWeighing\(/, "the weight field's open state is not restored");
  // And `sore` falls back to the pain map for drafts written before it was saved.
  assert.match(restore, /Object\.keys\(draft\.painMap \?\? \{\}\)\.length > 0/,
    "an older draft with marks in it will open with the body map shut");
});

test("a draft alongside a saved check-in is offered rather than applied", () => {
  // Checking in at 7am and adding the evening's session later is the normal
  // pattern for a daily user, and that half-finished session used to be dropped
  // because `initial` existed. Restoring it silently would be the opposite
  // mistake — overwriting what is actually stored.
  assert.match(FORM, /if \(initial\) \{\s*\n\s*setPendingDraft\(draft\);/,
    "a draft is no longer held back when a check-in already exists");
  assert.match(FORM, /applyDraft\(pendingDraft\)/, "there is no way to accept the offered draft");
  assert.match(FORM, /clearDraft\("checkin", userId, today\);\s*\n\s*setPendingDraft\(null\)/,
    "discarding the offer leaves the draft on disk to be offered again forever");
});

test("an untouched form is never written as a draft", () => {
  assert.match(FORM, /!dirtyRef\.current/,
    "the flush no longer checks whether anything was entered");
  assert.match(FORM, /const dirty = checkInIsDirty\(/,
    "the dirtiness rules are inlined again rather than tested in lib/drafts.ts");
});

// --- Is there anything worth keeping? ---------------------------------------

/** An untouched quick check-in, exactly as the form mounts it. */
const fresh = () => ({
  painMap: {}, fatigue: 5, sleep: 7, nutrition: 6, weight: "", isMatchDay: false,
  sore: null, training: { drills: [], total_minutes: null, intensity: null },
});

test("an untouched check-in is not worth saving", () => {
  // THE BUG THIS FIXES. The autosave fired 400ms after mount whatever happened,
  // so opening the page and closing it wrote a draft of the defaults — and the
  // next visit said "restored from 2 hours ago" over a form nobody had filled
  // in. A restore notice that is usually about nothing is one people learn to
  // ignore, and then it fails them on the morning it was real.
  assert.equal(checkInIsDirty(fresh()), false);
  assert.equal(checkInIsDirty({}), false, "an empty object is not work in progress");
});

test("every way of starting the check-in counts as work", () => {
  const cases: [string, object][] = [
    ["marked a sore knee", { painMap: { knee_left: 3 } }],
    ["answered 'nothing hurts'", { sore: false }],
    ["answered 'something hurts'", { sore: true }],
    ["moved the sleep scale", { sleep: 3 }],
    ["moved fatigue", { fatigue: 9 }],
    ["moved nutrition", { nutrition: 2 }],
    ["typed a weight", { weight: "82" }],
    ["said it was a match day", { isMatchDay: true }],
    ["added a drill", { training: { drills: [{ name: "Back squat" }] } }],
    ["typed a duration", { training: { total_minutes: 45 } }],
    ["picked a run type", { training: { run_type: "hills" } }],
    ["logged a distance", { training: { distance_km: 8 } }],
  ];
  for (const [what, patch] of cases) {
    assert.equal(checkInIsDirty({ ...fresh(), ...patch }), true, `${what} should be kept`);
  }
});

test("'no' to soreness is as real an answer as 'yes'", () => {
  // It is also the one most likely to be given first and then interrupted, so
  // treating null and false alike would lose the commonest first tap there is.
  assert.equal(checkInIsDirty({ ...fresh(), sore: false }), true);
  assert.equal(checkInIsDirty({ ...fresh(), sore: null }), false);
});

test("dirtiness is measured against an existing entry, not against zero", () => {
  // Re-opening a saved check-in seeds the form FROM it. Comparing to the
  // hardcoded defaults would call that untouched form dirty and immediately
  // write a draft of the athlete's own saved answers back over itself.
  const saved = { fatigue_score: 8, sleep_quality: 3, nutrition_quality: 9, weight_kg: 82, is_match_day: true };
  const seeded = {
    ...fresh(), fatigue: 8, sleep: 3, nutrition: 9, weight: "82", isMatchDay: true,
  };
  assert.equal(checkInIsDirty(seeded, saved), false, "re-opening an entry is not editing it");
  assert.equal(checkInIsDirty({ ...seeded, sleep: 4 }, saved), true, "changing one thing is");
  // And against no baseline the same form obviously IS full of work.
  assert.equal(checkInIsDirty(seeded), true);
});
