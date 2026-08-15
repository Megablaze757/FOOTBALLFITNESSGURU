// =============================================================================
// The movement catalogue the program engine builds from.
//
// WHY THIS EXISTS. There were two libraries. lib/exercises.ts holds ~85 fully
// documented exercises — demo animation, coaching cues, tempo, why it helps.
// lib/coach.ts held a second, private list of 42 for the program engine to
// choose from. Everything else was invisible to it.
//
// So no program ever contained a warm-up, any core work, any rehab progression,
// any of the cardio machines, or a single one of the seven goalkeeper drills —
// not because the engine decided against them, but because it could not see
// them. A keeper got outfield finishing drills.
//
// This file is the join. Exercise facts (name, cues, demo, equipment) stay in
// exercises.ts and are never duplicated; what lives here is what the ENGINE
// needs to know — where a movement belongs in a session, what pattern it
// trains, what it costs each joint, and how to dose it properly.
//
// Pure data + tested.
// =============================================================================

import { EXERCISES, type Exercise, type SportId } from "./exercises";
import type { Region } from "./constraints";

// Defined here rather than in coach.ts so the catalogue doesn't have to import
// the engine that consumes it. coach.ts re-exports both, so existing imports of
// `GoalType` from "@/lib/coach" keep working.
export type GoalType = "speed" | "agility" | "strength" | "endurance" | "injury_recovery" | "skill";
/**
 * The areas the programme can train around.
 *
 * THIS LIST USED TO BE SHORTER THAN THE ONE THE ATHLETE CAN POINT AT, and that
 * gap was silent. `m.load[area] ?? 0` treats an unmodelled area as costing
 * nothing, so EVERY movement claimed to spare it: an athlete marked a groin at
 * 8/10 and the engine cheerfully kept prescribing sprints, change-of-direction
 * work and shooting drills, because as far as it was concerned nothing in the
 * catalogue touched a groin. Six of the thirteen areas on the body map were in
 * that state — calf, groin, glute, elbow, wrist and head — including the two
 * commonest soft-tissue injuries in football.
 *
 * A missing default that silently means "fine" is the same absent-is-not-zero
 * mistake this codebase keeps having to relearn.
 *
 * `head` is deliberately still not here. A suspected concussion is not a
 * loading problem to be programmed around — the answer is to stop, which is
 * what the concussion protocol says, and quietly swapping a drill would imply
 * training through it is an option.
 */
export type BodyArea =
  | "knee" | "ankle" | "hamstring" | "quad" | "hip" | "lower_back" | "shoulder"
  | "calf" | "groin" | "glute" | "elbow" | "wrist";

/**
 * Where a movement belongs in a session. This is the thing that turns a list of
 * three drills into an actual training session: you warm up, you do the hard
 * skilled work while you're fresh, you accumulate volume, then you condition.
 */
export type Slot = "warmup" | "primary" | "secondary" | "accessory" | "conditioning" | "skill" | "cooldown";

/** What the movement trains, so a session isn't three variations of one thing. */
export type Pattern =
  | "squat" | "hinge" | "lunge" | "push_v" | "push_h" | "pull_v" | "pull_h"
  | "carry" | "core" | "jump" | "sprint" | "cod" | "footwork"
  | "conditioning" | "mobility" | "rehab" | "skill";

/** Normalised from the free-text equipment on the exercise, for filtering. */
export type Kit =
  | "none" | "band" | "barbell" | "dumbbell" | "machine" | "kettlebell"
  | "box" | "ball" | "cones" | "cardio" | "partner" | "other";

/** How a movement is progressively overloaded. */
export type Prog = "load" | "reps" | "time" | "skill";

export interface Dose {
  sets: number;
  reps: number;
  /** Seconds between sets. For sprint and power work the rest IS the
   *  prescription — 30 seconds turns speed work into conditioning. */
  rest: number;
  unit: "reps" | "secs" | "metres" | "each side" | "minutes";
  /** Target effort out of 10. Absent where effort isn't the point. */
  rpe?: number;
  tempo?: string;
}

export interface MovementMeta {
  slot: Slot;
  pattern: Pattern;
  targets: GoalType[];
  /** 0–3 mechanical cost per joint, for training around pain. */
  load: Partial<Record<BodyArea, number>>;
  level: 1 | 2 | 3;
  dose: Dose;
  prog: Prog;
  region?: Region;
}

export interface Movement extends MovementMeta {
  id: string;
  name: string;
  cue: string;
  kit: Kit;
  sports?: SportId[];
  tempo: string;
}

