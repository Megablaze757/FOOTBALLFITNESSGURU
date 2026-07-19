// =============================================================================
// Movement-specific analysis. Knee valgus alone can't tell an athlete much —
// what they want to know is "what did I do wrong in THIS drill, and what would
// make it better". So the athlete tells us what the clip is, and we run the
// checks that actually apply to it: on a jump that's the countermovement, the
// arm swing, whether they finish the extension and how they absorb the landing;
// on a shot it's follow-through and the plant foot; on a sprint it's knee drive,
// stride and posture.
//
// Every check is gated on whether the camera angle and landmarks can support
// it. A check that can't be run is omitted, never guessed.
// =============================================================================

import type { CameraView } from "./types";
import type { Frame, Pt } from "./biomech";

export type MovementType =
  | "general" | "squat" | "landing" | "sprint" | "kick" | "lunge"
  | "hinge"   // deadlift / RDL / clean — the pull off the floor
  | "press"   // overhead or bench pressing
  | "tackle"; // rugby or football tackling

export const MOVEMENTS: { id: MovementType; label: string; blurb: string; icon: string }[] = [
  { id: "general", label: "General movement", blurb: "Overall quality & symmetry", icon: "🎥" },
  { id: "squat", label: "Squat / lift", blurb: "Depth, chest position, balance", icon: "🏋️" },
  { id: "landing", label: "Jump", blurb: "Load, arm swing, extension, landing", icon: "⬆️" },
  { id: "sprint", label: "Sprint / run", blurb: "Knee drive, stride, posture", icon: "🏃" },
  { id: "kick", label: "Shooting / kicking", blurb: "Follow-through & plant foot", icon: "⚽" },
  { id: "lunge", label: "Lunge / single leg", blurb: "Depth, control, side-to-side gap", icon: "🦵" },
  { id: "hinge", label: "Deadlift / hinge", blurb: "Hip timing, back angle, lockout", icon: "🏋️" },
  { id: "press", label: "Press / bench", blurb: "Bar path, lockout, evenness", icon: "💪" },
  { id: "tackle", label: "Tackle / contact", blurb: "Body height and drive", icon: "🏉" },
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
  // A genuine strength imbalance shows up as maybe 10-25 degrees. A gap this
  // large means one leg was occluded or mistracked, and telling an athlete they
  // have a huge imbalance on that basis is worse than saying nothing.
  if (gap > 40) {
    return {
      id: "asymmetry_unreadable",
      title: "Couldn't compare your left and right sides",
      detail: "One leg wasn't clearly visible for enough of this clip to trust a comparison. Film front-on with both legs in frame and nothing crossing in front of you, and we can check side-to-side balance properly.",
      severity: "watch",
      drillIds: [],
    };
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


// --- jump mechanics ----------------------------------------------------------
// A vertical jump has three moments worth finding: standing, the bottom of the
// countermovement (hips lowest), and the apex (hips highest). Image y grows
// downward, so "hips lowest" is the largest y.

interface JumpPhases { standIdx: number; dipIdx: number; apexIdx: number }

function hipSeries(frames: Frame[]): number[] {
  return frames.map((fr) => {
    const l = fr["left_hip"], r = fr["right_hip"];
    if (l && r) return (l.y + r.y) / 2;
    return l?.y ?? r?.y ?? NaN;
  });
}

function wristSeries(frames: Frame[]): number[] {
  return frames.map((fr) => {
    const l = fr["left_wrist"], r = fr["right_wrist"];
    if (l && r) return (l.y + r.y) / 2;
    return l?.y ?? r?.y ?? NaN;
  });
}

/** Standing hip-to-ankle distance — the scale everything else is measured in. */
function legLength(frames: Frame[]): number | null {
  for (const fr of frames) {
    const h = fr["left_hip"] ?? fr["right_hip"];
    const a = fr["left_ankle"] ?? fr["right_ankle"];
    if (h && a) return Math.abs(a.y - h.y);
  }
  return null;
}

function jumpPhases(frames: Frame[]): JumpPhases | null {
  const hips = hipSeries(frames);
  if (hips.filter((v) => !Number.isNaN(v)).length < 6) return null;
  let apexIdx = 0;
  for (let i = 0; i < hips.length; i++) {
    if (!Number.isNaN(hips[i]) && hips[i] < hips[apexIdx]) apexIdx = i;
  }
  // The deepest point has to come before the apex to be a countermovement.
  let dipIdx = 0;
  for (let i = 0; i < apexIdx; i++) {
    if (!Number.isNaN(hips[i]) && hips[i] > hips[dipIdx]) dipIdx = i;
  }
  if (apexIdx <= dipIdx) return null;
  return { standIdx: 0, dipIdx, apexIdx };
}

// Did the athlete load before jumping? Too shallow leaves free elastic energy
// unused; very deep turns a fast bounce into a slow grind.
function countermovementFinding(frames: Frame[]): Finding | null {
  const ph = jumpPhases(frames);
  const leg = legLength(frames);
  if (!ph || !leg || leg < 0.05) return null;
  const hips = hipSeries(frames);
  const drop = (hips[ph.dipIdx] - hips[ph.standIdx]) / leg;
  if (drop < 0.04) return null; // no discernible dip — probably not a jump

  if (drop < 0.12) {
    return {
      id: "countermovement_shallow",
      title: "Not loading before you jump",
      detail: "You dipped about " + Math.round(drop * 100) + "% of your leg length before takeoff. A jump is a stretch-shortening action - without a real countermovement you are jumping from a standstill and wasting free elastic energy. Sit into roughly a quarter squat, then reverse it fast.",
      severity: drop < 0.08 ? "fix" : "watch",
      drillIds: ["box_jumps", "vertical_jump", "pogo_hops", "back_squat"],
    };
  }
  if (drop > 0.32) {
    return {
      id: "countermovement_deep",
      title: "Dipping too deep",
      detail: "You dropped about " + Math.round(drop * 100) + "% of your leg length. Going that low spends the stretch reflex before you can use it and turns a fast bounce into a grind. Cut the dip to around a quarter squat and reverse it sharply.",
      severity: "watch",
      drillIds: ["pogo_hops", "depth_drop", "vertical_jump"],
    };
  }
  return {
    id: "countermovement",
    title: "Good countermovement depth",
    detail: "About " + Math.round(drop * 100) + "% of leg length - deep enough to load the stretch reflex, shallow enough to stay fast.",
    severity: "good",
    drillIds: [],
  };
}

// The arm swing is worth real height and is the thing most athletes under-use.
// Amplitude is measured against torso length so camera distance cancels out.
function armSwingFinding(frames: Frame[]): Finding | null {
  const ph = jumpPhases(frames);
  if (!ph) return null;
  const wrists = wristSeries(frames).filter((v) => !Number.isNaN(v));
  if (wrists.length < 6) return null; // arms not tracked — say nothing

  let torso: number | null = null;
  for (const fr of frames) {
    const sh = fr["left_shoulder"] ?? fr["right_shoulder"];
    const hp = fr["left_hip"] ?? fr["right_hip"];
    if (sh && hp) { torso = Math.abs(hp.y - sh.y); break; }
  }
  if (!torso || torso < 0.03) return null;

  const swing = (Math.max(...wrists) - Math.min(...wrists)) / torso;
  if (swing < 1.0) {
    return {
      id: "arm_swing_small",
      title: "Your arms are not helping you",
      detail: "Your hands travelled about " + swing.toFixed(1) + "x your torso length. A full swing - hands driving from behind the hips up past the head - adds height for free. Throw the arms down and back as you dip, then rip them up as you extend.",
      severity: swing < 0.6 ? "fix" : "watch",
      drillIds: ["vertical_jump", "box_jumps", "broad_jump", "scap_pull_up"],
    };
  }
  return {
    id: "arm_swing",
    title: "Strong arm swing",
    detail: "Your hands covered about " + swing.toFixed(1) + "x your torso length - you are getting the free height the arms give you.",
    severity: "good",
    drillIds: [],
  };
}

// Triple extension: at takeoff the hips and knees should finish nearly straight.
// Stopping short is the most common reason a jump feels stuck.
function extensionFinding(frames: Frame[]): Finding | null {
  const ph = jumpPhases(frames);
  if (!ph) return null;
  let best = 0;
  for (let i = ph.dipIdx; i <= ph.apexIdx; i++) {
    const fr = frames[i];
    if (!fr) continue;
    for (const side of ["left", "right"]) {
      const h = fr[side + "_hip"], k = fr[side + "_knee"], a = fr[side + "_ankle"];
      if (h && k && a) best = Math.max(best, angle3(h, k, a));
    }
  }
  if (best <= 0) return null;
  if (best >= 165) {
    return {
      id: "extension",
      title: "Full extension at takeoff",
      detail: "Your knees reached about " + Math.round(best) + " degrees - you are finishing the jump rather than leaving it half done.",
      severity: "good",
      drillIds: [],
    };
  }
  return {
    id: "extension_short",
    title: "Cutting the takeoff short",
    detail: "Your knees only reached about " + Math.round(best) + " degrees at takeoff instead of near straight. You are leaving the ground before finishing the push - drive all the way through the floor and finish tall on your toes.",
    severity: best < 150 ? "fix" : "watch",
    drillIds: ["vertical_jump", "power_clean", "calf_raise", "hip_thrust"],
  };
}

// Sprinting: how high the knee comes through, relative to the hip.
function kneeDriveFinding(frames: Frame[]): Finding | null {
  const leg = legLength(frames);
  if (!leg || leg < 0.05) return null;
  let bestRise = -99, samples = 0;
  for (const fr of frames) {
    const hip = fr["left_hip"] ?? fr["right_hip"];
    if (!hip) continue;
    for (const side of ["left", "right"]) {
      const k = fr[side + "_knee"];
      if (!k) continue;
      samples++;
      bestRise = Math.max(bestRise, (hip.y - k.y) / leg); // knee above hip = positive
    }
  }
  if (samples < 6) return null;
  if (bestRise < -0.12) {
    return {
      id: "knee_drive_low",
      title: "Low knee drive",
      detail: "Your knee never came through high. That usually means you are reaching with the lower leg instead of driving the thigh, which brakes you on every step. Punch the knee forward and stamp the foot down underneath your hip.",
      severity: "watch",
      drillIds: ["a_skips", "resisted_sprint", "hill_sprints", "couch_stretch"],
    };
  }
  return {
    id: "knee_drive",
    title: "Good knee drive",
    detail: "Your knee comes through high enough to put force into the ground underneath you rather than out in front.",
    severity: "good",
    drillIds: [],
  };
}

// Squat and lunge: is the chest staying up, or folding forward?
function torsoAngleFinding(frames: Frame[]): Finding | null {
  let worst = 0, samples = 0;
  for (const fr of frames) {
    const sh = fr["left_shoulder"] ?? fr["right_shoulder"];
    const hp = fr["left_hip"] ?? fr["right_hip"];
    if (!sh || !hp) continue;
    const dy = Math.abs(hp.y - sh.y), dx = Math.abs(hp.x - sh.x);
    if (dy < 0.02) continue;
    samples++;
    worst = Math.max(worst, (Math.atan2(dx, dy) * 180) / Math.PI);
  }
  if (samples < 4) return null;
  if (worst > 45) {
    return {
      id: "torso_fold",
      title: "Chest folding forward",
      detail: "Your torso tipped to about " + Math.round(worst) + " degrees from upright, which shifts load off the legs and onto the lower back. Usually that is ankle stiffness or a weak upper back rather than weak legs - drop the weight and fix the position first.",
      severity: worst > 60 ? "fix" : "watch",
      drillIds: ["ankle_rocks", "front_squat", "goblet_squat", "bird_dog"],
    };
  }
  return {
    id: "torso",
    title: "Chest stayed up",
    detail: "Your torso held within about " + Math.round(worst) + " degrees of upright - the legs are doing the work, not your back.",
    severity: "good",
    drillIds: [],
  };
}

// Kicking: the plant foot should be steady through the strike.
function plantFootFinding(frames: Frame[]): Finding | null {
  const leg = legLength(frames);
  if (!leg || leg < 0.05) return null;
  const travel = (side: string) => {
    const xs: number[] = [], ys: number[] = [];
    for (const fr of frames) {
      const a = fr[side + "_ankle"];
      if (a) { xs.push(a.x); ys.push(a.y); }
    }
    if (xs.length < 4) return null;
    return Math.hypot(range(xs), range(ys));
  };
  const l = travel("left"), r = travel("right");
  if (l == null || r == null) return null;
  const plantMove = Math.min(l, r) / leg;
  if (plantMove > 0.45) {
    return {
      id: "plant_foot_unstable",
      title: "Plant foot is moving",
      detail: "Your standing foot shifted a long way during the strike. A wandering plant foot costs accuracy more than anything else - plant it firmly alongside the ball, pointed at your target, and strike around it.",
      severity: "watch",
      drillIds: ["finishing_drill", "single_leg_balance", "copenhagen", "bulgarian_split"],
    };
  }
  return {
    id: "plant_foot",
    title: "Solid plant foot",
    detail: "Your standing foot stayed planted through contact - that is what lets you strike the same way twice.",
    severity: "good",
    drillIds: [],
  };
}


// Deadlift: the hips shooting up ahead of the shoulders turns a leg drive into
// a back lift. Comparing how far each rises over the first half of the pull is
// the clearest 2D read on it.
function hipShootFinding(frames: Frame[]): Finding | null {
  const hips = hipSeries(frames);
  const shoulders = frames.map((fr) => {
    const l = fr["left_shoulder"], r = fr["right_shoulder"];
    if (l && r) return (l.y + r.y) / 2;
    return l?.y ?? r?.y ?? NaN;
  });
  const ok = (v: number) => !Number.isNaN(v);
  if (hips.filter(ok).length < 6 || shoulders.filter(ok).length < 6) return null;

  // Start of the pull = hips lowest (largest y); end = hips highest.
  let startIdx = 0, endIdx = 0;
  for (let i = 0; i < hips.length; i++) {
    if (ok(hips[i]) && hips[i] > hips[startIdx]) startIdx = i;
  }
  for (let i = startIdx; i < hips.length; i++) {
    if (ok(hips[i]) && hips[i] < hips[endIdx] || endIdx < startIdx) endIdx = i;
  }
  if (endIdx - startIdx < 3) return null;

  const mid = Math.floor((startIdx + endIdx) / 2);
  const hipRise = hips[startIdx] - hips[mid];
  const shoulderRise = shoulders[startIdx] - shoulders[mid];
  if (!ok(hipRise) || !ok(shoulderRise) || hipRise <= 0) return null;

  const ratio = shoulderRise / hipRise; // 1.0 = rising together
  if (ratio < 0.55) {
    return {
      id: "hip_shoot",
      title: "Your hips are shooting up first",
      detail: "Your hips rose noticeably faster than your shoulders off the floor, which leaves the bar to your lower back instead of your legs. Push the floor away and make your chest and hips rise together - if you cannot, the weight is too heavy for the position you are holding.",
      severity: ratio < 0.35 ? "fix" : "watch",
      drillIds: ["deadlift", "single_leg_rdl", "bird_dog", "hip_thrust"],
    };
  }
  return {
    id: "hip_timing",
    title: "Hips and chest rising together",
    detail: "Your shoulders and hips came up at a similar rate, so the lift is staying in your legs and hips rather than turning into a back lift.",
    severity: "good",
    drillIds: [],
  };
}

// Pressing: the hands should travel a straight vertical line. Drift forward is
// what turns a press into a shoulder problem.
function barPathFinding(frames: Frame[]): Finding | null {
  const xs: number[] = [], shoulderXs: number[] = [];
  for (const fr of frames) {
    const lw = fr["left_wrist"], rw = fr["right_wrist"];
    const ls = fr["left_shoulder"], rs = fr["right_shoulder"];
    if (lw && rw) xs.push((lw.x + rw.x) / 2);
    if (ls && rs) shoulderXs.push((ls.x + rs.x) / 2);
  }
  if (xs.length < 6 || !shoulderXs.length) return null;
  let torso: number | null = null;
  for (const fr of frames) {
    const sh = fr["left_shoulder"] ?? fr["right_shoulder"];
    const hp = fr["left_hip"] ?? fr["right_hip"];
    if (sh && hp) { torso = Math.abs(hp.y - sh.y); break; }
  }
  if (!torso || torso < 0.03) return null;

  const drift = range(xs) / torso;
  if (drift > 0.55) {
    return {
      id: "bar_path_drift",
      title: "The bar is drifting, not going straight up",
      detail: "Your hands wandered horizontally through the press instead of tracking a straight line. That usually means the ribs are flaring or the shoulder blades are not set. Brace, squeeze the glutes, and press the bar past your face rather than out in front of it.",
      severity: drift > 0.8 ? "fix" : "watch",
      drillIds: ["overhead_press", "scap_pull_up", "dead_bug", "thoracic_openers"],
    };
  }
  return {
    id: "bar_path",
    title: "Straight bar path",
    detail: "Your hands tracked a tidy vertical line through the press - that is the position that keeps shoulders healthy under load.",
    severity: "good",
    drillIds: [],
  };
}

// Pressing: one arm finishing ahead of the other, at lockout.
function pressEvennessFinding(frames: Frame[]): Finding | null {
  let worst = 0, samples = 0;
  let torso: number | null = null;
  for (const fr of frames) {
    const sh = fr["left_shoulder"] ?? fr["right_shoulder"];
    const hp = fr["left_hip"] ?? fr["right_hip"];
    if (sh && hp) { torso = Math.abs(hp.y - sh.y); break; }
  }
  if (!torso || torso < 0.03) return null;
  for (const fr of frames) {
    const lw = fr["left_wrist"], rw = fr["right_wrist"];
    if (!lw || !rw) continue;
    samples++;
    worst = Math.max(worst, Math.abs(lw.y - rw.y) / torso);
  }
  if (samples < 5) return null;
  if (worst > 0.35) {
    return {
      id: "press_uneven",
      title: "One arm is finishing ahead of the other",
      detail: "Your hands were noticeably out of level during the press. A consistent gap points to a strength difference or a shoulder that is not moving freely on one side. Add single-arm pressing so the weak side cannot hide.",
      severity: worst > 0.55 ? "fix" : "watch",
      drillIds: ["dumbbell_press", "shoulder_external_rotation", "scap_pull_up"],
    };
  }
  return {
    id: "press_even",
    title: "Both arms locking out together",
    detail: "Your hands stayed level through the press - no side is doing more than its share.",
    severity: "good",
    drillIds: [],
  };
}

// Tackling: contact height is the whole thing, for effectiveness and for safety.
function tackleHeightFinding(frames: Frame[]): Finding | null {
  const hips = hipSeries(frames);
  const leg = legLength(frames);
  const ok = (v: number) => !Number.isNaN(v);
  if (!leg || leg < 0.05 || hips.filter(ok).length < 5) return null;
  const stand = hips.find(ok);
  if (stand == null) return null;
  const lowest = Math.max(...hips.filter(ok)); // largest y = lowest hips
  const drop = (lowest - stand) / leg;

  if (drop < 0.12) {
    return {
      id: "tackle_high",
      title: "You are staying too tall into contact",
      detail: "Your hips barely dropped before contact. Tackling upright loses every collision and is how head and neck injuries happen. Sink the hips, get your shoulder below theirs, and drive up through the contact.",
      severity: "fix",
      drillIds: ["tackle_technique", "back_squat", "scrum_drive", "farmers_carry"],
    };
  }
  return {
    id: "tackle_height",
    title: "Good body height into contact",
    detail: "You dropped your hips before contact, which is what lets you drive up and through rather than getting stood up.",
    severity: "good",
    drillIds: [],
  };
}

// Shooting: leaning back through the strike is why shots balloon over the bar.
function strikeLeanFinding(frames: Frame[]): Finding | null {
  let worst = 0, samples = 0;
  for (const fr of frames) {
    const sh = fr["left_shoulder"] ?? fr["right_shoulder"];
    const hp = fr["left_hip"] ?? fr["right_hip"];
    const an = fr["left_ankle"] ?? fr["right_ankle"];
    if (!sh || !hp || !an) continue;
    const dy = Math.abs(hp.y - sh.y);
    if (dy < 0.02) continue;
    samples++;
    // Shoulders behind the hips, away from the direction of travel.
    const behind = (hp.x - sh.x) * Math.sign(an.x - hp.x || 1);
    worst = Math.max(worst, behind / dy);
  }
  if (samples < 4) return null;
  if (worst > 0.45) {
    return {
      id: "strike_lean_back",
      title: "Leaning back through the strike",
      detail: "Your upper body was behind your hips at contact, which opens the face of the foot and sends the ball up. Get your head and chest over the ball and strike through the middle of it - that is the difference between the top corner and the stands.",
      severity: worst > 0.7 ? "fix" : "watch",
      drillIds: ["finishing_drill", "set_piece_practice", "dead_bug", "hip_90_90"],
    };
  }
  return {
    id: "strike_lean",
    title: "Body over the ball",
    detail: "Your chest stayed over the ball through contact, which keeps the strike down and on target.",
    severity: "good",
    drillIds: [],
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
      out.push(depthFinding(frames), torsoAngleFinding(frames), asymmetryFinding(frames));
      break;
    case "landing":
      // The whole jump: load it, swing the arms, finish the push, absorb it.
      out.push(
        countermovementFinding(frames), armSwingFinding(frames),
        extensionFinding(frames), landingFinding(frames), asymmetryFinding(frames)
      );
      break;
    case "sprint":
      out.push(kneeDriveFinding(frames), strideFinding(frames, view), postureFinding(frames));
      break;
    case "kick":
      out.push(
        followThroughFinding(frames), plantFootFinding(frames),
        strikeLeanFinding(frames), postureFinding(frames)
      );
      break;
    case "hinge":
      out.push(hipShootFinding(frames), torsoAngleFinding(frames), asymmetryFinding(frames));
      break;
    case "press":
      out.push(barPathFinding(frames), pressEvennessFinding(frames), postureFinding(frames));
      break;
    case "tackle":
      out.push(tackleHeightFinding(frames), torsoAngleFinding(frames), asymmetryFinding(frames));
      break;
    case "lunge":
      out.push(asymmetryFinding(frames), depthFinding(frames), torsoAngleFinding(frames));
      break;
    default:
      out.push(asymmetryFinding(frames), landingFinding(frames), torsoAngleFinding(frames));
  }

  // Trunk lean needs a front/side distinction to interpret properly; from an
  // unknown view we can't tell a genuine lean from camera rotation.
  const usable = out.filter((f): f is Finding => f != null)
    .filter((f) => !(f.id.startsWith("posture") && view === "unknown"));

  // Most actionable first.
  const rank: Record<Severity, number> = { fix: 0, watch: 1, good: 2 };
  return usable.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
