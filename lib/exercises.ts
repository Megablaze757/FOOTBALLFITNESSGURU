// =============================================================================
// Coached exercise library — rich, athlete-facing metadata for every drill the
// AI coach and video analysis can prescribe. Keyed by the same drill ids used
// in lib/coach.ts and lib/biomech.ts so any DrillItem resolves to full coaching
// content: an animated demo, cues, tempo, target muscles and why it helps.
// Pure data (no deps) — safe on the static site.
// =============================================================================

export type DemoPattern =
  | "squat" | "hinge" | "lunge" | "jump" | "plank"
  | "run" | "lateral" | "ball" | "bike";

export type ExerciseCategory =
  | "Speed" | "Agility" | "Power" | "Strength" | "Recovery" | "Endurance" | "Skill";

export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  demo: DemoPattern;
  equipment: string;
  muscles: string[];
  tempo: string;        // e.g. "3s down · explode up"
  cues: string[];       // 2–3 concise coaching cues
  why: string;          // one line: why it helps the athlete
}

export const EXERCISES: Exercise[] = [
  { id: "ladder_quickfeet", name: "Ladder quick-feet", category: "Agility", demo: "run", equipment: "None",
    muscles: ["Calves", "Hip flexors"], tempo: "Fast · 10–15s bursts",
    cues: ["Stay on the balls of your feet", "Fast ground contacts, quiet landings", "Arms drive in rhythm with the feet"],
    why: "Trains foot speed and coordination so you're sharper in tight spaces." },
  { id: "reactive_mirror", name: "Reactive mirror drill", category: "Agility", demo: "lateral", equipment: "Partner",
    muscles: ["Glutes", "Quads", "Calves"], tempo: "5–8s reactive reps",
    cues: ["React — don't pre-plan your steps", "Low athletic stance", "Push hard off the outside foot"],
    why: "Builds the reactive change-of-direction you actually use in a game." },
  { id: "lateral_shuffle", name: "Lateral shuffle gates", category: "Agility", demo: "lateral", equipment: "Cones",
    muscles: ["Glute med", "Adductors", "Quads"], tempo: "Controlled · 6–10m",
    cues: ["Hips low, chest up", "Push off the outside foot", "Don't click your heels together"],
    why: "Strengthens the lateral push-off that protects the knee on cuts." },
  { id: "cone_weave", name: "Cone weave dribble", category: "Skill", demo: "ball", equipment: "Ball + cones",
    muscles: ["Calves", "Core"], tempo: "Smooth · continuous",
    cues: ["Small touches, close control", "Eyes up between cones", "Use both feet"],
    why: "Sharpens close control at speed under light fatigue." },
  { id: "t_drill", name: "T-drill", category: "Agility", demo: "lateral", equipment: "Cones",
    muscles: ["Quads", "Glutes", "Calves"], tempo: "Max effort · full rest",
    cues: ["Decelerate under control before each turn", "Stay square through the shuffles", "Accelerate out of every change"],
    why: "A benchmark COD drill — sprints, shuffles and turns in one." },
  { id: "a_skips", name: "A-skips", category: "Speed", demo: "run", equipment: "None",
    muscles: ["Hip flexors", "Calves", "Hamstrings"], tempo: "Rhythmic · 20m",
    cues: ["Tall posture, ribs down", "Drive the knee, snap the foot down", "Punch the ground, don't reach"],
    why: "Grooves clean sprint mechanics and rhythm." },
  { id: "resisted_sprint", name: "Resisted sprint starts", category: "Speed", demo: "run", equipment: "Band/sled",
    muscles: ["Glutes", "Hamstrings", "Quads"], tempo: "Explosive · 10–15m",
    cues: ["Aggressive arm drive", "Lean into the resistance", "Push the ground back and down"],
    why: "Overloads acceleration — the first 5 steps that win races to the ball." },
  { id: "flying_sprints", name: "Flying 20m sprints", category: "Speed", demo: "run", equipment: "None",
    muscles: ["Hamstrings", "Glutes", "Calves"], tempo: "95%+ · long rest",
    cues: ["Build to 95%, don't strain", "Relaxed face and shoulders", "Let the legs cycle underneath you"],
    why: "Develops top-end speed with a rolling run-in to stay relaxed." },
  { id: "pogo_hops", name: "Pogo hops", category: "Power", demo: "jump", equipment: "None",
    muscles: ["Calves", "Achilles"], tempo: "Stiff · minimal contact",
    cues: ["Stiff ankles, like a spring", "Minimal ground time", "Land and leave — don't sink"],
    why: "Builds tendon stiffness for a faster, springier stride." },
  { id: "box_jumps", name: "Box jumps", category: "Power", demo: "jump", equipment: "Box",
    muscles: ["Quads", "Glutes", "Calves"], tempo: "Explosive · full reset",
    cues: ["Load the hips, then explode up", "Full hip extension at take-off", "Land soft and quiet"],
    why: "Trains vertical power and a controlled, knee-safe landing." },
  { id: "depth_drop", name: "Depth drop to sprint", category: "Power", demo: "jump", equipment: "Box",
    muscles: ["Quads", "Glutes", "Calves"], tempo: "Reactive · minimal pause",
    cues: ["Absorb then explode — minimal pause", "Land on the balls of the feet", "Drive straight into the sprint"],
    why: "Reactive strength: turn braking force into acceleration instantly." },
  { id: "bulgarian_split", name: "Bulgarian split squat", category: "Strength", demo: "lunge", equipment: "Weights",
    muscles: ["Quads", "Glutes"], tempo: "3s down · drive up",
    cues: ["Vertical shin over the front foot", "Control the descent", "Push through the whole front foot"],
    why: "Single-leg strength that fixes left/right imbalances and stabilises the knee." },
  { id: "single_leg_rdl", name: "Single-leg RDL", category: "Strength", demo: "hinge", equipment: "Weights",
    muscles: ["Hamstrings", "Glutes"], tempo: "3s down · controlled up",
    cues: ["Hinge at the hip, flat back", "Slow, balanced tempo", "Feel the hamstring lengthen"],
    why: "Bulletproofs the hamstring and trains single-leg balance." },
  { id: "nordic_curl", name: "Nordic hamstring curl", category: "Recovery", demo: "hinge", equipment: "None",
    muscles: ["Hamstrings"], tempo: "Resist the lower slowly",
    cues: ["Resist the lower as long as you can", "Keep hips extended", "Catch yourself with the hands"],
    why: "The gold-standard exercise for cutting hamstring-strain risk." },
  { id: "copenhagen", name: "Copenhagen plank", category: "Recovery", demo: "plank", equipment: "Bench",
    muscles: ["Adductors", "Core"], tempo: "Hold · 15–30s",
    cues: ["Squeeze the top leg into the bench", "Hips high, body in a line", "Breathe steadily"],
    why: "Strengthens the adductors/groin — a common footballer injury site." },
  { id: "band_lateral_walk", name: "Band lateral walks", category: "Recovery", demo: "lateral", equipment: "Band",
    muscles: ["Glute med"], tempo: "Slow · constant tension",
    cues: ["Tension on the band the whole set", "Knees tracking out over the toes", "Small, controlled steps"],
    why: "Wakes up the glute med so the knee stops caving inward." },
  { id: "spanish_squat", name: "Spanish squat iso-hold", category: "Recovery", demo: "squat", equipment: "Band",
    muscles: ["Quads", "Patellar tendon"], tempo: "Hold · 30–45s",
    cues: ["Knees forward over the toes", "Sit back into the band", "Hold the burn"],
    why: "Loads the patellar tendon safely — great for sore or achy knees." },
  { id: "bike_intervals", name: "Bike intervals", category: "Endurance", demo: "bike", equipment: "Bike",
    muscles: ["Quads", "Cardio"], tempo: "Hard/easy · 30s/60s",
    cues: ["Hard efforts, easy spins", "Keep the torso quiet", "Zero impact — save the joints"],
    why: "Builds engine and aids recovery without pounding the legs." },
  { id: "tempo_runs", name: "Tempo runs", category: "Endurance", demo: "run", equipment: "None",
    muscles: ["Hamstrings", "Cardio"], tempo: "~75% · repeatable",
    cues: ["Smooth and controlled, ~75%", "Relaxed upper body", "Consistent split every rep"],
    why: "Extends your aerobic base so you repeat sprints late in games." },
  { id: "dribbling_grid", name: "Tight-space dribbling", category: "Skill", demo: "ball", equipment: "Ball",
    muscles: ["Calves", "Core"], tempo: "Continuous · 60–90s",
    cues: ["Manipulate the ball in small spaces", "Both feet, all surfaces", "Head up to scan"],
    why: "Improves ball mastery under pressure in congested areas." },
  { id: "passing_wall", name: "Wall passing reps", category: "Skill", demo: "ball", equipment: "Ball + wall",
    muscles: ["Core"], tempo: "Rhythmic · both feet",
    cues: ["First touch out of your feet", "Weight the pass firmly", "Open the body to receive"],
    why: "Grooves a clean first touch and passing rhythm — endlessly repeatable solo." },
];

const BY_ID: Record<string, Exercise> = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

export function getExercise(id: string): Exercise | null {
  return BY_ID[id] ?? null;
}

const BY_NAME: Record<string, Exercise> = Object.fromEntries(EXERCISES.map((e) => [e.name.toLowerCase(), e]));

export function getExerciseByName(name: string): Exercise | null {
  return BY_NAME[name.trim().toLowerCase()] ?? null;
}

export const EXERCISE_CATEGORIES: ExerciseCategory[] =
  ["Speed", "Agility", "Power", "Strength", "Recovery", "Endurance", "Skill"];
