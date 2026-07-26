// =============================================================================
// Technical skill drills — the ball work, not the gym work.
//
// lib/exercises.ts covers physical preparation (lifts, sprints, plyos) and the
// position guides in lib/essentials.ts describe what a position NEEDS ("heading
// & aerial timing") — but nothing told anyone how to actually practise it. A
// centre back was told they need heading and then handed a back squat.
//
// These are the standard drills of each sport: rondos, wall passes, the Mikan
// drill, tackle-bag work. Deliberately not attributed to any coach or creator —
// they're common coaching property, taught the same way in every club, and
// putting a name to them would be inventing a provenance we can't stand behind.
//
// Pure data + tested. Every drill states what you need, how to run it, what to
// look for, and how to make it harder, because "practise crossing" is not
// coaching.
// =============================================================================

import type { SportId } from "./exercises";

export interface SkillDrill {
  id: string;
  sport: SportId;
  /** Grouping shown in the UI, e.g. "Shooting". */
  skill: string;
  name: string;
  /** Positions this matters most for. Empty = everyone in the sport. */
  positions: string[];
  /** Kit and space needed — the first reason a drill gets skipped. */
  setup: string;
  how: string[];
  /** Volume that makes it a session rather than a demonstration. */
  reps: string;
  /** The single thing that separates doing it from doing it well. */
  coaching: string;
  progression: string;
  /** True when it needs nobody else — most people train alone most of the time. */
  solo: boolean;
}

// --- Football ----------------------------------------------------------------

