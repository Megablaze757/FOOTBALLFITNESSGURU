import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CHROME_H, MIN_STAGE_H, STAGE_MARGIN, STAGE_MAX_H, STAGE_NAME, STAGE_RATIO, STAGE_ROUTE,
  isStageRoute, stageBox, stageFeatures,
} from "./reel-stage";
import { SCRIPTS, reelScript, beatAt } from "./reel-script";

const code = (src: string) =>
  readFileSync(src, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Every screen anybody films on, plus the ones nobody should have to. */
const SCREENS = [
  { name: "13in laptop", width: 1440, height: 900 },
  { name: "16in laptop", width: 1728, height: 1117 },
  { name: "1080p", width: 1920, height: 1080 },
  { name: "4K", width: 3840, height: 2160 },
  { name: "ultrawide", width: 5120, height: 1440 },
  { name: "old netbook", width: 1024, height: 600 },
  { name: "absurdly short", width: 1280, height: 320 },
  { name: "absurdly narrow", width: 320, height: 1200 },
];

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A REEL IS 9:16, AND THE SHAPE IS DECIDED BEFORE THE RECORDING.
 *
 * Film a maximised browser and every platform either pillarboxes it or crops
 * through the middle of the layout. Neither is fixable afterwards without
 * filming it again, which is why this is a function with tests rather than a
 * note in the instructions.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the stage is a phone on every screen worth filming on", () => {
  for (const screen of SCREENS) {
    const box = stageBox(screen);
    const ratio = box.width / box.height;
    assert.ok(
      Math.abs(ratio - STAGE_RATIO) < 0.01,
      `${screen.name}: ${box.width}x${box.height} is ${ratio.toFixed(3)}, not 9:16`,
    );
    assert.ok(box.height <= STAGE_MAX_H, `${screen.name}: ${box.height}px stops being a phone layout`);

    /**
     * The readable floor holds everywhere it CAN hold. It cannot on a screen
     * too narrow to fit a 9:16 window that tall — and there the ratio wins,
     * because a small correctly-shaped video is postable and a large wrongly-
     * shaped one is letterboxed by every platform that receives it.
     */
    const roomForFloor = screen.width - STAGE_MARGIN * 2 >= MIN_STAGE_H * STAGE_RATIO;
    if (roomForFloor) {
      assert.ok(box.height >= MIN_STAGE_H, `${screen.name}: ${box.height}px is too small to read`);
    } else {
      assert.ok(box.width <= screen.width, `${screen.name}: wider than the screen`);
    }
  }
});

test("it opens somewhere the person can actually see it", () => {
  for (const screen of SCREENS) {
    const box = stageBox(screen);
    assert.ok(box.left >= 0, `${screen.name}: opens off the left edge`);
    assert.ok(box.top >= 0, `${screen.name}: opens above the top of the screen`);
    // A window that starts off-screen cannot be picked in the share dialog
    // either, which is the failure that matters.
    assert.ok(box.left < screen.width, `${screen.name}: opens past the right edge`);
  }
});

/**
 * `window.screen` is not always telling the truth — headless contexts and some
 * embedded browsers report zeroes, and the fallback for that lives at the call
 * site. This is the belt: whatever numbers arrive, the window that comes back
 * has to be one a person can see and pick out of the share dialog.
 */
test("a screen reporting nonsense still yields a window that can be seen", () => {
  for (const screen of [{ width: 0, height: 0 }, { width: 40, height: 900 }, { width: -100, height: -100 }]) {
    const box = stageBox(screen);
    assert.ok(box.width > 0 && box.height > 0, `${JSON.stringify(screen)} produced ${box.width}x${box.height}`);
    assert.ok(box.left >= 0, `${JSON.stringify(screen)} opens off the left edge at ${box.left}`);
    assert.ok(box.top >= 0, `${JSON.stringify(screen)} opens above the screen at ${box.top}`);
  }
});

/**
 * The invariant `beatAt` rests on: no gaps. With one, the clock can land on a
 * beat it has not reached, and the progress bar runs backwards.
 */
test("beats are contiguous, which is what makes the prompter's arithmetic safe", () => {
  for (const { id } of SCRIPTS) {
    const script = reelScript(id);
    assert.ok(script);
    let at = 0;
    for (const [i, beat] of script.beats.entries()) {
      assert.equal(beat.at, at, `${id} beat ${i + 1} starts at ${beat.at}, not ${at}`);
      at += beat.ms;
    }
    assert.equal(at, script.totalMs, `${id}: the beats do not add up to its own length`);
    // And the consequence, stated as the thing anybody would actually notice.
    for (let ms = 0; ms <= script.totalMs; ms += 137) {
      const p = beatAt(script, ms)?.progress ?? -1;
      assert.ok(p >= 0 && p <= 1, `${id} at ${ms}ms: progress ${p}`);
    }
  }
});

test("a screen with room to spare is not filled by the stage", () => {
  const box = stageBox({ width: 1920, height: 1080 });
  assert.ok(box.height <= 1080 - CHROME_H, "the stage is taller than the screen it opens on");
  assert.ok(box.left + box.width <= 1920, "the stage hangs off the right");
  assert.ok(box.left > 900, "the stage is parked over the studio it is meant to sit beside");
});

/**
 * The floor wins on a screen too small for it. Deliberate: a window can be
 * moved and resized, and footage nobody can read at feed size cannot be fixed
 * at all. The test exists so the overflow is a decision rather than a surprise.
 */
test("a screen too small for a readable stage gets one anyway", () => {
  const box = stageBox({ width: 1280, height: 320 });
  assert.equal(box.height, MIN_STAGE_H);
  assert.equal(box.top, 0, "it should at least start at the top of what there is");
});

