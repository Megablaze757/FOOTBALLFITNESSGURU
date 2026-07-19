import { test } from "node:test";
import assert from "node:assert/strict";
import { movementFindings, MOVEMENTS } from "./movement";
import type { Frame } from "./biomech";

// Symmetric squat, front-on, reaching good depth.
function squatFrames(opts: { leftBendScale?: number; depth?: number } = {}): Frame[] {
  const { leftBendScale = 1, depth = 0.28 } = opts;
  const frames: Frame[] = [];
  for (let k = 0; k < 40; k++) {
    const phase = Math.sin((2 * Math.PI * k) / 40) * 0.5 + 0.5;
    frames.push({
      left_shoulder: { x: 0.42, y: 0.3 }, right_shoulder: { x: 0.58, y: 0.3 },
      left_hip: { x: 0.46, y: 0.5 }, right_hip: { x: 0.54, y: 0.5 },
      // Knee tracks forward (x) as the athlete descends — that's what bends it.
      left_knee: { x: 0.46 + depth * phase * leftBendScale, y: 0.7 },
      right_knee: { x: 0.54 - depth * phase, y: 0.7 },
      left_ankle: { x: 0.46, y: 0.9 }, right_ankle: { x: 0.54, y: 0.9 },
    });
  }
  return frames;
}

test("every movement type has a label and blurb", () => {
  for (const m of MOVEMENTS) {
    assert.ok(m.label.length > 0 && m.blurb.length > 0, m.id);
  }
});

test("a side doing less work is named, with single-leg drills", () => {
  // Left knee barely bends compared to the right.
  const f = movementFindings(squatFrames({ leftBendScale: 0.15 }), "squat", "front");
  const asym = f.find((x) => x.id === "asymmetry");
  assert.ok(asym, `no asymmetry finding in ${JSON.stringify(f.map((x) => x.id))}`);
  assert.equal(asym!.side, "left");
  assert.match(asym!.title, /left/i);
  assert.ok(asym!.drillIds.includes("bulgarian_split"));
});

test("even effort is reported as good, not as a problem", () => {
  const f = movementFindings(squatFrames(), "squat", "front");
  const asym = f.find((x) => x.id === "symmetry" || x.id === "asymmetry");
  assert.equal(asym?.severity, "good");
});

test("a short swing is flagged as no follow-through on a shot", () => {
  // Both ankles essentially static — the leg stopped at contact.
  const still: Frame[] = Array.from({ length: 20 }, () => ({
    left_shoulder: { x: 0.42, y: 0.3 }, right_shoulder: { x: 0.58, y: 0.3 },
    left_hip: { x: 0.46, y: 0.5 }, right_hip: { x: 0.54, y: 0.5 },
    left_knee: { x: 0.46, y: 0.7 }, right_knee: { x: 0.54, y: 0.7 },
    left_ankle: { x: 0.46, y: 0.9 }, right_ankle: { x: 0.545, y: 0.9 },
  }));
  // Give one ankle a small swing so there's something to judge.
  still[10] = { ...still[10], right_ankle: { x: 0.60, y: 0.86 } };
  const f = movementFindings(still, "kick", "side");
  const ft = f.find((x) => x.id === "follow_through_short");
  assert.ok(ft, `expected short follow-through, got ${JSON.stringify(f.map((x) => x.id))}`);
  assert.ok(ft!.drillIds.includes("finishing_drill"));
});

test("findings are ordered most-actionable first", () => {
  const f = movementFindings(squatFrames({ leftBendScale: 0.15, depth: 0.05 }), "squat", "front");
  const rank = { fix: 0, watch: 1, good: 2 } as const;
  for (let i = 1; i < f.length; i++) {
    assert.ok(rank[f[i - 1].severity] <= rank[f[i].severity], "unsorted severities");
  }
});

test("posture is withheld when the camera angle is unknown", () => {
  const f = movementFindings(squatFrames(), "sprint", "unknown");
  assert.equal(f.filter((x) => x.id.startsWith("posture")).length, 0);
});

test("too few frames yields nothing rather than guesses", () => {
  assert.deepEqual(movementFindings([], "squat", "front"), []);
  assert.deepEqual(movementFindings(squatFrames().slice(0, 2), "squat", "front"), []);
});

test("stride asymmetry is softened when perspective could explain it", () => {
  // Left ankle cycles far more than the right.
  const f: Frame[] = Array.from({ length: 20 }, (_, k) => ({
    left_shoulder: { x: 0.42, y: 0.3 }, right_shoulder: { x: 0.58, y: 0.3 },
    left_hip: { x: 0.46, y: 0.5 }, right_hip: { x: 0.54, y: 0.5 },
    left_knee: { x: 0.46, y: 0.7 }, right_knee: { x: 0.54, y: 0.7 },
    left_ankle: { x: 0.46, y: 0.9 - 0.3 * (k % 4) / 3 },
    right_ankle: { x: 0.54, y: 0.9 - 0.02 * (k % 4) / 3 },
  }));
  const side = movementFindings(f, "sprint", "side").find((x) => x.id === "stride_uneven");
  assert.ok(side, "expected a stride finding");
  assert.equal(side!.severity, "watch", "side-on should not be a hard 'fix'");
  assert.match(side!.detail, /front-on/i);

  const front = movementFindings(f, "sprint", "front").find((x) => x.id === "stride_uneven");
  assert.equal(front!.severity, "fix", "front-on can be stated plainly");
  assert.doesNotMatch(front!.detail, /front-on/i);
});
