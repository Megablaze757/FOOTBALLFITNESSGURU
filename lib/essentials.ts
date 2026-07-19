// =============================================================================
// Playbook content — position essentials, matchday nutrition and recovery
// protocols. Practical, coach-style guidance tailored to the athlete's sport
// and position. Pure data + selectors (runs on Pages).
// =============================================================================

import type { SportId } from "./exercises";

// --- Position essentials -----------------------------------------------------

export interface PositionGuide {
  summary: string;
  physical: string[];  // physical qualities to prioritise
  skills: string[];    // technical / tactical focuses
  keyDrills: string[]; // exercise ids (resolve to the library)
}

const FOOTBALL: Record<string, PositionGuide> = {
  Goalkeeper: {
    summary: "Explosive, reactive and strong through the core — short bursts, dives and quick resets.",
    physical: ["Reactive power & lateral push-off", "Core & shoulder stability", "Short-burst explosiveness"],
    skills: ["Set position & footwork", "Handling under pressure", "Distribution & command of the box"],
    keyDrills: ["reactive_mirror", "lateral_shuffle", "box_jumps", "copenhagen"],
  },
  "Centre back": {
    summary: "Win everything in the air and in duels — strength, jumping and clean positioning matter most.",
    physical: ["Maximal & jumping strength", "Aerial power", "Robustness for duels"],
    skills: ["Heading & aerial timing", "Defensive positioning", "Composed distribution"],
    keyDrills: ["back_squat", "box_jumps", "broad_jump", "nordic_curl"],
  },
  "Full back": {
    summary: "Up and down the line all game — repeated sprints, crossing and stamina.",
    physical: ["Repeated-sprint ability", "Aerobic engine", "Hamstring durability"],
    skills: ["Overlapping runs & crossing", "1v1 defending", "Recovery runs"],
    keyDrills: ["hill_sprints", "tempo_runs", "single_leg_rdl", "stride_outs"],
  },
  "Defensive mid": {
    summary: "The engine that screens the back four — endurance, tackling and tidy distribution.",
    physical: ["Aerobic & repeat-effort capacity", "Trunk & pulling strength", "Deceleration control"],
    skills: ["Screening & interceptions", "Tackling technique", "Quick, secure passing"],
    keyDrills: ["tempo_runs", "deadlift", "farmers_carry", "reactive_mirror"],
  },
  "Central mid": {
    summary: "Box-to-box: cover the most ground of anyone and link play both ways.",
    physical: ["High aerobic base", "Repeated sprints", "Change-of-pace"],
    skills: ["Scanning & first touch", "Progressive passing", "Late runs into the box"],
    keyDrills: ["tempo_runs", "stride_outs", "passing_wall", "a_skips"],
  },
  Winger: {
    summary: "Beat your marker — top-end speed, agility and 1v1 quality in tight areas.",
    physical: ["Top speed & acceleration", "Change of direction", "Reactive strength"],
    skills: ["1v1 dribbling", "Crossing & cutbacks", "Timing the run in behind"],
    keyDrills: ["flying_sprints", "ladder_quickfeet", "cone_weave", "pogo_hops"],
  },
  Striker: {
    summary: "Sharp first five metres, ruthless finishing and a clean first touch under pressure.",
    physical: ["Acceleration & explosiveness", "Jumping power", "Rotational core"],
    skills: ["Finishing both feet", "First touch to set", "Movement in the box"],
    keyDrills: ["resisted_sprint", "box_jumps", "dribbling_grid", "broad_jump"],
  },
};

