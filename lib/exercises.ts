// =============================================================================
// Coached exercise library — rich, athlete-facing metadata for every drill the
// AI coach and video analysis can prescribe. Keyed by the same drill ids used
// in lib/coach.ts and lib/biomech.ts so any DrillItem resolves to full coaching
// content: an animated demo, cues, tempo, target muscles and why it helps.
// Pure data (no deps) — safe on the static site.
// =============================================================================

import type { IconName } from "@/components/Icon";
import { IMPORTED_EXERCISES, difficultyOf, equipBucket } from "./exercise-catalog";
import { IMPORTED_HOWTO } from "./exercise-howto";

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

/**
 * `icon` is ours (components/Icon.tsx); `emoji` survives for ONE reason.
 *
 * ProfileForm renders the sport list as a native `<select>`, and an `<option>`
 * can hold text and nothing else — no SVG, no element. So the emoji stays for
 * that control alone. Everywhere the sport is drawn as a tile or a pill uses
 * the icon, which takes the theme colour and looks the same on every phone.
 */
export const SPORTS: { id: SportId; label: string; emoji: string; icon: IconName }[] = [
  { id: "football", label: "Football", emoji: "⚽", icon: "ball" },
  { id: "rugby", label: "Rugby", emoji: "🏉", icon: "rugby" },
  { id: "weightlifting", label: "Weightlifting", emoji: "🏋️", icon: "barbell" },
  { id: "gym", label: "Gym & fitness", emoji: "💪", icon: "muscle" },
  { id: "basketball", label: "Basketball", emoji: "🏀", icon: "basketball" },
  { id: "running", label: "Running", emoji: "🏃", icon: "run" },
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
  /** True when `description` actually teaches the movement, rather than being
   *  the one-line `why` used as a fallback. */
  hasHowTo?: boolean;
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

  // --- Runs --------------------------------------------------------------------
  //
  // ACTUAL RUNS, available to every sport rather than only to runners.
  //
  // The library could describe a 100m tempo rep and a hill sprint, and had
  // nothing at all for "go for a half-hour run" — so no program in any sport
  // could prescribe one. A footballer's conditioning came out as shuttles and a
  // sled, and the recovery day for every sport was a stretch or a bike, because
  // the one thing most athletes actually do on an easy day did not exist here.
  //
  // Each of these is one of the run types in lib/running.ts, which carries the
  // zone, the pacing and the failure mode. What lives here is what the LIBRARY
  // needs — a name, cues and a reason — so they browse and search like anything
  // else. No `sports` field on any of them: that is the point.
  { id: "recovery_run", name: "Recovery run", category: "Recovery", demo: "run", equipment: "None",
    muscles: ["Cardio", "Legs"], tempo: "20–40 min · Zone 1",
    cues: ["Slower than feels reasonable — that is the dose", "Flat route, no hills, no watch-chasing", "You should finish fresher than you started"],
    why: "Moves blood through tired legs the day after something hard, without adding any training stress of its own." },
  { id: "easy_run", name: "Easy run", category: "Endurance", demo: "run", equipment: "None",
    muscles: ["Cardio", "Legs"], tempo: "30–75 min · Zone 2",
    cues: ["You should be able to hold a conversation the whole way", "If you can't talk, you're working too hard to be doing this", "Nose-breathing should be possible for most of it"],
    why: "The single most valuable aerobic session there is, in any sport — it builds the engine that everything else runs on." },
  { id: "long_run", name: "Long run", category: "Endurance", demo: "run", equipment: "None",
    muscles: ["Cardio", "Legs"], tempo: "60–150 min · Zone 2",
    cues: ["Start slower than you intend to finish", "Build it by time, not distance", "Keep it under a third of your week's total"],
    why: "Time on feet — builds both the aerobic base and the durability to keep using it late in a game or a race." },
  { id: "threshold_run", name: "Threshold run", category: "Endurance", demo: "run", equipment: "None",
    muscles: ["Cardio", "Legs"], tempo: "20–40 min · Zone 4",
    cues: ["Comfortably uncomfortable, and even the whole way", "A few words at a time, not silence", "Warm up 15 min and cool down 10 — they are part of the session"],
    why: "Raises the pace you can hold before you start slowing down. The highest-value hard session for most athletes." },
  { id: "vo2_intervals", name: "VO2 max intervals", category: "Endurance", demo: "run", equipment: "None",
    muscles: ["Cardio", "Legs"], tempo: "5–6 × 3 min · Zone 5",
    cues: ["Every rep the same speed — the last one is the one that counts", "Hard from halfway, not from the first stride", "Jog the recovery, don't stand still"],
    why: "Stretches the ceiling on how much oxygen you can actually use, which raises everything underneath it." },
  { id: "fartlek_run", name: "Fartlek", category: "Endurance", demo: "run", equipment: "None",
    muscles: ["Cardio", "Legs"], tempo: "40–70 min · mixed",
    cues: ["Surge to the next lamppost, then run easy until you're ready again", "30 seconds to 4 minutes — vary it deliberately", "Actually recover between surges"],
    why: "Hard running without a track, a stopwatch or a plan — the easiest quality session to fit into a real week." },
  { id: "progression_run", name: "Progression run", category: "Endurance", demo: "run", equipment: "None",
    muscles: ["Cardio", "Legs"], tempo: "40–75 min · Zone 2→4",
    cues: ["Thirds: easy, then steady, then hard", "The first third should feel too slow", "If the last third isn't the fastest, it wasn't one"],
    why: "Teaches pacing discipline and a strong finish — the two things that decide the end of a race or a match." },
  { id: "hill_repeats", name: "Hill repeats", category: "Endurance", demo: "run", equipment: "A hill",
    muscles: ["Glutes", "Calves", "Cardio"], tempo: "6–10 × 45–90s",
    cues: ["Tall posture, short strides, drive the arms", "Hard but controlled — not a sprint", "Jog the descent; downhill is where the damage comes from"],
    why: "Builds strength and power with far less impact than flat speed work, so it fits weeks where the legs are already loaded." },
  { id: "strides", name: "Strides", category: "Speed", demo: "run", equipment: "None",
    muscles: ["Hamstrings", "Hip flexors"], tempo: "4–6 × 15–20s",
    cues: ["Accelerate to about 90%, then float back down", "Full walk-back between — these are not intervals", "Fast and easy, never maximal"],
    why: "Keeps the legs quick at almost no cost. Bolt them onto the end of an easy day or use them to prime a session." },

  // --- Conditioning -----------------------------------------------------------
  //
  // The library had two cardio entries, both of them running or a bike, which
  // left nothing to substitute when someone says "no running". These are the
  // low-impact and machine options, so a conditioning slot can always be filled
  // for someone with shins, knees, or only a gym to work with.
  { id: "rowing_intervals", name: "Rowing intervals", category: "Endurance", demo: "pull", equipment: "Rower",
    muscles: ["Back", "Quads", "Cardio"], tempo: "500m hard · 90s easy",
    cues: ["Legs, then back, then arms — in that order", "Drive with the heels, don't yank with the arms", "Ribs down, don't lean back past upright"],
    why: "Full-body conditioning with no impact at all — the first choice when running is off the table." },
  { id: "ski_erg", name: "Ski erg intervals", category: "Endurance", demo: "pull", equipment: "Ski erg",
    muscles: ["Back", "Core", "Cardio"], tempo: "30s hard · 30s easy",
    cues: ["Hinge at the hips, don't just pull with the arms", "Finish the stroke past your hips", "Stay tall between reps"],
    why: "Upper-body-led conditioning that spares the legs entirely on a heavy lower week." },
  { id: "skipping", name: "Skipping", category: "Endurance", demo: "jump", equipment: "Rope",
    muscles: ["Calves", "Cardio"], tempo: "60s on · 30s off",
    cues: ["Small hops, stay on the balls of the feet", "Turn the rope from the wrists, not the shoulders", "Land quietly — noise is wasted force"],
    why: "Builds an engine and calf stiffness at once, and fits in any space with no machine." },
  { id: "incline_walk", name: "Incline treadmill walk", category: "Endurance", demo: "run", equipment: "Treadmill",
    muscles: ["Glutes", "Calves", "Cardio"], tempo: "20–40 min steady",
    cues: ["Steep and slow beats flat and fast", "Don't hold the handrails — it halves the work", "Nose-breathing pace: hard but conversational"],
    why: "Aerobic work with almost no joint load, so it stacks on top of hard training instead of competing with it." },
  { id: "swim_intervals", name: "Swim intervals", category: "Endurance", demo: "pull", equipment: "Pool",
    muscles: ["Back", "Shoulders", "Cardio"], tempo: "50m hard · 30s rest",
    cues: ["Long strokes, don't thrash", "Breathe bilaterally to stay even", "Push off the wall properly — it's free speed"],
    why: "Zero-impact conditioning that also opens the shoulders and chest after a week of pressing." },
  { id: "sled_push", name: "Sled push", category: "Endurance", demo: "run", equipment: "Sled",
    muscles: ["Quads", "Glutes", "Cardio"], tempo: "20m hard · walk back",
    cues: ["Low body angle, arms locked out", "Short, aggressive steps", "Drive through the whole foot"],
    why: "Conditioning that builds acceleration strength — the only cardio that makes you faster as well as fitter." },
  { id: "kb_swing_intervals", name: "Kettlebell swing intervals", category: "Endurance", demo: "hinge", equipment: "Kettlebell",
    muscles: ["Hamstrings", "Glutes", "Cardio"], tempo: "30s on · 30s off",
    cues: ["Hinge, don't squat — the bell floats, you don't lift it", "Snap the hips, glutes hard at the top", "Breathe out sharply at the top of each swing"],
    why: "Trains the aerobic system and the posterior chain together, in ten minutes and one piece of kit." },
  { id: "shuttle_runs", name: "Shuttle runs", category: "Endurance", demo: "lateral", equipment: "Cones",
    muscles: ["Quads", "Calves", "Cardio"], tempo: "6 × 20m · 45s rest",
    cues: ["Decelerate under control — that's the hard part", "Low hips through the turn", "Accelerate out, don't drift"],
    why: "Match-realistic conditioning: repeated efforts with a change of direction, which is how team sport is actually played." },
  { id: "stair_intervals", name: "Stair intervals", category: "Endurance", demo: "run", equipment: "Stairs",
    muscles: ["Quads", "Glutes", "Cardio"], tempo: "8 × up · walk down",
    cues: ["Drive the knee, don't reach with the foot", "Land mid-foot on each step", "Walk down — the descent is where injuries happen"],
    why: "Hill-sprint stimulus when there's no hill, and available in nearly every building." },
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

  // ===========================================================================
  // REHAB, IN FULL.
  //
  // Tapping an exercise in a rehab plan shows you how to do it — and it only
  // could for 27 of the 63 movements a graded loading plan actually prescribes.
  // The rest showed a dose and a name, which for somebody who has never done a
  // Copenhagen plank is an instruction they cannot follow, on the one screen
  // where following it correctly matters most.
  //
  // These are the standard clinical vocabulary for the seven areas the injury
  // planner covers: ankle, knee, hamstring, groin, calf/Achilles, lower back
  // and shoulder. Authored rather than imported, because a rehab cue that is
  // vague is worse than no cue: "keep good form" on a Nordic curl is how people
  // tear the thing they are rehabbing.
  // ===========================================================================

  // --- Ankle ---------------------------------------------------------------
  { id: "ankle_circles", name: "Ankle circles", category: "Rehab", demo: "plank", equipment: "None",
    muscles: ["Ankle stabilisers"], tempo: "10 each way · 3 rounds",
    cues: ["Move the foot, not the leg", "Slow and deliberate — this is not a warm-up swing", "Go to the edge of stiffness, never into sharp pain"],
    why: "The gentlest way to keep an injured ankle moving in the first few days." },
  { id: "band_ankle_eversion", name: "Band ankle eversion", category: "Rehab", demo: "plank", equipment: "Band",
    muscles: ["Ankle stabilisers", "Calves"], tempo: "15 reps · 3 sets",
    cues: ["Turn the sole outward against the band", "Knee and shin stay completely still", "Return slowly — the lowering is the work"],
    why: "The peroneals on the outside of the ankle are what stop it rolling again; they are also what an inversion sprain damages." },
  { id: "band_ankle_inversion", name: "Band ankle inversion", category: "Rehab", demo: "plank", equipment: "Band",
    muscles: ["Ankle stabilisers"], tempo: "15 reps · 3 sets",
    cues: ["Turn the sole inward against the band", "Shin still, movement only at the ankle", "Control it back out"],
    why: "Balances the eversion work so the ankle is strong in both directions rather than only the one that hurts." },
  { id: "ankle_dorsiflexion_stretch", name: "Ankle dorsiflexion stretch", category: "Rehab", demo: "lunge", equipment: "Wall",
    muscles: ["Calves", "Ankle stabilisers"], tempo: "10 × 5s · each side",
    cues: ["Knee drives forward over the toes", "Heel stays welded to the floor", "Aim for the knee to pass the toes by a hand's width"],
    why: "Lost dorsiflexion after a sprain changes how you squat, land and run — and it is the deficit people never regain by accident." },
  { id: "lateral_hops", name: "Lateral hops", category: "Rehab", demo: "jump", equipment: "Line or low hurdle",
    muscles: ["Calves", "Ankle stabilisers", "Glute med"], tempo: "3 × 20s · quick contacts",
    cues: ["Land on the ball of the foot, knee soft", "Quiet landings — noise is uncontrolled force", "Stay over the middle of the foot, do not roll out"],
    why: "The last thing an ankle has to prove before cutting: that it can take sideways load at speed." },
  { id: "wobble_board_balance", name: "Wobble board balance", category: "Rehab", demo: "plank", equipment: "Wobble board or cushion",
    muscles: ["Ankle stabilisers", "Glute med"], tempo: "30–45s/side · 3 rounds",
    cues: ["Small constant corrections, not big saves", "Grip the floor with the toes", "Progress by closing your eyes, not by wobbling harder"],
    why: "Unstable-surface balance rebuilds the position sense a sprain destroys, which is the single biggest predictor of doing it again." },

  // --- Knee ----------------------------------------------------------------
  { id: "quad_set", name: "Quad set", category: "Rehab", demo: "plank", equipment: "None",
    muscles: ["Quads", "VMO"], tempo: "10 × 5s · several times a day",
    cues: ["Leg straight, press the back of the knee down into the floor", "Squeeze the thigh hard, heel may lift slightly", "Nothing should hurt — this is the gentlest quad exercise there is"],
    why: "The first quad exercise after any knee problem: it wakes the muscle up before the joint can tolerate movement." },
  { id: "straight_leg_raise", name: "Straight leg raise", category: "Rehab", demo: "plank", equipment: "None",
    muscles: ["Quads", "Hip flexors"], tempo: "12 reps · 3 sets",
    cues: ["Lock the knee straight BEFORE you lift", "Lift to the height of the other thigh, no higher", "If the knee bends on the way up, the quad is not ready"],
    why: "Loads the quad with no knee movement at all — the bridge between a quad set and squatting." },
  // NAMED "WALL SLIDE SQUAT", NOT "WALL SLIDE". "Wall slide" means two entirely
  // different exercises depending on which joint you are rehabbing — this one
  // for a knee, and a scapular wall slide for a shoulder. Sharing the name meant
  // somebody with a sore shoulder tapped their wall slides and got a quad
  // exercise, presented with exactly as much confidence as a correct answer.
  { id: "wall_slide_knee", name: "Wall slide squat", category: "Rehab", demo: "squat", equipment: "Wall",
    muscles: ["Quads", "Glutes"], tempo: "10 reps · 3 sets",
    cues: ["Slide down only as far as it stays comfortable", "Knees track over the middle toes", "Push through the whole foot to come up"],
    why: "Reintroduces bending under load with the wall taking the balance out of it." },
  { id: "step_down", name: "Step down", category: "Rehab", demo: "lunge", equipment: "Step or box",
    muscles: ["Quads", "Glutes", "VMO"], tempo: "8/side · 3s lower",
    cues: ["Lower slowly until the other heel kisses the floor", "Knee stays over the toes, not falling inward", "Hips level — the standing side does the work"],
    why: "The best single test and exercise for knee control: it exposes the inward collapse that causes most knee pain." },
  { id: "box_step_up", name: "Box step up", category: "Rehab", demo: "lunge", equipment: "Box",
    muscles: ["Quads", "Glutes"], tempo: "10/side · controlled",
    cues: ["Drive through the top foot, do not push off the bottom one", "Stand up fully before stepping back down", "Lower under control rather than dropping"],
    why: "Loads one leg through a full range with far less joint stress than a squat, so it fits earlier in a knee plan." },

  // --- Hamstring -----------------------------------------------------------
  { id: "hamstring_isometric_hold", name: "Isometric hamstring hold", category: "Rehab", demo: "hinge", equipment: "None",
    muscles: ["Hamstrings"], tempo: "5 × 20–30s",
    cues: ["Heel digs into the floor, knee slightly bent", "Push at an effort that keeps pain under 3/10", "Hold steady — no pulsing"],
    why: "The first loading a strained hamstring tolerates, and it reduces pain while keeping the muscle switched on." },
  { id: "single_leg_bridge", name: "Single-leg bridge", category: "Rehab", demo: "hinge", equipment: "None",
    muscles: ["Hamstrings", "Glutes"], tempo: "10/side · 3 sets",
    cues: ["Drive through the heel, not the whole foot", "Hips stay level — do not let one side drop", "Squeeze the glute at the top"],
    why: "Loads hamstring and glute together on one leg, which is how they actually work when you run." },
  { id: "prone_hamstring_curl", name: "Prone hamstring curl", category: "Rehab", demo: "hinge", equipment: "Band or ankle weight",
    muscles: ["Hamstrings"], tempo: "12 reps · 3s lower",
    cues: ["Lie face down, curl the heel toward the backside", "Hips stay pinned to the floor", "Lower slowly — that is the part that builds it"],
    why: "Isolates the hamstring through range with no hip involvement, so you can load it before hinging is comfortable." },
  { id: "supine_hamstring_stretch", name: "Supine hamstring stretch", category: "Rehab", demo: "hinge", equipment: "Strap or towel",
    muscles: ["Hamstrings"], tempo: "3 × 30s/side",
    cues: ["Strap round the foot, leg as straight as comfort allows", "Pull to a stretch, never to pain", "Keep the other leg flat on the floor"],
    why: "Restores the length a healing hamstring loses, without the aggressive end-range that can re-tear it." },
  { id: "build_up_runs", name: "Build-up runs", category: "Rehab", demo: "run", equipment: "None",
    muscles: ["Hamstrings", "Glutes", "Calves"], tempo: "6 × 60m · walk back",
    cues: ["Accelerate gradually to the target speed, hold briefly, decelerate", "Start at 60% and add 10% per session", "Stop at the first hint of grabbing — the session is over, not the plan"],
    why: "The graded reintroduction of speed. Hamstrings re-tear when sprinting arrives all at once rather than in steps." },

  // --- Groin ---------------------------------------------------------------
  { id: "side_lying_adduction", name: "Side-lying adduction", category: "Rehab", demo: "plank", equipment: "None",
    muscles: ["Adductors", "Groin"], tempo: "12/side · 3 sets",
    cues: ["Bottom leg lifts toward the ceiling", "Top leg crossed in front, out of the way", "Small range, slow, no swinging"],
    why: "Loads the adductor through range once the isometric squeeze is comfortable — the step before Copenhagen planks." },
  { id: "cossack_squat", name: "Cossack squat", category: "Rehab", demo: "lunge", equipment: "None",
    muscles: ["Adductors", "Quads", "Glutes"], tempo: "8/side · controlled",
    cues: ["Shift onto one leg, the other stays straight with toes up", "Chest tall, heel down on the bent side", "Only go as deep as you can control"],
    why: "Rebuilds strength at the long end of the adductor, which is exactly where groin strains happen." },

  // --- Calf and Achilles ---------------------------------------------------
  { id: "isometric_calf_hold", name: "Isometric calf hold", category: "Rehab", demo: "plank", equipment: "Wall for balance",
    muscles: ["Calves", "Achilles"], tempo: "5 × 45s",
    cues: ["Rise onto the toes and hold still", "Both legs first, one leg when that is easy", "Steady hold — do not bounce at the top"],
    why: "Isometrics settle Achilles pain fast, which makes this the right session on a flare-up day instead of skipping it entirely." },
  { id: "soleus_raise", name: "Soleus raise", category: "Rehab", demo: "squat", equipment: "Optional load",
    muscles: ["Calves", "Achilles"], tempo: "15 reps · 3 sets",
    cues: ["Knee BENT throughout — that is what makes it the soleus", "Rise onto the toes, lower slowly", "Add weight on the knee once bodyweight is easy"],
    why: "The soleus takes most of the load in running and is routinely missed because every calf raise people do is done with a straight knee." },
  { id: "heel_drop", name: "Heel drop", category: "Rehab", demo: "squat", equipment: "Step",
    muscles: ["Calves", "Achilles"], tempo: "15 reps · 3s lower",
    cues: ["Rise on both feet, lower on the injured one alone", "Drop the heel below the step slowly", "Some discomfort is fine — sharp pain is not"],
    why: "The best-evidenced Achilles tendinopathy exercise there is: slow eccentric loading below neutral, done daily." },

  // --- Lower back ----------------------------------------------------------
  { id: "side_plank_rehab", name: "Side plank", category: "Rehab", demo: "plank", equipment: "None",
    muscles: ["Obliques", "Lower back", "Glute med"], tempo: "3 × 20–30s/side",
    cues: ["Elbow under the shoulder, body in one line", "Knees down to regress, feet stacked to progress", "Breathe normally throughout"],
    why: "One of the McGill big three: trunk endurance with almost no compression through the spine." },
  { id: "cat_cow", name: "Cat cow", category: "Rehab", demo: "plank", equipment: "None",
    muscles: ["Lower back", "T-spine"], tempo: "10 slow rounds",
    cues: ["Move one vertebra at a time, do not just tip the pelvis", "Breathe out as you round, in as you arch", "Stay inside the comfortable range"],
    why: "Gentle spinal motion that eases a stiff back in the first few days, when doing nothing makes it worse." },
  { id: "pelvic_tilt", name: "Pelvic tilt", category: "Rehab", demo: "plank", equipment: "None",
    muscles: ["Deep core", "Lower back"], tempo: "12 reps · 3 sets",
    cues: ["Flatten the lower back into the floor, then let it arch back", "Movement comes from the pelvis, not the legs", "Small and slow"],
    why: "Teaches the pelvic control every other back exercise assumes you already have." },
  { id: "prone_press_up", name: "Prone press up", category: "Rehab", demo: "press", equipment: "None",
    muscles: ["Lower back"], tempo: "10 reps · hold 2s",
    cues: ["Hands under the shoulders, press the chest up", "Hips stay down on the floor", "Stop if pain spreads DOWN the leg — that is the wrong direction"],
    why: "Extension work that often eases disc-related back pain. The leg rule matters: pain moving toward the spine is progress, pain moving down it is not." },
  { id: "hip_hinge_pattern", name: "Hip hinge pattern", category: "Rehab", demo: "hinge", equipment: "Dowel or broom",
    muscles: ["Hamstrings", "Glutes", "Lower back"], tempo: "12 reps · slow",
    cues: ["Dowel touches head, upper back and tailbone — keep all three", "Push the hips back, let the knees bend a little", "Feel it in the hamstrings, not the lower back"],
    why: "Relearning to bend from the hips rather than the spine is what stops the back injury happening again." },

  // --- Shoulder ------------------------------------------------------------
  { id: "pendulum_swing", name: "Pendulum swing", category: "Rehab", demo: "pull", equipment: "None",
    muscles: ["Shoulders", "Rotator cuff"], tempo: "30s each direction",
    cues: ["Lean on a bench with the good arm, let the sore arm hang", "Let the body sway — the arm goes along for the ride", "No muscle effort in the hanging arm at all"],
    why: "Moves an irritable shoulder without asking it to work, which is the only thing that helps in the first painful week." },
  { id: "scapular_retraction", name: "Scapular retraction", category: "Rehab", demo: "pull", equipment: "Band",
    muscles: ["Lower traps", "Upper back", "Rear delts"], tempo: "15 reps · 2s squeeze",
    cues: ["Pull the shoulder blades together and slightly down", "Arms barely move — this is all shoulder blade", "Do not shrug up toward the ears"],
    why: "A shoulder blade that does not sit right is behind a lot of shoulder pain, and this is where fixing it starts." },
  { id: "scapular_push_up", name: "Scapular push-up", category: "Rehab", demo: "press", equipment: "None",
    muscles: ["Upper back", "Shoulders"], tempo: "12 reps · slow",
    cues: ["Arms stay straight the whole time", "Let the chest sink between the shoulder blades, then push it away", "Small movement — a few centimetres is the whole rep"],
    why: "Trains serratus, the muscle that holds the shoulder blade flat, which almost nothing else in a gym does." },
  { id: "y_raise", name: "Y raise", category: "Rehab", demo: "pull", equipment: "Light dumbbells or band",
    muscles: ["Lower traps", "Shoulders"], tempo: "12 reps · light",
    cues: ["Arms out at roughly 45° making a Y with thumbs up", "Lift with the shoulder blade, not the arm", "Very light — this is not a delt raise"],
    why: "The lower trap is the hardest part of the shoulder to reach and the part that most often gives up." },
  { id: "wall_slide_shoulder", name: "Wall angel", category: "Rehab", demo: "press", equipment: "Wall",
    muscles: ["Lower traps", "Shoulders", "Upper back"], tempo: "10 reps · slow",
    cues: ["Back, head and arms against the wall, elbows at 90°", "Slide the arms up keeping every contact point touching", "Stop where contact breaks — that is your range, not where you want it"],
    why: "The shoulder half of what people call a wall slide: it trains overhead reach with the shoulder blade moving properly instead of the back arching to fake it." },
  { id: "sleeper_stretch", name: "Sleeper stretch", category: "Rehab", demo: "plank", equipment: "None",
    muscles: ["Rotator cuff", "Shoulders"], tempo: "3 × 30s",
    cues: ["Lie on the sore side, elbow at 90° in front of you", "Use the other hand to rotate the forearm gently down", "A stretch at the back of the shoulder, never a pinch at the front"],
    why: "Restores the internal rotation that overhead and throwing athletes lose, which is what starts the shoulder impinging." },
];

