import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeFrames, syntheticFrames, type Frame } from "./biomech";

// A clean, symmetric squat filmed FRONT-ON: both knees track straight, deep
// flexion. The wide shoulder span is what marks it as a frontal view.
function cleanFrames(): Frame[] {
  const frames: Frame[] = [];
  for (let k = 0; k < 40; k++) {
    const phase = Math.sin((2 * Math.PI * k) / 40) * 0.5 + 0.5;
    const kneeY = 0.7 + 0.15 * phase;
    frames.push({
      left_shoulder: { x: 0.42, y: 0.3 }, right_shoulder: { x: 0.58, y: 0.3 },
      left_hip: { x: 0.46, y: 0.5 }, right_hip: { x: 0.54, y: 0.5 },
      left_knee: { x: 0.46, y: kneeY }, right_knee: { x: 0.54, y: kneeY },
      left_ankle: { x: 0.46, y: 0.9 }, right_ankle: { x: 0.54, y: 0.9 },
    });
  }
  return frames;
}

// The same movement filmed from the side: the shoulders collapse toward a
// single point, so the frontal plane is not visible.
function sideOnFrames(): Frame[] {
  return cleanFrames().map((f) => ({
    ...f,
    left_shoulder: { x: 0.50, y: 0.3 }, right_shoulder: { x: 0.52, y: 0.3 },
  }));
}

test("clean symmetric movement scores high symmetry, no alert", () => {
  const a = analyzeFrames(cleanFrames(), 30, { painMap: {}, source: "mediapipe" });
  assert.ok(a.symmetry_score >= 95, `symmetry ${a.symmetry_score}`);
  assert.equal(a.root_cause_alert, null);
  assert.equal(a.pose_source, "mediapipe");
  assert.ok(a.drills.length > 0 && a.drills.length <= 4);
});

test("left-knee valgus is detected on the correct side", () => {
  const frames = cleanFrames().map((f) => ({
    ...f,
    left_knee: { x: f.left_knee.x + 0.09, y: f.left_knee.y }, // caves inward
  }));
  const a = analyzeFrames(frames, 30, { painMap: {}, source: "mediapipe" });
  assert.ok(a.biomechanics.knee_valgus_left > a.biomechanics.knee_valgus_right);
  assert.ok(a.biomechanics.knee_valgus_left >= 10, `valgus ${a.biomechanics.knee_valgus_left}`);
  assert.equal(a.focus_area, "stability");
});

test("valgus + matching knee pain surfaces a root-cause alert", () => {
  const frames = cleanFrames().map((f) => ({
    ...f,
    left_knee: { x: f.left_knee.x + 0.09, y: f.left_knee.y },
  }));
  const a = analyzeFrames(frames, 30, { painMap: { knee_left: 8 }, source: "mediapipe" });
  assert.ok(a.root_cause_alert && /left/.test(a.root_cause_alert));
  assert.ok(/8\/10/.test(a.root_cause_alert!));
});

test("synthetic frames are deterministic per seed", () => {
  const a = analyzeFrames(syntheticFrames("video-123"), 30, { painMap: {}, source: "synthetic" });
  const b = analyzeFrames(syntheticFrames("video-123"), 30, { painMap: {}, source: "synthetic" });
  assert.deepEqual(a, b);
  const c = analyzeFrames(syntheticFrames("other"), 30, { painMap: {}, source: "synthetic" });
  assert.notDeepEqual(a.biomechanics, c.biomechanics);
});

test("in-season tapers drill volume", () => {
  const frames = cleanFrames();
  const off = analyzeFrames(frames, 30, { painMap: {}, isInSeason: false, source: "mediapipe" });
  const on = analyzeFrames(frames, 30, { painMap: {}, isInSeason: true, source: "mediapipe" });
  const offSets = off.drills.reduce((s, d) => s + d.sets, 0);
  const onSets = on.drills.reduce((s, d) => s + d.sets, 0);
  assert.ok(onSets < offSets, `on ${onSets} !< off ${offSets}`);
});