const RUGBY: Record<string, PositionGuide> = {
  Prop: {
    summary: "Set-piece power — the scrum, the maul and dominant contact.",
    physical: ["Maximal lower & upper strength", "Scrum drive position", "Neck & trunk robustness"],
    skills: ["Scrummaging technique", "Low, dominant tackles", "Close-quarter carrying"],
    keyDrills: ["back_squat", "deadlift", "scrum_drive", "bench_press"],
  },
  Flanker: {
    summary: "First to the breakdown — power, engine and relentless work-rate.",
    physical: ["Power endurance", "Aerobic engine", "Tackle & jackal strength"],
    skills: ["Breakdown technique", "Dominant tackling", "Support lines"],
    keyDrills: ["power_clean", "tackle_technique", "farmers_carry", "hill_sprints"],
  },
  Centre: {
    summary: "Break the line and defend the midchannel — power meets speed.",
    physical: ["Explosive power", "Speed off the mark", "Collision strength"],
    skills: ["Line-break footwork", "Dominant tackles", "Distribution at pace"],
    keyDrills: ["power_clean", "broad_jump", "resisted_sprint", "tackle_technique"],
  },
  Wing: {
    summary: "Finish in the corner — pure speed, aerial skill and a strong fend.",
    physical: ["Top-end speed", "Aerial jumping", "Fend / upper strength"],
    skills: ["Finishing & footwork", "High-ball catching", "Kick-chase"],
    keyDrills: ["flying_sprints", "vertical_jump", "bench_press", "stride_outs"],
  },
};

const BASKETBALL: Record<string, PositionGuide> = {
  "Point guard": {
    summary: "Run the show — handle, change pace and defend on the ball.",
    physical: ["Acceleration & agility", "Lateral quickness", "Repeat-effort engine"],
    skills: ["Ball handling", "Pick-and-roll reads", "On-ball defence"],
    keyDrills: ["defensive_slides", "ladder_quickfeet", "cone_weave", "hill_sprints"],
  },
  "Power forward": {
    summary: "Battle inside — vertical power, strength and rebounding.",
    physical: ["Vertical & explosive power", "Strength for contact", "Core stability"],
    skills: ["Rebounding & boxing out", "Finishing through contact", "Post positioning"],
    keyDrills: ["vertical_jump", "back_squat", "broad_jump", "calf_raise"],
  },
  Centre: {
    summary: "Anchor the paint — strength, vertical and rim protection.",
    physical: ["Max strength", "Vertical power", "Robust joints"],
    skills: ["Rim protection & timing", "Rebounding", "Screen setting"],
    keyDrills: ["back_squat", "vertical_jump", "deadlift", "calf_raise"],
  },
};

const RUNNING: Record<string, PositionGuide> = {
  Sprinter: {
    summary: "Maximal speed & power — mechanics, force and reactive strength.",
    physical: ["Maximal strength & power", "Reactive/tendon stiffness", "Sprint mechanics"],
    skills: ["Acceleration technique", "Top-speed posture", "Block/start work"],
    keyDrills: ["flying_sprints", "power_clean", "pogo_hops", "a_skips"],
  },
  "5k/10k": {
    summary: "Aerobic engine with durability — tempo, strength and running economy.",
    physical: ["Aerobic capacity", "Runner's durability", "Economy"],
    skills: ["Pacing & tempo control", "Efficient form", "Fuelling on the run"],
    keyDrills: ["tempo_runs", "hill_sprints", "single_leg_rdl", "calf_raise"],
  },
  Marathon: {
    summary: "Sustainable pace over distance — aerobic base, fuelling and resilience.",
    physical: ["Deep aerobic base", "Muscular endurance", "Injury resilience"],
    skills: ["Long-run pacing", "Race fuelling strategy", "Cadence & economy"],
    keyDrills: ["tempo_runs", "single_leg_rdl", "calf_raise", "hip_thrust"],
  },
};

const WEIGHTLIFTING: Record<string, PositionGuide> = {
  Powerlifting: {
    summary: "Move maximal loads on the squat, bench and deadlift with flawless technique.",
    physical: ["Maximal strength", "Bracing & positional strength", "Recovery capacity"],
    skills: ["Squat/bench/deadlift technique", "Cueing & bracing", "Peaking a 1RM"],
    keyDrills: ["back_squat", "bench_press", "deadlift", "overhead_press"],
  },
  "Olympic lifting": {
    summary: "Explosive strength-speed — clean, jerk and snatch with precision.",
    physical: ["Rate of force development", "Mobility for positions", "Max strength base"],
    skills: ["Clean & jerk technique", "Snatch technique", "Positional mobility"],
    keyDrills: ["power_clean", "front_squat", "overhead_press", "back_squat"],
  },
};

