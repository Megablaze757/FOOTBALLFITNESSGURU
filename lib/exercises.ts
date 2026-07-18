// =============================================================================
// Coached exercise library — rich, athlete-facing metadata for every drill the
// AI coach and video analysis can prescribe. Keyed by the same drill ids used
// in lib/coach.ts and lib/biomech.ts so any DrillItem resolves to full coaching
// content: an animated demo, cues, tempo, target muscles and why it helps.
// Pure data (no deps) — safe on the static site.
// =============================================================================

import { IMPORTED_EXERCISES, difficultyOf, equipBucket } from "./exercise-catalog";

export type DemoPattern =
  | "squat" | "hinge" | "lunge" | "jump" | "plank"
  | "run" | "lateral" | "ball" | "bike" | "press" | "pull";

export type ExerciseCategory =
  | "Speed" | "Agility" | "Power" | "Strength" | "Recovery" | "Endurance" | "Skill"
  | "Mobility"     // range-of-motion + pre-training activation
  | "Rehab";       // return-from-injury protocol work

export type Difficulty = "easy" | "medium" | "advanced";
export const DIFFICULTIES: { id: Difficulty; label: string }[] = [
  { id: "easy", label: "Beginner" },
  { id: "medium", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
];
const DIFF_RANK: Record<Difficulty, number> = { easy: 0, medium: 1, advanced: 2 };

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
  description?: string; // fuller how-to (merged from DESCRIPTIONS below)
  custom?: boolean;     // true for coach-authored team exercises
  imported?: boolean;   // true for the bulk gym-database entries
  difficulty?: Difficulty;
  video_url?: string;   // optional real demo clip (falls back to the animation)
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

  // --- Mobility & activation (warm-up / pre-training) -----------------------
  { id: "world_greatest_stretch", name: "World's greatest stretch", category: "Mobility", demo: "lunge", equipment: "None",
    muscles: ["Hip flexors", "Adductors", "T-spine"], tempo: "5 reps/side · 3s holds",
    cues: ["Deep lunge, back knee off the floor", "Drop the elbow to the instep", "Rotate and reach tall to the sky"],
    why: "Opens hips, groin and upper back in one move — the best single warm-up drill." },
  { id: "hip_90_90", name: "90/90 hip switches", category: "Mobility", demo: "plank", equipment: "None",
    muscles: ["Glutes", "Hip rotators"], tempo: "Slow · 8–10 switches/side",
    cues: ["Sit tall, chest proud", "Lower both knees under control", "Don't let the hands take your weight"],
    why: "Builds the hip internal/external rotation that cutting and kicking demand." },
  { id: "ankle_rocks", name: "Half-kneeling ankle rocks", category: "Mobility", demo: "lunge", equipment: "Wall",
    muscles: ["Calves", "Achilles"], tempo: "10–15 rocks/side",
    cues: ["Knee tracks over the 2nd toe", "Heel stays glued down", "Rock forward slowly, no bouncing"],
    why: "Stiff ankles force the knee inward — this restores the dorsiflexion squats and landings need." },
  { id: "glute_bridge", name: "Glute bridge", category: "Mobility", demo: "hinge", equipment: "None",
    muscles: ["Glutes", "Hamstrings"], tempo: "2s squeeze at the top",
    cues: ["Ribs down, don't arch the back", "Drive through the heels", "Squeeze the glutes hard at the top"],
    why: "Wakes up glutes that switch off from sitting, so they fire when you sprint." },
  { id: "dead_bug", name: "Dead bug", category: "Mobility", demo: "plank", equipment: "None",
    muscles: ["Deep core", "Hip flexors"], tempo: "Slow · 8/side",
    cues: ["Lower back pinned to the floor", "Exhale as you extend", "Move slowly — no rushing"],
    why: "Teaches the core to stay braced while the limbs move — the basis of injury-proof trunk control." },
  { id: "thoracic_openers", name: "Thoracic spine openers", category: "Mobility", demo: "plank", equipment: "None",
    muscles: ["T-spine", "Chest", "Lats"], tempo: "8–10 slow reps/side",
    cues: ["Rotate from the ribs, not the low back", "Follow your hand with your eyes", "Breathe out at end range"],
    why: "Unlocks upper-back rotation for overhead lifting, throwing and running posture." },
  { id: "leg_swings", name: "Dynamic leg swings", category: "Mobility", demo: "run", equipment: "Support",
    muscles: ["Hamstrings", "Hip flexors", "Adductors"], tempo: "10 front-back + 10 side/leg",
    cues: ["Stay tall, hold something for balance", "Build range gradually", "Controlled swing, no ballistic yanking"],
    why: "Raises hip temperature and range right before sprinting — a proper dynamic warm-up staple." },
  { id: "monster_walk", name: "Monster walks", category: "Mobility", demo: "lateral", equipment: "Band",
    muscles: ["Glute med", "Glute max"], tempo: "10 steps each way · 2–3 rounds",
    cues: ["Band above the knees, tension held", "Half-squat throughout", "Step forward-diagonally, knees out"],
    why: "Pre-activates the glutes so the knee holds its line from the very first sprint." },
  { id: "scap_pull_up", name: "Scapular pull-ups", category: "Mobility", demo: "pull", equipment: "Bar",
    muscles: ["Lower traps", "Lats"], tempo: "8–10 slow reps",
    cues: ["Arms stay straight", "Pull the shoulders down away from the ears", "Pause 1s at the top"],
    why: "Builds shoulder-blade control that protects the shoulder in pressing and contact." },
  { id: "couch_stretch", name: "Couch stretch", category: "Mobility", demo: "lunge", equipment: "Wall/bench",
    muscles: ["Hip flexors", "Quads"], tempo: "60–90s hold/side",
    cues: ["Squeeze the glute of the back leg", "Tuck the pelvis under", "Stay tall — don't lean forward"],
    why: "Releases the tight hip flexors that flatten your sprint stride and nag the lower back." },

  // --- Injury rehab / prehab ------------------------------------------------
  { id: "calf_raise_eccentric", name: "Eccentric calf raises", category: "Rehab", demo: "jump", equipment: "Step",
    muscles: ["Calves", "Achilles"], tempo: "Up 2 legs · down 1 leg over 3s",
    cues: ["Rise on both, lower on the injured side", "3 seconds down every rep", "Full stretch at the bottom"],
    why: "The evidence-backed protocol for Achilles tendinopathy — loads the tendon to rebuild it." },
  { id: "ankle_alphabet", name: "Ankle alphabet", category: "Rehab", demo: "plank", equipment: "None",
    muscles: ["Ankle stabilisers"], tempo: "A–Z · 2 rounds/side",
    cues: ["Move only the foot, keep the shin still", "Make the letters big", "Stop at sharp pain, work through stiffness"],
    why: "Early-stage ankle-sprain mobility that restores motion without loading the joint." },
  { id: "single_leg_balance", name: "Single-leg balance progression", category: "Rehab", demo: "plank", equipment: "Optional cushion",
    muscles: ["Ankle stabilisers", "Glute med"], tempo: "30–45s/side · 3 rounds",
    cues: ["Eyes open → eyes closed to progress", "Grip the floor with the toes", "Add head turns or a ball throw"],
    why: "Rebuilds the proprioception lost after an ankle sprain — the biggest predictor of re-injury." },
  { id: "terminal_knee_ext", name: "Terminal knee extensions", category: "Rehab", demo: "squat", equipment: "Band",
    muscles: ["VMO", "Quads"], tempo: "15–20 reps · 2s squeeze",
    cues: ["Band pulls the knee forward, you straighten against it", "Squeeze the quad at lockout", "Keep the heel down"],
    why: "Restores the last few degrees of knee extension that stay weak after knee injury or surgery." },
  { id: "isometric_wall_sit", name: "Isometric wall sit", category: "Rehab", demo: "squat", equipment: "Wall",
    muscles: ["Quads"], tempo: "5 × 45s holds",
    cues: ["Knees at ~60°, shins vertical", "Weight through the heels", "Breathe — don't hold your breath"],
    why: "Isometrics reduce tendon pain fast — the go-to for jumper's knee on a sore day." },
  { id: "hamstring_slider", name: "Hamstring sliders", category: "Rehab", demo: "hinge", equipment: "Sliders/towel",
    muscles: ["Hamstrings"], tempo: "Slow eccentric · 8–10 reps",
    cues: ["Hips stay high throughout", "Slide the heels out slowly", "Pull back in with the hamstrings"],
    why: "Mid-stage hamstring rehab that loads the muscle eccentrically before you sprint again." },
  { id: "adductor_iso_squeeze", name: "Adductor isometric squeeze", category: "Rehab", demo: "plank", equipment: "Ball",
    muscles: ["Adductors", "Groin"], tempo: "5 × 30s",
    cues: ["Ball between the knees", "Squeeze to ~70% effort", "Keep the pelvis level and ribs down"],
    why: "Safe early groin-strain loading — settles pain and keeps the adductors strong." },
  { id: "bird_dog", name: "Bird dog", category: "Rehab", demo: "plank", equipment: "None",
    muscles: ["Lower back", "Glutes", "Core"], tempo: "8/side · 3s hold",
    cues: ["Keep the hips square to the floor", "Reach long, don't lift high", "Neutral spine — no sagging"],
    why: "Rebuilds lower-back endurance and control without loading the spine." },
  { id: "mcgill_curl_up", name: "McGill curl-up", category: "Rehab", demo: "plank", equipment: "None",
    muscles: ["Deep core"], tempo: "8–10 reps · 8s holds",
    cues: ["One knee bent, hands under the low back", "Lift only the head and shoulders", "Keep the low-back arch intact"],
    why: "A back-friendly core exercise — trains the trunk without the spinal flexion sit-ups cause." },
  { id: "shoulder_external_rotation", name: "Band external rotation", category: "Rehab", demo: "pull", equipment: "Band",
    muscles: ["Rotator cuff"], tempo: "15 reps · slow return",
    cues: ["Elbow pinned to your side", "Rotate the forearm out, don't shrug", "Control the way back in"],
    why: "Strengthens the rotator cuff that stabilises the shoulder in contact and overhead work." },

  // --- Football skill drills ------------------------------------------------
  { id: "finishing_drill", name: "Finishing drill", category: "Skill", demo: "ball", equipment: "Ball + goal",
    muscles: ["Quads", "Glutes", "Core"], tempo: "10–15 strikes · reset each",
    cues: ["Plant foot beside the ball, pointing at target", "Head still, eyes on the ball at contact", "Pick your corner before it arrives"],
    why: "Repeatable striking technique so chances get finished under pressure.",
    sports: ["football"] },
  { id: "heading_drill", name: "Heading technique", category: "Skill", demo: "jump", equipment: "Ball + partner",
    muscles: ["Neck", "Core", "Legs"], tempo: "8–12 headers · full reset",
    cues: ["Attack the ball — don't let it hit you", "Contact on the forehead, eyes open", "Neck braced, generate power from the trunk"],
    why: "Correct heading technique wins more aerial duels and lowers impact on the head and neck.",
    sports: ["football"] },
  { id: "crossing_drill", name: "Crossing reps", category: "Skill", demo: "ball", equipment: "Balls + targets",
    muscles: ["Hip flexors", "Quads"], tempo: "10 crosses/side",
    cues: ["Open the hips, plant foot behind the ball", "Whip across the ball with the instep", "Aim for a zone, not a person"],
    why: "Delivery quality from wide areas — the difference between a chance and a goal kick.",
    sports: ["football"] },
  { id: "first_touch_drill", name: "First-touch control", category: "Skill", demo: "ball", equipment: "Ball + wall",
    muscles: ["Calves", "Core"], tempo: "Continuous · 3–5 min",
    cues: ["Cushion the ball — relax the receiving foot", "Touch into space, away from pressure", "Open your body before it arrives"],
    why: "A clean first touch buys you the half-second that makes everything else possible.",
    sports: ["football"] },
  { id: "one_v_one_attack", name: "1v1 attacking moves", category: "Skill", demo: "ball", equipment: "Ball + defender/cone",
    muscles: ["Quads", "Glutes", "Calves"], tempo: "8–10 reps · walk back",
    cues: ["Attack the defender's front foot", "Sell the feint with your hips and eyes", "Explode away in 2–3 touches"],
    why: "Beating your man 1v1 is the most valuable individual skill in the final third.",
    sports: ["football"] },
  { id: "long_passing", name: "Long passing range", category: "Skill", demo: "ball", equipment: "Balls + partner",
    muscles: ["Hip flexors", "Core"], tempo: "15–20 passes",
    cues: ["Lean back slightly, strike under the ball", "Follow through toward the target", "Vary driven vs lofted"],
    why: "Switching play quickly and accurately breaks compact defensive blocks.",
    sports: ["football"] },
  { id: "set_piece_practice", name: "Set-piece striking", category: "Skill", demo: "ball", equipment: "Balls + wall/goal",
    muscles: ["Quads", "Core"], tempo: "10–12 strikes · full routine",
    cues: ["Same run-up every single time", "Strike across the ball for whip", "Rehearse your exact match routine"],
    why: "Dead balls are free chances — the players who practise them win games.",
    sports: ["football"] },

  // --- Goalkeeper training --------------------------------------------------
  { id: "gk_handling", name: "GK handling & catching", category: "Skill", demo: "ball", equipment: "Ball + server",
    muscles: ["Hands", "Forearms", "Core"], tempo: "20–30 serves · varied height",
    cues: ["W-shape hands behind the ball", "Watch it all the way in", "Cushion on contact — absorb, don't slap"],
    why: "Clean, repeatable handling is the foundation of everything else a keeper does.",
    sports: ["football"] },
  { id: "gk_diving", name: "GK low & high diving", category: "Skill", demo: "lateral", equipment: "Ball + server",
    muscles: ["Glutes", "Quads", "Obliques"], tempo: "6–8 dives/side · full reset",
    cues: ["Push off the near leg, don't step across", "Attack the ball with the top hand", "Land on the side, not the elbow"],
    why: "Correct diving technique covers more goal and protects the shoulder on landing.",
    sports: ["football"] },
  { id: "gk_footwork", name: "GK set-position footwork", category: "Skill", demo: "lateral", equipment: "Cones",
    muscles: ["Calves", "Glute med", "Quads"], tempo: "20–30s bursts",
    cues: ["Small adjusting steps, stay on the balls of the feet", "Set as the striker strikes", "Never be moving at the moment of contact"],
    why: "Being set at the right instant saves more shots than raw reflexes do.",
    sports: ["football"] },
  { id: "gk_distribution", name: "GK distribution", category: "Skill", demo: "ball", equipment: "Balls + targets",
    muscles: ["Hip flexors", "Core", "Shoulders"], tempo: "15–20 reps · mixed types",
    cues: ["Scan before you receive", "Throw flat and fast to feet", "Kick over a set target, not just far"],
    why: "The modern keeper starts attacks — distribution is half the job.",
    sports: ["football"] },
  { id: "gk_reaction_saves", name: "GK reaction saves", category: "Skill", demo: "lateral", equipment: "Balls + rebounder",
    muscles: ["Whole body"], tempo: "6–10 rapid serves · full rest",
    cues: ["React to the ball, not the server", "Stay big — hands ready at hip height", "Recover to your feet fast for the second ball"],
    why: "Trains the close-range reflex saves and the vital second-ball recovery.",
    sports: ["football"] },
  { id: "gk_crosses", name: "GK claiming crosses", category: "Skill", demo: "jump", equipment: "Balls + servers",
    muscles: ["Legs", "Core", "Shoulders"], tempo: "8–12 claims",
    cues: ["Loud, early call — command your area", "Attack the ball at its highest point", "Lead knee up to protect yourself"],
    why: "Dominating your box kills crosses before they become chances.",
    sports: ["football"] },
  { id: "gk_one_v_one", name: "GK 1v1 spreading", category: "Skill", demo: "lunge", equipment: "Ball + attacker",
    muscles: ["Quads", "Glutes", "Core"], tempo: "6–8 reps · full reset",
    cues: ["Close the distance fast, then set", "Stay tall as long as possible", "Spread big and low — hands lead"],
    why: "1v1s are the highest-value save situation a keeper faces.",
    sports: ["football"] },
];