test("heatmap points carry normalised coords + intensity", () => {
  const a = analyzeFrames(syntheticFrames("hm"), 30, { painMap: {}, source: "synthetic" });
  assert.ok(a.heatmap_data.length > 0);
  for (const p of a.heatmap_data) {
    assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
    assert.ok(p.intensity >= 0 && p.intensity <= 1);
  }
});

test("empty frames degrade gracefully", () => {
  const a = analyzeFrames([], 30, { painMap: {}, source: "synthetic" });
  assert.equal(a.symmetry_score, 100);
  assert.equal(a.heatmap_data.length, 0);
  assert.equal(a.rep_count, 0);
  // With no landmarks we can't know the camera angle, so we say so rather than
  // silently implying the knees were measured.
  assert.match(a.root_cause_alert ?? "", /camera angle/i);
  assert.equal(a.view, "unknown");
});

test("side-on clips refuse to report knee valgus", () => {
  // Same inward-caving knee as the front-on case — but from the side, the
  // frontal plane isn't visible, so reporting a number would be fabrication.
  const caved = sideOnFrames().map((f) => ({
    ...f,
    left_knee: { x: f.left_knee.x + 0.09, y: f.left_knee.y },
  }));
  const a = analyzeFrames(caved, 30, { painMap: {}, source: "mediapipe" });
  assert.equal(a.view, "side");
  assert.equal(a.biomechanics.knee_valgus_left, 0);
  assert.equal(a.biomechanics.knee_valgus_right, 0);
  assert.match(a.root_cause_alert ?? "", /side-on/i);
  assert.ok((a.confidence ?? 1) < 0.8, `confidence ${a.confidence}`);
});

test("front-on clips are detected and trusted more than side-on", () => {
  const front = analyzeFrames(cleanFrames(), 30, { painMap: {}, source: "mediapipe" });
  const side = analyzeFrames(sideOnFrames(), 30, { painMap: {}, source: "mediapipe" });
  assert.equal(front.view, "front");
  assert.equal(side.view, "side");
  assert.ok((front.confidence ?? 0) > (side.confidence ?? 0));
});

test("ground contact is withheld below 60fps rather than guessed", () => {
  // One frame at 10fps is 100ms — longer than the thing being measured.
  const low = analyzeFrames(cleanFrames(), 10, { painMap: {}, source: "mediapipe" });
  assert.equal(low.biomechanics.ground_contact_ms, null);

  const high = analyzeFrames(cleanFrames(), 120, { painMap: {}, source: "mediapipe" });
  assert.ok(typeof high.biomechanics.ground_contact_ms === "number");
});

test("valgus is measured at the loaded phase, not averaged over the clip", () => {
  // Knee caves only at the deepest point; a whole-clip mean would wash it out.
  const frames = cleanFrames().map((f) => {
    const deep = f.left_knee.y > 0.82;
    return deep ? { ...f, left_knee: { x: f.left_knee.x + 0.07, y: f.left_knee.y } } : f;
  });
  const a = analyzeFrames(frames, 30, { painMap: {}, source: "mediapipe" });
  assert.ok(a.biomechanics.knee_valgus_left > a.biomechanics.knee_valgus_right);
});

test("clean deep squats score high form and count reps", () => {
  const a = analyzeFrames(cleanFrames(), 30, { painMap: {}, source: "mediapipe" });
  assert.ok(a.form_score >= 80, `form ${a.form_score}`);
  assert.ok(a.rep_count >= 1, `reps ${a.rep_count}`);
});

test("rep counting scales with the number of squat cycles", () => {
  // stitch three squat cycles together
  const one = cleanFrames();
  const three = [...one, ...one, ...one];
  const a = analyzeFrames(three, 30, { painMap: {}, source: "mediapipe" });
  assert.ok(a.rep_count >= 3, `reps ${a.rep_count}`);
});

test("valgus drags the form score down", () => {
  const clean = analyzeFrames(cleanFrames(), 30, { painMap: {}, source: "mediapipe" });
  const caved = analyzeFrames(
    cleanFrames().map((f) => ({ ...f, left_knee: { x: f.left_knee.x + 0.06, y: f.left_knee.y } })),
    30, { painMap: {}, source: "mediapipe" }
  );
  assert.ok(caved.form_score < clean.form_score, `caved ${caved.form_score} !< clean ${clean.form_score}`);
});
