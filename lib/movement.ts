// =============================================================================
// Movement-specific analysis. Knee valgus alone can't tell an athlete much —
// what they want to know is "what did I do wrong in THIS drill". So the athlete
// tells us what the clip is, and we run the checks that actually apply to it:
// follow-through on a shot, landing stiffness on a jump, stride symmetry on a
// sprint, depth on a squat.
//
// Every check is gated on whether the camera angle and landmarks can support
// it. A check that can't be run is omitted, never guessed.
// =============================================================================

import type { CameraView } from "./types";
import type { Frame, Pt } from "./biomech";

export type MovementType = "general" | "squat" | "landing" | "sprint" | "kick" | "lunge";

export const MOVEMENTS: { id: MovementType; label: string; blurb: string; icon: string }[] = [
  { id: "general", label: "General movement", blurb: "Overall quality & symmetry", icon: "🎥" },
  { id: "squat", label: "Squat / lift", blurb: "Depth, knee tracking, balance", icon: "🏋️" },
  { id: "landing", label: "Jump & landing", blurb: "Landing softness & symmetry", icon: "⬇️" },
  { id: "sprint", label: "Sprint / run", blurb: "Stride symmetry & posture", icon: "🏃" },
  { id: "kick", label: "Shooting / kicking", blurb: "Follow-through & plant foot", icon: "⚽" },
  { id: "lunge", label: "Lunge / single leg", blurb: "Control & side-to-side gap", icon: "🦵" },
];

export type Severity = "good" | "watch" | "fix";

export interface Finding {
  id: string;
  title: string;        // what we saw, in the athlete's language
  detail: string;       // why it matters / what to do
  severity: Severity;
  side?: "left" | "right";
  drillIds: string[];   // exercises that address it
}

// --- helpers ----------------------------------------------------------------
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const range = (a: number[]) => (a.length ? Math.max(...a) - Math.min(...a) : 0);

function angle3(a: Pt, b: Pt, c: Pt): number {
  const bax = a.x - b.x, bay = a.y - b.y, bcx = c.x - b.x, bcy = c.y - b.y;
  const na = Math.hypot(bax, bay), nc = Math.hypot(bcx, bcy);
  if (!na || !nc) return 180;
  const cos = Math.max(-1, Math.min(1, (bax * bcx + bay * bcy) / (na * nc)));
  return (Math.acos(cos) * 180) / Math.PI;
}

// Knee flexion series for one side (smaller angle = more bent).
function flexionSeries(frames: Frame[], side: string): number[] {
  const out: number[] = [];
  for (const fr of frames) {
    const h = fr[`${side}_hip`], k = fr[`${side}_knee`], a = fr[`${side}_ankle`];
    if (h && k && a) out.push(angle3(h, k, a));
  }
  return out;
}

// How far an ankle travels over the clip — the basis of stride and swing checks.
function ankleTravel(frames: Frame[], side: string): { x: number; y: number } {
  const xs: number[] = [], ys: number[] = [];
  for (const fr of frames) {
    const a = fr[`${side}_ankle`];
    if (a) { xs.push(a.x); ys.push(a.y); }
  }
  return { x: range(xs), y: range(ys) };
}

// Trunk lean: horizontal offset of shoulders from hips, normalised by torso
// length so it doesn't scale with how close the athlete is to the camera.
function trunkLean(frames: Frame[]): number | null {
  const vals: number[] = [];
  for (const fr of frames) {
    const ls = fr["left_shoulder"], rs = fr["right_shoulder"];
    const lh = fr["left_hip"], rh = fr["right_hip"];
    if (!ls || !rs || !lh || !rh) continue;
    const sx = (ls.x + rs.x) / 2, sy = (ls.y + rs.y) / 2;
    const hx = (lh.x + rh.x) / 2, hy = (lh.y + rh.y) / 2;
    const torso = Math.abs(hy - sy);
    if (torso < 0.05) continue;
    vals.push(Math.abs(sx - hx) / torso);
  }
  return vals.length ? mean(vals) : null;
}

// --- the checks -------------------------------------------------------------

