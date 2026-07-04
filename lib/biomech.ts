// =============================================================================
// Client-side biomechanics — computes a video analysis from pose landmarks in
// the browser (no backend). Ported from the Python cv-worker so the video
// feature works on GitHub Pages. Pure + tested; MediaPipe feeds it landmarks.
// =============================================================================

import type { PainMap, VideoAnalysis, DrillItem } from "./types";

export interface Pt { x: number; y: number }
export type Frame = Record<string, Pt>; // "left_knee" -> {x,y} normalised 0..1

type Area = "knee" | "ankle" | "hamstring" | "hip";

// --- geometry ---------------------------------------------------------------
function angle3(a: Pt, b: Pt, c: Pt): number {
  const bax = a.x - b.x, bay = a.y - b.y, bcx = c.x - b.x, bcy = c.y - b.y;
  const na = Math.hypot(bax, bay), nc = Math.hypot(bcx, bcy);
  if (!na || !nc) return 180;
  const cos = Math.max(-1, Math.min(1, (bax * bcx + bay * bcy) / (na * nc)));
  return (Math.acos(cos) * 180) / Math.PI;
}
function valgus(hip: Pt, knee: Pt, ankle: Pt): number {
  const hax = ankle.x - hip.x, hay = ankle.y - hip.y, hkx = knee.x - hip.x, hky = knee.y - hip.y;
  const nha = Math.hypot(hax, hay), nhk = Math.hypot(hkx, hky);
  if (!nha || !nhk) return 0;
  const cos = Math.max(-1, Math.min(1, (hax * hkx + hay * hky) / (nha * nhk)));
  return (Math.acos(cos) * 180) / Math.PI;
}

interface Side { valgus: number; flexion: number }
function sideMetrics(frames: Frame[], side: string): Side | null {
  const hip = `${side}_hip`, knee = `${side}_knee`, ankle = `${side}_ankle`;
  const v: number[] = [], f: number[] = [];
  for (const fr of frames) {
    if (fr[hip] && fr[knee] && fr[ankle]) {
      v.push(valgus(fr[hip], fr[knee], fr[ankle]));
      f.push(angle3(fr[hip], fr[knee], fr[ankle]));
    }
  }
  if (!v.length) return null;
  return { valgus: round1(mean(v)), flexion: round1(Math.min(...f)) };
}
function symmetry(l: Side, r: Side): number {
  const penalty = Math.abs(l.valgus - r.valgus) * 1 + Math.abs(l.flexion - r.flexion) * 0.5;
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}
function groundContactMs(frames: Frame[], fps: number): number {
  if (!frames.length || fps <= 0) return 0;
  const ys: number[] = [];
  for (const fr of frames) {
    const a = [fr["left_ankle"]?.y, fr["right_ankle"]?.y].filter((y): y is number => y != null);
    if (a.length) ys.push(Math.max(...a));
  }
  if (!ys.length) return 0;
  const max = Math.max(...ys), min = Math.min(...ys);
  const thr = max - 0.05 * (max - min + 1e-9);
  const stance = ys.filter((y) => y >= thr).length;
  return round1((stance / fps) * 1000);
}

// Count movement cycles from vertical hip/knee travel (a rep = one full
// down-and-up). Works across camera angles; hysteresis rejects jitter.
// Image y grows downward, so a deeper position = larger y.
function countReps(frames: Frame[]): number {
  const sig: number[] = [];
  for (const fr of frames) {
    const ys: number[] = [];
    for (const p of ["left_hip", "right_hip", "left_knee", "right_knee"]) {
      const pt = fr[p];
      if (pt) ys.push(pt.y);
    }
    if (ys.length) sig.push(mean(ys));
  }
  if (sig.length < 4) return 0;
  const lo = Math.min(...sig), hi = Math.max(...sig), range = hi - lo;
  if (range < 0.03) return 0; // <3% of frame height — not a real rep
  const enter = lo + range * 0.65; // "deep" threshold
  const exit = lo + range * 0.35;  // "extended" threshold
  let reps = 0, deep = false;
  for (const v of sig) {
    if (!deep && v >= enter) { deep = true; }
    else if (deep && v <= exit) { deep = false; reps++; }
  }
  return reps;
}

