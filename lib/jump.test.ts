import { test } from "node:test";
import assert from "node:assert/strict";
import { movementFindings } from "./movement";
import type { Frame } from "./biomech";

// Build a jump: stand, dip to `dipFrac` of leg length, extend to `takeoffAngle`
// at the knee, rise to an apex, then land absorbing `landBend` degrees.
// `armSwing` is how far the hands travel, in torso lengths.
function jumpFrames(opts: {
  dipFrac?: number; takeoffStraight?: boolean; armSwing?: number; landBend?: number;
} = {}): Frame[] {
  const { dipFrac = 0.2, takeoffStraight = true, armSwing = 1.4, landBend = 60 } = opts;
  const HIP_Y = 0.5, ANKLE_Y = 0.9, SHOULDER_Y = 0.3;
  const leg = ANKLE_Y - HIP_Y;          // 0.4
  const torso = HIP_Y - SHOULDER_Y;     // 0.2
  const frames: Frame[] = [];

  // phase: 0 stand, 1 dip, 2 extend/takeoff, 3 apex, 4 land
  const script: { hipDrop: number; kneeBend: number; wristY: number }[] = [];
  for (let i = 0; i < 4; i++) script.push({ hipDrop: 0, kneeBend: 10, wristY: HIP_Y });
  for (let i = 0; i < 5; i++) {
    const t = (i + 1) / 5;
    // Hands swing DOWN and back during the dip (larger y).
    script.push({ hipDrop: dipFrac * leg * t, kneeBend: 10 + 60 * t, wristY: HIP_Y + torso * (armSwing / 2) * t });
  }
  for (let i = 0; i < 4; i++) {
    const t = (i + 1) / 4;
    // Extending: hips rise, knees straighten, hands rip UP (smaller y).
    script.push({
      hipDrop: dipFrac * leg * (1 - t) - 0.12 * t,
      kneeBend: takeoffStraight ? 70 - 65 * t : 70 - 30 * t,
      wristY: HIP_Y + torso * (armSwing / 2) - torso * armSwing * t,
    });
  }
  for (let i = 0; i < 4; i++) {
    const t = (i + 1) / 4;
    script.push({ hipDrop: -0.12 + (0.12 + 0.02) * t, kneeBend: 5 + (180 - landBend - 5) * t, wristY: HIP_Y });
  }

  for (const st of script) {
    const hipY = HIP_Y + st.hipDrop;
    // Knee sits between hip and ankle; bending pushes it forward in x.
    const kneeX = 0.46 + (st.kneeBend / 180) * 0.25;
    const kneeY = (hipY + ANKLE_Y) / 2;
    frames.push({
      left_shoulder: { x: 0.42, y: SHOULDER_Y + st.hipDrop },
      right_shoulder: { x: 0.58, y: SHOULDER_Y + st.hipDrop },
      left_wrist: { x: 0.40, y: st.wristY },
      right_wrist: { x: 0.60, y: st.wristY },
      left_hip: { x: 0.46, y: hipY },
      right_hip: { x: 0.54, y: hipY },
      left_knee: { x: kneeX, y: kneeY },
      right_knee: { x: 1.0 - kneeX, y: kneeY },
      left_ankle: { x: 0.46, y: ANKLE_Y },
      right_ankle: { x: 0.54, y: ANKLE_Y },
    });
  }
  return frames;
}

const ids = (f: { id: string }[]) => f.map((x) => x.id);

test("a jump is analysed as a whole movement, not just the knees", () => {
  const f = movementFindings(jumpFrames(), "landing", "front");
  // Load, arms, finish, absorb — the parts of a jump worth coaching.
  const covered = ids(f).join(" ");
  assert.match(covered, /countermovement/, `no load check: ${covered}`);
  assert.match(covered, /arm_swing/, `no arm check: ${covered}`);
  assert.match(covered, /extension/, `no extension check: ${covered}`);
  assert.ok(f.length >= 4, `expected a full breakdown, got ${covered}`);
});

test("barely dipping is called out as not loading the jump", () => {
  const f = movementFindings(jumpFrames({ dipFrac: 0.05 }), "landing", "front");
  const cm = f.find((x) => x.id === "countermovement_shallow");
  assert.ok(cm, `expected a shallow-load finding, got ${ids(f).join(" ")}`);
  assert.match(cm!.detail, /quarter squat/i);
  assert.ok(cm!.drillIds.includes("box_jumps"));
});

test("a lazy arm swing is called out, a full one is praised", () => {
  const lazy = movementFindings(jumpFrames({ armSwing: 0.3 }), "landing", "front");
  assert.ok(lazy.find((x) => x.id === "arm_swing_small"), ids(lazy).join(" "));

  const full = movementFindings(jumpFrames({ armSwing: 2.0 }), "landing", "front");
  const good = full.find((x) => x.id === "arm_swing");
  assert.equal(good?.severity, "good");
});

test("stopping short of full extension is flagged", () => {
  const short = movementFindings(jumpFrames({ takeoffStraight: false }), "landing", "front");
  const ex = short.find((x) => x.id === "extension_short");
  assert.ok(ex, `expected a short-extension finding, got ${ids(short).join(" ")}`);
  assert.match(ex!.detail, /through the floor/i);
});

test("every jump finding tells the athlete what to do about it", () => {
  const f = movementFindings(jumpFrames({ dipFrac: 0.05, armSwing: 0.3, takeoffStraight: false }), "landing", "front");
  const actionable = f.filter((x) => x.severity !== "good");
  assert.ok(actionable.length >= 2, "a sloppy jump should surface several fixes");
  for (const x of actionable) {
    assert.ok(x.drillIds.length > 0, `${x.id} offers no drills`);
    assert.ok(x.detail.length > 80, `${x.id} detail is too thin to coach from`);
  }
});

test("arm checks stay silent when the arms weren't tracked", () => {
  // Older clips analysed before we tracked wrists must not invent a swing.
  const noArms = jumpFrames().map((fr) => {
    const copy = { ...fr };
    delete copy.left_wrist;
    delete copy.right_wrist;
    return copy;
  });
  const f = movementFindings(noArms, "landing", "front");
  assert.equal(ids(f).filter((i) => i.startsWith("arm_swing")).length, 0);
  // The rest of the breakdown still runs.
  assert.ok(ids(f).some((i) => i.startsWith("countermovement")));
});

test("squat and kick get their own technique checks", () => {
  const squat = movementFindings(jumpFrames(), "squat", "front");
  assert.ok(ids(squat).some((i) => i.startsWith("torso")), ids(squat).join(" "));

  const kick = movementFindings(jumpFrames(), "kick", "side");
  assert.ok(ids(kick).some((i) => i.startsWith("plant_foot")), ids(kick).join(" "));
});
