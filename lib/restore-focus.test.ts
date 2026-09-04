import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GUIDE_FRAMES,
  RESTORE_ANCHOR,
  RESTORE_BUTTON_ATTR,
  TRAINING_ANCHORS,
  firstPresent,
  guideStep,
  guideTo,
  scrollOrder,
} from "./restore-focus";

const code = (src: string) =>
  readFileSync(src, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

const present = (...ids: string[]) => (id: string) => ids.includes(id);

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * "WHEN I RECLICK ON THE LOG TO RESTOR IT SHOULD AUTO REGUIDE ME TO RESTORE
 *  BUTTON RATHER TO MIDDLE OF OAGE"
 *
 * The training section is the middle of the page. The restore banner is at the
 * top of the form. Scrolling to the section leaves the banner off screen above
 * you, and nothing else on the page says the draft exists.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the restore banner wins even when the thing that was asked for is right there", () => {
  for (const fallback of TRAINING_ANCHORS) {
    assert.deepEqual(
      guideStep([fallback], present(RESTORE_ANCHOR, fallback), GUIDE_FRAMES),
      { action: "scroll", id: RESTORE_ANCHOR },
    );
  }
});

/**
 * THE RACE THIS FILE IS REALLY ABOUT.
 *
 * The training section exists the moment the form mounts. The banner waits on
 * an effect that reads localStorage and sets state, so there is a frame where
 * only the fallback is on the page — and taking it in that frame reproduces
 * the reported bug exactly, while looking like a correct scroll.
 */
test("a frame where only the fallback exists is not an answer yet", () => {
  assert.deepEqual(guideStep(TRAINING_ANCHORS, present("training"), GUIDE_FRAMES), { action: "wait" });
  assert.ok(GUIDE_FRAMES > 0, "with no frames in hand there is nothing to wait with");
});

/** But waiting forever is its own bug: a tap that does nothing visible. */
test("when the frames run out the fallback gets it rather than nobody", () => {
  assert.deepEqual(
    guideStep(TRAINING_ANCHORS, present("training"), 0),
    { action: "scroll", id: "training" },
  );
  assert.deepEqual(
    guideStep(TRAINING_ANCHORS, present("log-training"), 0),
    { action: "scroll", id: "log-training" },
  );
});

test("nothing on the page leaves the view alone", () => {
  assert.deepEqual(guideStep(TRAINING_ANCHORS, () => false, 0), { action: "stop" });
  assert.deepEqual(guideStep([], () => false, 0), { action: "stop" });
});

test("the banner is first, once, whatever the caller passes", () => {
  assert.deepEqual(scrollOrder([]), [RESTORE_ANCHOR]);
  assert.deepEqual(scrollOrder([RESTORE_ANCHOR]), [RESTORE_ANCHOR]);
  assert.deepEqual(scrollOrder(["a", "a", "", "b"]), [RESTORE_ANCHOR, "a", "b"]);
  assert.deepEqual(scrollOrder(TRAINING_ANCHORS), [RESTORE_ANCHOR, ...TRAINING_ANCHORS]);
});

test("firstPresent keeps the caller's order and admits when there is none", () => {
  assert.equal(firstPresent(["a", "b"], present("b")), "b");
  assert.equal(firstPresent(["a", "b"], present("a", "b")), "a");
  assert.equal(firstPresent([], present("a")), null);
  assert.equal(firstPresent(["a"], () => false), null);
});

// --- The driver, against a fake page ----------------------------------------

interface FakeRun {
  scrolled: string[];
  focused: number;
  frames: number;
}

/**
 * Drive `guideTo` over a scripted mount sequence.
 *
 * `perFrame[n]` is the set of ids on the page when frame n runs, so the real
 * sequence — section first, banner a render later — can be written down.
 */
function drive(requested: readonly string[], perFrame: string[][], stopAfter = 12): FakeRun {
  const run: FakeRun = { scrolled: [], focused: 0, frames: 0 };
  // A map rather than one variable: the driver is allowed to cancel a frame it
  // never scheduled, and a fake that ignored the handle would hide that.
  const pending = new Map<number, () => void>();
  let handle = 0;

  const element = (id: string) => ({
    scrollIntoView: () => run.scrolled.push(id),
    querySelector: (sel: string) =>
      id === RESTORE_ANCHOR && sel === `[${RESTORE_BUTTON_ATTR}]`
        ? { focus: () => { run.focused += 1; } }
        : null,
  });

  const win = {
    requestAnimationFrame: (fn: () => void) => { pending.set(++handle, fn); return handle; },
    cancelAnimationFrame: (h: number) => { pending.delete(h); },
  };
  const doc = {
    getElementById: (id: string) =>
      (perFrame[Math.min(run.frames, perFrame.length - 1)] ?? []).includes(id) ? element(id) : null,
  };

  const g = globalThis as Record<string, unknown>;
  const hadWindow = "window" in g, hadDoc = "document" in g;
  const oldWindow = g.window, oldDoc = g.document;
  g.window = win;
  g.document = doc;
  try {
    guideTo(requested);
    while (pending.size > 0 && run.frames < stopAfter) {
      const [h, fn] = [...pending][0];
      pending.delete(h);
      fn();
      run.frames += 1;
    }
  } finally {
    if (hadWindow) g.window = oldWindow; else delete g.window;
    if (hadDoc) g.document = oldDoc; else delete g.document;
  }
  assert.equal("window" in g, hadWindow, "the fake window outlived the test");
  assert.equal("document" in g, hadDoc, "the fake document outlived the test");
  return run;
}