// Side-to-side depth gap: the same movement should bend both knees about the
// same amount. A persistent gap is the classic "not as strong on that side".
function asymmetryFinding(frames: Frame[]): Finding | null {
  const l = flexionSeries(frames, "left"), r = flexionSeries(frames, "right");
  if (l.length < 4 || r.length < 4) return null;
  const lMin = Math.min(...l), rMin = Math.min(...r);
  const gap = Math.abs(lMin - rMin);
  if (gap < 8) {
    return { id: "symmetry", title: "Both sides working evenly", detail: `Left and right knees bent within ${gap.toFixed(0)}° of each other — no meaningful imbalance in this clip.`, severity: "good", drillIds: [] };
  }
  const weak: "left" | "right" = lMin > rMin ? "left" : "right"; // bends less = doing less
  return {
    id: "asymmetry",
    title: `Your ${weak} side is doing less work`,
    detail: `The ${weak} knee bent ${gap.toFixed(0)}° less than the other side, so you're loading through the stronger leg. Single-leg work is what closes that gap.`,
    severity: gap >= 15 ? "fix" : "watch",
    side: weak,
    drillIds: ["bulgarian_split", "single_leg_rdl", "single_leg_balance"],
  };
}

// Landing stiffness: absorbing a landing means bending. Very little knee flexion
// through the landing = the joints are taking the force instead of the muscles.
function landingFinding(frames: Frame[]): Finding | null {
  const l = flexionSeries(frames, "left"), r = flexionSeries(frames, "right");
  if (l.length < 4 || r.length < 4) return null;
  const bend = Math.min(180 - Math.min(...l), 180 - Math.min(...r)); // degrees of bend
  if (bend >= 45) {
    return { id: "landing", title: "Soft, absorbed landing", detail: `You bent about ${bend.toFixed(0)}° through the knees on landing — that's the muscles absorbing the force rather than the joints.`, severity: "good", drillIds: [] };
  }
  return {
    id: "landing_stiff",
    title: "Heavy, stiff landing",
    detail: `Only about ${bend.toFixed(0)}° of knee bend on landing. Stiff landings push force into the ankle and knee instead of the muscles — this is the pattern behind a lot of ankle and knee pain. Land quietly and sit into it.`,
    severity: bend < 30 ? "fix" : "watch",
    drillIds: ["box_jumps", "pogo_hops", "spanish_squat", "calf_raise_eccentric"],
  };
}

// Squat depth from the deepest knee angle reached.
function depthFinding(frames: Frame[]): Finding | null {
  const l = flexionSeries(frames, "left"), r = flexionSeries(frames, "right");
  if (!l.length && !r.length) return null;
  const deepest = Math.min(...[...l, ...r]);
  if (deepest <= 100) {
    return { id: "depth", title: "Good depth", detail: `You reached about ${deepest.toFixed(0)}° at the knee — at or below parallel, which is where the strength is built.`, severity: "good", drillIds: [] };
  }
  return {
    id: "depth_shallow",
    title: "Cutting the rep short",
    detail: `Your deepest knee angle was about ${deepest.toFixed(0)}° — short of parallel. Usually this is ankle stiffness or confidence under the bar rather than leg strength. Drop the load and own the full range.`,
    severity: deepest > 130 ? "fix" : "watch",
    drillIds: ["ankle_rocks", "goblet_squat", "spanish_squat", "world_greatest_stretch"],
  };
}

// Follow-through on a strike: the kicking leg should keep travelling well past
// contact. A short swing is the classic "stabbed at it" / no follow-through.
function followThroughFinding(frames: Frame[]): Finding | null {
  const l = ankleTravel(frames, "left"), r = ankleTravel(frames, "right");
  const lSwing = Math.hypot(l.x, l.y), rSwing = Math.hypot(r.x, r.y);
  if (lSwing + rSwing < 0.02) return null; // nothing moved enough to judge
  const kicking: "left" | "right" = lSwing >= rSwing ? "left" : "right";
  const swing = Math.max(lSwing, rSwing);
  if (swing >= 0.25) {
    return { id: "follow_through", title: `Full follow-through (${kicking} foot)`, detail: "Your kicking leg carried well through the ball rather than stopping at contact — that's where power and accuracy come from.", severity: "good", side: kicking, drillIds: [] };
  }
  return {
    id: "follow_through_short",
    title: "Not following through on the strike",
    detail: `Your ${kicking} leg stopped short after contact instead of swinging through the ball. That's the most common cause of weak, ballooned finishes. Drive the leg through and let your body follow it forward.`,
    severity: swing < 0.15 ? "fix" : "watch",
    side: kicking,
    drillIds: ["finishing_drill", "set_piece_practice", "hip_90_90", "couch_stretch"],
  };
}