// Fuller "how to perform it" write-ups — setup, execution, what to feel and the
// most common mistake. Merged onto EXERCISES below so components can show depth.
const DESCRIPTIONS: Record<string, string> = {
  ladder_quickfeet: "Set an agility ladder flat on the ground and work through patterns (one foot in each, two in each, lateral in-in-out) as fast as you can stay clean. Keep your weight on the balls of the feet, arms pumping in rhythm, and eyes up. It's a coordination and foot-speed drill, not a conditioning grind — quality of contact beats raw speed.",
  reactive_mirror: "Face a partner a couple of metres away; one leads with short lateral and forward-back movements, the other mirrors as fast as possible. Stay in a low athletic stance and react — never pre-plan. This trains the unscripted change-of-direction you actually use in a game, where you respond to an opponent rather than a cone.",
  lateral_shuffle: "Set two gates ~6–10m apart. Drop into a low stance, hips back and chest up, and shuffle sideways pushing hard off the outside foot without clicking your heels together. Stay square and low the whole way. The goal is a strong lateral push-off, which is exactly the position that protects the knee when you cut.",
  cone_weave: "Weave a ball through a line of cones using small, frequent touches with both feet and the inside/outside of each foot. Keep the ball close and your head up to scan between cones. Build speed only as far as your control allows — the moment touches get loose, slow down.",
  t_drill: "Sprint forward to the top cone, shuffle laterally to one side, back across to the other, back to the middle, then backpedal to the start — forming a T. It blends acceleration, lateral movement, and deceleration. Decelerate under control before each change of direction rather than crashing into the turn.",
  a_skips: "A marching/skipping drill: drive one knee up to hip height, snap the foot down under your hip, and stay tall with the ribs down. It grooves the coordination and posture of good sprinting. Punch the ground beneath you — don't reach the foot out in front, which causes braking.",
  resisted_sprint: "Sprint against a band, sled or partner resistance for the first 10–15m. The extra load forces a strong forward lean and powerful, deliberate leg drive. Keep an aggressive arm action and push the ground back and down. This overloads the acceleration phase — the first few steps that win races to the ball.",
  flying_sprints: "Build up over ~20m, then hit near-maximal speed over a 'flying' 20m zone before easing off. The rolling start lets you reach top speed relaxed rather than straining from a standstill. Keep the face and shoulders loose and let the legs cycle underneath you. Take full recovery between reps — this is a quality speed session, not conditioning.",
  pogo_hops: "Small, continuous vertical hops keeping the ankles stiff like a pogo stick, minimising ground-contact time. You're training tendon stiffness and reactivity, not jump height. Land and leave the ground quickly; if you sink into a squat between hops you've lost the point.",
  box_jumps: "From an athletic stance, load the hips and explode up onto a box, landing soft and quiet in a quarter-squat with full hip extension at take-off. Step down (don't jump down) to save the joints. The box just protects the landing — the aim is maximal, controlled vertical power off the floor.",
  depth_drop: "Step off a low box, land on the balls of the feet, and immediately explode into a sprint or jump with minimal ground time. This is a true plyometric that trains reactive strength — turning braking force into propulsion. Keep the pause between landing and take-off as short as possible. Advanced; build a base of strength first.",
  bulgarian_split: "Rear foot elevated on a bench, drop straight down into a lunge keeping a vertical shin over the front foot, then drive up through the whole front foot. It builds single-leg strength and ruthlessly exposes left/right imbalances. Control the descent — don't just drop and bounce out of the bottom.",
  single_leg_rdl: "Balancing on one leg, hinge at the hip and lower a weight toward the floor with a flat back, feeling the hamstring of the standing leg lengthen, then return under control. It builds hamstring strength through range plus single-leg balance. Move slowly — the balance challenge is part of the training.",
  nordic_curl: "Kneel with your ankles anchored and lower your torso toward the floor as slowly as you can, resisting with the hamstrings, then catch yourself with your hands and push back up. It's the gold-standard eccentric hamstring exercise and one of the few proven to cut hamstring-strain risk. Only lower as far as you can control.",
  copenhagen: "Side plank with the top leg supported on a bench, squeezing that leg down into the bench while holding the hips high in a straight line. It strengthens the adductors/groin — a very common footballer injury site. Start with the knee supported and progress to the ankle as you get stronger.",
  band_lateral_walk: "Loop a band around the legs (above the knees or at the ankles), drop into a half-squat, and take small controlled steps sideways keeping constant tension on the band and the knees tracking out over the toes. It wakes up the glute medius so the knee stops collapsing inward — a direct fix for valgus.",
  spanish_squat: "Loop a stout band behind the knees and anchor it in front; sit back against the band into a squat with the shins vertical and hold. It loads the quads and patellar tendon with almost no joint shear, so it's ideal for cranky or rehabbing knees. Hold the isometric and breathe through the burn.",
  bike_intervals: "On a stationary bike, alternate hard efforts with easy spins (e.g. 30s hard / 60s easy). It builds aerobic and anaerobic capacity with zero impact, making it perfect for conditioning while managing sore joints or during return-to-play. Keep the torso quiet and drive the effort through the legs.",
  tempo_runs: "Run repeats at a controlled ~75% effort with short recoveries, staying smooth and relaxed with a repeatable split every rep. Tempo work extends your aerobic base so you can repeat sprints late in games without impact-heavy volume. If you're straining or the splits fall off, you're going too hard.",
  dribbling_grid: "In a small grid, keep a ball moving continuously using all surfaces of both feet, changing direction and manipulating the ball in tight space with your head up to scan. It builds ball mastery under mild fatigue and pressure. Prioritise clean, deliberate touches over flashy speed.",
  passing_wall: "Pass a ball against a wall and control the return, working both feet and varying distance and weight. Take your first touch out of your feet into space and open your body to receive. It's an endlessly repeatable solo drill for a clean first touch and passing rhythm.",
  back_squat: "With the bar racked on your upper back, brace your core, break at the hips and knees together, and descend to at least parallel keeping the knees tracking over the toes, then drive the floor away to stand. It's the foundational lower-body strength lift with carryover to every sport. Brace hard before each rep and don't let the chest cave forward.",
  front_squat: "Rack the bar on the front of the shoulders with high elbows, then squat keeping the torso as upright as possible and elbows pointing forward the whole way. The front-loaded position hammers the quads and demands a strong, upright trunk. If your elbows drop, the bar rolls forward — keep them high.",
  deadlift: "Set up with the bar over mid-foot, grip it, take the slack out of the bar, then push the floor away with hips and chest rising together and a neutral spine throughout. It's total-body pulling strength and posterior-chain power. Reset every rep — don't bounce it off the floor with a rounded back.",
  hip_thrust: "Upper back on a bench, barbell across the hips, chin tucked and ribs down; drive through the heels to full hip extension and squeeze the glutes hard at the top, then lower under control. It directly builds the glute power behind sprinting and jumping. Don't hyperextend the lower back to fake more range — the movement is at the hips.",
  bench_press: "Lying on a bench, retract and pin your shoulder blades, lower the bar under control to the mid-chest, then press up while driving your feet into the floor. It's the primary upper-body pressing lift — valuable for contact and throwing sports. Keep the shoulder blades tucked; letting them roll forward is where shoulders get cranky.",
  overhead_press: "Standing tall with the bar at the shoulders, brace the core and squeeze the glutes, then press overhead in a path close to the face and finish with the biceps by the ears. It builds pressing power and shoulder stability. Don't lean back excessively — if you can't press it with a braced trunk, drop the weight.",
  pull_up: "From a dead hang, pull until your chest approaches the bar, lead with the chest rather than the chin, then lower all the way under control. It's the best bodyweight builder of back and grip strength. Own the lower — no kipping or half-reps. Use a band or the lat pulldown to build up if you can't yet.",
  lat_pulldown: "Seated at a cable, drive the elbows down and back to pull the bar to the upper chest with a tall chest and slight lean, then control the weight back up. It builds back width and pulling strength and is a great pull-up regression. Lead with the elbows, not the hands, and don't heave with the whole body.",
  barbell_row: "Hinge to roughly 45° with a flat back, let the bar hang, then row it to the lower ribs squeezing the shoulder blades together, and lower under control. It balances all the pressing with heavy horizontal pulling. Keep the torso angle fixed — standing up to move the weight turns it into a shrug.",
  power_clean: "From the floor, accelerate the bar with a violent hip extension, shrug and pull yourself under it fast, and catch it on the front of the shoulders in a strong quarter-squat. It trains rate of force development — raw explosive power. It's technical; learn it light with a coach before adding load.",
  goblet_squat: "Hold a dumbbell or kettlebell at your chest and squat down until your elbows brush the inside of your knees, sitting tall and deep, then stand. The front load keeps you upright and teaches bracing and depth. It's a joint-friendly squat and a great place to build the pattern before barbell work.",
  dumbbell_press: "Seated or standing, press two dumbbells overhead with neutral, stacked wrists and press without flaring the ribs, using a full range each rep. The independent dumbbells build shoulder size and stability with a friendlier joint path than a barbell. Control the lowering — don't let the weights crash down.",
  calf_raise: "Standing (optionally loaded), lower into a full stretch at the bottom, then rise all the way onto the big toe and pause at the top before lowering slowly. Stronger, stiffer calves protect the Achilles and add spring to every stride and jump. Use a full range and a slow lower — bouncing wastes the set.",
  farmers_carry: "Pick up a heavy dumbbell or kettlebell in each hand and walk with tall posture, ribs down, crushing the handles, taking small quick quiet steps. It's brutally simple full-body and grip strength that carries over everywhere. Don't let the shoulders shrug up or the torso lean — stay stacked and walk.",
  tackle_technique: "Rehearse the tackle at controlled intensity on a bag or a compliant partner: track your man, get your head to the correct side (cheek-to-cheek, head behind), make contact with a low body height, drive through, and wrap and squeeze. Safe, dominant technique is the core rugby skill — grooving it slowly first is what makes it reliable and safe under fatigue.",
  scrum_drive: "Against a scrum machine or sled, set a strong body position — flat back, hips below shoulders — bind tight, engage as a unit, and drive through the balls of the feet. It builds the low, powerful drive position for scrummaging. The position is everything: never drive with a rounded back or high hips.",
  broad_jump: "From a standing start, load the hips and swing the arms back, then explode forward and up jumping for maximum distance and sticking the landing soft. It develops horizontal power that transfers directly to acceleration and contact. Reset fully between reps — it's a quality power drill, not conditioning.",
  vertical_jump: "From an athletic stance, make a quick counter-movement dip and immediately explode straight up with full triple extension of the ankles, knees and hips, reaching at the peak. It directly trains your standing vertical leap. Keep the dip shallow and fast — a slow, deep dip leaks power.",
  defensive_slides: "In a low, wide defensive stance, slide laterally by pushing off the trailing foot without ever crossing your feet, staying square to an imaginary attacker. It builds the lateral quickness and stance endurance for on-ball defence. Stay low the whole time — standing up between slides is the most common fault.",
  hill_sprints: "Sprint up a moderate hill for 8–12 seconds with aggressive arm drive and short, powerful ground contacts, then walk down to recover. The incline naturally builds a forward lean and reduces impact versus flat sprinting, making it a safer way to develop sprint power. Keep the efforts short and the recovery full.",
  stride_outs: "Over 60–80m, gradually build to about 90% effort with long, relaxed strides, then ease off — you should feel like you're floating, not straining. Stride-outs prime fast running mechanics and are ideal as a pre-session primer or a gentle speed day that avoids the strain of all-out sprints.",

  // Mobility & activation
  world_greatest_stretch: "Step into a deep lunge, place both hands inside the front foot, drop the same-side elbow toward your instep, then rotate and reach that arm to the sky, following the hand with your eyes. Step through and repeat on the other side. It hits hip flexors, adductors and thoracic rotation in one sequence — the single best use of two minutes in a warm-up.",
  hip_90_90: "Sit with your front leg bent 90° in front and your back leg bent 90° to the side. Keeping your chest tall, lower both knees over to the opposite side under control, then come back. Don't push into your hands. It builds the hip internal and external rotation that cutting, kicking and squatting depend on — most stiff-hip athletes get real range back within a few weeks.",
  ankle_rocks: "In a half-kneeling position with your front foot about a hand's width from a wall, drive your knee forward over your second toe until it touches the wall, keeping the heel glued to the floor. Rock slowly in and out. Limited ankle dorsiflexion is a hidden cause of knees caving in and heels lifting in the squat — this restores it directly.",
  glute_bridge: "Lying on your back with knees bent and feet flat, tuck the ribs down, drive through the heels and lift the hips until your body is a straight line from knee to shoulder, squeezing the glutes hard for two seconds at the top. Sitting all day switches the glutes off; this reminds them to fire before you ask them to sprint. If you feel it in your hamstrings or lower back, tuck the pelvis harder and drive more through the heels.",
  dead_bug: "Lying on your back with arms up and hips and knees at 90°, press your lower back flat into the floor and hold it there while slowly extending the opposite arm and leg, exhaling as you reach. Return and switch sides. It teaches your core to stay braced while your limbs move — the exact quality that protects the lower back when you sprint and change direction. The moment your back arches off the floor, shorten the range.",
  thoracic_openers: "Lying on your side with knees stacked and bent, arms extended together in front, sweep the top arm across your body and open the chest toward the ceiling, following your hand with your eyes and breathing out at end range. Rotate from the ribcage, not the lower back. Restoring upper-back rotation improves overhead positions, running posture and throwing.",
  leg_swings: "Holding a support for balance, swing one leg forward and back in a controlled arc, gradually increasing range over ten reps, then switch to side-to-side swings across the body. Stay tall and don't ballistically yank at end range. It raises hip temperature and range immediately before sprinting — dynamic swings belong in the warm-up, long static stretches don't.",
  monster_walk: "With a band above the knees, drop into a half-squat and step forward on a diagonal, keeping constant band tension and driving the knees outward the whole time. Walk ten steps forward, then ten backward. It pre-activates the glute medius so your knee holds its line from the first sprint of the session rather than the tenth.",
  scap_pull_up: "Hang from a bar with straight arms, then — without bending your elbows — pull your shoulder blades down and back so your body rises an inch or two, pause for a second, and lower back into the hang. It builds the shoulder-blade control that keeps the shoulder healthy under pressing and contact loads, and it's the missing prerequisite for most people who struggle with pull-ups.",
  couch_stretch: "Place your back foot up on a wall or bench with the knee on the floor beneath it, then squeeze the glute of that back leg and tuck your pelvis under before rising tall. Hold 60–90 seconds per side and breathe. It targets the hip flexors and quads that shorten from sitting, flatten your sprint stride and often refer pain to the lower back. Intense — build the hold time gradually.",

  // Injury rehab / prehab
  calf_raise_eccentric: "On the edge of a step, rise up onto both toes, shift all your weight to the injured leg, then lower that heel below the step over a slow three-second count. Step back up with both legs and repeat. This heavy-slow eccentric loading is the best-evidenced treatment for Achilles tendinopathy — mild discomfort during the exercise is expected and acceptable, sharp pain is not. Consistency over 8–12 weeks is what makes it work.",
  ankle_alphabet: "Sitting with the foot off the ground, trace each letter of the alphabet in the air with your big toe, moving only at the ankle while the shin stays still. Make the letters as large as your range allows. It's a gentle early-stage ankle-sprain drill that restores motion in every direction without loading the joint. Work through stiffness, back off from sharp pain.",
  single_leg_balance: "Stand on one leg with a soft knee and hold for 30–45 seconds, gripping the floor with your toes. Progress it by closing your eyes, then standing on a cushion, then adding head turns or catching a ball. Ankle sprains wipe out proprioception — the joint's sense of its own position — and failing to retrain it is the single biggest reason ankles get re-sprained. Rebuild this before returning to sport.",
  terminal_knee_ext: "Anchor a band at knee height, step into it so it pulls the back of your knee forward, and stand with slight tension. Bend the knee a little, then straighten it fully against the band, squeezing the quad hard at lockout. Keep your heel down. It restores the last few degrees of knee extension and the quad control that stay stubbornly weak after knee injury or surgery.",
  isometric_wall_sit: "Slide down a wall until your knees are bent around 60° with shins vertical and weight through the heels, then hold. Five holds of 45 seconds with rest between. Isometric holds have a well-documented pain-relieving effect on tendons, which makes this the right choice for patellar tendinopathy on a flare-up day when jumping and deep squatting would make things worse.",
  hamstring_slider: "Lying on your back with heels on sliders or a towel, bridge your hips up and hold them high while slowly sliding both heels away from you, then pull them back in using the hamstrings. Never let the hips drop. It's a controlled way to load the hamstring eccentrically in mid-stage rehab — the bridge between early isometrics and returning to sprinting.",
  adductor_iso_squeeze: "Lying on your back with knees bent and a ball between them, squeeze the ball at about 70% of maximum effort for 30 seconds, keeping your pelvis level and ribs down. Five rounds. It's the standard early groin-strain loading exercise: it reduces pain and keeps the adductors strong at a stage when kicking and cutting would aggravate things. Progress toward the Copenhagen plank as pain settles.",
  bird_dog: "On all fours with a neutral spine, extend the opposite arm and leg until they're level with your torso, hold for three seconds, and return under control. Keep the hips square to the floor — imagine balancing a glass of water on your lower back. It rebuilds lower-back endurance and trunk control without any spinal loading, which is why it's a cornerstone of nearly every back-rehab programme.",
  mcgill_curl_up: "Lie on your back with one knee bent, one leg straight, and your hands under your lower back to preserve its natural arch. Lift only your head and shoulders a couple of centimetres off the floor and hold for eight seconds. The point is training the trunk without flexing the spine — this is the back-safe alternative to sit-ups and crunches for anyone with a history of lower-back pain.",
  shoulder_external_rotation: "With a band at elbow height and your elbow pinned to your side at 90°, rotate your forearm outward away from your body, then return slowly under control. Don't let the elbow drift off your ribs or the shoulder shrug up. It strengthens the rotator cuff that keeps the shoulder centred and stable — essential prehab for contact sports and heavy overhead pressing.",

  // Football skill drills
  finishing_drill: "Work through repeated strikes on goal from realistic positions: plant your non-kicking foot beside the ball pointing at your target, keep your head still with your eyes on the ball through contact, and strike through the middle-to-upper half for a low, controlled finish. Decide your corner before the ball arrives rather than after. Reset fully between reps — this is a technique drill, and tired, sloppy strikes just groove bad habits.",
  heading_drill: "Starting with a served ball and progressing to a jump, attack the ball rather than waiting for it to hit you: contact it on the flat of your forehead with your eyes open and your neck braced, generating power by snapping through the trunk. Start with gentle serves and low volume. Correct technique wins more aerial duels and — because a braced neck and forehead contact reduce head acceleration — it is also the safer way to head a ball. Keep heading volume low in training.",
  crossing_drill: "From a wide position, open your hips, plant your standing foot slightly behind and beside the ball, and whip across the outside of the ball with your instep to generate curl away from the keeper. Aim for a zone — the penalty spot, the back post — rather than a specific player. Work both sides. Delivery quality is what separates a dangerous winger from a busy one.",
  first_touch_drill: "Play the ball against a wall and control the return, relaxing the receiving foot to cushion it and taking your first touch into space away from imaginary pressure. Open your body before the ball arrives so you can see the whole pitch. Alternate feet and vary the weight and height of the pass. A clean first touch buys you the half-second that makes every other decision easier.",
  one_v_one_attack: "Against a cone or a passive defender, run at pace directly at their front foot, sell a feint with your hips and eyes, then explode away in two or three touches. Practise two or three moves until they're automatic rather than collecting twenty. Walk back between reps so every attempt is at full speed. Beating your man one-on-one is the most valuable individual skill in the final third.",
  long_passing: "Striking with your instep, lean back slightly and hit under the ball to loft it, or stay over it and drive through the middle for a flat pass. Follow through toward your target. Alternate driven and lofted balls over 30–50m to a partner or target zone. The ability to switch play quickly and accurately is what breaks a compact defensive block.",
  set_piece_practice: "Rehearse free kicks and corners with your full match routine — same number of steps, same run-up angle, same rhythm every time. Strike across the ball for whip or through it for power, and aim at a specific target rather than just the goal. Dead balls are the only chances in football you get to take completely on your own terms, and the players who practise them win games.",

  // Goalkeeper training
  gk_handling: "Take varied serves — chest, above the head, at the hips, low — forming a W with your hands behind the ball, thumbs almost touching for high balls and little fingers together for low ones. Watch the ball all the way into your hands and cushion it on contact rather than slapping at it. Clean, boring, repeatable handling is the foundation everything else a keeper does is built on, and it's the first thing to fail under pressure.",
  gk_diving: "From a set position, push explosively off the leg nearest the ball — never step across first, which costs you distance and time — attack the ball with your top hand leading, and land on your side with the ball, not on your elbow or shoulder. Work low dives before high ones. Good technique covers more of the goal and, just as importantly, keeps your shoulder intact over a season.",
  gk_footwork: "Move around your goal with small, quick adjusting steps on the balls of your feet, and practise being completely set at the exact moment the striker makes contact. The cardinal rule is never to be moving when the shot is struck. Most goals that look like reflex failures are actually footwork failures — the keeper simply wasn't set. Use cones to force realistic repositioning between serves.",
  gk_distribution: "Practise the full range: flat, fast throws to feet, rolled balls to a full-back, driven kicks over a target and clipped passes into midfield. Scan the pitch before the ball reaches you, not after. The modern goalkeeper starts attacks as often as they stop them, and a keeper who can play out under pressure changes how the whole team can set up.",
  gk_reaction_saves: "From close range with a rebounder or a rapid server, take six to ten quick serves with your hands ready at hip height and your body big. React to the ball itself, not the server's arm. Critically, recover to your feet immediately after every save to deal with the second ball — the rebound is where most close-range goals actually come from. Take full rest between sets so quality stays high.",
  gk_crosses: "With servers delivering from both wings, call early and loudly, attack the ball at its highest point, and take off from one foot with the lead knee up to protect yourself in a crowd. Catch when you can, punch decisively with two fists when you can't. Dominating your box kills crosses before they ever become chances, and a keeper who commands their area lifts the whole back line.",
  gk_one_v_one: "As the attacker breaks through, close the distance fast while they're still taking a touch, then set and stay tall as long as possible to keep the goal covered. When they commit, spread big and low with your hands leading, making yourself as wide a barrier as possible. One-v-ones are the highest-value situation a keeper faces — going to ground early is the most common and most punished mistake.",
};