/**
 * The whole reported journey in one test: tap "Add today's training", the form
 * mounts with the section in it, the draft effect adds the banner a render
 * later — and the scroll lands on the banner, not the section.
 */
test("the banner arriving a frame late still gets the scroll", () => {
  const run = drive(TRAINING_ANCHORS, [["training"], ["training", RESTORE_ANCHOR]]);
  assert.deepEqual(run.scrolled, [RESTORE_ANCHOR]);
  assert.equal(run.focused, 1, "the button, not just the region");
});

test("no draft at all and the training section gets it, a couple of frames later", () => {
  const run = drive(TRAINING_ANCHORS, [["training"]]);
  assert.deepEqual(run.scrolled, ["training"]);
  assert.equal(run.focused, 0);
});

/** A page with neither must not spin: every frame is one the person waits. */
test("the driver gives up rather than looping forever", () => {
  const run = drive(TRAINING_ANCHORS, [[]]);
  assert.deepEqual(run.scrolled, []);
  assert.ok(run.frames <= GUIDE_FRAMES + 1, `gave up after ${run.frames} frames`);
});

test("unmounting cancels a scroll that has not happened yet", () => {
  const g = globalThis as Record<string, unknown>;
  const hadWindow = "window" in g;
  const oldWindow = g.window, oldDoc = g.document;
  let cancelled = false;
  let ran = false;
  g.window = {
    requestAnimationFrame: () => 7,
    cancelAnimationFrame: (h: number) => { cancelled = h === 7; },
  };
  g.document = { getElementById: () => { ran = true; return null; } };
  try {
    guideTo([])();
  } finally {
    if (hadWindow) { g.window = oldWindow; g.document = oldDoc; } else { delete g.window; delete g.document; }
  }
  assert.equal("window" in g, hadWindow, "the fake window outlived the test");
  assert.ok(cancelled, "the frame was left to fire after the page had gone");
  assert.ok(!ran, "nothing should have looked at the page yet");
});

test("server rendering asks nothing of a browser that is not there", () => {
  const g = globalThis as Record<string, unknown>;
  const hadWindow = "window" in g;
  const oldWindow = g.window;
  if (hadWindow) delete g.window;
  try {
    assert.doesNotThrow(() => guideTo(TRAINING_ANCHORS)());
  } finally {
    if (hadWindow) g.window = oldWindow;
  }
  assert.equal("window" in g, hadWindow, "the window was not put back");
});

// --- The page has to hold up its end -----------------------------------------

/**
 * The logic above is worth nothing if the ids it chooses between are not on
 * the page. Asserted on the SOURCE with comments stripped, because every one
 * of these names appears in the prose explaining the choice.
 */
test("the ids this file arbitrates between exist in the form", () => {
  const form = code("components/JournalForm.tsx");
  assert.match(form, new RegExp(`id=\\{RESTORE_ANCHOR\\}`), "the banner is unaddressable");
  assert.match(form, new RegExp(`\\[RESTORE_BUTTON_ATTR\\]`), "the Restore button cannot be focused");
  assert.match(form, /id="log-training"/, "the quick form's training row lost its anchor");
  assert.match(form, /id="training"/, "the detailed form's training section lost its anchor");
  for (const id of TRAINING_ANCHORS) {
    assert.ok(form.includes(`id="${id}"`), `${id} is in TRAINING_ANCHORS but nowhere in the form`);
  }
});

/**
 * THE ORIGINAL BUG, GUARDED AT ITS SOURCE.
 *
 * Both scrolls used to name the training section directly. Either one doing so
 * again puts the banner back off screen, and nothing else in this file would
 * notice — the arbitration would still be correct and simply never consulted.
 */
test("nothing scrolls straight to the training section any more", () => {
  for (const file of ["components/JournalForm.tsx", "app/(app)/journal/page.tsx"]) {
    const src = code(file);
    assert.ok(
      !/getElementById\(\s*["']training["']\s*\)/.test(src),
      `${file} still reaches for the training section itself`,
    );
    assert.ok(
      !/scrollIntoView/.test(src),
      `${file} scrolls on its own instead of going through guideTo`,
    );
    assert.ok(/guideTo\(/.test(src), `${file} never calls guideTo`);
  }
});

/**
 * The done card is the state the bug was reported from: a saved check-in, so
 * the form — and the only banner that mentions the draft — is not mounted.
 * The page has to open it itself, or there is nothing to guide to.
 */
test("the journal page opens the form when a draft is waiting behind the done card", () => {
  const page = code("app/(app)/journal/page.tsx");
  assert.match(page, /loadDraft\(\s*"checkin"/, "the page never checks whether a draft exists");
  assert.match(page, /setEditing\(true\);\s*\n\s*return guideTo\(\[\]\)/,
    "the form is opened without then going to the banner, or the other way round");
});