// Stride symmetry for running: each ankle should cycle through a similar range.
function strideFinding(frames: Frame[], view: CameraView): Finding | null {
  const l = ankleTravel(frames, "left").y, r = ankleTravel(frames, "right").y;
  if (l + r < 0.05) return null;
  const diff = Math.abs(l - r) / Math.max(l, r);
  if (diff < 0.2) {
    return { id: "stride", title: "Even stride", detail: "Both legs cycled through a similar range — your stride is balanced side to side.", severity: "good", drillIds: [] };
  }
  const short: "left" | "right" = l < r ? "left" : "right";
  // Filmed from the side or at an angle, the near leg simply looks like it
  // travels further than the far one. Real asymmetry and camera perspective
  // are indistinguishable here, so flag it as something to check, not a fault.
  const perspectiveRisk = view !== "front";
  const caveat = perspectiveRisk
    ? " Worth checking rather than acting on straight away — filmed from this angle, the near leg naturally looks like it travels further. Re-film front-on to confirm."
    : "";
  return {
    id: "stride_uneven",
    title: `Shorter stride on the ${short} side`,
    detail: `Your ${short} leg travelled ${Math.round(diff * 100)}% less than the other. Uneven strides usually trace back to hip mobility or a previous injury on that side, and they cost you speed.${caveat}`,
    severity: perspectiveRisk ? "watch" : diff >= 0.35 ? "fix" : "watch",
    side: short,
    drillIds: ["a_skips", "couch_stretch", "single_leg_rdl", "leg_swings"],
  };
}

// Trunk posture — mainly for running, where collapsing forward wastes energy.
function postureFinding(frames: Frame[]): Finding | null {
  const lean = trunkLean(frames);
  if (lean == null) return null;
  if (lean <= 0.25) {
    return { id: "posture", title: "Tall, stable posture", detail: "Your trunk stayed stacked over your hips — efficient and easy on the lower back.", severity: "good", drillIds: [] };
  }
  return {
    id: "posture_lean",
    title: "Trunk collapsing to one side",
    detail: "Your shoulders drifted noticeably off your hips. That leaks power and loads the lower back unevenly — usually a core-endurance issue rather than a technique one.",
    severity: lean > 0.4 ? "fix" : "watch",
    drillIds: ["dead_bug", "bird_dog", "farmers_carry", "mcgill_curl_up"],
  };
}

// --- entry point ------------------------------------------------------------
export function movementFindings(
  frames: Frame[],
  movement: MovementType,
  view: CameraView
): Finding[] {
  if (frames.length < 4) return [];
  const out: (Finding | null)[] = [];

  switch (movement) {
    case "squat":
      out.push(depthFinding(frames), asymmetryFinding(frames));
      break;
    case "landing":
      out.push(landingFinding(frames), asymmetryFinding(frames));
      break;
    case "sprint":
      out.push(strideFinding(frames, view), postureFinding(frames));
      break;
    case "kick":
      out.push(followThroughFinding(frames), postureFinding(frames));
      break;
    case "lunge":
      out.push(asymmetryFinding(frames), depthFinding(frames));
      break;
    default:
      out.push(asymmetryFinding(frames), landingFinding(frames));
  }

  // Trunk lean needs a front/side distinction to interpret properly; from an
  // unknown view we can't tell a genuine lean from camera rotation.
  const usable = out.filter((f): f is Finding => f != null)
    .filter((f) => !(f.id.startsWith("posture") && view === "unknown"));

  // Most actionable first.
  const rank: Record<Severity, number> = { fix: 0, watch: 1, good: 2 };
  return usable.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