const GYM: Record<string, PositionGuide> = {
  Hypertrophy: {
    summary: "Build muscle — controlled volume, progressive overload and enough protein.",
    physical: ["Working-set volume", "Time under tension", "Recovery & sleep"],
    skills: ["Mind-muscle control", "Progressive overload tracking", "Full range of motion"],
    keyDrills: ["back_squat", "bench_press", "barbell_row", "dumbbell_press"],
  },
  "General fitness": {
    summary: "Look and feel good — a balance of strength, conditioning and consistency.",
    physical: ["Full-body strength", "Aerobic conditioning", "Mobility"],
    skills: ["Consistent habit", "Balanced push/pull/legs", "Sensible progression"],
    keyDrills: ["goblet_squat", "pull_up", "dumbbell_press", "bike_intervals"],
  },
};

const GUIDES: Record<SportId, Record<string, PositionGuide>> = {
  football: FOOTBALL, rugby: RUGBY, basketball: BASKETBALL,
  running: RUNNING, weightlifting: WEIGHTLIFTING, gym: GYM,
};

const SPORT_FALLBACK: Record<SportId, PositionGuide> = {
  football: { summary: "A complete footballer: speed, agility, strength and ball skill.", physical: ["Speed & agility", "Strength & power", "Aerobic engine"], skills: ["First touch & passing", "1v1s", "Game awareness"], keyDrills: ["flying_sprints", "back_squat", "ladder_quickfeet", "tempo_runs"] },
  rugby: { summary: "Powerful, durable and fit for 80 minutes of collisions.", physical: ["Collision strength", "Power", "Power endurance"], skills: ["Tackling", "Breakdown work", "Handling"], keyDrills: ["back_squat", "power_clean", "tackle_technique", "hill_sprints"] },
  basketball: { summary: "Explosive, quick and skilled on both ends.", physical: ["Vertical power", "Agility", "Repeat-effort engine"], skills: ["Handling & finishing", "On-ball defence", "Court vision"], keyDrills: ["vertical_jump", "defensive_slides", "ladder_quickfeet", "back_squat"] },
  running: { summary: "Efficient, strong and durable over your distance.", physical: ["Aerobic capacity", "Runner's strength", "Economy"], skills: ["Pacing", "Form", "Fuelling"], keyDrills: ["tempo_runs", "hill_sprints", "single_leg_rdl", "calf_raise"] },
  weightlifting: { summary: "Strong and technically sound on the main lifts.", physical: ["Maximal strength", "Bracing", "Mobility"], skills: ["Lift technique", "Progression", "Peaking"], keyDrills: ["back_squat", "deadlift", "bench_press", "overhead_press"] },
  gym: { summary: "Balanced strength, conditioning and consistency.", physical: ["Strength", "Conditioning", "Mobility"], skills: ["Progressive overload", "Balanced training", "Consistency"], keyDrills: ["goblet_squat", "pull_up", "dumbbell_press", "bike_intervals"] },
};

export function positionGuide(sport: SportId, position?: string | null): PositionGuide {
  const bySport = GUIDES[sport] ?? GUIDES.football;
  return (position && bySport[position]) || SPORT_FALLBACK[sport] || SPORT_FALLBACK.football;
}

// What the "gameday" section is called for each sport.
export function gamedayLabel(sport: SportId): string {
  if (sport === "running") return "Race day";
  if (sport === "weightlifting" || sport === "gym") return "Big session day";
  return "Matchday";
}

// --- Matchday / gameday nutrition -------------------------------------------

export interface NutritionPhase { when: string; title: string; icon: string; tips: string[] }