const FOOTBALL: SkillDrill[] = [
  {
    id: "fb_wall_pass", sport: "football", skill: "Passing", name: "Wall passing reps",
    positions: ["Defensive mid", "Central mid", "Centre back", "Full back"],
    setup: "A wall and a ball. 5–8m back.",
    how: [
      "Pass firmly against the wall with the inside of the foot.",
      "Take the return with your far foot, away from where a defender would be.",
      "Play it back first time, alternating feet every rep.",
    ],
    reps: "5 × 60 seconds, alternating feet",
    coaching: "Your first touch decides the pass — set the ball outside your body, not under it.",
    progression: "Move closer to speed it up, or restrict yourself to two touches, then one.",
    solo: true,
  },
  {
    id: "fb_rondo", sport: "football", skill: "Passing", name: "Rondo (piggy in the middle)",
    positions: ["Defensive mid", "Central mid", "Winger"],
    setup: "4+ players, one ball, a 8×8m square.",
    how: [
      "Players on the outside keep the ball; one or two defend inside.",
      "Two touches maximum — receive across your body and move it on.",
      "Whoever loses it goes in the middle.",
    ],
    reps: "4 × 4 minutes",
    coaching: "Scan before it arrives. The pass you make is decided before you touch the ball.",
    progression: "Shrink the square, or go one-touch.",
    solo: false,
  },
  {
    id: "fb_first_touch_wall", sport: "football", skill: "First touch", name: "Directional first touch",
    positions: [],
    setup: "A wall, a ball, two cones 3m apart.",
    how: [
      "Throw or pass the ball against the wall at varying heights.",
      "Kill it with one touch and move it through a cone gate.",
      "Alternate which gate — left, right, then behind you.",
    ],
    reps: "6 × 45 seconds",
    coaching: "Cushion, don't stop it dead — the touch should already be going where you want to run.",
    progression: "Add a turn before the touch so you receive on the half-turn.",
    solo: true,
  },
  {
    id: "fb_cone_weave", sport: "football", skill: "Dribbling", name: "Tight cone weave",
    positions: ["Winger", "Striker", "Central mid"],
    setup: "6–8 cones, 1m apart.",
    how: [
      "Weave through using both feet, small touches.",
      "Head up between touches — find a fixed point to look at each time.",
      "Explode out of the last cone for 5m.",
    ],
    reps: "8 runs, 45s rest",
    coaching: "Touch count beats speed. Small touches keep the ball inside your stride.",
    progression: "Narrow the gaps, or use only your weaker foot.",
    solo: true,
  },
  {
    id: "fb_1v1_moves", sport: "football", skill: "Dribbling", name: "1v1 move repetition",
    positions: ["Winger", "Striker"],
    setup: "A cone as a defender, 20m of space.",
    how: [
      "Attack the cone at pace, execute one move (step-over, chop, drag-back).",
      "Accelerate hard for 5m past it — the move is worthless without the burst.",
      "Rotate through three moves so you own more than one.",
    ],
    reps: "3 moves × 6 reps each side",
    coaching: "Sell it with your shoulders and eyes, not just your feet.",
    progression: "Add a real defender at 50%, then full pace.",
    solo: true,
  },
  {
    id: "fb_finishing_1touch", sport: "football", skill: "Shooting", name: "One-touch finishing",
    positions: ["Striker", "Winger", "Central mid"],
    setup: "A goal, a ball supply (server or rebounder), the penalty area.",
    how: [
      "Receive a rolled ball across the box and finish first time.",
      "Alternate sides so you strike with both feet.",
      "Place low and across the keeper rather than blasting it.",
    ],
    reps: "5 × 10 finishes",
    coaching: "Ankle locked, head over the ball. Placement beats power inside the box.",
    progression: "Server varies the pace and angle without telling you.",
    solo: false,
  },
  {
    id: "fb_shooting_edge", sport: "football", skill: "Shooting", name: "Strikes from the edge",
    positions: ["Central mid", "Winger", "Striker"],
    setup: "A goal and 6+ balls, 18–22m out.",
    how: [
      "Take a controlled touch out of your feet, then strike across the ball.",
      "Aim for the corners — pick one and commit before you touch it.",
      "Reset fully between strikes; this is a quality drill, not conditioning.",
    ],
    reps: "4 × 8 strikes",
    coaching: "Plant foot pointing at the target. Most bad strikes are bad plant feet.",
    progression: "Strike moving away from goal, or off the weaker foot only.",
    solo: true,
  },
  {
    id: "fb_crossing", sport: "football", skill: "Crossing", name: "Crossing off the dribble",
    positions: ["Winger", "Full back"],
    setup: "The flank, a goal, cones or targets in the box.",
    how: [
      "Drive 10m down the line, then cross first time off the run.",
      "Vary between the near post, the penalty spot and the back post.",
      "Whip it — the ball should be moving away from the keeper.",
    ],
    reps: "5 × 6 crosses each side",
    coaching: "Look up once, then cross to the picture — don't stare at the ball.",
    progression: "Add a defender pressing, forcing you to cross earlier.",
    solo: true,
  },
  {
    id: "fb_heading", sport: "football", skill: "Heading", name: "Attacking & defensive heading",
    positions: ["Centre back", "Striker"],
    setup: "A server, a ball, a goal or target area.",
    how: [
      "Attack the ball from a short run-up — meet it at the highest point.",
      "Defensive reps: head for height, distance and width.",
      "Attacking reps: head down, back across the keeper.",
    ],
    reps: "4 × 10 (alternate attacking/defensive)",
    coaching: "Attack the ball, don't wait for it. Eyes open, contact on the forehead.",
    progression: "Add a passive jumper to compete against.",
    solo: false,
  },
  {
    id: "fb_defending_1v1", sport: "football", skill: "Defending", name: "1v1 defending shape",
    positions: ["Centre back", "Full back", "Defensive mid"],
    setup: "A 10×15m channel, an attacker with a ball.",
    how: [
      "Close the ground quickly, then slow into a side-on stance.",
      "Show them onto their weaker foot and toward the touchline.",
      "Tackle only when the ball is away from their body.",
    ],
    reps: "8 × 30 seconds, alternating roles",
    coaching: "Get there fast, arrive slow. Diving in is how you get beaten.",
    progression: "Shrink the channel; give the attacker a two-touch limit.",
    solo: false,
  },
];

// --- Rugby -------------------------------------------------------------------

