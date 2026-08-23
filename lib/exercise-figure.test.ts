// The stick figure on every exercise card.
//
// "All the images are awful" — and they were, for reasons that turned out to be
// specific rather than a matter of taste:
//
//   1. ARMS HAD NO ELBOW. Legs had a knee from the first version; arms were one
//      straight segment from shoulder to hand. Every figure had two rigid poles
//      hanging off it, and on a run — where the hands are on opposite sides of
//      the body, because that is what an arm swing is — the two straight
//      segments crossed the chest and drew an X over the torso. The figure read
//      as somebody toppling forward.
//   2. LIMBS WERE CHROME. Four strokes each: a casing, a diagonal metallic
//      gradient, a white bevel offset by a pixel, and a coloured line on top
//      with a glow filter. At thumbnail size that is noise.
//   3. THE WORKING MUSCLE WAS RED. #ef4444 — the same red as a red readiness
//      score and an injury flag — glowing, over the limb. Every card looked
//      like a diagram of somebody hurt.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../components/ExerciseDemo.tsx", import.meta.url), "utf8");
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("arms bend, the way legs always have", () => {
  assert.match(src, /lElbow\?: XY; rElbow\?: XY;/);
  // Upper arm and forearm, two segments — the same shape as hip→knee→ankle.
  assert.match(code, /<Segment from=\{lShoulder\} to=\{lElbow\}/);
  assert.match(code, /<Segment from=\{lElbow\} to=\{j\.lHand\}/);
  assert.match(code, /<Segment from=\{rShoulder\} to=\{rElbow\}/);
  assert.match(code, /<Segment from=\{rElbow\} to=\{j\.rHand\}/);
  assert.ok(!/<Segment from=\{lShoulder\} to=\{j\.lHand\}/.test(code), "the straight pole is back");
});

test("a pose that does not state an elbow still gets one", () => {
  // Every pose gains a bend without being rewritten — and the derived bend is
  // never zero, because a perfectly straight arm is the thing this exists to
  // stop.
  assert.match(code, /const lElbow = j\.lElbow \?\? elbowFor\(lShoulder, j\.lHand, j\.neck\[0\]\)/);
  const fn = src.slice(src.indexOf("function elbowFor"), src.indexOf("const STAND"));
  assert.match(fn, /Math\.min\(6, 2 \+ length \* 0\.16\)/, "the bend can be zero, which is a straight arm");
});

test("the run says where its elbows are, because that is the movement", () => {
  // Runners hold about ninety degrees and swing from the shoulder, hands going
  // hip to chest without crossing the midline. Derived elbows cannot know that.
  const run = src.slice(src.indexOf("  run: {"), src.indexOf("  lateral: {"));
  assert.match(run, /lElbow: \[/);
  assert.match(run, /rElbow: \[/);
  // Opposite arm, opposite leg — the thing that makes a still frame read as
  // motion instead of a stance.
  assert.match(run, /a: \{[\s\S]*?lHand: \[58, 33\][\s\S]*?rHand: \[40, 62\]/);
  assert.match(run, /b: \{[\s\S]*?lHand: \[60, 62\][\s\S]*?rHand: \[42, 33\]/);
});

test("the poses where the bend IS the lift state it", () => {
  // A press racked at the shoulders and a press locked out overhead are the
  // same straight arm at two heights without elbows. Same for a hang and a
  // chin-over-bar.
  for (const pattern of ["press", "pull"]) {
    const at = src.indexOf(`  ${pattern}: {`);
    assert.ok(at > 0, `${pattern} is gone`);
    const block = src.slice(at, src.indexOf("\n  },", at));
    assert.match(block, /lElbow: \[/, `${pattern} has no stated elbow`);
  }
});

test("a limb is two strokes, not four", () => {
  const fn = code.slice(code.indexOf("function Segment("), code.indexOf("function Figure("));
  const strokes = fn.match(/<line/g) ?? [];
  assert.equal(strokes.length, 2, `a limb is drawn with ${strokes.length} strokes`);
  assert.ok(!fn.includes("figure-surface"), "the chrome gradient is back on the limbs");
  assert.ok(!fn.includes("activation-glow"), "the glow is back");
  assert.ok(!/strokeOpacity=\{0\.24\}/.test(fn), "the bevel line is back");
});

test("a working muscle is gold, not the colour of an injury", () => {
  // #ef4444 is the app's red: a red readiness score, an injury flag. Painted on
  // a limb it says the opposite of "this is the bit that is working".
  assert.match(src, /const activationColour = \(level: Activation\) => level === "primary" \? "#e3b53f" : "#b98c5a"/);
  assert.ok(!code.includes("#ef4444"), "the injury red is back on the figure");
});

test("the colour is in the body, not floating over it", () => {
  // Three glowing ellipses used to be laid over the torso for chest, core and
  // hips. At thumbnail size they are splodges, and the glow bled past the
  // outline. The limb and the torso carry their own colour now.
  assert.match(code, /stroke=\{activation \? activationColour\(activation\) : LIMB_FILL\}/);
  assert.match(code, /fill=\{torsoActivation \? activationColour\(torsoActivation\) : TORSO_FILL\}/);
  assert.ok(!/chestCentre\[0\]\} cy=\{chestCentre\[1\]\}/.test(code), "the chest blob is back");
  // Core is the one zone with no limb of its own, so it keeps a shape — but a
  // flat one, inside the outline, and only when the torso is not already lit.
  assert.match(code, /zones\.core && !torsoActivation/);
});

test("nothing is left defining what no longer renders", () => {
  // A gradient nobody references is a gradient somebody re-applies by accident.
  for (const id of ["figure-surface", "figure-head", "activation-glow"]) {
    assert.ok(!src.includes(id), `${id} is defined and unused`);
  }
});