export const GAMEDAY_NUTRITION: NutritionPhase[] = [
  {
    when: "Night before", title: "Top up the tank", icon: "🍝",
    tips: [
      "High-carb dinner: pasta, rice or potatoes with lean protein",
      "Hydrate well through the evening",
      "Nothing new or heavy/greasy — stick to foods you know",
    ],
  },
  {
    when: "3–4 hours before", title: "Main fuel", icon: "🥣",
    tips: [
      "Slow-release carbs: porridge/oats, toast, rice or pasta",
      "Add some protein (eggs, chicken) and a little fruit",
      "Keep fat and fibre moderate so it digests comfortably",
    ],
  },
  {
    when: "60–90 min before", title: "Top-up snack", icon: "🍌",
    tips: [
      "Light, carb-rich snack: banana, energy bar or a bagel",
      "Start sipping water / an electrolyte drink",
      "Avoid a heavy meal this close to kick-off",
    ],
  },
  {
    when: "During", title: "Stay fuelled", icon: "💧",
    tips: [
      "Sip water or a sports drink at every break",
      "For efforts over ~60 min, take on carbs (gel or sports drink)",
      "Replace fluid you sweat out — don't wait until you're thirsty",
    ],
  },
  {
    when: "Within 60 min after", title: "Recovery window", icon: "🥤",
    tips: [
      "Protein + carbs: recovery shake, chocolate milk, or chicken & rice",
      "Aim ~20–30g protein to kick-start muscle repair",
      "Begin rehydrating with water + electrolytes",
    ],
  },
  {
    when: "Rest of day", title: "Refuel & rebuild", icon: "🍽️",
    tips: [
      "A balanced meal with protein, carbs and veg",
      "Keep rehydrating through the evening",
      "Prioritise 8–9 hours of sleep to recover",
    ],
  },
];

// --- Recovery protocols ------------------------------------------------------

export interface RecoveryProtocol {
  id: string;
  title: string;
  when: string;
  icon: string;
  steps: string[];
  areas?: string[];       // body areas this protocol targets (for injury-specific ones)
  stages?: RehabStage[];  // staged return-to-play plan
  redFlags?: string[];    // signs to stop and get assessed by a professional
  exerciseIds?: string[]; // ids in lib/exercises.ts to load the rehab work from
}

// One phase of a return-to-play progression. `criteria` is what must be true
// before moving on — progressing on symptoms rather than dates is what stops
// the re-injury cycle.
export interface RehabStage {
  phase: string;    // "Phase 1 — Protect"
  window: string;   // rough timeframe
  focus: string;
  criteria: string; // gate to the next phase
}

// Shown wherever rehab content appears. This is coaching guidance, not a
// diagnosis — anything significant needs a real clinician.
export const REHAB_DISCLAIMER =
  "General guidance only — not a medical diagnosis. If pain is severe, you heard a pop, you can't bear weight, or it isn't improving after a week or two, get assessed by a physio or doctor.";

export const RECOVERY_GENERAL: RecoveryProtocol[] = [
  {
    id: "cooldown", title: "Cool down", when: "Right after", icon: "🚶",
    steps: ["5–10 min easy walk/jog to flush the legs", "Gentle full-body stretch", "Start rehydrating and refuel within the hour"],
  },
  {
    id: "evening", title: "Evening reset", when: "That night", icon: "🛁",
    steps: ["Cold bath or shower 10–12 min (or contrast hot/cold) to reduce soreness", "Compression garments or 10 min legs-up-the-wall", "Get 8–9 hours of sleep — the biggest recovery lever there is"],
  },
  {
    id: "active", title: "Active recovery", when: "Next day", icon: "🚴",
    steps: ["20–30 min low-impact: easy bike, swim or walk", "Foam roll and mobility for tight areas", "Light protein + carbs, keep hydration up"],
  },
];