const RUGBY: SkillDrill[] = [
  {
    id: "rg_passing_wall", sport: "rugby", skill: "Passing", name: "Wall passing, both hands",
    positions: ["Scrum-half", "Fly-half", "Centre"],
    setup: "A wall and a rugby ball, 4–6m back.",
    how: [
      "Pass flat and hard off the left hand for 30 seconds, then the right.",
      "Hands finish pointing at the target every time.",
      "Catch early with fingers spread, pass without a wind-up.",
    ],
    reps: "6 × 30 seconds each hand",
    coaching: "Push the ball, don't throw it. The follow-through is the accuracy.",
    progression: "Step across as you pass so it's off-balance, like a real game.",
    solo: true,
  },
  {
    id: "rg_spin_pass", sport: "rugby", skill: "Passing", name: "Long spin pass",
    positions: ["Scrum-half", "Fly-half"],
    setup: "15–20m of space, a partner or a target.",
    how: [
      "Sweep the ball from the ground with both hands, no backlift.",
      "Rotate hips and shoulders through the pass.",
      "Finish with the top hand across your body.",
    ],
    reps: "5 × 12 each side",
    coaching: "Power comes from the hips, not the arms. Feet set before the sweep.",
    progression: "Add distance, then pass off one step, then off the deck under pressure.",
    solo: false,
  },
  {
    id: "rg_tackle_technique", sport: "rugby", skill: "Tackling", name: "Tackle technique on the bag",
    positions: ["Prop", "Hooker", "Lock", "Flanker", "No. 8", "Centre"],
    setup: "A tackle bag or shield and a partner to hold it.",
    how: [
      "Approach in a low, balanced stance — chest over toes.",
      "Cheek to cheek: head to the side, never across the front.",
      "Wrap both arms, drive with the legs, finish on top.",
    ],
    reps: "5 × 8 each shoulder",
    coaching: "Eyes open, head behind. Every safe tackle starts with head position.",
    progression: "Add a moving bag carrier, then a light live carry.",
    solo: false,
  },
  {
    id: "rg_breakdown", sport: "rugby", skill: "Contact", name: "Ruck arrival & clear-out",
    positions: ["Flanker", "No. 8", "Prop", "Hooker"],
    setup: "A ball on the ground, a shield holder over it.",
    how: [
      "Approach low, take the last step short and wide.",
      "Hit through the sternum with a leg drive, not a shoulder barge.",
      "Stay on your feet past the ball.",
    ],
    reps: "6 × 6 arrivals",
    coaching: "Lowest man wins. If you're standing tall you're a passenger.",
    progression: "Add a second defender so you have to pick which threat to clear.",
    solo: false,
  },
  {
    id: "rg_kicking", sport: "rugby", skill: "Kicking", name: "Territory & touch-finding",
    positions: ["Fly-half", "Full-back", "Scrum-half"],
    setup: "A pitch with touchlines, several balls.",
    how: [
      "Kick to find touch from varying positions and angles.",
      "Alternate spiral and end-over-end.",
      "Call your target before each kick and score yourself.",
    ],
    reps: "4 × 10 kicks",
    coaching: "Ball drop is everything — hold it out and let it fall, don't throw it down.",
    progression: "Kick under fatigue, or with a chaser closing you down.",
    solo: true,
  },
  {
    id: "rg_handling_pressure", sport: "rugby", skill: "Handling", name: "Handling under fatigue",
    positions: [],
    setup: "20m channel, a ball, a partner.",
    how: [
      "Sprint 20m, then immediately catch and pass 10 times.",
      "Hands out early — no chest catches.",
      "Repeat without full recovery.",
    ],
    reps: "6 rounds, 45s rest",
    coaching: "Skills fail before legs do. Practise them tired or you've only practised the easy version.",
    progression: "Add a defender, or make every pass off the weaker hand.",
    solo: false,
  },
];

// --- Basketball --------------------------------------------------------------