for (const e of EXERCISES) e.description = DESCRIPTIONS[e.id] ?? e.why;

// Merge the bulk gym database — skip any whose name already has a rich entry.
const richNames = new Set(EXERCISES.map((e) => e.name.toLowerCase()));
for (const e of IMPORTED_EXERCISES) {
  if (!richNames.has(e.name.toLowerCase())) EXERCISES.push(e);
}
// Every exercise gets a difficulty (rich ones inferred from the name).
for (const e of EXERCISES) e.difficulty ??= difficultyOf(e.name);

const BY_ID: Record<string, Exercise> = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

export function getExercise(id: string): Exercise | null {
  return BY_ID[id] ?? null;
}

const BY_NAME: Record<string, Exercise> = Object.fromEntries(EXERCISES.map((e) => [e.name.toLowerCase(), e]));

export function getExerciseByName(name: string): Exercise | null {
  return BY_NAME[name.trim().toLowerCase()] ?? null;
}

// --- level + equipment filtering (for the library) --------------------------
export const EQUIPMENT_BUCKETS = ["Barbell", "Dumbbell", "Machine", "Cable", "Bodyweight", "Kettlebell", "Other"] as const;

export function exerciseEquip(ex: Exercise): string {
  return equipBucket(ex.equipment);
}

/** True if the exercise is at or below the athlete's chosen level (a ceiling). */
export function withinLevel(ex: Exercise, maxLevel: Difficulty): boolean {
  return DIFF_RANK[ex.difficulty ?? "medium"] <= DIFF_RANK[maxLevel];
}