const d = (sets: number, reps: number, rest: number, extra: Partial<Dose> = {}): Dose =>
  ({ sets, reps, rest, unit: "reps", ...extra });

// Rest that means something. Named because "90" scattered through a table is
// unreadable and quietly drifts.
const REST = {
  none: 15,      // flow straight on — warm-ups, mobility
  short: 45,     // accessory work
  moderate: 90,  // secondary lifts, hypertrophy
  long: 150,     // heavy compounds
  full: 180,     // sprints, jumps, max power — recover or it isn't speed work
} as const;

// -----------------------------------------------------------------------------
// Engine metadata, keyed by the exercise id in lib/exercises.ts.
// An exercise with no entry here simply isn't programmed automatically — it's
// still browsable in the library. That's the safe default for anything new.
// -----------------------------------------------------------------------------

const META: Record<string, MovementMeta> = {
  // --- Warm-up: mobility and activation ------------------------------------
  leg_swings: { slot: "warmup", pattern: "mobility", targets: [], load: { groin: 1, hip: 1 }, level: 1, prog: "reps", dose: d(1, 10, REST.none, { unit: "each side" }) },
  world_greatest_stretch: { slot: "warmup", pattern: "mobility", targets: [], load: { groin: 1, hip: 1 }, level: 1, prog: "reps", dose: d(1, 5, REST.none, { unit: "each side" }) },
  hip_90_90: { slot: "warmup", pattern: "mobility", targets: [], load: { hip: 1, groin: 1 }, level: 1, prog: "time", dose: d(2, 30, REST.none, { unit: "secs" }) },
  ankle_rocks: { slot: "warmup", pattern: "mobility", targets: [], load: { ankle: 1 }, level: 1, prog: "reps", dose: d(1, 10, REST.none, { unit: "each side" }) },
  thoracic_openers: { slot: "warmup", pattern: "mobility", targets: [], load: {}, level: 1, prog: "reps", dose: d(1, 8, REST.none, { unit: "each side" }) },
  glute_bridge: { slot: "warmup", pattern: "hinge", targets: ["injury_recovery"], load: { glute: 2, hip: 1 }, level: 1, prog: "reps", dose: d(2, 12, REST.none), region: "legs" },
  monster_walk: { slot: "warmup", pattern: "mobility", targets: ["injury_recovery"], load: { groin: 1, glute: 2 }, level: 1, prog: "reps", dose: d(2, 12, REST.none, { unit: "each side" }), region: "legs" },
  scap_pull_up: { slot: "warmup", pattern: "pull_v", targets: ["strength"], load: { shoulder: 1, elbow: 1 }, level: 1, prog: "reps", dose: d(2, 8, REST.short), region: "back" },
  single_leg_balance: { slot: "warmup", pattern: "rehab", targets: ["injury_recovery"], load: { ankle: 1, calf: 1 }, level: 1, prog: "time", dose: d(2, 30, REST.none, { unit: "secs" }) },
  ladder_quickfeet: { slot: "warmup", pattern: "footwork", targets: ["agility", "speed"], load: { ankle: 1, calf: 2 }, level: 1, prog: "time", dose: d(3, 20, REST.short, { unit: "secs" }), region: "conditioning" },
  a_skips: { slot: "warmup", pattern: "sprint", targets: ["speed"], load: { ankle: 1, calf: 2, glute: 1, hip: 2 }, level: 1, prog: "reps", dose: d(3, 20, REST.short, { unit: "metres" }), region: "conditioning" },

  // --- Primary: the hard, skilled work, done fresh --------------------------
  back_squat: { slot: "primary", pattern: "squat", targets: ["strength"], load: { knee: 2, hip: 1, quad: 2, groin: 1, glute: 2, lower_back: 2 }, level: 2, prog: "load", dose: d(4, 5, REST.long, { rpe: 8, tempo: "3s down · drive up" }), region: "legs" },
  front_squat: { slot: "primary", pattern: "squat", targets: ["strength"], load: { knee: 2, quad: 3, groin: 1, glute: 1, wrist: 2, hip: 1, lower_back: 2 }, level: 2, prog: "load", dose: d(4, 5, REST.long, { rpe: 8, tempo: "2s down · drive up" }), region: "legs" },
  deadlift: { slot: "primary", pattern: "hinge", targets: ["strength"], load: { hamstring: 2, lower_back: 2, glute: 2, hip: 2 }, level: 3, prog: "load", dose: d(4, 4, REST.long, { rpe: 8, tempo: "Controlled down" }), region: "legs" },
  bench_press: { slot: "primary", pattern: "push_h", targets: ["strength"], load: { shoulder: 1, elbow: 2, wrist: 1 }, level: 2, prog: "load", dose: d(4, 6, REST.long, { rpe: 8, tempo: "2s down · press" }), region: "chest" },
  overhead_press: { slot: "primary", pattern: "push_v", targets: ["strength"], load: { shoulder: 2, elbow: 2, wrist: 2, lower_back: 2 }, level: 2, prog: "load", dose: d(4, 6, REST.long, { rpe: 8 }), region: "shoulders" },
  pull_up: { slot: "primary", pattern: "pull_v", targets: ["strength"], load: { shoulder: 1, elbow: 2, wrist: 1 }, level: 2, prog: "reps", dose: d(4, 6, REST.long, { rpe: 8, tempo: "Own the lower" }), region: "back" },
  power_clean: { slot: "primary", pattern: "jump", targets: ["strength", "speed"], load: { knee: 2, lower_back: 1, quad: 2, calf: 1, glute: 2, wrist: 2, hip: 2 }, level: 3, prog: "load", dose: d(5, 3, REST.full, { rpe: 8, tempo: "Explosive" }), region: "legs" },
  box_jumps: { slot: "primary", pattern: "jump", targets: ["strength", "speed"], load: { knee: 2, ankle: 2, quad: 2, calf: 2, glute: 2, hip: 1, lower_back: 1 }, level: 2, prog: "load", dose: d(4, 4, REST.full, { rpe: 7 }), region: "impact" },
  broad_jump: { slot: "primary", pattern: "jump", targets: ["strength", "speed"], load: { knee: 2, ankle: 1, quad: 2, calf: 2, glute: 2, hip: 2, lower_back: 1 }, level: 2, prog: "load", dose: d(4, 4, REST.full, { rpe: 7 }), region: "impact" },
  vertical_jump: { slot: "primary", pattern: "jump", targets: ["strength", "speed"], load: { knee: 2, ankle: 1, quad: 2, calf: 2, glute: 2, hip: 1 }, level: 2, prog: "load", dose: d(4, 4, REST.full, { rpe: 7 }), region: "impact" },
  depth_drop: { slot: "primary", pattern: "jump", targets: ["speed", "strength"], load: { knee: 3, ankle: 2, quad: 3, calf: 3, glute: 2, hip: 1, lower_back: 1 }, level: 3, prog: "load", dose: d(4, 3, REST.full, { rpe: 8 }), region: "impact" },
  flying_sprints: { slot: "primary", pattern: "sprint", targets: ["speed"], load: { hamstring: 2, knee: 1, quad: 1, calf: 3, groin: 1, glute: 2, hip: 2, lower_back: 1 }, level: 3, prog: "time", dose: d(5, 20, REST.full, { unit: "metres", rpe: 9 }), region: "conditioning" },
  resisted_sprint: { slot: "primary", pattern: "sprint", targets: ["speed"], load: { hamstring: 2, quad: 1, calf: 2, groin: 1, glute: 3, hip: 2, lower_back: 2 }, level: 2, prog: "load", dose: d(6, 15, REST.full, { unit: "metres", rpe: 9 }), region: "conditioning" },
  hill_sprints: { slot: "primary", pattern: "sprint", targets: ["speed", "endurance"], load: { hamstring: 1, quad: 2, calf: 3, groin: 1, glute: 3, hip: 2, lower_back: 1 }, level: 2, prog: "reps", dose: d(6, 30, REST.full, { unit: "metres", rpe: 9 }), region: "conditioning" },
  stride_outs: { slot: "primary", pattern: "sprint", targets: ["speed"], load: { hamstring: 1, calf: 2, glute: 2, hip: 1 }, level: 1, prog: "reps", dose: d(5, 60, REST.long, { unit: "metres", rpe: 7 }), region: "conditioning" },
  t_drill: { slot: "primary", pattern: "cod", targets: ["agility", "speed"], load: { knee: 1, ankle: 1, quad: 1, calf: 2, groin: 2, glute: 1, hip: 2 }, level: 2, prog: "time", dose: d(5, 1, REST.full, { rpe: 9 }), region: "conditioning" },
  scrum_drive: { slot: "primary", pattern: "push_h", targets: ["strength"], load: { lower_back: 1, shoulder: 1, elbow: 1, wrist: 1 }, level: 2, prog: "load", dose: d(5, 5, REST.long, { rpe: 8 }), region: "conditioning" },

  // --- Secondary: the second movement, complementing the primary ------------
  goblet_squat: { slot: "secondary", pattern: "squat", targets: ["strength"], load: { knee: 1, quad: 1, groin: 1, glute: 1, hip: 1, lower_back: 1 }, level: 1, prog: "load", dose: d(3, 10, REST.moderate, { rpe: 7 }), region: "legs" },
  hip_thrust: { slot: "secondary", pattern: "hinge", targets: ["strength"], load: { hamstring: 1, glute: 3, hip: 2, lower_back: 1 }, level: 1, prog: "load", dose: d(3, 10, REST.moderate, { rpe: 8 }), region: "legs" },
  single_leg_rdl: { slot: "secondary", pattern: "hinge", targets: ["strength", "injury_recovery", "speed"], load: { hamstring: 1, glute: 2, hip: 2, lower_back: 2 }, level: 2, prog: "load", dose: d(3, 8, REST.moderate, { unit: "each side", rpe: 7, tempo: "3s down" }), region: "legs" },
  bulgarian_split: { slot: "secondary", pattern: "lunge", targets: ["strength"], load: { knee: 2, hip: 1, quad: 2, groin: 1, glute: 2, lower_back: 1 }, level: 2, prog: "load", dose: d(3, 8, REST.moderate, { unit: "each side", rpe: 8 }), region: "legs" },
  barbell_row: { slot: "secondary", pattern: "pull_h", targets: ["strength"], load: { lower_back: 1, elbow: 1, wrist: 1 }, level: 2, prog: "load", dose: d(3, 8, REST.moderate, { rpe: 8 }), region: "back" },
  lat_pulldown: { slot: "secondary", pattern: "pull_v", targets: ["strength"], load: { elbow: 1, wrist: 1 }, level: 1, prog: "load", dose: d(3, 10, REST.moderate, { rpe: 7 }), region: "back" },
  dumbbell_press: { slot: "secondary", pattern: "push_v", targets: ["strength"], load: { shoulder: 1, elbow: 2, wrist: 1 }, level: 1, prog: "load", dose: d(3, 10, REST.moderate, { rpe: 7 }), region: "shoulders" },
  pogo_hops: { slot: "secondary", pattern: "jump", targets: ["speed", "strength"], load: { ankle: 2, calf: 3, glute: 1, hip: 1 }, level: 2, prog: "reps", dose: d(4, 12, REST.short, { rpe: 7 }), region: "impact" },
  lateral_shuffle: { slot: "secondary", pattern: "cod", targets: ["agility"], load: { knee: 1, ankle: 1, quad: 1, calf: 1, groin: 2, glute: 2, hip: 2 }, level: 1, prog: "time", dose: d(4, 20, REST.moderate, { unit: "secs", rpe: 8 }), region: "conditioning" },
  reactive_mirror: { slot: "secondary", pattern: "cod", targets: ["agility"], load: { calf: 1, groin: 2, hip: 1 }, level: 2, prog: "time", dose: d(4, 20, REST.moderate, { unit: "secs", rpe: 8 }), region: "conditioning" },
  defensive_slides: { slot: "secondary", pattern: "cod", targets: ["agility"], load: { knee: 1, quad: 1, calf: 1, groin: 2, glute: 2, hip: 2 }, level: 1, prog: "time", dose: d(4, 25, REST.moderate, { unit: "secs", rpe: 8 }), region: "conditioning" },

  // --- Accessory: volume, weak points, durability ---------------------------
  // Hamstring work targets SPEED as well as strength, which is not a
  // technicality. These scored poorly in a speed session because their targets
  // said "strength, injury_recovery" — so a football speed block came out with
  // four hamstring sets against thirteen quad sets, and sprinting is itself the
  // mechanism that tears hamstrings. The Nordic curl is the best-evidenced
  // injury-prevention exercise there is for sprinting athletes; it belongs in a
  // speed block by name, not by exception.
  // REST.moderate, not REST.short. The Nordic sits in the accessory slot and so
  // inherited accessory rest — 45 seconds — but it is not accessory volume: it
  // is a maximal eccentric, the highest-force thing most athletes will do all
  // week, and the stimulus IS the force. Rushed back on 45s the reps get
  // shorter and sloppier, which trains less and hurts more.
  //
  // RPE is deliberately left OFF. I set it explicitly to 8 first, which was
  // worse than leaving it: the base value still progresses, so peak week came
  // out at RPE 9 where the accessory default had produced 8. Effort is not the
  // dial on this movement anyway — you resist until you cannot — so the
  // accessory default is both harmless and correct, and the dose that matters
  // is the reps.
  nordic_curl: { slot: "accessory", pattern: "hinge", targets: ["strength", "injury_recovery", "speed"], load: { hamstring: 2, glute: 1, hip: 1, lower_back: 1 }, level: 2, prog: "reps", dose: d(3, 6, REST.moderate, { tempo: "Resist the lower" }), region: "legs" },
  copenhagen: { slot: "accessory", pattern: "core", targets: ["strength", "injury_recovery"], load: { hip: 1, groin: 3, lower_back: 1 }, level: 2, prog: "time", dose: d(3, 20, REST.short, { unit: "secs" }), region: "core" },
  spanish_squat: { slot: "accessory", pattern: "squat", targets: ["injury_recovery"], load: { knee: 1, quad: 2, glute: 1, hip: 1 }, level: 1, prog: "time", dose: d(3, 30, REST.short, { unit: "secs" }), region: "legs" },
  band_lateral_walk: { slot: "accessory", pattern: "rehab", targets: ["injury_recovery", "strength"], load: { groin: 1, glute: 2, hip: 1 }, level: 1, prog: "reps", dose: d(3, 12, REST.short, { unit: "each side" }), region: "legs" },
  calf_raise: { slot: "accessory", pattern: "rehab", targets: ["strength", "injury_recovery"], load: { ankle: 1, calf: 2 }, level: 1, prog: "load", dose: d(3, 12, REST.short, { tempo: "2s up · 3s down" }), region: "legs" },
  farmers_carry: { slot: "accessory", pattern: "carry", targets: ["strength", "endurance"], load: { elbow: 1, wrist: 3, lower_back: 2 }, level: 1, prog: "load", dose: d(3, 30, REST.moderate, { unit: "metres", rpe: 8 }), region: "core" },
  dead_bug: { slot: "accessory", pattern: "core", targets: ["injury_recovery"], load: { lower_back: 1 }, level: 1, prog: "reps", dose: d(3, 8, REST.short, { unit: "each side" }), region: "core" },
  bird_dog: { slot: "accessory", pattern: "core", targets: ["injury_recovery"], load: { lower_back: 1 }, level: 1, prog: "reps", dose: d(3, 8, REST.short, { unit: "each side" }), region: "core" },
  mcgill_curl_up: { slot: "accessory", pattern: "core", targets: ["injury_recovery"], load: { lower_back: 1 }, level: 1, prog: "time", dose: d(3, 10, REST.short, { unit: "secs" }), region: "core" },
  isometric_wall_sit: { slot: "accessory", pattern: "squat", targets: ["injury_recovery", "endurance"], load: { knee: 1, quad: 2, glute: 1 }, level: 1, prog: "time", dose: d(3, 30, REST.short, { unit: "secs" }), region: "legs" },
  hamstring_slider: { slot: "accessory", pattern: "hinge", targets: ["injury_recovery", "speed"], load: { hamstring: 1, glute: 1, hip: 1 }, level: 2, prog: "reps", dose: d(3, 8, REST.short, { tempo: "Slow out" }), region: "legs" },
  terminal_knee_ext: { slot: "accessory", pattern: "rehab", targets: ["injury_recovery"], load: { knee: 1, quad: 2 }, level: 1, prog: "reps", dose: d(3, 15, REST.short), region: "legs" },
  adductor_iso_squeeze: { slot: "accessory", pattern: "rehab", targets: ["injury_recovery"], load: { hip: 1, groin: 2 }, level: 1, prog: "time", dose: d(3, 20, REST.short, { unit: "secs" }), region: "legs" },
  calf_raise_eccentric: { slot: "accessory", pattern: "rehab", targets: ["injury_recovery"], load: { ankle: 1, calf: 3 }, level: 1, prog: "reps", dose: d(3, 12, REST.short, { tempo: "3s lower" }), region: "legs" },
  shoulder_external_rotation: { slot: "accessory", pattern: "rehab", targets: ["injury_recovery"], load: { shoulder: 1 }, level: 1, prog: "reps", dose: d(3, 15, REST.short, { unit: "each side" }), region: "shoulders" },
  ankle_alphabet: { slot: "accessory", pattern: "rehab", targets: ["injury_recovery"], load: { ankle: 1 }, level: 1, prog: "reps", dose: d(2, 1, REST.short, { unit: "each side" }) },

  // --- Conditioning: the finisher -------------------------------------------
  tempo_runs: { slot: "conditioning", pattern: "conditioning", targets: ["endurance"], load: { hamstring: 1, knee: 1, quad: 1, calf: 2, glute: 1 }, level: 2, prog: "time", dose: d(6, 100, REST.moderate, { unit: "metres", rpe: 7 }), region: "conditioning" },

  // ACTUAL RUNS — for every sport, not just runners.
  //
  // Before these, a conditioning slot could be filled by a sled, a shuttle or a
  // bike but never by going for a run, and a recovery day had nothing aerobic
  // in it at all. Both are the most ordinary thing an athlete does.
  //
  // All are `region: "running"` so one "no running" note drops the lot and
  // leaves the bike and rower to fill the slot. Doses are single sets, because
  // a run is one continuous effort — the minutes are in `reps`, and the zone
  // and pacing live in lib/running.ts, which is where the prescription is
  // written for the athlete.
  recovery_run: { slot: "conditioning", pattern: "conditioning", targets: ["injury_recovery", "endurance"], load: { knee: 2, ankle: 2, hamstring: 2, quad: 1, calf: 1 }, level: 1, prog: "time", dose: d(1, 30, REST.none, { unit: "minutes", rpe: 2 }), region: "running" },
  easy_run: { slot: "conditioning", pattern: "conditioning", targets: ["endurance"], load: { knee: 2, ankle: 2, hamstring: 2, hip: 1, quad: 1, calf: 2, glute: 1 }, level: 1, prog: "time", dose: d(1, 40, REST.none, { unit: "minutes", rpe: 4 }), region: "running" },
  long_run: { slot: "conditioning", pattern: "conditioning", targets: ["endurance"], load: { knee: 2, ankle: 2, hamstring: 2, hip: 1, quad: 1, calf: 2, glute: 1, lower_back: 1 }, level: 2, prog: "time", dose: d(1, 75, REST.none, { unit: "minutes", rpe: 5 }), region: "running" },
  threshold_run: { slot: "conditioning", pattern: "conditioning", targets: ["endurance"], load: { knee: 2, ankle: 2, hamstring: 2, quad: 1, calf: 2, glute: 1, lower_back: 1 }, level: 2, prog: "time", dose: d(1, 30, REST.none, { unit: "minutes", rpe: 8 }), region: "running" },
  vo2_intervals: { slot: "conditioning", pattern: "conditioning", targets: ["endurance"], load: { knee: 2, ankle: 2, hamstring: 2, quad: 1, calf: 2, lower_back: 1 }, level: 3, prog: "time", dose: d(5, 3, REST.long, { unit: "minutes", rpe: 9 }), region: "running" },
  fartlek_run: { slot: "conditioning", pattern: "conditioning", targets: ["endurance", "speed"], load: { knee: 2, ankle: 2, hamstring: 2, quad: 1, calf: 2 }, level: 2, prog: "time", dose: d(1, 50, REST.none, { unit: "minutes", rpe: 7 }), region: "running" },
  progression_run: { slot: "conditioning", pattern: "conditioning", targets: ["endurance"], load: { knee: 2, ankle: 2, hamstring: 2, quad: 1, calf: 2 }, level: 2, prog: "time", dose: d(1, 50, REST.none, { unit: "minutes", rpe: 6 }), region: "running" },
  hill_repeats: { slot: "conditioning", pattern: "conditioning", targets: ["endurance", "strength"], load: { knee: 2, ankle: 2, hamstring: 2, quad: 2, calf: 3, glute: 2, hip: 1 }, level: 2, prog: "reps", dose: d(8, 60, REST.moderate, { unit: "secs", rpe: 8 }), region: "running" },
  // A primer, not a session — which is why it warms up rather than conditions.
  strides: { slot: "warmup", pattern: "sprint", targets: ["speed"], load: { knee: 2, ankle: 2, hamstring: 2, quad: 1, calf: 2, glute: 2, hip: 1 }, level: 1, prog: "reps", dose: d(5, 20, REST.short, { unit: "secs", rpe: 6 }), region: "running" },
  bike_intervals: { slot: "conditioning", pattern: "conditioning", targets: ["endurance", "injury_recovery"], load: {}, level: 2, prog: "time", dose: d(8, 40, REST.short, { unit: "secs", rpe: 8 }), region: "conditioning" },
  rowing_intervals: { slot: "conditioning", pattern: "conditioning", targets: ["endurance"], load: { lower_back: 1, elbow: 1 }, level: 2, prog: "time", dose: d(6, 60, REST.moderate, { unit: "secs", rpe: 8 }), region: "conditioning" },
  ski_erg: { slot: "conditioning", pattern: "conditioning", targets: ["endurance"], load: { shoulder: 1, elbow: 1, lower_back: 1 }, level: 2, prog: "time", dose: d(6, 45, REST.moderate, { unit: "secs", rpe: 8 }), region: "conditioning" },
  skipping: { slot: "conditioning", pattern: "conditioning", targets: ["endurance", "agility"], load: { ankle: 2, calf: 3 }, level: 1, prog: "time", dose: d(5, 60, REST.short, { unit: "secs", rpe: 7 }), region: "conditioning" },
  incline_walk: { slot: "conditioning", pattern: "conditioning", targets: ["endurance", "injury_recovery"], load: { calf: 2 }, level: 1, prog: "time", dose: d(1, 20, REST.none, { unit: "minutes", rpe: 5 }), region: "conditioning" },
  swim_intervals: { slot: "conditioning", pattern: "conditioning", targets: ["endurance", "injury_recovery"], load: {}, level: 2, prog: "time", dose: d(8, 50, REST.short, { unit: "metres", rpe: 7 }), region: "conditioning" },
  sled_push: { slot: "conditioning", pattern: "conditioning", targets: ["endurance", "strength"], load: { knee: 1, quad: 2, calf: 2, glute: 2, hip: 1, lower_back: 2 }, level: 2, prog: "load", dose: d(6, 20, REST.moderate, { unit: "metres", rpe: 8 }), region: "conditioning" },
  kb_swing_intervals: { slot: "conditioning", pattern: "hinge", targets: ["endurance", "strength"], load: { lower_back: 1, hamstring: 1, groin: 1, glute: 2, wrist: 1, hip: 2 }, level: 2, prog: "time", dose: d(6, 30, REST.short, { unit: "secs", rpe: 8 }), region: "conditioning" },
  shuttle_runs: { slot: "conditioning", pattern: "cod", targets: ["endurance", "agility"], load: { knee: 1, ankle: 1, quad: 1, calf: 2, groin: 1, glute: 1, hip: 1 }, level: 2, prog: "time", dose: d(8, 20, REST.moderate, { unit: "metres", rpe: 9 }), region: "conditioning" },
  stair_intervals: { slot: "conditioning", pattern: "conditioning", targets: ["endurance"], load: { knee: 1, quad: 2, calf: 3, glute: 2, hip: 1 }, level: 2, prog: "time", dose: d(8, 30, REST.moderate, { unit: "secs", rpe: 8 }), region: "conditioning" },

  // --- Cool-down -------------------------------------------------------------
  couch_stretch: { slot: "cooldown", pattern: "mobility", targets: [], load: { hip: 2 }, level: 1, prog: "time", dose: d(2, 45, REST.none, { unit: "secs" }) },

  // --- Sport skill -----------------------------------------------------------
  // The block builder takes its ball work from lib/skills.ts instead, which is
  // position-aware and carries setup and coaching points. These entries are what
  // makes skill work reachable by the /coach page's recommendations — including
  // the goalkeeping drills, which nothing could surface before.
  cone_weave: { slot: "skill", pattern: "skill", targets: ["skill", "agility"], load: { ankle: 1 }, level: 1, prog: "skill", dose: d(6, 1, REST.short), region: "skill" },
  dribbling_grid: { slot: "skill", pattern: "skill", targets: ["skill", "agility"], load: { ankle: 1, groin: 1 }, level: 1, prog: "skill", dose: d(4, 60, REST.short, { unit: "secs" }), region: "skill" },
  passing_wall: { slot: "skill", pattern: "skill", targets: ["skill"], load: { groin: 1 }, level: 1, prog: "skill", dose: d(5, 60, REST.short, { unit: "secs" }), region: "skill" },
  first_touch_drill: { slot: "skill", pattern: "skill", targets: ["skill"], load: { groin: 1 }, level: 1, prog: "skill", dose: d(6, 45, REST.short, { unit: "secs" }), region: "skill" },
  crossing_drill: { slot: "skill", pattern: "skill", targets: ["skill"], load: { groin: 2, hip: 1 }, level: 2, prog: "skill", dose: d(4, 8, REST.short), region: "skill" },
  finishing_drill: { slot: "skill", pattern: "skill", targets: ["skill"], load: { groin: 2, hip: 1 }, level: 2, prog: "skill", dose: d(5, 8, REST.short), region: "skill" },
  heading_drill: { slot: "skill", pattern: "skill", targets: ["skill"], load: { lower_back: 1 }, level: 2, prog: "skill", dose: d(4, 8, REST.short), region: "skill" },
  long_passing: { slot: "skill", pattern: "skill", targets: ["skill"], load: { groin: 2, hip: 1 }, level: 2, prog: "skill", dose: d(4, 10, REST.short), region: "skill" },
  one_v_one_attack: { slot: "skill", pattern: "skill", targets: ["skill", "agility"], load: { ankle: 1, groin: 1 }, level: 2, prog: "skill", dose: d(6, 1, REST.moderate), region: "skill" },
  set_piece_practice: { slot: "skill", pattern: "skill", targets: ["skill"], load: { groin: 2, hip: 1 }, level: 2, prog: "skill", dose: d(4, 8, REST.short), region: "skill" },
  tackle_technique: { slot: "skill", pattern: "skill", targets: ["skill"], load: { shoulder: 1, groin: 2, hip: 1, lower_back: 2 }, level: 2, prog: "skill", dose: d(4, 6, REST.moderate), region: "skill" },
  gk_handling: { slot: "skill", pattern: "skill", targets: ["skill"], load: { elbow: 1, wrist: 2 }, level: 1, prog: "skill", dose: d(5, 10, REST.short), region: "skill" },
  gk_footwork: { slot: "skill", pattern: "skill", targets: ["skill", "agility"], load: { ankle: 1 }, level: 1, prog: "skill", dose: d(5, 30, REST.short, { unit: "secs" }), region: "skill" },
  gk_diving: { slot: "skill", pattern: "skill", targets: ["skill"], load: { shoulder: 1, groin: 2, elbow: 1, wrist: 2, lower_back: 1 }, level: 2, prog: "skill", dose: d(4, 6, REST.moderate, { unit: "each side" }), region: "skill" },
  gk_reaction_saves: { slot: "skill", pattern: "skill", targets: ["skill", "agility"], load: { wrist: 2 }, level: 2, prog: "skill", dose: d(5, 8, REST.moderate), region: "skill" },
  gk_distribution: { slot: "skill", pattern: "skill", targets: ["skill"], load: { groin: 2 }, level: 1, prog: "skill", dose: d(4, 10, REST.short), region: "skill" },
  gk_crosses: { slot: "skill", pattern: "skill", targets: ["skill"], load: { shoulder: 1, wrist: 2 }, level: 2, prog: "skill", dose: d(4, 8, REST.moderate), region: "skill" },
  gk_one_v_one: { slot: "skill", pattern: "skill", targets: ["skill"], load: { wrist: 1 }, level: 3, prog: "skill", dose: d(4, 6, REST.moderate), region: "skill" },
};