// Overall movement-quality score (0–100): starts from symmetry, penalises knee
// valgus and rewards good depth. Distinct from raw left/right symmetry.
function formScore(sym: number, worstValgus: number, bestFlexion: number): number {
  const valgusPenalty = Math.max(0, worstValgus - 6) * 1.6;   // caving in hurts
  const depthPenalty = Math.max(0, bestFlexion - 140) * 0.4;  // too shallow hurts
  return Math.max(0, Math.min(100, Math.round(sym - valgusPenalty - depthPenalty)));
}

function painByArea(painMap: PainMap): Partial<Record<Area, number>> {
  const out: Partial<Record<Area, number>> = {};
  for (const [k, v] of Object.entries(painMap ?? {})) {
    const a = k.split("_").filter((t) => t !== "left" && t !== "right").join("_") as Area;
    out[a] = Math.max(out[a] ?? 0, Number(v) || 0);
  }
  return out;
}

// --- drills -----------------------------------------------------------------
// ids match lib/exercises.ts so each prescribed drill opens its coached demo.
const LIB: { id: string; name: string; tag: string; sets: number; reps: number; targets: string }[] = [
  { id: "single_leg_rdl", name: "Single-leg RDL", tag: "valgus", sets: 3, reps: 12, targets: "knee stability" },
  { id: "band_lateral_walk", name: "Band lateral walks", tag: "valgus", sets: 4, reps: 15, targets: "glute med / knee tracking" },
  { id: "copenhagen", name: "Copenhagen plank", tag: "symmetry", sets: 3, reps: 10, targets: "adductor balance" },
  { id: "bulgarian_split", name: "Bulgarian split squat", tag: "symmetry", sets: 3, reps: 10, targets: "unilateral strength" },
  { id: "box_jumps", name: "Box jumps", tag: "explosiveness", sets: 4, reps: 6, targets: "power" },
  { id: "depth_drop", name: "Depth-drop to sprint", tag: "explosiveness", sets: 3, reps: 5, targets: "reactive strength" },
  { id: "tempo_runs", name: "Tempo runs 6x100m", tag: "endurance", sets: 1, reps: 6, targets: "aerobic base" },
  { id: "spanish_squat", name: "Spanish squat iso-hold", tag: "flexion", sets: 3, reps: 8, targets: "knee mobility" },
  { id: "dribbling_grid", name: "Tight-space dribbling", tag: "control", sets: 4, reps: 12, targets: "ball control" },
];
function selectDrills(focus: string, weaknesses: string[], inSeason: boolean): DrillItem[] {
  const want = [...new Set([...weaknesses, focus])];
  const picked: DrillItem[] = [];
  const seen = new Set<string>();
  for (const tag of want) {
    for (const d of LIB) {
      if (d.tag === tag && !seen.has(d.id)) {
        seen.add(d.id);
        picked.push({ id: d.id, name: d.name, sets: inSeason ? Math.max(1, Math.round(d.sets * 0.7)) : d.sets, reps: d.reps, targets: d.targets });
      }
    }
    if (picked.length >= 4) break;
  }
  return picked.slice(0, 4);
}