/** Progression method for a drill referenced by name (null if unknown). */
export function progressionForName(name: string): ProgressionMethod | null {
  const ex = getExerciseByName(name);
  return ex ? exerciseProgression(ex) : null;
}

// How an exercise is progressively overloaded — you can't add weight to a wall
// pass, so each type gets the right progression advice.
export type ProgressionMethod = "load" | "reps" | "time" | "skill";

export const PROGRESSION_NOTE: Record<ProgressionMethod, string> = {
  load: "Add a small amount of weight (~2.5kg) once you can hit every rep with clean form.",
  reps: "Add a rep or two each session; once it's easy across all sets, make the movement harder (tempo, range, or a harder variation).",
  time: "Extend the work interval, add a round, or cover more distance as it gets easier.",
  skill: "There's no weight to add — progress by difficulty: go faster, use less space, use your weaker side, or add a defender/decision.",
};

export function exerciseProgression(ex: Exercise): ProgressionMethod {
  const eq = ex.equipment.toLowerCase();
  if (/barbell|dumbbell|kettlebell|cable|weight/.test(eq)) return "load";
  if (ex.category === "Skill" || ex.category === "Speed" || ex.category === "Agility" || /ball/.test(eq)) return "skill";
  if (ex.category === "Endurance" || /bike/.test(eq)) return "time";
  return "reps"; // bodyweight strength / plyometrics
}

