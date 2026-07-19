import { test } from "node:test";
import assert from "node:assert/strict";
import { movementFindings, MOVEMENTS } from "./movement";
import type { Frame } from "./biomech";

const ids = (f: { id: string }[]) => f.map((x) => x.id);

// A pull off the floor. `hipLead` = how much faster the hips rise than the
// shoulders (1 = together, higher = hips shooting up first).
function deadliftFrames(hipLead = 1): Frame[] {
  const frames: Frame[] = [];
  const HIP0 = 0.68, SH0 = 0.55, ANKLE = 0.92;
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const hipY = HIP0 - 0.18 * t;
    const shoulderY = SH0 - (0.18 * t) / hipLead;
    frames.push({
      left_shoulder: { x: 0.44, y: shoulderY }, right_shoulder: { x: 0.56, y: shoulderY },
      left_wrist: { x: 0.44, y: 0.8 }, right_wrist: { x: 0.56, y: 0.8 },
      left_hip: { x: 0.46, y: hipY }, right_hip: { x: 0.54, y: hipY },
      left_knee: { x: 0.46, y: (hipY + ANKLE) / 2 }, right_knee: { x: 0.54, y: (hipY + ANKLE) / 2 },
      left_ankle: { x: 0.46, y: ANKLE }, right_ankle: { x: 0.54, y: ANKLE },
    });
  }
  return frames;
}

// An overhead press. `drift` moves the hands horizontally; `unevenness` raises
// one hand above the other.
function pressFrames(drift = 0, unevenness = 0): Frame[] {
  const frames: Frame[] = [];
  const SH = 0.4, HIP = 0.6;
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const y = SH - 0.18 * t;
    frames.push({
      left_shoulder: { x: 0.44, y: SH }, right_shoulder: { x: 0.56, y: SH },
      left_wrist: { x: 0.44 + drift * t, y: y - unevenness },
      right_wrist: { x: 0.56 + drift * t, y },
      left_hip: { x: 0.46, y: HIP }, right_hip: { x: 0.54, y: HIP },
      left_knee: { x: 0.46, y: 0.75 }, right_knee: { x: 0.54, y: 0.75 },
      left_ankle: { x: 0.46, y: 0.92 }, right_ankle: { x: 0.54, y: 0.92 },
    });
  }
  return frames;
}

// Approaching contact. `dip` is how far the hips drop, in leg lengths.
function tackleFrames(dip: number): Frame[] {
  const frames: Frame[] = [];
  const HIP0 = 0.5, ANKLE = 0.9;
  const leg = ANKLE - HIP0;
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const hipY = HIP0 + dip * leg * t;
    frames.push({
      left_shoulder: { x: 0.44, y: hipY - 0.2 }, right_shoulder: { x: 0.56, y: hipY - 0.2 },
      left_hip: { x: 0.46, y: hipY }, right_hip: { x: 0.54, y: hipY },
      left_knee: { x: 0.46, y: (hipY + ANKLE) / 2 }, right_knee: { x: 0.54, y: (hipY + ANKLE) / 2 },
      left_ankle: { x: 0.46, y: ANKLE }, right_ankle: { x: 0.54, y: ANKLE },
    });
  }
  return frames;
}

test("every movement type is offered in the picker", () => {
  for (const id of ["general", "squat", "landing", "sprint", "kick", "lunge", "hinge", "press", "tackle"]) {
    assert.ok(MOVEMENTS.some((m) => m.id === id), `${id} missing from the picker`);
  }
});

test("hips shooting up on a deadlift is called out", () => {
  const bad = movementFindings(deadliftFrames(4), "hinge", "side");
  const f = bad.find((x) => x.id === "hip_shoot");
  assert.ok(f, `expected hip_shoot, got ${ids(bad).join(" ")}`);
  assert.match(f!.detail, /lower back/i);
  assert.ok(f!.drillIds.includes("deadlift"));

  const good = movementFindings(deadliftFrames(1), "hinge", "side");
  assert.equal(good.find((x) => x.id === "hip_timing")?.severity, "good");
});

test("a drifting bar path is flagged, a straight one is not", () => {
  const drifting = movementFindings(pressFrames(0.16), "press", "side");
  assert.ok(drifting.find((x) => x.id === "bar_path_drift"), ids(drifting).join(" "));

  const straight = movementFindings(pressFrames(0), "press", "side");
  assert.equal(straight.find((x) => x.id === "bar_path")?.severity, "good");
});

test("one arm finishing ahead of the other is flagged", () => {
  const uneven = movementFindings(pressFrames(0, 0.1), "press", "front");
  const f = uneven.find((x) => x.id === "press_uneven");
  assert.ok(f, `expected press_uneven, got ${ids(uneven).join(" ")}`);
  assert.ok(f!.drillIds.includes("dumbbell_press"));
});

test("tackling upright is a fix, not a suggestion", () => {
  const tall = movementFindings(tackleFrames(0.03), "tackle", "side");
  const f = tall.find((x) => x.id === "tackle_high");
  assert.ok(f, `expected tackle_high, got ${ids(tall).join(" ")}`);
  assert.equal(f!.severity, "fix", "tackling high is a safety issue");
  assert.match(f!.detail, /head and neck/i);

  const low = movementFindings(tackleFrames(0.3), "tackle", "side");
  assert.equal(low.find((x) => x.id === "tackle_height")?.severity, "good");
});

test("each drill type gets checks specific to it, not one generic set", () => {
  const seen = new Map<string, string[]>();
  for (const m of MOVEMENTS) {
    const f = movementFindings(deadliftFrames(3), m.id, "front");
    seen.set(m.id, ids(f));
  }
  // The lift-specific movements must not collapse to the same checks.
  assert.notDeepEqual(seen.get("hinge"), seen.get("press"));
  assert.notDeepEqual(seen.get("tackle"), seen.get("sprint"));
  assert.notDeepEqual(seen.get("kick"), seen.get("squat"));
});