export const RECOVERY_INJURY: RecoveryProtocol[] = [
  {
    id: "ankle", title: "Sore / rolled ankle", when: "First 48h", icon: "🦶", areas: ["ankle"],
    steps: [
      "First 48h follow PEACE: Protect, Elevate, Avoid anti-inflammatories, Compress, Educate",
      "Elevate above heart level — this does more for swelling than ice does",
      "Compress with a wrap; ice 15–20 min for comfort if you want it",
      "Keep weight-bearing within comfort — total rest stiffens it up",
      "Then LOVE: Load, Optimism, Vascularisation, Exercise",
    ],
    stages: [
      { phase: "Phase 1 — Settle", window: "Day 0–3", focus: "Protect, elevate, compress. Ankle alphabet and gentle pain-free motion.", criteria: "Swelling down and you can walk without a limp." },
      { phase: "Phase 2 — Restore", window: "Day 3–10", focus: "Full range of motion, calf raises, and single-leg balance work.", criteria: "Full pain-free range and 20 single-leg calf raises." },
      { phase: "Phase 3 — Rebuild", window: "Week 2–4", focus: "Balance on unstable surfaces, hopping, lateral loading, band work.", criteria: "30s eyes-closed single-leg balance and pain-free hopping." },
      { phase: "Phase 4 — Return", window: "Week 3–6", focus: "Running, then cutting and changing direction, then contact/match play.", criteria: "Full-speed cutting with no pain, swelling or hesitation." },
    ],
    redFlags: ["Can't put weight through it for four steps", "Bony tenderness on the ankle knobs", "Obvious deformity", "Numbness or pins and needles in the foot"],
    exerciseIds: ["ankle_alphabet", "single_leg_balance", "calf_raise_eccentric", "band_lateral_walk", "ankle_rocks"],
  },
  {
    id: "knee", title: "Achy knee", when: "Ongoing", icon: "🦵", areas: ["knee"],
    steps: [
      "Don't rest completely — tendons need load to heal, they just need the right amount",
      "Use pain as your dial: up to about 3/10 during and settled by the next morning is acceptable",
      "Isometrics first — wall sits and Spanish squats reduce tendon pain within minutes",
      "Cut jumping and deep loaded knee bends while it's irritated, keep everything else",
      "Strengthen upstream: glutes and quads control what the knee actually does",
    ],
    stages: [
      { phase: "Phase 1 — Calm", window: "Week 1–2", focus: "Daily isometric holds, remove the aggravating jumping/deep-squat volume.", criteria: "Pain under 3/10 during daily activity." },
      { phase: "Phase 2 — Load", window: "Week 2–6", focus: "Slow heavy strength — leg press, split squats, terminal knee extensions.", criteria: "Full pain-free range and comfortable loaded squatting." },
      { phase: "Phase 3 — Spring", window: "Week 6–10", focus: "Reintroduce jumping and landing, starting low and building height.", criteria: "Pain-free repeated hopping and landing." },
      { phase: "Phase 4 — Return", window: "Week 8+", focus: "Sport-specific cutting, sprinting and full training load.", criteria: "Symmetric strength and no morning-after stiffness." },
    ],
    redFlags: ["Knee gave way or locked", "Rapid swelling within an hour of the injury", "You heard or felt a pop", "Can't fully straighten it"],
    exerciseIds: ["isometric_wall_sit", "spanish_squat", "terminal_knee_ext", "band_lateral_walk", "bulgarian_split"],
  },
  {
    id: "hamstring", title: "Tight / tweaked hamstring", when: "Early stage", icon: "🦿", areas: ["hamstring"],
    steps: [
      "Don't aggressively stretch a fresh strain — it can set healing back",
      "Start pain-free isometric holds within the first few days",
      "Keep walking within comfort; keep training everything that doesn't hurt",
      "Progress to slow eccentrics (sliders, then Nordics and RDLs) as it settles",
      "Reintroduce sprinting gradually — most re-injuries happen from rushing this",
    ],
    stages: [
      { phase: "Phase 1 — Protect", window: "Day 0–5", focus: "Pain-free isometric holds, walking, upper-body and other-leg training.", criteria: "Pain-free walking and gentle isometrics." },
      { phase: "Phase 2 — Lengthen", window: "Week 1–3", focus: "Eccentric loading through range — sliders, then RDLs.", criteria: "Full range with no more than mild pulling sensation." },
      { phase: "Phase 3 — Strengthen", window: "Week 3–5", focus: "Nordic curls and heavy hinging; start build-up runs.", criteria: "Strength within 10% of the other leg." },
      { phase: "Phase 4 — Sprint", window: "Week 4–8", focus: "Progressive sprinting — 60%, 75%, 90%, then max over sessions.", criteria: "Max-speed sprinting with total confidence and no grabbing." },
    ],
    redFlags: ["You heard a pop and couldn't continue", "Big bruising down the back of the leg", "A visible gap or lump in the muscle", "Pain sitting on the bone at the top of the hamstring"],
    exerciseIds: ["hamstring_slider", "nordic_curl", "single_leg_rdl", "glute_bridge", "tempo_runs"],
  },
  {
    id: "groin", title: "Groin / adductor strain", when: "Early stage", icon: "🩹", areas: ["groin", "adductor", "hip"],
    steps: [
      "Very common in footballers — usually from kicking, lunging or a stretched tackle",
      "Start adductor isometric squeezes early; they settle pain and preserve strength",
      "Avoid long-range stretching and hard kicking while it's acute",
      "Build to the Copenhagen plank — the best-evidenced groin-injury preventer",
      "Kicking is the last thing to return, not the first",
    ],
    stages: [
      { phase: "Phase 1 — Settle", window: "Day 0–7", focus: "Ball squeezes at submaximal effort, pain-free walking.", criteria: "Pain-free squeeze at full effort." },
      { phase: "Phase 2 — Load", window: "Week 1–3", focus: "Side-lying adductor work, short-lever Copenhagen planks.", criteria: "Comfortable short-lever Copenhagen holds." },
      { phase: "Phase 3 — Build", window: "Week 3–5", focus: "Full Copenhagen planks, lateral movement, change of direction.", criteria: "Pain-free cutting and shuffling at speed." },
      { phase: "Phase 4 — Kick", window: "Week 4–8", focus: "Graded return to passing, then striking, then crossing at full power.", criteria: "Full-power striking with no pain next morning." },
    ],
    redFlags: ["Pain that wraps into the lower abdomen", "A visible bulge in the groin", "Pain that wakes you at night", "No improvement after three weeks"],
    exerciseIds: ["adductor_iso_squeeze", "copenhagen", "band_lateral_walk", "world_greatest_stretch"],
  },
  {
    id: "calf", title: "Calf strain / Achilles pain", when: "Ongoing", icon: "🦵", areas: ["calf", "achilles"],
    steps: [
      "Distinguish the two: a calf strain is a sudden muscle tear, Achilles pain builds gradually",
      "For Achilles tendinopathy, heavy slow eccentric calf raises are the proven treatment",
      "Morning stiffness in the tendon is the key marker — track whether it's improving week to week",
      "Keep fitness with bike or pool work while loading tolerance rebuilds",
      "Progress load, not just reps — the tendon needs weight, and it takes 8–12 weeks",
    ],
    stages: [
      { phase: "Phase 1 — Settle", window: "Week 1–2", focus: "Isometric calf holds, reduce running volume, keep walking.", criteria: "Morning stiffness lasting under 10 minutes." },
      { phase: "Phase 2 — Load", window: "Week 2–6", focus: "Daily eccentric calf raises, adding load as tolerated.", criteria: "20 single-leg calf raises with load, low pain." },
      { phase: "Phase 3 — Spring", window: "Week 6–10", focus: "Pogo hops, skipping, and returning to easy running.", criteria: "Pain-free hopping and 20 minutes of easy running." },
      { phase: "Phase 4 — Return", window: "Week 8–12", focus: "Sprinting and full training load rebuilt gradually.", criteria: "Full-speed sprinting with no next-day flare." },
    ],
    redFlags: ["Sudden pain like being kicked in the calf plus weakness pushing off", "Can't rise onto your toes on that leg", "A gap felt in the tendon", "Calf that is hot, swollen and painful at rest — get this checked urgently"],
    exerciseIds: ["calf_raise_eccentric", "calf_raise", "ankle_rocks", "pogo_hops", "bike_intervals"],
  },
  {
    id: "lower_back", title: "Stiff lower back", when: "Ongoing", icon: "🧎", areas: ["lower_back"],
    steps: [
      "Keep moving gently — bed rest makes back pain worse, not better",
      "Most back pain settles within a few weeks and is not structural damage",
      "Cat-camel and hip-hinge mobility to restore comfortable movement",
      "Brace properly under load; avoid rounded heavy lifting while sore",
      "Build endurance with the McGill big three — curl-up, side plank, bird dog",
    ],
    stages: [
      { phase: "Phase 1 — Move", window: "Day 0–7", focus: "Walking, gentle mobility, avoid the specific positions that spike pain.", criteria: "Comfortable walking and sitting." },
      { phase: "Phase 2 — Control", window: "Week 1–3", focus: "McGill big three daily, hip hinge pattern with no load.", criteria: "Can hinge and brace without pain." },
      { phase: "Phase 3 — Load", window: "Week 3–6", focus: "Reintroduce loaded hinging light and build; add glute strength.", criteria: "Comfortable moderate deadlifting and squatting." },
      { phase: "Phase 4 — Return", window: "Week 4–8", focus: "Full lifting and sport load rebuilt progressively.", criteria: "Full training with no flare-ups." },
    ],
    redFlags: ["Pain radiating below the knee, or numbness/weakness in the leg", "Numbness in the saddle area or loss of bladder/bowel control — this is an emergency", "Unexplained weight loss or fever with back pain", "Pain following a significant fall or impact"],
    exerciseIds: ["bird_dog", "mcgill_curl_up", "dead_bug", "glute_bridge", "hip_thrust"],
  },
  {
    id: "shoulder", title: "Niggly shoulder", when: "Ongoing", icon: "💪", areas: ["shoulder"],
    steps: [
      "Reduce overhead and heavy pressing volume while it's irritated — don't stop training entirely",
      "Keep pain-free range daily so it doesn't stiffen up",
      "Band external rotations and scapular control work are the backbone of shoulder rehab",
      "Rebuild pressing from the friendliest angles first: neutral-grip and landmine before strict overhead",
      "Progress volume slowly — shoulders punish sudden jumps in load",
    ],
    stages: [
      { phase: "Phase 1 — Calm", window: "Week 1–2", focus: "Cut aggravating overhead work, daily pain-free range and isometrics.", criteria: "Pain-free daily use and sleeping through the night." },
      { phase: "Phase 2 — Control", window: "Week 2–5", focus: "Cuff and scapular strengthening, rows, scap pull-ups.", criteria: "Full pain-free range with good scapular control." },
      { phase: "Phase 3 — Press", window: "Week 4–8", focus: "Rebuild pressing from neutral grip toward full overhead.", criteria: "Comfortable overhead pressing at moderate load." },
      { phase: "Phase 4 — Return", window: "Week 6+", focus: "Contact, throwing or full overhead sport load.", criteria: "Full load with no next-day pain." },
    ],
    redFlags: ["The shoulder dislocated or felt like it came out", "Can't lift the arm at all", "Pain with pins and needles down the arm", "Obvious deformity or major weakness after an impact"],
    exerciseIds: ["shoulder_external_rotation", "scap_pull_up", "thoracic_openers", "barbell_row"],
  },
  {
    id: "hip", title: "Tight hips / hip flexor", when: "Ongoing", icon: "🕺", areas: ["hip", "hip_flexor", "quad"],
    steps: [
      "Usually an overload issue from sprinting and kicking volume, or from long hours sitting",
      "Stretching alone rarely fixes it — the muscle usually needs strengthening too",
      "Couch stretch plus 90/90 work to restore range",
      "Strengthen the hip flexor directly through range with banded marches",
      "Get the glutes working so they share the load with the hip flexors",
    ],
    stages: [
      { phase: "Phase 1 — Settle", window: "Week 1", focus: "Reduce sprint and kicking volume, daily gentle mobility.", criteria: "Pain-free walking and sitting." },
      { phase: "Phase 2 — Restore", window: "Week 1–3", focus: "Couch stretch, 90/90 switches, glute bridges.", criteria: "Full pain-free hip extension." },
      { phase: "Phase 3 — Strengthen", window: "Week 3–5", focus: "Loaded hip flexion, split squats, hinge strength.", criteria: "Strong and symmetric through full range." },
      { phase: "Phase 4 — Return", window: "Week 4–6", focus: "Graded return to sprinting and striking.", criteria: "Full-speed running and kicking with no grab." },
    ],
    redFlags: ["Deep groin pain with clicking or catching", "Pain that refers into the knee", "Marked loss of hip rotation", "Night pain"],
    exerciseIds: ["couch_stretch", "hip_90_90", "world_greatest_stretch", "glute_bridge", "bulgarian_split"],
  },
  {
    id: "concussion", title: "Head knock / suspected concussion", when: "Immediately", icon: "🧠", areas: ["head", "neck"],
    steps: [
      "If in doubt, sit them out — no same-day return to play after a suspected concussion, ever",
      "You do not need to lose consciousness to have a concussion",
      "See a doctor for assessment before starting any return-to-play progression",
      "Rest 24–48 hours, then gradually reintroduce light activity as symptoms allow",
      "Each stage below takes a minimum of 24 hours; any return of symptoms means dropping back a stage",
    ],
    stages: [
      { phase: "Stage 1 — Rest", window: "24–48h", focus: "Relative rest. Limit screens and mentally demanding work.", criteria: "Symptoms clearly improving." },
      { phase: "Stage 2 — Light aerobic", window: "24h min", focus: "Walking or stationary bike at light intensity. No resistance training.", criteria: "No return of symptoms." },
      { phase: "Stage 3 — Sport-specific", window: "24h min", focus: "Running drills. Still no head-impact activity of any kind.", criteria: "No return of symptoms." },
      { phase: "Stage 4 — Non-contact training", window: "24h min", focus: "Full non-contact training and resistance work. No heading.", criteria: "No symptoms, and medical clearance obtained." },
      { phase: "Stage 5 — Full contact", window: "After clearance", focus: "Normal training including contact and heading.", criteria: "Symptom-free through a full contact session." },
    ],
    redFlags: [
      "Loss of consciousness, seizure, or repeated vomiting — call emergency services",
      "Worsening headache, increasing confusion, or unusual drowsiness",
      "Weakness, numbness, slurred speech or double vision",
      "Neck pain or tenderness after the impact — do not move them, call for help",
    ],
  },
];