const BASKETBALL: SkillDrill[] = [
  {
    id: "bb_mikan", sport: "basketball", skill: "Finishing", name: "Mikan drill",
    positions: ["Centre", "Power forward", "Small forward"],
    setup: "A hoop and a ball.",
    how: [
      "Finish a right-hand layup off the left foot, rebound before it lands.",
      "Step across and finish left-handed off the right foot.",
      "Stay under the rim, continuous, no dribble.",
    ],
    reps: "4 × 20 makes",
    coaching: "Use the glass every time. Footwork, not hands, is what this trains.",
    progression: "Reverse Mikan, then add a contact pad on the finish.",
    solo: true,
  },
  {
    id: "bb_form_shooting", sport: "basketball", skill: "Shooting", name: "Form shooting",
    positions: [],
    setup: "A hoop and a ball. Start 1m out.",
    how: [
      "One hand, no guide hand, straight up and down.",
      "Hold the follow-through until the ball lands.",
      "Only step back once you've made five straight.",
    ],
    reps: "5 spots × 10 makes",
    coaching: "Elbow under the ball, wrist relaxed. Chase the feel, not the make.",
    progression: "Step back to the free-throw line, then the arc, keeping the same form.",
    solo: true,
  },
  {
    id: "bb_catch_shoot", sport: "basketball", skill: "Shooting", name: "Catch-and-shoot off the move",
    positions: ["Shooting guard", "Small forward", "Point guard"],
    setup: "A hoop, a rebounder or passer, several balls.",
    how: [
      "Sprint to a spot, catch with feet already set.",
      "Shoot in rhythm — the catch and the rise are one movement.",
      "Move to the next spot immediately.",
    ],
    reps: "5 spots × 8 shots",
    coaching: "Feet before hands. If you're setting your feet after the catch, you're late.",
    progression: "Add a closeout defender, then shoot off a relocation cut.",
    solo: false,
  },
  {
    id: "bb_two_ball", sport: "basketball", skill: "Ball handling", name: "Two-ball dribbling",
    positions: ["Point guard", "Shooting guard"],
    setup: "Two balls, any hard surface.",
    how: [
      "Dribble both simultaneously, then alternating.",
      "Progress to high-low, then crossovers with both.",
      "Head up throughout — pick a point on the wall.",
    ],
    reps: "6 × 45 seconds",
    coaching: "Fingertips, not palms. Pound the ball hard — soft dribbles get stolen.",
    progression: "Move while doing it, then add a stationary defender's hands.",
    solo: true,
  },
  {
    id: "bb_cone_handles", sport: "basketball", skill: "Ball handling", name: "Cone series",
    positions: ["Point guard", "Shooting guard", "Small forward"],
    setup: "5 cones in a line, 2m apart, one ball.",
    how: [
      "Attack each cone and execute one move: crossover, between-the-legs, behind-the-back.",
      "Change pace out of every move — slow into it, explode out.",
      "Finish the series with a layup or pull-up.",
    ],
    reps: "6 runs per move",
    coaching: "The move doesn't beat anyone; the change of pace does.",
    progression: "Add a live defender at the last cone.",
    solo: true,
  },
  {
    id: "bb_closeout", sport: "basketball", skill: "Defence", name: "Closeout & slide",
    positions: [],
    setup: "Half court, a partner with a ball.",
    how: [
      "Sprint at the shooter, chop your feet, hand high.",
      "Slide to contain the drive — no crossing the feet.",
      "Recover to help position and repeat.",
    ],
    reps: "8 × 30 seconds",
    coaching: "Short steps on the closeout. Arriving out of control is the same as not arriving.",
    progression: "Let the attacker choose shot or drive without telling you.",
    solo: false,
  },
  {
    id: "bb_rebound", sport: "basketball", skill: "Rebounding", name: "Box-out & pursue",
    positions: ["Centre", "Power forward"],
    setup: "A hoop, a ball, a partner.",
    how: [
      "On the shot, find your man and make contact first.",
      "Hold the seal, then go and get the ball at its highest point.",
      "Land wide and chin it.",
    ],
    reps: "5 × 8 reps",
    coaching: "Contact then ball. Everyone who jumps first loses the rebound.",
    progression: "Two attackers, so you have to pick and seal the right one.",
    solo: false,
  },
];

export const SKILL_DRILLS: SkillDrill[] = [...FOOTBALL, ...RUGBY, ...BASKETBALL];

/** Drills for a sport, optionally narrowed to a position. */
export function skillsForSport(sport: SportId, position?: string | null): SkillDrill[] {
  const all = SKILL_DRILLS.filter((d) => d.sport === sport);
  if (!position) return all;
  // A drill with no positions listed applies to everyone — a winger still needs
  // a first touch. Position-specific ones lead, so the list opens with the work
  // that matters most for them.
  const mine = all.filter((d) => d.positions.includes(position));
  const general = all.filter((d) => d.positions.length === 0);
  const rest = all.filter((d) => d.positions.length > 0 && !d.positions.includes(position));
  return [...mine, ...general, ...rest];
}

/** The skill headings available for a sport, in the order drills are listed. */
export function skillCategories(sport: SportId): string[] {
  const out: string[] = [];
  for (const d of SKILL_DRILLS) {
    if (d.sport === sport && !out.includes(d.skill)) out.push(d.skill);
  }
  return out;
}

/** Does this sport have technical drills at all? Gym and lifting don't. */
export function hasSkills(sport: SportId): boolean {
  return SKILL_DRILLS.some((d) => d.sport === sport);
}