test("a screen too narrow for 9:16 gives up width, not the ratio", () => {
  const screen = { width: 320, height: 1200 };
  const box = stageBox(screen);
  assert.ok(box.width <= screen.width, "wider than the screen");
  assert.ok(Math.abs(box.width / box.height - STAGE_RATIO) < 0.01, "the ratio was sacrificed instead");
});

test("the features string says everything window.open needs", () => {
  const box = stageBox({ width: 1440, height: 900 });
  const features = stageFeatures(box);
  for (const key of ["width", "height", "left", "top"]) {
    assert.match(features, new RegExp(`(^|,)${key}=\\d+(,|$)`), `no ${key} in "${features}"`);
  }
  assert.match(features, /popup=yes/, "a tab would open behind the studio, named the same thing");
  assert.ok(!/\s/.test(features), "a space in the features string is silently ignored by some browsers");
});

// --- where the stage is allowed to go ----------------------------------------

test("the stage only ever goes somewhere in this app", () => {
  for (const ok of ["/", "/home", "/journal", "/cheapest-protein/", "/drills/", "/a/sacha?x=1"]) {
    assert.ok(isStageRoute(ok), `${ok} is a route in this app and was refused`);
  }
  for (const bad of [
    "", "//evil.example", "\\\\evil.example", "https://evil.example", "http://x",
    "javascript:alert(1)", "data:text/html,x", "home", " /home",
  ]) {
    assert.ok(!isStageRoute(bad), `${JSON.stringify(bad)} would navigate the stage off the app`);
  }
});

/**
 * The guard is worth nothing if the scripts do not satisfy it: a beat whose
 * route is refused leaves the stage on the previous screen with the narration
 * describing a different one, and nothing says so.
 */
test("every beat of every script names a route the stage can be sent to", () => {
  for (const { id } of SCRIPTS) {
    const script = reelScript(id);
    assert.ok(script, `${id} has no script`);
    for (const [i, beat] of script.beats.entries()) {
      assert.ok(isStageRoute(beat.route), `${id} beat ${i + 1}: "${beat.route}" cannot be staged`);
    }
  }
});

// --- the teleprompter's one function -----------------------------------------

test("the clock lands on a beat from the first frame to the last", () => {
  const script = reelScript("demo-readiness");
  assert.ok(script);
  const first = beatAt(script, 0);
  assert.equal(first?.index, 0, "frame zero is on no beat at all");
  assert.equal(first?.progress, 0);
  assert.equal(first?.overrun, false);

  for (const [i, beat] of script.beats.entries()) {
    assert.equal(beatAt(script, beat.at)?.index, i, `the start of beat ${i + 1} shows the wrong beat`);
    assert.equal(beatAt(script, beat.at + beat.ms - 1)?.index, i, `beat ${i + 1} ends early`);
  }
});

/** Going blank at the end reads as a crash, while somebody is still talking. */
test("overrunning holds the last beat rather than showing nothing", () => {
  const script = reelScript("demo-cost");
  assert.ok(script);
  const over = beatAt(script, script.totalMs + 60_000);
  assert.equal(over?.index, script.beats.length - 1);
  assert.equal(over?.progress, 1);
  assert.equal(over?.overrun, true, "nothing tells the person they have run long");
});

test("a clock that has not started yet is on the first beat, not before it", () => {
  const script = reelScript("drill", "Five-spot shooting");
  assert.ok(script);
  assert.equal(beatAt(script, -5_000)?.index, 0);
  assert.equal(beatAt(script, -5_000)?.progress, 0);
  assert.equal(beatAt({ ...script, beats: [] }, 0), null);
});

// --- the studio has to hold up its end ---------------------------------------

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE BUG, GUARDED WHERE IT WAS.
 *
 * The studio said "share THIS tab" and then told you to go to /journal. This
 * is a single-page app: following that unmounted the studio, and its cleanup
 * stopped every track. Doing as instructed produced no file at all.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the studio never asks to be filmed", () => {
  const src = code("components/ReelRecorder.tsx");
  assert.ok(!/share\s+<b>this tab<\/b>/i.test(src), "it still asks you to share the tab it lives in");
  assert.ok(!/Share a tab and record/.test(src), "the button still offers to share a tab");
  assert.match(src, new RegExp(`window\\.open\\(STAGE_ROUTE, STAGE_NAME`),
    "nothing opens the second window the recording is of");
});

test("the stage is opened before the share dialog can be reached", () => {
  const src = code("components/ReelRecorder.tsx");
  // The dialog can only offer a window that already exists, and somebody who
  // gets there with nothing to pick will share this tab — the original bug.
  assert.match(src, /disabled=\{canRecord === null \|\| !stageOpen\}/,
    "recording can start with no stage to record");
});

test("the stage is closed with the studio, and only moved when the screen changes", () => {
  const src = code("components/ReelRecorder.tsx");
  assert.match(src, /stage\.current\?\.close\(\)/, "a popup nobody owns is one they have to hunt for");
  assert.match(src, /if \(route === droveTo\.current\) return;/,
    "the stage reloads on every frame instead of on every screen change");
});

test("the names the studio and the stage agree on are the ones this file exports", () => {
  const src = code("components/ReelRecorder.tsx");
  for (const name of ["STAGE_NAME", "STAGE_ROUTE", "stageBox", "stageFeatures", "isStageRoute"]) {
    assert.ok(src.includes(name), `the studio does not use ${name}`);
  }
  assert.equal(STAGE_ROUTE, "/home", "the stage should open on the app, not the marketing site");
  assert.ok(STAGE_NAME.length > 0 && !/\s/.test(STAGE_NAME), "a window name with a space names nothing");
  assert.ok(STAGE_MARGIN >= 0);
});
