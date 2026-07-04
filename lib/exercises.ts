// =============================================================================
// Coached exercise library — rich, athlete-facing metadata for every drill the
// AI coach and video analysis can prescribe. Keyed by the same drill ids used
// in lib/coach.ts and lib/biomech.ts so any DrillItem resolves to full coaching
// content: an animated demo, cues, tempo, target muscles and why it helps.
// Pure data (no deps) — safe on the static site.
// =============================================================================

export type DemoPattern =
  | "squat" | "hinge" | "lunge" | "jump" | "plank"
  | "run" | "lateral" | "ball" | "bike" | "press" | "pull";

export type ExerciseCategory =
  | "Speed" | "Agility" | "Power" | "Strength" | "Recovery" | "Endurance" | "Skill";

export type SportId = "football" | "rugby" | "weightlifting" | "gym" | "basketball" | "running";

export const SPORTS: { id: SportId; label: string; emoji: string }[] = [
  { id: "football", label: "Football", emoji: "⚽" },
  { id: "rugby", label: "Rugby", emoji: "🏉" },
  { id: "weightlifting", label: "Weightlifting", emoji: "🏋️" },
  { id: "gym", label: "Gym & fitness", emoji: "💪" },
  { id: "basketball", label: "Basketball", emoji: "🏀" },
  { id: "running", label: "Running", emoji: "🏃" },
];

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
  sports?: SportId[];   // omitted = general (applies to every sport)
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
    why: "Sharpens close control at speed under light fatigue.", sports: ["football", "basketball"] },
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
    why: "Improves ball mastery under pressure in congested areas.", sports: ["football", "basketball"] },
  { id: "passing_wall", name: "Wall passing reps", category: "Skill", demo: "ball", equipment: "Ball + wall",
    muscles: ["Core"], tempo: "Rhythmic · both feet",
    cues: ["First touch out of your feet", "Weight the pass firmly", "Open the body to receive"],
    why: "Grooves a clean first touch and passing rhythm — endlessly repeatable solo.", sports: ["football"] },

  // --- Weightlifting & gym --------------------------------------------------
  { id: "back_squat", name: "Barbell back squat", category: "Strength", demo: "squat", equipment: "Barbell",
    muscles: ["Quads", "Glutes", "Core"], tempo: "3s down · drive up",
    cues: ["Brace the core before you descend", "Knees track over the toes", "Drive the floor away"],
    why: "The foundational lower-body strength lift — carries over to every sport.",
    sports: ["weightlifting", "gym", "rugby"] },
  { id: "front_squat", name: "Front squat", category: "Strength", demo: "squat", equipment: "Barbell",
    muscles: ["Quads", "Upper back", "Core"], tempo: "2s down · explode up",
    cues: ["Elbows high, bar on the shelf", "Stay upright through the torso", "Full depth if mobility allows"],
    why: "Builds quad strength and a strong, upright trunk position.",
    sports: ["weightlifting", "gym"] },
  { id: "deadlift", name: "Conventional deadlift", category: "Strength", demo: "hinge", equipment: "Barbell",
    muscles: ["Hamstrings", "Glutes", "Back"], tempo: "Controlled · reset each rep",
    cues: ["Take the slack out of the bar first", "Push the floor away, hips and chest rise together", "Neutral spine throughout"],
    why: "Total-body pulling strength and posterior-chain power.",
    sports: ["weightlifting", "gym", "rugby"] },
  { id: "hip_thrust", name: "Barbell hip thrust", category: "Strength", demo: "hinge", equipment: "Barbell",
    muscles: ["Glutes", "Hamstrings"], tempo: "2s up · squeeze · lower",
    cues: ["Chin tucked, ribs down", "Drive through the heels", "Full lockout, squeeze the glutes"],
    why: "Directly builds the glute power behind sprinting and jumping.",
    sports: ["weightlifting", "gym", "running"] },
  { id: "bench_press", name: "Barbell bench press", category: "Strength", demo: "press", equipment: "Barbell",
    muscles: ["Chest", "Shoulders", "Triceps"], tempo: "2s down · press up",
    cues: ["Retract the shoulder blades", "Bar to mid-chest", "Drive the feet into the floor"],
    why: "Upper-body pressing strength for contact and throwing sports.",
    sports: ["weightlifting", "gym", "rugby"] },
  { id: "overhead_press", name: "Overhead press", category: "Strength", demo: "press", equipment: "Barbell",
    muscles: ["Shoulders", "Triceps", "Core"], tempo: "Controlled · full lockout",
    cues: ["Brace the core, glutes tight", "Bar path close to the face", "Finish with biceps by the ears"],
    why: "Builds pressing power and shoulder stability.",
    sports: ["weightlifting", "gym", "rugby"] },
  { id: "pull_up", name: "Pull-up", category: "Strength", demo: "pull", equipment: "Bar",
    muscles: ["Lats", "Biceps", "Core"], tempo: "Controlled up · slow down",
    cues: ["Start from a dead hang", "Lead with the chest to the bar", "No kipping — own the lower"],
    why: "The best bodyweight builder of back and grip strength.",
    sports: ["gym", "weightlifting", "rugby"] },
  { id: "lat_pulldown", name: "Lat pulldown", category: "Strength", demo: "pull", equipment: "Cable",
    muscles: ["Lats", "Biceps"], tempo: "2s down · 2s up",
    cues: ["Drive the elbows down and back", "Chest tall, slight lean", "Control the eccentric"],
    why: "Builds back width and pulling strength — a pull-up regression.",
    sports: ["gym"] },
  { id: "barbell_row", name: "Bent-over barbell row", category: "Strength", demo: "hinge", equipment: "Barbell",
    muscles: ["Back", "Rear delts", "Biceps"], tempo: "2s up · controlled down",
    cues: ["Hinge to ~45°, flat back", "Row to the lower ribs", "Squeeze the shoulder blades"],
    why: "Balances all the pressing with heavy horizontal pulling.",
    sports: ["weightlifting", "gym", "rugby"] },
  { id: "power_clean", name: "Power clean", category: "Power", demo: "jump", equipment: "Barbell",
    muscles: ["Full body"], tempo: "Explosive · full reset",
    cues: ["Accelerate through the hips", "Shrug and pull under fast", "Catch in a strong quarter-squat"],
    why: "Trains rate of force development — raw explosive power.",
    sports: ["weightlifting", "rugby"] },
  { id: "goblet_squat", name: "Goblet squat", category: "Strength", demo: "squat", equipment: "Dumbbell",
    muscles: ["Quads", "Glutes", "Core"], tempo: "3s down · up",
    cues: ["Hold the bell at the chest", "Elbows inside the knees at the bottom", "Sit tall and deep"],
    why: "A joint-friendly squat that teaches depth and bracing.",
    sports: ["gym", "weightlifting"] },
  { id: "dumbbell_press", name: "Dumbbell shoulder press", category: "Strength", demo: "press", equipment: "Dumbbells",
    muscles: ["Shoulders", "Triceps"], tempo: "2s up · 2s down",
    cues: ["Neutral wrists, dumbbells stacked", "Press without flaring the ribs", "Full range each rep"],
    why: "Shoulder hypertrophy and stability with a friendly joint path.",
    sports: ["gym"] },
  { id: "calf_raise", name: "Standing calf raise", category: "Strength", demo: "jump", equipment: "Optional weight",
    muscles: ["Calves", "Achilles"], tempo: "1s up · 3s down",
    cues: ["Full stretch at the bottom", "Rise onto the big toe", "Pause at the top"],
    why: "Stiffer, stronger calves protect the Achilles and add spring.",
    sports: ["gym", "running", "basketball"] },
  { id: "farmers_carry", name: "Farmer's carry", category: "Strength", demo: "lateral", equipment: "Dumbbells",
    muscles: ["Grip", "Core", "Traps"], tempo: "Walk · 20–40m",
    cues: ["Tall posture, ribs down", "Crush the handles", "Small, quick, quiet steps"],
    why: "Brutal, simple full-body and grip strength that carries everywhere.",
    sports: ["gym", "weightlifting", "rugby"] },

  // --- Rugby / contact ------------------------------------------------------
  { id: "tackle_technique", name: "Tackle technique", category: "Skill", demo: "lunge", equipment: "Bag/partner",
    muscles: ["Legs", "Core", "Shoulders"], tempo: "Reps · full reset",
    cues: ["Cheek to cheek, head behind", "Low body height, drive through", "Wrap and squeeze on contact"],
    why: "Safe, dominant tackling technique — the core rugby skill.",
    sports: ["rugby"] },
  { id: "scrum_drive", name: "Scrum engage & drive", category: "Power", demo: "lunge", equipment: "Sled/scrum machine",
    muscles: ["Legs", "Back", "Core"], tempo: "Explosive drive",
    cues: ["Flat back, hips below shoulders", "Bind tight, engage as one", "Drive through the balls of the feet"],
    why: "Builds the low, powerful drive position for scrummaging.",
    sports: ["rugby"] },
  { id: "broad_jump", name: "Standing broad jump", category: "Power", demo: "jump", equipment: "None",
    muscles: ["Glutes", "Quads", "Calves"], tempo: "Max effort · full rest",
    cues: ["Load the hips and swing the arms", "Explode out and up", "Stick the landing soft"],
    why: "Horizontal power that transfers to acceleration and contact.",
    sports: ["rugby", "basketball", "running"] },

  // --- Basketball / court ---------------------------------------------------
  { id: "vertical_jump", name: "Vertical jump", category: "Power", demo: "jump", equipment: "None",
    muscles: ["Quads", "Glutes", "Calves"], tempo: "Max effort · full reset",
    cues: ["Quick dip, then explode", "Full triple extension", "Reach at the peak"],
    why: "Directly trains your standing vertical leap.",
    sports: ["basketball", "rugby"] },
  { id: "defensive_slides", name: "Defensive slides", category: "Agility", demo: "lateral", equipment: "None",
    muscles: ["Glute med", "Quads"], tempo: "Continuous · 20–30s",
    cues: ["Low, wide stance", "Push don't cross the feet", "Stay square to your man"],
    why: "Builds the lateral quickness and stance for on-ball defence.",
    sports: ["basketball"] },

  // --- Running --------------------------------------------------------------
  { id: "hill_sprints", name: "Hill sprints", category: "Speed", demo: "run", equipment: "A hill",
    muscles: ["Glutes", "Hamstrings", "Calves"], tempo: "8–12s · walk down",
    cues: ["Aggressive arm drive", "Lean from the ankles", "Powerful, short ground contacts"],
    why: "Low-impact way to build sprint power and drive mechanics.",
    sports: ["running", "football", "rugby"] },
  { id: "stride_outs", name: "Stride-outs", category: "Speed", demo: "run", equipment: "None",
    muscles: ["Hamstrings", "Hip flexors"], tempo: "Build · 60–80m",
    cues: ["Gradually build to ~90%", "Long, relaxed strides", "Float — don't strain"],
    why: "Primes fast running mechanics without the strain of all-out sprints.",
    sports: ["running", "football"] },
];

const BY_ID: Record<string, Exercise> = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

export function getExercise(id: string): Exercise | null {
  return BY_ID[id] ?? null;
}

const BY_NAME: Record<string, Exercise> = Object.fromEntries(EXERCISES.map((e) => [e.name.toLowerCase(), e]));

export function getExerciseByName(name: string): Exercise | null {
  return BY_NAME[name.trim().toLowerCase()] ?? null;
}

// Exercises for a sport = its sport-specific drills (first) plus all general ones.
export function getExercisesForSport(sport: SportId | "all"): Exercise[] {
  if (sport === "all") return EXERCISES;
  const specific = EXERCISES.filter((e) => e.sports?.includes(sport));
  const general = EXERCISES.filter((e) => !e.sports);
  return [...specific, ...general];
}

export const EXERCISE_CATEGORIES: ExerciseCategory[] =
  ["Speed", "Agility", "Power", "Strength", "Recovery", "Endurance", "Skill"];