// Base area from a pain-map key ("knee_left" -> "knee").
function baseArea(key: string): string {
  return key.split("_").filter((t) => t !== "left" && t !== "right").join("_");
}

// Injury protocols relevant to the athlete's current sore areas (pain >= 4).
export function relevantInjuryProtocols(painMap: Record<string, number> | null | undefined): RecoveryProtocol[] {
  const sore = new Set(
    Object.entries(painMap ?? {}).filter(([, v]) => (Number(v) || 0) >= 4).map(([k]) => baseArea(k))
  );
  return RECOVERY_INJURY.filter((p) => p.areas?.some((a) => sore.has(a)));
}

// Body areas an athlete can point at directly, rather than waiting for a daily
// check-in to infer it.
export const INJURY_AREAS: { id: string; label: string; icon: string }[] = [
  { id: "ankle", label: "Ankle / foot", icon: "🦶" },
  { id: "calf", label: "Calf / Achilles", icon: "🦵" },
  { id: "knee", label: "Knee", icon: "🦵" },
  { id: "hamstring", label: "Hamstring", icon: "🦿" },
  { id: "groin", label: "Groin / adductor", icon: "🩹" },
  { id: "hip", label: "Hip / quad", icon: "🕺" },
  { id: "lower_back", label: "Lower back", icon: "🧎" },
  { id: "shoulder", label: "Shoulder", icon: "💪" },
  { id: "head", label: "Head / neck", icon: "🧠" },
];