// Fuller "how to perform it" write-ups — setup, execution, what to feel and the
// most common mistake. Merged onto EXERCISES below so components can show depth.
const DESCRIPTIONS: Record<string, string> = {
  // --- Rehab how-tos -------------------------------------------------------
  // Setup, execution, what to feel, and the mistake that matters. Rehab cues
  // have to be more specific than training cues: "keep good form" on a Nordic
  // curl is how somebody tears the thing they are rehabbing.
  ankle_circles: "Sit or lie with the leg supported and the foot free. Draw slow circles with the foot, ten in each direction, moving only at the ankle — the shin should stay completely still. Go to the edge of stiffness and no further. This is the gentlest thing you can do for a swollen ankle in the first few days, and doing nothing at all is what leaves it stiff for months.",
  band_ankle_eversion: "Anchor a band and loop it round the outside of the foot so it pulls inward. Turn the sole of the foot outward against the band, then let it return slowly. Keep the knee and shin still — if the whole leg rotates, you are using the hip instead. Fifteen reps, three sets. The peroneals on the outside of the ankle are what stop it rolling again, and they are exactly what an inversion sprain weakens.",
  band_ankle_inversion: "Anchor the band on the other side so it pulls the foot outward, and turn the sole inward against it. Same rules: shin still, movement only at the ankle, slow on the way back. Fifteen reps, three sets. Done alongside the eversion work so the ankle ends up strong in both directions rather than only the one that got injured.",
  ankle_dorsiflexion_stretch: "Stand facing a wall in a short lunge with the front foot about a hand's width from it. Drive the front knee forward over the toes toward the wall, keeping the heel welded to the floor, then return. Ten reps holding five seconds. Aim to get the knee past the toes. Losing dorsiflexion after a sprain quietly changes how you squat, land and run, and it is the deficit nobody regains by accident.",
  lateral_hops: "Stand on one leg beside a line or low hurdle and hop sideways over it and back, landing on the ball of the foot with a soft knee. Twenty seconds, three rounds. Listen for the landings — noise means force you are not absorbing. Keep your weight over the middle of the foot rather than rolling to the outside. This is the last thing an ankle has to prove before you cut on it.",
  wobble_board_balance: "Stand on a wobble board or a folded cushion on one leg and hold, making small constant corrections rather than big saves. Thirty to forty-five seconds a side, three rounds. Progress by closing your eyes, not by finding something wobblier. Unstable-surface balance rebuilds the position sense a sprain destroys, and losing that is the single biggest predictor of spraining it again.",
  quad_set: "Lie or sit with the leg straight and press the back of the knee down into the floor, squeezing the thigh hard for five seconds — the heel may lift slightly. Ten reps, several times a day. Nothing should hurt. It is the first quad exercise after any knee problem, because the quad switches off within days of a swollen or painful knee and everything else waits on it waking back up.",
  straight_leg_raise: "Lie on your back with one knee bent and the other leg straight. Lock the straight knee first, then lift the leg to the height of the other thigh and lower it slowly. Twelve reps, three sets. If the knee bends on the way up, the quad is not ready and you should go back to quad sets. It loads the quad with no knee movement at all, which is what makes it the bridge to squatting.",
  wall_slide_knee: "Stand with your back against a wall, feet a step forward, and slide down only as far as stays comfortable — often a quarter of the way at first. Knees track over the middle toes rather than falling inward. Push through the whole foot to come back up. Ten reps, three sets. The wall takes balance out of it so you can reintroduce bending under load without the joint having to stabilise as well.",
  step_down: "Stand on a step on one leg with the other foot hanging off the front. Lower slowly — three seconds — until the hanging heel just touches the floor, then come back up. Eight a side. Watch the knee: if it drifts inward over the big toe, lower the step. Keep the hips level. It is simultaneously the best test and the best exercise for knee control, because it exposes the inward collapse behind most knee pain.",
  box_step_up: "Face a box around knee height, place one foot flat on top, and drive through that foot to stand all the way up — do not push off the trailing leg. Lower under control rather than dropping. Ten a side. It loads one leg through a full range with far less joint stress than a squat, which is why it fits earlier in a knee plan than most people expect.",
  hamstring_isometric_hold: "Lie on your back with the injured leg's heel on the floor and the knee slightly bent, then dig the heel down as if trying to drag it toward you. Hold twenty to thirty seconds, five times, at an effort that keeps pain under 3/10. No pulsing — a steady push. This is the first loading a strained hamstring will tolerate, and it reduces pain while stopping the muscle switching off.",
  single_leg_bridge: "Lie on your back with one knee bent and the other leg straight or held up. Drive through the heel of the bent leg to lift the hips, keeping them level — the untouched side must not drop. Squeeze the glute at the top. Ten a side, three sets. It loads hamstring and glute together on one leg, which is the way they actually work every stride you run.",
  prone_hamstring_curl: "Lie face down with a band round the ankle or a light weight on it, and curl the heel toward your backside. Keep the hips pinned to the floor — if they lift, the weight is too heavy. Lower over three seconds; that slow part is what builds the muscle. Twelve reps. It isolates the hamstring with no hip involvement, so it can be loaded before hinging is comfortable.",
  supine_hamstring_stretch: "Lie on your back with a strap or towel round the foot and the other leg flat on the floor. Straighten the strapped leg toward the ceiling until you feel a stretch, and hold thirty seconds. Three a side. Pull to a stretch and never into pain. A healing hamstring loses length, and getting it back matters — but aggressive end-range stretching on fresh scar tissue is a way to re-tear it.",
  build_up_runs: "On grass or a track, accelerate gradually over about forty metres to your target speed, hold it briefly, then decelerate over the rest. Six runs of sixty metres with a walk back. Start at around 60% of full speed and add roughly 10% per session. Stop at the first hint of the hamstring grabbing — that ends the session, not the plan. Hamstrings re-tear when sprinting arrives all at once instead of in steps.",
  side_lying_adduction: "Lie on your side with the top leg crossed in front and out of the way, and lift the bottom leg toward the ceiling. Small range, slow, no swinging. Twelve a side, three sets. It loads the adductor through range once the isometric squeeze is comfortable, and it is the step that belongs between that squeeze and the Copenhagen plank rather than jumping straight across.",
  cossack_squat: "Stand wide, shift your weight onto one leg and sit down into it while the other stays straight with the toes turned up. Keep the chest tall and the heel down on the bent side. Come back to the middle under control. Eight a side, only as deep as you can control. It builds strength at the long end of the adductor, which is precisely where groin strains happen.",
  isometric_calf_hold: "Rise onto your toes and hold still — both feet first, one foot once that is easy — with a wall for balance. Five holds of forty-five seconds. Do not bounce at the top. Isometric holds settle Achilles pain quickly, which makes this the right session on a flare-up day rather than skipping training entirely and losing the tendon's tolerance.",
  soleus_raise: "Sit with the knees bent at ninety degrees and a weight resting on them, or stand in a half-squat against a wall, and rise onto the toes. The bent knee is the whole point: it takes the big calf muscle out and puts the load on the soleus underneath. Fifteen reps, three sets. The soleus carries most of the load in running and gets missed because every calf raise people do is done with a straight knee.",
  heel_drop: "Stand on a step with the heels hanging off. Rise on both feet, shift onto the injured leg, and lower that heel below the level of the step over three seconds. Step back up with both. Fifteen reps, daily. Some discomfort during it is expected and fine; sharp pain is not. Slow eccentric loading below neutral is the best-evidenced Achilles tendinopathy exercise there is.",
  side_plank_rehab: "Lie on your side with the elbow under the shoulder, and lift the hips so the body makes one straight line. Knees down to make it easier, feet stacked to make it harder. Twenty to thirty seconds a side, three rounds, breathing normally. One of the McGill big three: it builds the trunk endurance a back needs with almost no compression through the spine itself.",
  cat_cow: "On all fours, round the spine toward the ceiling one vertebra at a time, then reverse into a gentle arch. Ten slow rounds, breathing out as you round and in as you arch. Stay inside the comfortable range. Do not just tip the pelvis back and forth — the point is motion spread through the whole spine, which is what eases a stiff back in the days when resting it makes it worse.",
  pelvic_tilt: "Lie on your back with the knees bent. Flatten the lower back into the floor by tilting the pelvis, then let it arch gently back. Twelve reps, three sets, small and slow, with the movement coming from the pelvis rather than pushing with the legs. It teaches the pelvic control that every other back exercise quietly assumes you already have.",
  prone_press_up: "Lie face down with the hands under the shoulders and press the chest up, keeping the hips down on the floor. Ten reps holding two seconds. Watch where the pain goes: pain moving up toward the spine is progress, pain spreading further DOWN the leg means stop. That rule matters more than the exercise — it is how you tell whether extension is the right direction for your back at all.",
  hip_hinge_pattern: "Hold a dowel or broom against your back so it touches head, upper back and tailbone. Push the hips back, letting the knees bend a little, and keep all three contact points as you lower. Twelve slow reps. You should feel it in the hamstrings and not in the lower back. Relearning to bend from the hips rather than the spine is the thing that stops the back injury happening a second time.",
  pendulum_swing: "Lean forward with the good arm on a bench and let the sore arm hang straight down, completely relaxed. Sway your body gently so the arm swings in small circles and back and forth — the arm itself does no work at all. Thirty seconds each direction. It moves an irritable shoulder without asking it to contract, which is the only thing that helps in the first genuinely painful week.",
  scapular_retraction: "With a band anchored in front at chest height, pull the shoulder blades together and slightly down without bending the elbows much — the arms barely move. Hold the squeeze two seconds. Fifteen reps. Do not shrug up toward the ears, which is what happens when the upper traps take over. A shoulder blade that does not sit and move properly is behind a great deal of shoulder pain.",
  scapular_push_up: "Get into a push-up or box position with the arms locked straight and keep them straight throughout. Let the chest sink between the shoulder blades, then push the floor away so the upper back rounds slightly. Twelve slow reps. The whole movement is a few centimetres. It trains serratus, the muscle that holds the shoulder blade flat against the ribs, which almost nothing else in a gym reaches.",
  y_raise: "Lying face down on a bench or standing bent at the hips, raise the arms out at about forty-five degrees with the thumbs up, making a Y. Lift by moving the shoulder blade rather than the arm, and use very light weight or a band — this is not a delt raise and going heavy defeats it. Twelve reps. The lower trap is the hardest part of the shoulder to reach and usually the first to give up.",
  wall_slide_shoulder: "Stand with your back, head and arms flat against a wall, elbows bent to ninety degrees and the backs of the hands touching. Slide the arms slowly up the wall, keeping the elbows, wrists, head and lower back in contact throughout. Ten slow reps. Stop the moment any contact point lifts — that is your honest range, and arching the lower back to get the arms higher trains exactly the compensation you are trying to remove. Often called a wall slide, which is why it is named separately here from the knee exercise of the same name.",
  sleeper_stretch: "Lie on the sore shoulder with the arm out in front and the elbow bent to ninety degrees. Use the other hand to rotate the forearm down toward the floor until you feel a stretch at the BACK of the shoulder. Three holds of thirty seconds. A pinch at the front means you have gone too far and should back off. It restores the internal rotation overhead and throwing athletes lose, which is what starts a shoulder impinging.",

  // --- Runs ---------------------------------------------------------------
  //
  // Each names its ZONE and then says what that zone feels like, because a
  // number on its own coaches nobody — "Zone 2" means nothing until someone
  // tells you it's the pace you could hold a conversation at. The formal zone
  // definitions, the heart-rate bands and the pace maths live in lib/running.ts.
  recovery_run: "A short, genuinely slow run the day after something hard — 20 to 40 minutes in Zone 1. Zone 1 is recovery pace: about 50–60% of your maximum heart rate, an effort of 1–3 out of 10, slow enough that talking is completely effortless and it almost feels silly. Pick a flat route and don't look at your watch. The single most common way to ruin this session is to drift up into Zone 2 because you feel fine — if you finish more tired than you started, it was too fast to have been a recovery run.",
  easy_run: "The everyday run, 30 to 75 minutes in Zone 2, and it should make up most of your week. Zone 2 is easy aerobic running: roughly 60–70% of maximum heart rate, an effort of 3–5 out of 10, at a pace where you can speak in full sentences without gasping. Nose-breathing should be possible for most of it. Almost everyone runs this too fast, which turns it into Zone 3 — hard enough to tire you, too easy to drive much adaptation. Easy days being genuinely easy is what makes the hard days work.",
  long_run: "The week's longest run, an hour or more, mostly Zone 2 with a drift into Zone 3 late on. Zone 3 is steady, comfortably hard — 70–80% of maximum heart rate, short sentences rather than full ones. Start slower than you plan to finish and build it by time rather than distance, especially early on: an hour is an hour whatever pace you cover it at. Keep it under about a third of your weekly volume, because past that the long run stops building fitness and starts costing you the rest of the week.",
  threshold_run: "Fifteen minutes easy, then 20 to 40 minutes continuous in Zone 4, then ten minutes easy to finish. Zone 4 is threshold: 80–90% of maximum heart rate, an effort of 7–8 out of 10, the pace you could just about race for an hour and no longer. You should be able to get a few words out at a time. Hold it even the whole way — the failure mode is racing it, and a threshold run finished at full stretch was really an interval session with no recovery.",
  vo2_intervals: "After a thorough warm-up, run five to six repetitions of three minutes in Zone 5 with an equal jog between each. Zone 5 is VO2 max work: 90–100% of maximum heart rate, an effort of 9–10 out of 10, hard enough that talking is impossible and three to five minutes is all you would manage in one go. Each rep should feel hard from about halfway, not from the first stride. Run every rep at the same speed — going out fast and fading is the classic mistake, and the last rep is the one that earns the session.",
  fartlek_run: "Inside an ordinary easy run, surge for anything from 30 seconds to four minutes, then run easy until you genuinely feel ready to go again. Pick landmarks rather than times — the next lamppost, the top of the hill. The surges land in Zone 4 and Zone 5 and the floats should drop back to Zone 2, which is the part people skip: never really recovering between efforts quietly turns the whole thing into a very long threshold run and costs far more than it should.",
  progression_run: "Split the run into thirds and get faster through each one: Zone 2, then Zone 3, then Zone 4 for the last third. Zone 2 is conversational, Zone 3 is comfortably hard, Zone 4 is the pace you could race for about an hour. The first third should feel too slow — that is the discipline the session teaches. If the final third isn't the fastest part of the run, you started too hard and it wasn't a progression run at all.",
  hill_repeats: "Find a moderate hill and run six to ten efforts of 45 to 90 seconds up it, hard but controlled, jogging back down between each. The effort sits in Zone 4 to Zone 5 — 80% of maximum heart rate and above — but the hill limits your speed, so you get the intensity with far less impact than flat running. Stay tall, keep the strides short and drive the arms. Jog the descent: downhill running is where the muscle damage comes from, and hammering it is what makes you sore two days later.",
  strides: "Four to six accelerations of 15 to 20 seconds, building smoothly to about 90% of full speed and then floating back down, with a complete walk-back between each. Bolt them onto the end of an easy run or use them before a session to wake the legs up. They touch Zone 5 speed but last far too briefly to cost you anything, which is why they don't count as a hard session. Treating them as sprints is the mistake — they should feel fast and relaxed, never maximal.",

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

  // Conditioning. These were added to give the engine cardio that isn't
  // running, and shipped with only a one-line benefit — so the "How to perform
  // it" panel explained the point of the exercise and not the exercise.
  rowing_intervals: "Set the damper around 4–5. Drive with the legs first, then swing the hips back, then pull the handle to the bottom of your ribs — legs, hips, arms, and the exact reverse on the way back. Most people pull with the arms and waste the biggest muscles they own. Aim for a steady stroke rate around 24–28 during work intervals and let the legs do the work; the screen should show consistent splits rather than a fast start and a fade.",
  ski_erg: "Stand tall with the handles overhead, then drive down by hinging at the hips and crunching the trunk, finishing with the hands past your thighs. It's a hip hinge, not an arm pull — the power comes from folding at the hips and using your bodyweight. Return under control to full extension before the next stroke. It's kind on the legs, which makes it a good conditioning option when your legs are already beaten up from training.",
  skipping: "Turn the rope with the wrists, not the arms, and keep the elbows tucked in near the ribs. Stay on the balls of the feet with small hops, barely leaving the floor — a couple of centimetres is plenty. Keep the shoulders relaxed and look ahead rather than down at your feet. Start with steady two-foot bouncing and only add single-leg or double-unders once you can hold a full minute without tripping.",
  incline_walk: "Set the treadmill to a steep incline (10–15%) and a walking pace you can hold conversationally. Do not hold the handrails — gripping them takes most of the load out and turns a genuinely useful session into nothing. Stand tall, let the arms swing, and drive through the whole foot. It builds a real aerobic base with almost no impact, which makes it ideal when you're carrying a niggle or in a heavy training week.",
  swim_intervals: "Push off, extend fully, and rotate from the hips rather than thrashing with the arms. Breathe every three strokes to keep both sides even. Rest on the clock between lengths rather than by feel, so the intervals stay honest as you tire. Zero impact makes this the conditioning option that works when running is off the table entirely — a stress fracture, shin splints, or the day after a hard match.",
  sled_push: "Set the handles at chest height for a heavier push or low for a more aggressive drive. Get a strong forward lean with straight arms, brace the trunk, and take short, powerful steps driving through the whole foot. Do not let the hips rise and the back round. Keep the load heavy enough that it stays a push rather than a jog — this is meant to build leg drive as much as an engine.",
  kb_swing_intervals: "Hinge at the hips with a flat back, hike the bell back between your legs like a rugby pass, then snap the hips forward hard to float it to chest height. The arms are ropes, the hips are the engine — never lift it with the shoulders. Lock the glutes at the top and let the bell fall before hinging again. Done properly this is a hinge and a conditioning tool at once; done as a squat-and-lift it's neither.",
  shuttle_runs: "Mark two lines the given distance apart. Sprint out, decelerate under control, touch the line with a foot or hand, and change direction hard. The turn is the whole exercise: get the hips low and the weight over the outside foot rather than drifting through it. Full effort out, honest rest between reps — the aim is repeat sprint quality, so once your times fall off noticeably the useful part of the set is over.",
  stair_intervals: "Run or bound up a flight, then walk down as recovery — always walk down, since descending fast is where the knees and the injuries come from. Drive the knees and use your arms. Keep the torso tall rather than folding forward at the waist. Steep stairs make this closer to a power session than a run, so treat the first couple of reps as a build rather than going flat out cold.",
};

