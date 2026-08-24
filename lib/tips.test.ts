import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  TIPS, nextTip, tipsMuted, seenIds, actedMark, dismissedMark, tipAnchors,
  MUTE_AFTER_DISMISSALS, type TipContext,
} from "./tips";

const NEW: TipContext = {
  tier: "gold", checkIns: 0, sessionsDone: 0, hasProgram: false,
  weightEntries: 0, customExercises: 0, hasWearable: false,
};
const REGULAR: TipContext = {
  tier: "gold", checkIns: 20, sessionsDone: 8, hasProgram: true,
  weightEntries: 6, customExercises: 0, hasWearable: false,
};

// --- earned, not scheduled ----------------------------------------------------

/**
 * Telling somebody on day one that they can rank their bench is noise. Every
 * precondition is usage, not elapsed time, so a brand new account gets nothing
 * anywhere.
 */
test("a brand new athlete is shown nothing at all", () => {
  for (const page of [...new Set(TIPS.map((t) => t.page))]) {
    assert.equal(nextTip(page, NEW, []), null, page);
  }
});

test("each tip waits for the thing that makes it useful", () => {
  assert.equal(nextTip("/library", { ...NEW, sessionsDone: 1 }, [])?.id, undefined);
  assert.equal(nextTip("/library", { ...NEW, sessionsDone: 2 }, [])?.id, "strength-calculator");

  assert.equal(nextTip("/coach", { ...NEW, hasProgram: true, sessionsDone: 2 }, []), null);
  assert.equal(nextTip("/coach", { ...NEW, hasProgram: true, sessionsDone: 3 }, [])?.id, "customise-session");

  assert.equal(nextTip("/body", { ...NEW, weightEntries: 1 }, []), null);
  assert.equal(nextTip("/body", { ...NEW, weightEntries: 2 }, [])?.id, "weight-trend");
});

test("a tip stops being offered once the thing it suggests is done", () => {
  const ctx = { ...REGULAR, sessionsDone: 6 };
  assert.equal(nextTip("/library", ctx, [dismissedMark("strength-calculator")])?.id, "add-your-own-exercise");
  assert.equal(
    nextTip("/library", { ...ctx, customExercises: 1 }, [dismissedMark("strength-calculator")]),
    null,
    "somebody who has added one already knows how",
  );

  assert.equal(nextTip("/journal", REGULAR, [])?.id, "connect-wearable");
  assert.equal(nextTip("/journal", { ...REGULAR, hasWearable: true }, []), null);
});

// --- never advertise something they cannot use --------------------------------

/**
 * Pointing a free athlete at a Pro feature teaches them the app is a shop.
 */
test("a locked feature is never pointed at", () => {
  const free = { ...REGULAR, tier: "bronze" as const };
  assert.equal(nextTip("/library", free, []), null, "library is Pro");
  assert.equal(nextTip("/coach", free, []), null, "programmes are Pro");
  // The weight trend needs nothing, so it is still offered.
  assert.equal(nextTip("/body", free, [])?.id, "weight-trend");
});

// --- one at a time, once only --------------------------------------------------

test("a tip is never shown twice, however it ended", () => {
  const ctx = { ...REGULAR, sessionsDone: 6 };
  assert.equal(nextTip("/library", ctx, [])?.id, "strength-calculator");
  assert.equal(nextTip("/library", ctx, [actedMark("strength-calculator")])?.id, "add-your-own-exercise");
  assert.equal(
    nextTip("/library", ctx, [actedMark("strength-calculator"), actedMark("add-your-own-exercise")]),
    null,
  );
});

test("when two are eligible, priority decides and only one is returned", () => {
  const ctx = { ...REGULAR, sessionsDone: 6 };
  const tip = nextTip("/library", ctx, []);
  assert.equal(tip?.id, "strength-calculator");
  assert.ok(tip, "one tip, not a list");
});

test("a page with no tips returns null rather than reaching for another page's", () => {
  assert.equal(nextTip("/nutrition", REGULAR, []), null);
  assert.equal(nextTip("/", REGULAR, []), null);
});

/** The app is a static export, so every route is a directory. */
test("a trailing slash is the same page", () => {
  assert.equal(nextTip("/body/", { ...NEW, weightEntries: 2 }, [])?.id, "weight-trend");
  assert.equal(nextTip("/body", { ...NEW, weightEntries: 2 }, [])?.id, "weight-trend");
});

// --- three dismissals is an answer ---------------------------------------------

test("waving three away with none acted on stops them for good", () => {
  const dismissals = TIPS.slice(0, MUTE_AFTER_DISMISSALS).map((t) => dismissedMark(t.id));
  assert.equal(tipsMuted(dismissals), true);
  assert.equal(nextTip("/body", { ...NEW, weightEntries: 5 }, dismissals), null);
});

test("acting on one keeps them alive — they are finding them useful", () => {
  const mixed = [actedMark("strength-calculator"), dismissedMark("a"), dismissedMark("b"), dismissedMark("c")];
  assert.equal(tipsMuted(mixed), false);
  assert.equal(nextTip("/body", { ...NEW, weightEntries: 5 }, mixed)?.id, "weight-trend");
});

test("two dismissals is not yet an answer", () => {
  assert.equal(tipsMuted([dismissedMark("a"), dismissedMark("b")]), false);
});

test("an empty or missing history is not muted", () => {
  assert.equal(tipsMuted([]), false);
  assert.equal(tipsMuted(undefined as never), false);
});

test("seenIds reads both outcomes back", () => {
  const ids = seenIds([actedMark("one"), dismissedMark("two")]);
  assert.deepEqual([...ids].sort(), ["one", "two"]);
});

// --- the catalogue itself ------------------------------------------------------

test("every tip is distinct, addressable and points somewhere", () => {
  assert.equal(new Set(TIPS.map((t) => t.id)).size, TIPS.length, "duplicate ids");
  for (const t of TIPS) {
    assert.match(t.id, /^[a-z0-9-]+$/, `${t.id} is not a usable key`);
    assert.match(t.page, /^\//, `${t.id} has no page`);
    assert.ok(t.anchor.length > 0, `${t.id} has no anchor`);
    assert.ok(t.title.length > 0 && t.body.length > 0, `${t.id} has nothing to say`);
    assert.ok(t.body.length <= 200, `${t.id} is too long to read on a phone`);
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE FAILURE THIS EXISTS TO PREVENT: a tooltip floating in the corner
 * pointing at a control that was moved or renamed last week. The anchor and the
 * tip are written in different files, so nothing but this test keeps the
 * pairing honest.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("every anchor a tip names actually exists in the app", () => {
  const sources = [
    "../app/(app)/coach/page.tsx",
    "../app/(app)/library/page.tsx",
    "../app/(app)/body/page.tsx",
    "../app/(app)/journal/page.tsx",
    "../components/WeightHistory.tsx",
    "../components/WearableConnect.tsx",
    "../components/CustomExerciseForm.tsx",
  ].map((p) => readFileSync(new URL(p, import.meta.url), "utf8")).join("\n");

  for (const { id, anchor } of tipAnchors()) {
    assert.ok(
      sources.includes(`data-tip="${anchor}"`),
      `${id} points at data-tip="${anchor}", which nothing renders`,
    );
  }
});
