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
  areas?: string[]; // body areas this protocol targets (for injury-specific ones)
}

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
    steps: ["Rest — offload it and avoid aggravating movements", "Ice 15–20 min every 2–3 hours", "Compress with a wrap", "Elevate above heart level to control swelling", "Once pain settles, gentle range-of-motion (ankle circles, alphabet)"],
  },
  {
    id: "knee", title: "Achy knee", when: "Ongoing", icon: "🦵", areas: ["knee"],
    steps: ["Ice after activity if it swells", "Avoid deep loaded knee bends while irritated", "Isometrics — Spanish squat or wall-sit holds load the tendon safely", "Strengthen the glutes/quads around it (band walks, step-ups)", "Build load back gradually — see a physio if it persists"],
  },
  {
    id: "hamstring", title: "Tight / tweaked hamstring", when: "Early stage", icon: "🦿", areas: ["hamstring"],
    steps: ["Don't aggressively stretch a strain early — it can set healing back", "Gentle pain-free isometrics (holds)", "Ice early if acute; keep walking within comfort", "Rebuild with slow eccentrics (Nordic curls, RDLs) as it settles", "Return to sprinting gradually"],
  },
  {
    id: "lower_back", title: "Stiff lower back", when: "Ongoing", icon: "🧎", areas: ["lower_back"],
    steps: ["Keep moving gently — avoid bed rest", "Cat-camel and hip-hinge mobility", "Brace properly under any load; avoid rounded lifting while sore", "Build core/glute strength (dead bugs, hip thrusts)", "See a professional if pain radiates down a leg"],
  },
  {
    id: "shoulder", title: "Niggly shoulder", when: "Ongoing", icon: "💪", areas: ["shoulder"],
    steps: ["Reduce overhead loading while irritated", "Ice after aggravating sessions", "Band external rotations & scapular work", "Keep range of motion with gentle mobility", "Progress pressing volume slowly"],
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