// --- main -------------------------------------------------------------------
export function analyzeFrames(
  frames: Frame[],
  fps: number,
  opts: { painMap: PainMap; sessionType?: string | null; isInSeason?: boolean; source: "mediapipe" | "synthetic" }
): VideoAnalysis {
  const left = sideMetrics(frames, "left") ?? { valgus: 0, flexion: 180 };
  const right = sideMetrics(frames, "right") ?? { valgus: 0, flexion: 180 };
  const sym = symmetry(left, right);
  const gct = groundContactMs(frames, fps);

  const weaknesses: string[] = [];
  if (Math.max(left.valgus, right.valgus) >= 10) weaknesses.push("valgus");
  if (sym < 85) weaknesses.push("symmetry");
  if (Math.min(left.flexion, right.flexion) >= 150) weaknesses.push("flexion");

  const focus = weaknesses.includes("valgus") ? "stability"
    : weaknesses.includes("symmetry") ? "symmetry"
    : opts.sessionType === "recovery" ? "stability"
    : opts.sessionType === "match" ? "endurance" : "explosiveness";

  const worseSide = left.valgus >= right.valgus ? "left" : "right";
  const worseVal = Math.max(left.valgus, right.valgus);
  const pain = painByArea(opts.painMap);
  const kneePain = opts.painMap[`knee_${worseSide}`] ?? pain.knee ?? 0;
  let alert: string | null = null;
  if (worseVal >= 10 && kneePain >= 7)
    alert = `Your ${worseSide} knee is caving inwards during landing (${worseVal.toFixed(0)}° valgus), matching your journal's knee pain (${kneePain}/10). Likely the root cause — prioritise stability work.`;
  else if (worseVal >= 10)
    alert = `Noticeable inward collapse in the ${worseSide} knee (${worseVal.toFixed(0)}° valgus). Address it before it becomes painful.`;

  // heatmap: sample knee positions, weighted by each side's valgus
  const points: { x: number; y: number; intensity: number }[] = [];
  const step = Math.max(1, Math.floor(frames.length / 12));
  const li = Math.min(1, left.valgus / 20), ri = Math.min(1, right.valgus / 20);
  for (let i = 0; i < frames.length; i += step) {
    const fr = frames[i];
    if (fr["left_knee"]) points.push({ x: fr["left_knee"].x, y: fr["left_knee"].y, intensity: round2(li) });
    if (fr["right_knee"]) points.push({ x: fr["right_knee"].x, y: fr["right_knee"].y, intensity: round2(ri) });
  }

  const bestFlexion = Math.min(left.flexion, right.flexion);
  return {
    symmetry_score: sym,
    form_score: formScore(sym, worseVal, bestFlexion),
    rep_count: countReps(frames),
    biomechanics: {
      knee_valgus_left: left.valgus,
      knee_valgus_right: right.valgus,
      knee_flexion_left: left.flexion,
      knee_flexion_right: right.flexion,
      ground_contact_ms: gct,
    },
    heatmap_data: points,
    root_cause_alert: alert,
    focus_area: focus,
    pose_source: opts.source,
    drills: selectDrills(focus, weaknesses, opts.isInSeason ?? false),
  };
}

/** Deterministic synthetic gait — fallback when real pose can't run. */
export function syntheticFrames(seed: string, n = 60): Frame[] {
  let s = Math.abs(hash(seed)) % 2147483647;
  const rnd = () => (s = (s * 48271) % 2147483647) / 2147483647;
  const vL = 2 + rnd() * 14, vR = 2 + rnd() * 14, depth = 0.1 + rnd() * 0.1;
  const frames: Frame[] = [];
  for (let k = 0; k < n; k++) {
    const phase = Math.sin((2 * Math.PI * k) / n) * 0.5 + 0.5;
    const kneeY = 0.7 + depth * phase;
    const lsh = (vL / 100) * phase, rsh = (vR / 100) * phase;
    frames.push({
      left_shoulder: { x: 0.44, y: 0.3 }, right_shoulder: { x: 0.56, y: 0.3 },
      left_hip: { x: 0.46, y: 0.5 }, right_hip: { x: 0.54, y: 0.5 },
      left_knee: { x: 0.46 + lsh, y: kneeY }, right_knee: { x: 0.54 - rsh, y: kneeY },
      left_ankle: { x: 0.46, y: 0.9 }, right_ankle: { x: 0.54, y: 0.9 },
    });
  }
  return frames;
}

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
function hash(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