export function protocolsForAreas(areas: string[]): RecoveryProtocol[] {
  const want = new Set(areas);
  return RECOVERY_INJURY.filter((p) => p.areas?.some((a) => want.has(a)));
}

// Free-text → protocols. Athletes describe injuries in their own words
// ("rolled my ankle", "pain behind my knee", "tight groin when I kick"), so
// match on the vocabulary they actually use rather than clinical terms.
const TEXT_HINTS: { id: string; words: string[] }[] = [
  { id: "ankle", words: ["ankle", "rolled", "twisted", "foot", "sprain"] },
  { id: "calf", words: ["calf", "achilles", "heel", "shin", "toe off", "pushing off"] },
  { id: "knee", words: ["knee", "patella", "kneecap", "acl", "meniscus", "jumper"] },
  { id: "hamstring", words: ["hamstring", "back of my leg", "back of the leg", "pulled", "sprinting"] },
  { id: "groin", words: ["groin", "adductor", "inner thigh", "kicking"] },
  { id: "hip", words: ["hip", "quad", "thigh", "flexor", "hip flexor"] },
  { id: "lower_back", words: ["back", "lower back", "spine", "lumbar", "disc"] },
  { id: "shoulder", words: ["shoulder", "rotator", "cuff", "collarbone", "arm"] },
  { id: "head", words: ["head", "concussion", "neck", "dizzy", "headache", "knocked"] },
];

export function matchInjuryText(text: string): RecoveryProtocol[] {
  const t = (text ?? "").toLowerCase();
  if (t.trim().length < 3) return [];
  const hit = new Set<string>();
  for (const h of TEXT_HINTS) {
    if (h.words.some((w) => t.includes(w))) hit.add(h.id);
  }
  return protocolsForAreas([...hit]);
}