export type Implement = "barbell_back" | "barbell_hands" | "dumbbells" | "box" | "none";

// Which implement the animated demo should draw, so lifts read as lifts.
export function demoImplement(ex: Exercise): Implement {
  switch (ex.id) {
    case "back_squat": case "front_squat": return "barbell_back";
    case "deadlift": case "barbell_row": case "bench_press":
    case "overhead_press": case "power_clean": return "barbell_hands";
    case "dumbbell_press": case "farmers_carry": return "dumbbells";
    case "box_jumps": case "depth_drop": return "box";
    default: return "none";
  }
}

// Exercises for a sport = its sport-specific drills (first) plus all general ones.
export function getExercisesForSport(sport: SportId | "all"): Exercise[] {
  if (sport === "all") return EXERCISES;
  const specific = EXERCISES.filter((e) => e.sports?.includes(sport));
  const general = EXERCISES.filter((e) => !e.sports);
  return [...specific, ...general];
}

export const EXERCISE_CATEGORIES: ExerciseCategory[] =
  ["Speed", "Agility", "Power", "Strength", "Mobility", "Rehab", "Recovery", "Endurance", "Skill"];

// Movement patterns a coach can pick when authoring a team exercise.
export const DEMO_PATTERNS: { id: DemoPattern; label: string }[] = [
  { id: "squat", label: "Squat" }, { id: "hinge", label: "Hinge / deadlift" },
  { id: "lunge", label: "Lunge / split" }, { id: "jump", label: "Jump / plyometric" },
  { id: "press", label: "Press (overhead)" }, { id: "pull", label: "Pull / pull-up" },
  { id: "plank", label: "Plank / core" }, { id: "run", label: "Run / sprint" },
  { id: "lateral", label: "Lateral / shuffle" }, { id: "ball", label: "Ball skill" },
  { id: "bike", label: "Bike / cardio" },
];

// Convert a coach's custom_exercises row into the shared Exercise shape.
export function rowToExercise(r: {
  id: string; name: string; category?: string; sport?: string | null; demo?: string;
  equipment?: string | null; muscles?: string[] | null; cues?: string[] | null;
  why?: string | null; description?: string | null;
}): Exercise {
  return {
    id: `custom_${r.id}`,
    name: r.name,
    category: (r.category as ExerciseCategory) ?? "Strength",
    demo: (r.demo as DemoPattern) ?? "squat",
    equipment: r.equipment || "—",
    muscles: r.muscles ?? [],
    tempo: "Coach-set",
    cues: r.cues ?? [],
    why: r.why || "Added by your coach.",
    description: r.description || undefined,
    sports: r.sport ? [r.sport as SportId] : undefined,
    custom: true,
  };
}