/** Free-text equipment on the exercise -> the enum the engine filters on. */
export function normaliseKit(equipment: string): Kit {
  const e = equipment.toLowerCase();
  if (/^none$/.test(e)) return "none";
  if (/band/.test(e)) return "band";
  if (/barbell|^bar$/.test(e)) return "barbell";
  if (/dumbbell/.test(e)) return "dumbbell";
  if (/kettlebell/.test(e)) return "kettlebell";
  if (/cable|machine|rower|ski erg|treadmill|bike/.test(e)) return "machine";
  if (/box|step|stairs/.test(e)) return "box";
  if (/ball|goal|rebounder|target/.test(e)) return "ball";
  if (/cone/.test(e)) return "cones";
  if (/partner|server|defender|attacker/.test(e)) return "partner";
  if (/pool|hill|sled|rope|weight|bench|wall|support|slider|bag|cushion/.test(e)) return "other";
  return "other";
}

/**
 * The catalogue: every exercise that carries engine metadata, joined to its
 * facts. Built once at module load.
 *
 * Note what is NOT here — nothing is re-typed. If someone fixes a coaching cue
 * in exercises.ts, the program says the fixed version, because there is only
 * one copy of it.
 */
export const MOVEMENTS: Movement[] = EXERCISES.flatMap((ex: Exercise) => {
  const meta = META[ex.id];
  if (!meta) return [];
  return [{
    ...meta,
    id: ex.id,
    name: ex.name,
    cue: ex.cues[0] ?? ex.why,
    kit: normaliseKit(ex.equipment),
    sports: ex.sports,
    tempo: meta.dose.tempo ?? ex.tempo,
  }];
});

export const MOVEMENT_BY_ID: Record<string, Movement> =
  Object.fromEntries(MOVEMENTS.map((m) => [m.id, m]));

export function movementsInSlot(slot: Slot): Movement[] {
  return MOVEMENTS.filter((m) => m.slot === slot);
}

/** Session order, for sorting a list of movements the way a session runs. */
export const SLOT_LABEL_ORDER: Slot[] =
  ["warmup", "primary", "secondary", "accessory", "skill", "conditioning", "cooldown"];

/** The region a movement belongs to, for "I don't train legs" exclusions. */
export function regionOfMovement(id: string): Region | undefined {
  return MOVEMENT_BY_ID[id]?.region;
}

/** Ids that carry engine metadata — exported so a test can catch typos. */
export const PROGRAMMED_IDS = Object.keys(META);
