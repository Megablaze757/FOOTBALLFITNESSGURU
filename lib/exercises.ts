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
  description?: string; // fuller how-to (merged from DESCRIPTIONS below)
  custom?: boolean;     // true for coach-authored team exercises
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
};

for (const e of EXERCISES) e.description = DESCRIPTIONS[e.id] ?? e.why;

const BY_ID: Record<string, Exercise> = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

export function getExercise(id: string): Exercise | null {
  return BY_ID[id] ?? null;
}

const BY_NAME: Record<string, Exercise> = Object.fromEntries(EXERCISES.map((e) => [e.name.toLowerCase(), e]));

export function getExerciseByName(name: string): Exercise | null {
  return BY_NAME[name.trim().toLowerCase()] ?? null;
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
  ["Speed", "Agility", "Power", "Strength", "Recovery", "Endurance", "Skill"];

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