// Merge the bulk gym database — skip any whose name already has a rich entry.
const richNames = new Set(EXERCISES.map((e) => e.name.toLowerCase()));
for (const e of IMPORTED_EXERCISES) {
  if (!richNames.has(e.name.toLowerCase())) EXERCISES.push(e);
}

// Descriptions are assigned AFTER the merge, not before.
//
// This used to run first, so every one of the ~245 imported exercises ended up
// with description: undefined — and ExerciseDetail hides the "How to perform
// it" section when there's no description. The library therefore listed 330
// exercises of which most silently refused to tell you how to do them, even
// where the text to show was sitting right there in their `why`.
//
// `hasHowTo` marks the ones where that text genuinely teaches the movement,
// rather than saying what it's good for. Showing a one-line benefit under a
// heading that reads "How to perform it" is its own kind of lie, and the UI
// needs to be able to tell the two apart.
for (const e of EXERCISES) {
  // Two sources, one meaning: DESCRIPTIONS covers the hand-built exercises,
  // IMPORTED_HOWTO the bulk gym catalogue. Either counts as a real how-to.
  const written = DESCRIPTIONS[e.id] ?? IMPORTED_HOWTO[e.id];
  e.hasHowTo = !!written;
  e.description = written ?? e.description ?? e.why;
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
