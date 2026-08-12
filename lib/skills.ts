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
import { positionList } from "./positions";

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
  /** Who you need. Most people train alone most of the time, and a drill
   *  needing a full session is useless on a Tuesday evening. */
  needs: "solo" | "partner" | "team";
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
    needs: "solo",
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
    needs: "team",
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
    needs: "solo",
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
    needs: "solo",
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
    needs: "solo",
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
    needs: "partner",
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
    needs: "solo",
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
    needs: "solo",
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
    needs: "partner",
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
    needs: "partner",
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
    needs: "solo",
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
    needs: "partner",
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
    needs: "partner",
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
    needs: "partner",
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
    needs: "solo",
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
    needs: "partner",
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
    needs: "solo",
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
    needs: "solo",
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
    needs: "partner",
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
    needs: "solo",
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
    needs: "solo",
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
    needs: "partner",
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
    needs: "partner",
  },
];

// --- Football, continued ------------------------------------------------------

const FOOTBALL_MORE: SkillDrill[] = [
  {
    id: "fb_weak_foot", sport: "football", skill: "First touch", name: "Weak-foot only session",
    positions: [],
    setup: "A ball, a wall, 20 minutes.",
    how: [
      "Everything with the weaker foot: passes, touches, turns, strikes.",
      "Start slow and accurate before adding pace.",
      "Finish with 20 weak-foot strikes at a target.",
    ],
    reps: "One session a week, 20 minutes",
    coaching: "It feels bad because it is bad — that's the point. Nobody improves a weak foot in the middle of a game.",
    progression: "Add pressure: a time limit, or a defender who knows you can only use one foot.",
    needs: "solo",
  },
  {
    id: "fb_long_passing", sport: "football", skill: "Passing", name: "Switching play",
    positions: ["Centre back", "Defensive mid", "Central mid"],
    setup: "30–40m of space, a partner or a target zone.",
    how: [
      "Take a positive first touch across your body, then drive it 30m.",
      "Strike through the bottom third with the laces for a driven ball.",
      "Alternate driven and lofted — different jobs, different techniques.",
    ],
    reps: "5 × 10 switches",
    coaching: "Open your body before the touch, not after. You can't switch play facing your own goal.",
    progression: "Hit a moving target, or switch off one touch.",
    needs: "partner",
  },
  {
    id: "fb_turning", sport: "football", skill: "First touch", name: "Receive and turn",
    positions: ["Central mid", "Striker", "Defensive mid"],
    setup: "Two cones 10m apart, a wall or server.",
    how: [
      "Receive with your back to the far cone, on the half-turn.",
      "Turn out of your feet in one movement and drive forward.",
      "Alternate turning left and right, and inside and outside foot.",
    ],
    reps: "6 × 45 seconds",
    coaching: "Check your shoulder BEFORE it arrives. The turn is decided by what you saw, not what you feel.",
    progression: "Add a passive defender touching your back so you have to feel where they are.",
    needs: "solo",
  },
  {
    id: "fb_pressing", sport: "football", skill: "Defending", name: "Pressing triggers",
    positions: ["Striker", "Winger", "Central mid"],
    setup: "A partner with a ball, 15m of space.",
    how: [
      "Partner plays a heavy touch or turns their back — that's your trigger.",
      "Sprint to press on the trigger only; jog otherwise.",
      "Arrive curved, cutting off the pass back.",
    ],
    reps: "10 × 15-second bursts",
    coaching: "Press the moment their head goes down. Pressing a player who's looking up just tires you out.",
    progression: "Two attackers, so you also have to choose which one to press.",
    needs: "partner",
  },
];

// --- Rugby, continued ---------------------------------------------------------

const RUGBY_MORE: SkillDrill[] = [
  {
    id: "rg_offload", sport: "rugby", skill: "Handling", name: "Offload out of contact",
    positions: ["Centre", "No. 8", "Flanker", "Wing"],
    setup: "A tackle shield, a partner running a support line.",
    how: [
      "Carry into the shield, stay square and keep your feet driving.",
      "Free one arm and pop the ball up to the support runner.",
      "Support runner takes it at pace, not standing still.",
    ],
    reps: "5 × 8 carries",
    coaching: "Win the contact first. An offload from a losing position is just a turnover with extra steps.",
    progression: "Two defenders, so the offload has to be late.",
    needs: "partner",
  },
  {
    id: "rg_lineout_throw", sport: "rugby", skill: "Lineout", name: "Lineout throwing accuracy",
    positions: ["Hooker"],
    setup: "A target at jumping height — a post marking or a partner.",
    how: [
      "Same stance and grip every throw; consistency beats power.",
      "Throw flat and fast to the target, following through at it.",
      "Call the number before each throw so you're practising under a decision.",
    ],
    reps: "5 × 12 throws to varied targets",
    coaching: "Feet and hips set the line. If your throw drifts, look at your feet before your hands.",
    progression: "Throw after a sprint, so you're doing it with a raised heart rate.",
    needs: "solo",
  },
  {
    id: "rg_scrum_position", sport: "rugby", skill: "Contact", name: "Scrum body position",
    positions: ["Prop", "Hooker", "Lock"],
    setup: "A scrum machine or a strong partner with a shield.",
    how: [
      "Set with a flat back, hips below shoulders, shins vertical.",
      "Bind tight, then drive on the call through the heels.",
      "Hold the shape for 5 seconds — the position is the skill.",
    ],
    reps: "6 × 5-second drives",
    coaching: "Spine in line, chin off the chest. A bent back in a scrum is how necks get hurt.",
    progression: "Add a delayed call so you have to hold the set position longer.",
    needs: "partner",
  },
  {
    id: "rg_kick_chase", sport: "rugby", skill: "Kicking", name: "Kick and chase",
    positions: ["Fly-half", "Wing", "Full-back"],
    setup: "Open pitch, a few balls.",
    how: [
      "Put up a contestable kick — height over distance.",
      "Chase hard and compete for it at the top of your jump.",
      "Land safely, on your feet, ball secured.",
    ],
    reps: "8 kick-and-chases",
    coaching: "Hang time buys your chasers metres. A flat kick is just giving them the ball.",
    progression: "Add a competitor jumping against you.",
    needs: "solo",
  },
];

// --- Basketball, continued ----------------------------------------------------

const BASKETBALL_MORE: SkillDrill[] = [
  {
    id: "bb_free_throws", sport: "basketball", skill: "Shooting", name: "Pressure free throws",
    positions: [],
    setup: "A hoop, a ball, the free-throw line.",
    how: [
      "Same routine every time — dribbles, breath, shot.",
      "Shoot in sets of two, as you would in a game.",
      "Sprint the width of the court between sets so you're shooting tired.",
    ],
    reps: "10 sets of 2",
    coaching: "The routine is the skill. Under pressure you fall back on it or you fall apart.",
    progression: "Set a target — miss and the set restarts.",
    needs: "solo",
  },
  {
    id: "bb_floater", sport: "basketball", skill: "Finishing", name: "Floater off two feet",
    positions: ["Point guard", "Shooting guard"],
    setup: "A hoop, a ball, the paint.",
    how: [
      "Attack from the wing, gather just inside the free-throw line.",
      "Rise off two feet and release high and soft over the front rim.",
      "Alternate both hands and both sides.",
    ],
    reps: "4 × 10 each side",
    coaching: "Release early and high. The floater exists to beat a shot-blocker, so shoot it before they're set.",
    progression: "Add a defender with a raised hand or a pad.",
    needs: "solo",
  },
  {
    id: "bb_pick_roll", sport: "basketball", skill: "Passing", name: "Pick and roll reads",
    positions: ["Point guard", "Centre", "Power forward"],
    setup: "Two players, a ball, a hoop.",
    how: [
      "Set the screen, hold it, then roll hard to the rim.",
      "Handler reads the defence: pull up, drive, or hit the roller.",
      "Run each read deliberately so all three are available.",
    ],
    reps: "3 reads × 8 reps each",
    coaching: "Come off the screen shoulder-to-shoulder. Space between you and the screener is where the defender gets through.",
    progression: "Add live defenders and let them choose the coverage.",
    needs: "partner",
  },
  {
    id: "bb_transition", sport: "basketball", skill: "Finishing", name: "Transition finishing",
    positions: ["Small forward", "Shooting guard", "Point guard"],
    setup: "Full court, a ball.",
    how: [
      "Sprint the length, finish at full speed off one foot.",
      "Alternate the side you attack from and the hand you finish with.",
      "Jog back, then go again — this is conditioning as much as skill.",
    ],
    reps: "10 lengths",
    coaching: "Decide your finish before the last two steps. Deciding late is what gets it blocked.",
    progression: "Add a trailing defender so you have to finish through contact.",
    needs: "solo",
  },
];

// --- Running ------------------------------------------------------------------

const RUNNING: SkillDrill[] = [
  {
    id: "rn_form_drills", sport: "running", skill: "Technique", name: "Running form drills",
    positions: [],
    setup: "30m of flat ground.",
    how: [
      "A-skips 30m: tall posture, drive the knee, snap the foot down.",
      "B-skips 30m: same, but paw the ground back underneath you.",
      "High knees, then heel flicks, 30m each. Walk back to recover.",
    ],
    reps: "2 rounds of the sequence, before every run",
    coaching: "Tall and relaxed. These are posture drills — doing them tense teaches you nothing.",
    progression: "Add a 30m stride-out after each drill to carry the position into running.",
    needs: "solo",
  },
  {
    id: "rn_cadence", sport: "running", skill: "Technique", name: "Cadence work",
    positions: ["5k/10k", "Half marathon", "Marathon"],
    setup: "A watch or metronome and an easy route.",
    how: [
      "Run 5 minutes at your normal cadence and count your steps.",
      "Run 5 minutes at roughly 5% more, taking shorter steps at the same pace.",
      "Alternate for the session.",
    ],
    reps: "6 × 5 minutes, alternating",
    coaching: "Shorter steps, not faster running. Overstriding is braking with every step.",
    progression: "Hold the higher cadence for longer blocks until it stops feeling deliberate.",
    needs: "solo",
  },
  {
    id: "rn_hill_technique", sport: "running", skill: "Technique", name: "Hill running technique",
    positions: ["Sprinter", "5k/10k", "800m/1500m"],
    setup: "A hill of 8–10% for 60m.",
    how: [
      "Uphill: shorten the stride, drive the arms, lean from the ankles not the waist.",
      "Walk down to recover fully.",
      "Focus on posture over speed — this is a technique session.",
    ],
    reps: "8 × 60m, walk-down recovery",
    coaching: "Lean from the ankles. Bending at the waist closes your hips and shortens your stride.",
    progression: "Add reps before adding gradient, and keep the last one as fast as the first.",
    needs: "solo",
  },
];

// --- Goalkeeping ---------------------------------------------------------------
//
// "Goalkeeper" was in the position list from the start and there was not one
// drill for it, so a keeper's program prescribed rondos and crossing practice —
// technical work for the ten players who aren't them. Every drill here is
// position-locked, so it only ever reaches a keeper.

const GOALKEEPING: SkillDrill[] = [
  {
    id: "gk_set_position", sport: "football", skill: "Set position", name: "Set-and-save rhythm",
    positions: ["Goalkeeper"],
    setup: "A wall and a ball, 6–8m back.",
    how: [
      "Throw the ball against the wall and get set before it comes back.",
      "Feet land shoulder-width, weight on the balls of the feet, hands up in front of the chest.",
      "Save, reset to your starting mark, repeat immediately.",
    ],
    reps: "5 × 45 seconds",
    coaching: "Be still at the moment of contact. A keeper moving as the ball is struck is a keeper going the wrong way.",
    progression: "Throw harder and closer so you have less time to set.",
    needs: "solo",
  },
  {
    id: "gk_low_hands", sport: "football", skill: "Handling", name: "Low-hand collapse saves",
    positions: ["Goalkeeper"],
    setup: "A wall, a ball, soft ground if you can.",
    how: [
      "Roll the ball hard into the wall low so it returns along the floor.",
      "Collapse sideways, bottom hand behind the ball, top hand over it.",
      "Trap it against the ground and pull it into your chest before you get up.",
    ],
    reps: "6 × 6 each side",
    coaching: "The bottom hand is the barrier — if it's beside the ball rather than behind it, the ball goes through you.",
    progression: "Start standing rather than crouched, so you have to drop into it.",
    needs: "solo",
  },
  {
    id: "gk_high_ball", sport: "football", skill: "Crossing", name: "High-ball claiming",
    positions: ["Goalkeeper"],
    setup: "A ball and someone to serve, or a wall you can chip against.",
    how: [
      "Attack the ball at its highest point, taking off from one leg.",
      "Lead knee up — it makes room and protects you.",
      "Catch in front of your head, fingers spread behind the ball, then bring it down.",
    ],
    reps: "4 × 8 claims",
    coaching: "Call it loud and early. Half of claiming a cross is the defenders knowing you're coming.",
    progression: "Add a passive body in front of you so you have to come through traffic.",
    needs: "partner",
  },
  {
    id: "gk_footwork_gates", sport: "football", skill: "Footwork", name: "Across-goal footwork",
    positions: ["Goalkeeper"],
    setup: "Four cones two metres apart across your goal line.",
    how: [
      "Side-step between the cones staying square to the pitch — never cross your feet.",
      "On a call or a clap, set and take an imaginary save.",
      "Recover to the middle cone each time.",
    ],
    reps: "6 × 30 seconds",
    coaching: "Stay tall. Keepers who drop their hips shuffling can't push off to save.",
    progression: "Add a ball thrown to a random side as you finish the shuffle.",
    needs: "solo",
  },
  {
    id: "gk_reaction_wall", sport: "football", skill: "Reactions", name: "Rebound reaction saves",
    positions: ["Goalkeeper"],
    setup: "A wall with an uneven surface if possible, and a ball.",
    how: [
      "Throw the ball hard at the wall from close range.",
      "React to whatever comes back — you won't know the angle.",
      "Parry wide or catch, whichever the ball allows.",
    ],
    reps: "5 × 10 throws",
    coaching: "Hands travel to the ball on the shortest path. Any loop and you're late.",
    progression: "Move closer to cut the reaction time, or use a rebounder for a truly random return.",
    needs: "solo",
  },
  {
    id: "gk_distribution_targets", sport: "football", skill: "Distribution", name: "Distribution to targets",
    positions: ["Goalkeeper"],
    setup: "Cones or markers at 15m, 30m and 45m, and a few balls.",
    how: [
      "Roll to the near target, drive to the middle one, kick long to the far one.",
      "Cycle through all three so you're switching technique every rep.",
      "Take each one as if you've just made a save — move, then release.",
    ],
    reps: "4 × 9 (3 to each target)",
    coaching: "Distribution starts attacks. Pick the target before you gather, not after.",
    progression: "Add a time limit — release within three seconds of collecting.",
    needs: "solo",
  },
  {
    id: "gk_one_v_one_spread", sport: "football", skill: "1v1", name: "1v1 spread technique",
    positions: ["Goalkeeper"],
    setup: "A ball and an attacker, or cones to run onto.",
    how: [
      "Close the distance fast while the ball is away from the attacker's foot.",
      "Stop and get set as they touch it — never dive early.",
      "Spread big: hands and feet wide, make yourself the largest barrier you can.",
    ],
    reps: "4 × 6",
    coaching: "Patience beats bravery. The keeper who goes to ground first loses the 1v1.",
    progression: "Let the attacker choose to shoot early or take you on.",
    needs: "partner",
  },
];

// --- Weightlifting -------------------------------------------------------------
//
// Technique IS the skill in the barbell sports, and there wasn't a single drill
// for it. These are the standard technical exercises — positions grooved light,
// so they hold when the bar gets heavy.

const WEIGHTLIFTING: SkillDrill[] = [
  {
    id: "wl_tempo_squat", sport: "weightlifting", skill: "Squat technique", name: "Tempo squats",
    positions: ["Powerlifting", "Olympic lifting", "General strength"],
    setup: "An empty bar or about 50% of your working weight.",
    how: [
      "Five seconds down, two seconds paused at the bottom, then stand normally.",
      "Keep the bar over mid-foot the whole way — film from the side to check.",
      "Brace before you unrack, not on the way down.",
    ],
    reps: "4 × 3",
    coaching: "The pause removes the bounce. Whatever position you're in at the bottom is the position you actually own.",
    progression: "Add weight only once all reps hold position, then shorten the pause.",
    needs: "solo",
  },
  {
    id: "wl_pause_bench", sport: "weightlifting", skill: "Bench technique", name: "Paused bench",
    positions: ["Powerlifting", "General strength"],
    setup: "A bar you can control for triples, and a rack with safeties.",
    how: [
      "Lower to the chest and hold for a full two seconds, still and tight.",
      "Keep the shoulder blades pinned back and down throughout.",
      "Press without letting the bar drift toward your face.",
    ],
    reps: "5 × 3",
    coaching: "Stay tight in the pause. Relaxing at the bottom is where both the press and the shoulder go wrong.",
    progression: "Lengthen the pause to three seconds before adding weight.",
    needs: "solo",
  },
  {
    id: "wl_deadlift_setup", sport: "weightlifting", skill: "Deadlift technique", name: "Setup and wedge",
    positions: ["Powerlifting", "Olympic lifting", "General strength"],
    setup: "A loaded bar at about 60%.",
    how: [
      "Take your stance, grip, then pull your chest up to take the slack out of the bar.",
      "Hold that wedged position for two seconds before the bar leaves the floor.",
      "Lift, then reset completely — no touch-and-go.",
    ],
    reps: "6 × 2",
    coaching: "Hear the bar click into the plates before you pull. Yanking a loose bar is how backs get hurt.",
    progression: "Add weight once the setup is identical on every rep.",
    needs: "solo",
  },
  {
    id: "wl_overhead_position", sport: "weightlifting", skill: "Overhead position", name: "Overhead holds",
    positions: ["Olympic lifting", "General strength"],
    setup: "An empty bar or a broomstick.",
    how: [
      "Press or snatch the bar overhead with a wide grip.",
      "Lock the elbows, push the head slightly through, ribs down.",
      "Hold, then walk ten steps without letting the bar drift forward.",
    ],
    reps: "5 × 20 seconds",
    coaching: "If the bar sits in front of your ears you're holding it with your shoulders instead of your skeleton.",
    progression: "Add a light load, or hold in a quarter squat.",
    needs: "solo",
  },
  {
    id: "wl_clean_pull_position", sport: "weightlifting", skill: "Pull technique", name: "Halting clean pull",
    positions: ["Olympic lifting", "General strength"],
    setup: "A bar at roughly 70% of your clean.",
    how: [
      "Pull to just above the knee and stop dead, shoulders still over the bar.",
      "Hold for two seconds, feeling the weight in the middle of the foot.",
      "Finish the pull with a hard hip extension, or lower and reset.",
    ],
    reps: "5 × 3",
    coaching: "Shoulders in front of the bar at the knee. Let them drift back and the bar swings away from you.",
    progression: "Raise the halt position, or take the pause out and go straight through.",
    needs: "solo",
  },
  {
    id: "wl_bracing", sport: "weightlifting", skill: "Bracing", name: "Breathe and brace practice",
    positions: ["Powerlifting", "Olympic lifting", "General strength"],
    setup: "Nothing, or a light belt.",
    how: [
      "Breathe into your stomach and sides, not your chest.",
      "Brace as if about to take a punch, without letting the air out.",
      "Hold the brace for ten seconds, then breathe out and repeat.",
    ],
    reps: "3 × 5 breaths",
    coaching: "Pressure goes 360° around the trunk. Sucking the stomach in is the opposite of a brace.",
    progression: "Practise it under a light bar, then at your working weight.",
    needs: "solo",
  },
];

// --- Gym -----------------------------------------------------------------------
//
// A gym athlete's "skill" is execution: the difference between doing ten reps
// and doing ten reps that count.

const GYM: SkillDrill[] = [
  {
    id: "gym_tempo_control", sport: "gym", skill: "Execution", name: "Tempo sets",
    positions: ["Hypertrophy", "Strength", "General fitness"],
    setup: "Any machine or dumbbell exercise, roughly half your normal weight.",
    how: [
      "Three seconds lowering, one second pause, then lift normally.",
      "No swinging, no bouncing out of the bottom.",
      "Stop the set the moment the tempo breaks.",
    ],
    reps: "3 × 8",
    coaching: "Muscle responds to tension, not to weight moved. Slowing down is how you add tension without adding load.",
    progression: "Extend the lowering to five seconds before adding weight.",
    needs: "solo",
  },
  {
    id: "gym_full_range", sport: "gym", skill: "Execution", name: "Full-range reps",
    positions: ["Hypertrophy", "Strength", "General fitness"],
    setup: "Your usual exercise, 20% lighter than normal.",
    how: [
      "Take every rep to the deepest position you can control.",
      "Pause for a full second in the stretched position.",
      "Finish each rep completely — full lockout or full contraction.",
    ],
    reps: "3 × 10",
    coaching: "Half reps with a big weight build less than full reps with a smaller one. The stretched position does most of the work.",
    progression: "Return to your normal weight once full range holds for every rep.",
    needs: "solo",
  },
  {
    id: "gym_unilateral_check", sport: "gym", skill: "Balance", name: "Single-side check",
    positions: ["Hypertrophy", "Strength", "General fitness"],
    setup: "Dumbbells and a bench.",
    how: [
      "Do your press or row one arm at a time.",
      "Match the reps to whichever side is weaker — the strong side stops when the weak one does.",
      "Note the difference so you can watch it close over the block.",
    ],
    reps: "3 × 10 each side",
    coaching: "Barbells hide side-to-side differences by letting the strong side take over. Dumbbells can't.",
    progression: "Add a rep to the weaker side each week until they match.",
    needs: "solo",
  },
  {
    id: "gym_rest_discipline", sport: "gym", skill: "Execution", name: "Timed rest",
    positions: ["Hypertrophy", "Strength", "General fitness"],
    setup: "A timer, and your normal session.",
    how: [
      "Start the timer the moment a set ends.",
      "Hold the prescribed rest exactly — don't cut it short, don't drift past it.",
      "Log the weight and reps while you wait.",
    ],
    reps: "One full session",
    coaching: "Rest is part of the prescription. Two minutes for strength, sixty to ninety seconds for muscle — a phone scroll makes it four and changes what you trained.",
    progression: "Keep the rest fixed and try to beat last week's reps at the same weight.",
    needs: "solo",
  },
  {
    id: "gym_form_film", sport: "gym", skill: "Technique", name: "Film your working set",
    positions: ["Hypertrophy", "Strength", "General fitness"],
    setup: "A phone propped side-on.",
    how: [
      "Film one working set of your main lift from the side.",
      "Watch it back and pick one thing only — bar path, depth, or knee position.",
      "Fix that one thing on the next set.",
    ],
    reps: "1 set per session",
    coaching: "How a lift feels and how it looks are different things, and only one of them is true.",
    progression: "Compare this week's clip to last month's rather than to how it felt.",
    needs: "solo",
  },
];

// --- Running, continued ---------------------------------------------------------

const RUNNING_MORE: SkillDrill[] = [
  {
    id: "rn_strides", sport: "running", skill: "Speed", name: "Strides",
    positions: ["Sprinter", "800m/1500m", "5k/10k", "Half marathon", "Marathon"],
    setup: "80–100m of flat ground, after an easy run.",
    how: [
      "Build smoothly to about 95% over the first 40m.",
      "Hold relaxed at that speed for 20m — face loose, shoulders down.",
      "Decelerate gradually over the last stretch. Walk back.",
    ],
    reps: "6 × 80m, walk-back recovery",
    coaching: "Fast and relaxed, not fast and straining. Clenching your jaw slows you down.",
    progression: "Add a stride or two, or put them on a slight downhill for overspeed.",
    needs: "solo",
  },
  {
    id: "rn_arm_drive", sport: "running", skill: "Technique", name: "Arm drive isolation",
    positions: ["Sprinter", "800m/1500m"],
    setup: "Anywhere you can stand.",
    how: [
      "Stand tall and drive the arms as if sprinting, elbows at about 90°.",
      "Hands travel from hip pocket to cheek, not across the body.",
      "Build to maximum speed for the last five seconds.",
    ],
    reps: "5 × 15 seconds",
    coaching: "The legs follow the arms. Arms crossing your midline turns into a rotating torso and wasted stride.",
    progression: "Do it seated so the legs can't help, then standing again.",
    needs: "solo",
  },
  {
    id: "rn_pacing_ladder", sport: "running", skill: "Pacing", name: "Pacing ladder",
    positions: ["800m/1500m", "5k/10k", "Half marathon", "Marathon"],
    setup: "A track or a measured route, and a watch.",
    how: [
      "Run 400m at marathon pace, then 400m at half pace, then 400m at 10k pace.",
      "Check the watch only at the end of each rep, not during it.",
      "Note how far off you were — that gap is the skill.",
    ],
    reps: "3 rounds, 90 seconds between",
    coaching: "Pacing is a feel you build, not a number you read. Guess first, verify after.",
    progression: "Cover the watch entirely and estimate each split before looking.",
    needs: "solo",
  },
  {
    id: "rn_downhill_control", sport: "running", skill: "Technique", name: "Downhill control",
    positions: ["5k/10k", "Half marathon", "Marathon"],
    setup: "A gentle 4–6% descent, 100m long.",
    how: [
      "Lean very slightly forward from the ankles, not the waist.",
      "Increase your cadence rather than reaching with your stride.",
      "Land underneath yourself, quiet feet.",
    ],
    reps: "6 × 100m, jog back",
    coaching: "Reaching downhill brakes on every step. That's what wrecks quads late in a race.",
    progression: "Slightly steeper, or hold the control for longer descents.",
    needs: "solo",
  },
  {
    id: "rn_breathing_rhythm", sport: "running", skill: "Breathing", name: "Breathing rhythm",
    positions: ["800m/1500m", "5k/10k", "Half marathon", "Marathon"],
    setup: "An easy run.",
    how: [
      "Settle into breathing in for three steps and out for two.",
      "Hold that pattern for five minutes, then switch to two-in two-out at a harder effort.",
      "Return to easy and re-establish the three-two.",
    ],
    reps: "3 × 5 minutes",
    coaching: "An odd-numbered pattern alternates which foot you exhale on, so one side doesn't take every impact at full exhale.",
    progression: "Hold the rhythm at progressively harder efforts.",
    needs: "solo",
  },
];

/**
 * RUGBY FORWARDS HAD NOTHING. Measured, not guessed: `skillForSession` filters
 * to solo drills — a session has to be doable on the evening it lands, and a
 * drill needing three team-mates is a drill that gets skipped — and a prop, a
 * lock, a flanker and a No. 8 had ZERO solo drills between them. Every one of
 * those four positions got `null` for every session of every block, so four of
 * the ten rugby positions had no technical work in their programme at all.
 *
 * The cause is honest enough: forward play is contact play, and contact needs
 * someone to hit. But most of what makes a good forward is not the collision —
 * it is body height, foot placement, ball presentation and the grip on a lift,
 * all of which are trainable alone against a wall, a bag or the floor.
 */
const RUGBY_FORWARDS: SkillDrill[] = [
  {
    id: "rg_scrum_wall_iso", sport: "rugby", skill: "Scrummaging", name: "Scrum shape against a wall",
    positions: ["Prop", "Hooker", "Lock"],
    setup: "A wall. Nothing else.",
    how: [
      "Set your feet, hips below shoulders, spine long — chin off the chest, eyes up.",
      "Push into the wall through the balls of your feet and hold the shape.",
      "Hold 20 seconds, then step out and reset from scratch rather than sagging.",
    ],
    reps: "6 × 20 seconds, full reset between",
    coaching: "The push comes from the hips and the floor, not the arms. If your back rounds the set is over — stop and rebuild it.",
    progression: "Add a partner or a scrum machine for real resistance, or hold 30 seconds with a band round the knees.",
    needs: "solo",
  },
  {
    id: "rg_carry_footwork", sport: "rugby", skill: "Carrying", name: "Footwork before contact",
    positions: ["Prop", "Hooker", "Lock", "Flanker", "No. 8", "Centre"],
    setup: "A ball and four cones in a 10m channel.",
    how: [
      "Carry the ball in two hands and accelerate at the first cone.",
      "One hard step off your outside foot to change the angle, then square up again.",
      "Finish through the last cone at full pace with the ball tucked and shoulder leading.",
    ],
    reps: "10 runs, alternating which foot you step off",
    coaching: "The step is to move the DEFENDER, not to avoid contact — you should still arrive on your terms, going forward.",
    progression: "Shrink the channel, or have someone call the side late so you react rather than rehearse.",
    needs: "solo",
  },
  {
    id: "rg_ball_presentation", sport: "rugby", skill: "Contact", name: "Ball presentation on the floor",
    positions: ["Prop", "Hooker", "Lock", "Flanker", "No. 8", "Centre", "Wing"],
    setup: "A ball and a patch of grass.",
    how: [
      "From standing, fall to the ground as if tackled, landing on your side, not your front.",
      "Turn to face your own posts and place the ball at full arm stretch back towards them.",
      "Roll away and get to your feet in one movement.",
    ],
    reps: "3 × 8 presentations, alternating the shoulder you land on",
    coaching: "Long arms and a clean roll-away. Presenting short is what turns your carry into their turnover.",
    progression: "Do it fatigued at the end of a session, or start from a jog rather than standing.",
    needs: "solo",
  },
  {
    id: "rg_jackal_height", sport: "rugby", skill: "Breakdown", name: "Jackal position holds",
    positions: ["Flanker", "No. 8", "Hooker", "Prop"],
    setup: "A ball on the ground.",
    how: [
      "Step over the ball with a wide, braced stance and grip it low.",
      "Drop your hips, straighten your back and take the weight through your legs.",
      "Hold, then drive up to standing with the ball still in your hands.",
    ],
    reps: "8 × 10-second holds",
    coaching: "Supporting your own bodyweight over the ball is the whole skill — if your hands or head are taking the load you will be cleared out.",
    progression: "Add a band round your waist pulling you sideways, or a partner applying pressure.",
    needs: "solo",
  },
  {
    id: "rg_lineout_lift_setup", sport: "rugby", skill: "Lineout", name: "Lifting grip and dip",
    positions: ["Prop", "Hooker", "Lock", "Flanker"],
    setup: "A wall, or a light weight to hold at hip height.",
    how: [
      "Set your grip at hip height, thumbs in, elbows tight to your ribs.",
      "Dip by bending the knees only — the back stays vertical and the grip stays put.",
      "Drive up fast to full extension and lock out overhead.",
    ],
    reps: "5 × 6 dips and drives",
    coaching: "The dip is short and sharp. A slow dip is what makes a jumper mistime the jump, and it is nearly always the lifter's fault.",
    progression: "Hold a plate or sandbag, then move to lifting a jumper with a spotter behind.",
    needs: "solo",
  },
  {
    id: "rg_lineout_jump", sport: "rugby", skill: "Lineout", name: "Lineout jump timing",
    positions: ["Lock", "Flanker", "No. 8", "Hooker"],
    setup: "Space to jump, and a mark on a wall to reach for.",
    how: [
      "Stand square, hands at chest height, weight on the balls of your feet.",
      "On a count of three, dip and drive straight up — no step, no swing.",
      "Reach with both hands to the same point every rep.",
    ],
    reps: "6 × 5 jumps, with a count called differently each set",
    coaching: "Vertical, not forward. A jumper who travels is a jumper the lifters cannot follow.",
    progression: "Have someone call the count at random, or jump immediately after a short shuttle so you arrive already moving.",
    needs: "solo",
  },
  {
    id: "rg_pop_pass", sport: "rugby", skill: "Passing", name: "Tip-on passing, both sides",
    positions: ["Prop", "Hooker", "Lock", "No. 8", "Flanker"],
    setup: "A wall and a ball. 3–4m back.",
    how: [
      "Catch the ball early, in front of your chest, with both hands.",
      "Pop it straight back against the wall with a short push — no wind-up, no spin.",
      "Alternate which shoulder you turn towards on every rep.",
    ],
    reps: "5 × 45 seconds",
    coaching: "Hands out early and pass off the catch. A forward's pass is short and instant; the wind-up is what gets it intercepted.",
    progression: "Move closer, or take a step forward into every pass so you are moving when you release.",
    needs: "solo",
  },
  {
    id: "rg_pick_and_go", sport: "rugby", skill: "Carrying", name: "Pick and go from the base",
    positions: ["No. 8", "Scrum-half", "Flanker", "Prop", "Hooker"],
    setup: "A ball and two cones 2m apart.",
    how: [
      "Ball on the floor between the cones. Approach, pick it up with a flat back and both hands.",
      "Drive two hard steps forward, low, ball tucked to the outside arm.",
      "Go to ground, present, get up and repeat from the other side.",
    ],
    reps: "4 × 6 picks, alternating sides",
    coaching: "Pick and GO in one movement. The pause between picking up and driving is where the defence gets set.",
    progression: "Add a weighted vest, or make the last two of each set a full carry to the ground with a presentation.",
    needs: "solo",
  },
];

/**
 * The backs were thin rather than absent — a wing had one solo drill, repeated
 * in every session of a four-week block.
 */
const RUGBY_BACKS: SkillDrill[] = [
  {
    id: "rg_high_ball", sport: "rugby", skill: "Handling", name: "High-ball catch",
    positions: ["Full-back", "Wing", "Fly-half", "Centre"],
    setup: "A ball and open space. A wall to throw against helps.",
    how: [
      "Throw the ball high above you and track it up with your eyes the whole way.",
      "Take it at full stretch above your head, arms out, and pull it into your chest as you land.",
      "Land on both feet, balanced, ready to run.",
    ],
    reps: "3 × 10 catches, half of them taken on the move",
    coaching: "Take it at the top of the reach, not on your chest — the extra foot of height is what stops the contest.",
    progression: "Turn away and catch off a late look, or take off one foot with a knee raised into the contest.",
    needs: "solo",
  },
  {
    id: "rg_sidestep", sport: "rugby", skill: "Evasion", name: "Sidestep and swerve reps",
    positions: ["Wing", "Full-back", "Centre", "Scrum-half", "Fly-half"],
    setup: "A ball and five cones over 20m.",
    how: [
      "Run at each cone, sink your hips and step hard off the outside foot.",
      "Accelerate for three steps out of every step before setting up the next.",
      "Alternate the direction at each cone.",
    ],
    reps: "6 runs of 5 cones",
    coaching: "The acceleration out is the point. A pretty step you jog away from beats nobody.",
    progression: "Do it at full pace with a defender shadowing, or add a catch before the first cone.",
    needs: "solo",
  },
  {
    id: "rg_sh_clearing_pass", sport: "rugby", skill: "Passing", name: "Clearing pass off the floor",
    positions: ["Scrum-half"],
    setup: "A ball, a wall or target, and a marked spot on the floor.",
    how: [
      "Ball on the floor. Step past it so your back foot is level with it.",
      "Sweep it away in one movement, no lift and no backswing, driving off the back leg.",
      "Hit the same target every time, then turn round and do the other side.",
    ],
    reps: "5 × 10 passes each side",
    coaching: "No pick-up. The ball should leave the ground on its way to the target, not on its way to your hands.",
    progression: "Move the target further out, or take one step to the ball first so you are moving when you arrive.",
    needs: "solo",
  },
  {
    id: "rg_place_kick", sport: "rugby", skill: "Kicking", name: "Place-kicking routine",
    positions: ["Fly-half", "Full-back", "Wing", "Centre"],
    setup: "A ball, a tee, and posts — or any target at distance.",
    how: [
      "Build the same routine every time: place, steps back, steps across, breathe, look, strike.",
      "Strike through the bottom third with the instep, head down through contact.",
      "Kick from one spot until you have three in a row, then move.",
    ],
    reps: "20 kicks, from five positions across the pitch",
    coaching: "The routine is the skill. Under pressure you do not rise to the occasion — you fall back on the routine you have grooved.",
    progression: "Kick tired at the end of a session, or set a target you must hit before you are allowed to stop.",
    needs: "solo",
  },
];

/**
 * DEFENDERS AND HOLDING MIDFIELDERS were the football gap. A centre back had
 * three solo drills — two of which were "pass against a wall" and "use your
 * weak foot" — so the position whose guides talk about heading, aerial timing
 * and defending the box practised none of it, while a winger had six.
 */
const FOOTBALL_POSITIONS: SkillDrill[] = [
  {
    id: "fb_jockey_footwork", sport: "football", skill: "Defending", name: "Jockeying footwork",
    positions: ["Centre back", "Full back", "Defensive mid"],
    setup: "Four cones in a 5m square.",
    how: [
      "Get into a side-on stance, knees bent, weight on the balls of your feet.",
      "Shuffle between the cones without crossing your feet, staying side-on throughout.",
      "On the last cone, turn and sprint 5m as if the attacker has knocked it past you.",
    ],
    reps: "8 × 20 seconds, 40 seconds rest",
    coaching: "Side-on and patient. A defender who squares up has already committed, and the first touch past you decides the duel.",
    progression: "Have someone point the direction late, or add a ball to shepherd rather than a cone to touch.",
    needs: "solo",
  },
  {
    id: "fb_heading_solo", sport: "football", skill: "Heading", name: "Heading technique, self-served",
    positions: ["Centre back", "Striker", "Defensive mid"],
    setup: "A ball and a wall, or a ball you can throw high.",
    how: [
      "Throw the ball up above head height and attack it — meet the ball, do not wait for it.",
      "Contact with the forehead, eyes open, neck firm, and head THROUGH the line of the ball.",
      "Defensive reps: head it high and long. Attacking reps: head it down.",
    ],
    reps: "4 × 10 headers, alternating defensive and attacking contact",
    coaching: "You attack the ball; it never attacks you. Meeting it a foot earlier is the whole difference in a duel.",
    progression: "Jump off one foot from a short run-up, or have a partner serve from an angle.",
    needs: "solo",
  },
  {
    id: "fb_range_passing", sport: "football", skill: "Passing", name: "Switching the play",
    positions: ["Centre back", "Full back", "Defensive mid", "Central mid"],
    setup: "A ball and 40m of space, with a target — a goal, a tree, a cone.",
    how: [
      "Take a settling touch across your body, then strike through the bottom of the ball with your laces.",
      "Aim to land it in a 5m target zone, not just to hit it far.",
      "Alternate feet every five, and half of them off one touch.",
    ],
    reps: "5 × 10 passes",
    coaching: "The settling touch decides the pass. If it is under your feet you will scoop it; set it half a metre across yourself.",
    progression: "Reduce to one touch entirely, or aim for a partner's chest rather than a zone.",
    needs: "solo",
  },
  {
    id: "fb_clearance", sport: "football", skill: "Defending", name: "First-time clearing",
    positions: ["Centre back", "Full back"],
    setup: "A ball, a wall to rebound off, and space in front of you.",
    how: [
      "Play the ball against the wall so it returns at an awkward height.",
      "Clear it first time — high, long and wide, never straight back down the middle.",
      "Reset your feet between every rep rather than standing still.",
    ],
    reps: "4 × 12 clearances, both feet",
    coaching: "Height, distance, width — in that order. A clearance that stays in the box is a second chance for them.",
    progression: "Take them under pressure from a closing partner, or off a bouncing ball rather than a rolling one.",
    needs: "solo",
  },
  {
    id: "fb_overlap_run", sport: "football", skill: "Crossing", name: "Overlap and deliver",
    positions: ["Full back", "Winger"],
    setup: "A ball, three cones down a wing, and a target in the box.",
    how: [
      "Start with the ball, play it wide to a cone, then sprint the overlap outside it.",
      "Collect, take one touch to set, and cross first-time on the second.",
      "Alternate between a whipped near-post ball and a cut-back.",
    ],
    reps: "12 crosses, 6 of each type",
    coaching: "The sprint is the drill. Crossing fresh teaches you nothing about crossing on 70 minutes and a lung-buster.",
    progression: "Time the run against a stopwatch, or cross first-time with no setting touch.",
    needs: "solo",
  },
  {
    id: "fb_scan_receive", sport: "football", skill: "First touch", name: "Scan, then receive",
    positions: ["Defensive mid", "Central mid", "Centre back"],
    setup: "A wall, a ball, and four numbered cones around you.",
    how: [
      "Before every pass into the wall, look over both shoulders — a real turn of the head, not a glance.",
      "Take the return with the foot furthest from the cone you last looked at.",
      "Move the ball to that cone in two touches.",
    ],
    reps: "6 × 45 seconds",
    coaching: "Scan BEFORE the ball arrives, not while it does. Midfielders who look late take a touch that solves nothing.",
    progression: "Have someone call a cone number as the ball leaves the wall.",
    needs: "solo",
  },
  {
    id: "fb_tight_angle_finish", sport: "football", skill: "Shooting", name: "Finishing from tight angles",
    positions: ["Striker", "Winger"],
    setup: "A goal or two cones as a target, and a ball, from wide of the post.",
    how: [
      "Start wide, take one touch across yourself to open the angle.",
      "Aim across the keeper for the far post, low and hard.",
      "Half the reps from each side, using the foot nearest the goal-line.",
    ],
    reps: "4 × 10 finishes, both sides",
    coaching: "The opening touch does the work. From a tight angle you are not beating the keeper with power, you are beating them with the angle you made.",
    progression: "Finish first-time off a rolling ball, or start with a sprint to arrive already tired.",
    needs: "solo",
  },
  {
    id: "fb_gk_goal_kick", sport: "football", skill: "Distribution", name: "Goal-kick range and accuracy",
    positions: ["Goalkeeper"],
    setup: "A ball, and targets at 30m, 45m and the halfway line.",
    how: [
      "Same approach every kick: two steps, plant, strike through the bottom of the ball.",
      "Work through the three distances in order, three balls at each.",
      "Then repeat with the weaker foot at the shortest distance only.",
    ],
    reps: "27 kicks, plus 9 weak-footed",
    coaching: "Height and distance come from the plant foot, not the swing. Pointing it at the target is most of the accuracy.",
    progression: "Add a target zone rather than a distance, or kick into the wind and adjust.",
    needs: "solo",
  },
];

/**
 * BIG MEN AND GUARDS. A power forward and a centre had three solo drills each —
 * one of which was free throws — while a point guard and a shooting guard had
 * the same six as each other, so the app could not tell those two apart either.
 */
const BASKETBALL_POSITIONS: SkillDrill[] = [
  {
    id: "bb_post_footwork", sport: "basketball", skill: "Post play", name: "Drop step and jump hook",
    positions: ["Centre", "Power forward"],
    setup: "A hoop and a ball. A chair or cone as a marker on the block.",
    how: [
      "Start with your back to the basket on the block, ball held high and tight.",
      "Drop step baseline, one dribble, finish with a jump hook off the inside foot.",
      "Repeat over the other shoulder with the middle drop step.",
    ],
    reps: "5 × 8 each shoulder",
    coaching: "Ball above your shoulders the whole way. Bringing it down in the post is how guards strip you.",
    progression: "Add a defender's arm with a pad, or make the read off which way the chair is placed.",
    needs: "solo",
  },
  {
    id: "bb_rebound_taps", sport: "basketball", skill: "Rebounding", name: "Board taps",
    positions: ["Centre", "Power forward", "Small forward"],
    setup: "A hoop and a ball.",
    how: [
      "Throw the ball off the backboard and catch it at the highest point you can reach.",
      "Land balanced, chin the ball, then go straight back up off two feet.",
      "Keep it continuous — the ball should not touch the floor.",
    ],
    reps: "6 × 10 taps",
    coaching: "Catch it high and land wide. Rebounds are lost by the player who lands narrow and gets pushed off balance.",
    progression: "Alternate the side of the board, or finish every set with a putback off the glass.",
    needs: "solo",
  },
  {
    id: "bb_outlet", sport: "basketball", skill: "Passing", name: "Rebound and outlet",
    positions: ["Centre", "Power forward"],
    setup: "A hoop, a ball, and a wall or target to the side.",
    how: [
      "Take the ball off the board, land, and pivot to face the sideline in one movement.",
      "Throw a two-handed overhead outlet to the target.",
      "Sprint three steps up the floor after the pass before resetting.",
    ],
    reps: "5 × 8 outlets, alternating pivot foot",
    coaching: "The turn is the speed. A big who rebounds and then looks has already lost the break.",
    progression: "Move the target further up the floor, or throw it off one foot as you land.",
    needs: "solo",
  },
  {
    id: "bb_pullup", sport: "basketball", skill: "Shooting", name: "Pull-up off the dribble",
    positions: ["Shooting guard", "Point guard", "Small forward"],
    setup: "A hoop, a ball, and two cones.",
    how: [
      "Attack the first cone hard with two dribbles.",
      "Plant, rise straight up — not forward — and shoot with your feet under you.",
      "Alternate pulling up going right and going left.",
    ],
    reps: "5 × 10, both directions",
    coaching: "Stop before you shoot. The drifting pull-up misses long every time, and it is always the last dribble that causes it.",
    progression: "Add a step-back before rising, or shoot off one dribble instead of two.",
    needs: "solo",
  },
  {
    id: "bb_pocket_pass", sport: "basketball", skill: "Passing", name: "Pocket pass into the wall",
    positions: ["Point guard"],
    setup: "A wall and a ball.",
    how: [
      "Dribble hard towards the wall as if coming off a screen.",
      "From the low pocket beside your hip, whip a one-handed bounce pass into the wall.",
      "Take the return in stride and go again the other way.",
    ],
    reps: "6 × 45 seconds",
    coaching: "Out of the pocket, off the dribble, no gather. The pass a big man can use arrives before the help recovers.",
    progression: "Alternate hands every rep, or take the return with the opposite hand.",
    needs: "solo",
  },
  {
    id: "bb_off_screen", sport: "basketball", skill: "Shooting", name: "Coming off a screen",
    positions: ["Shooting guard", "Small forward"],
    setup: "A hoop, a ball, and a chair or cone as the screen.",
    how: [
      "Start below the screen. Set your man up with two steps the wrong way, then sprint off the chair, shoulder brushing it.",
      "Show your hands early and land on a one-two into the shot.",
      "Alternate curling over the top and flaring away from it.",
    ],
    reps: "5 × 8, both directions",
    coaching: "Hands and feet ready BEFORE the catch. A shooter who arrives and then gets organised has already given the closeout time.",
    progression: "Add a self-toss off the backboard to catch, or shoot immediately off a hard cut with no setting step.",
    needs: "solo",
  },
  {
    id: "bb_pace_change", sport: "basketball", skill: "Ball handling", name: "Change of pace",
    positions: ["Point guard"],
    setup: "Half a court and a ball.",
    how: [
      "Push the ball at three-quarter speed, then hesitate — a genuine pause, not a stutter — and explode past the cone.",
      "Alternate hesitation, in-and-out, and a snake dribble across the lane.",
      "Finish each rep with a pass or a finish, never a walk-off.",
    ],
    reps: "6 × 30 seconds",
    coaching: "The change is what beats the defender, not the top speed. If you are running at one pace you are just running.",
    progression: "Add a second ball, or make the move on a call so you are reacting rather than rehearsing.",
    needs: "solo",
  },
  {
    id: "bb_five_spots", sport: "basketball", skill: "Shooting", name: "Five-spot shooting",
    positions: [],
    setup: "A hoop, a ball, and five marks around the arc.",
    how: [
      "Shoot from each spot in turn: corner, wing, top, wing, corner.",
      "Make five at a spot before moving on — misses do not count.",
      "Chase your own rebound and get back behind the line each time.",
    ],
    reps: "Five makes at each of five spots",
    coaching: "Same feet, same finish, every spot. Score it, so there is a number to beat next week.",
    progression: "Time yourself, or move a step back to the NBA line.",
    needs: "solo",
  },
  {
    id: "bb_weak_hand", sport: "basketball", skill: "Finishing", name: "Weak-hand finishing",
    positions: [],
    setup: "A hoop and a ball.",
    how: [
      "Everything with the weaker hand: dribble in, gather, lay it in off the correct foot.",
      "Alternate near-side and reverse layups.",
      "If you make ten in a row, move a step further out.",
    ],
    reps: "4 × 10 finishes",
    coaching: "Off the OPPOSITE foot. Most weak-hand layups fail because the footwork was never learned, not the hand.",
    progression: "Finish through contact off a wall pad, or add a euro-step before the gather.",
    needs: "solo",
  },
];

/**
 * The running positions are distances, and the technical work that matters
 * differs at each end: a sprinter needs a start, a marathoner needs to have
 * practised eating.
 */
const RUNNING_POSITIONS: SkillDrill[] = [
  {
    id: "rn_starts", sport: "running", skill: "Speed", name: "Three-point starts",
    positions: ["Sprinter", "800m/1500m"],
    setup: "A flat 30m stretch. Blocks if you have them.",
    how: [
      "Set: front knee at 90°, hips slightly above shoulders, weight forward on the hand.",
      "Drive out low with a long first step — you should feel like you are falling and catching it.",
      "Stay low for five steps, then rise gradually over the next ten.",
    ],
    reps: "8 × 20m, walk back recovery, full rest",
    coaching: "Popping up on the first step costs more than any other error in a sprint. Push BACK, not down.",
    progression: "Extend to 30m, or start on a partner's call rather than your own.",
    needs: "solo",
  },
  {
    id: "rn_fuel_rehearsal", sport: "running", skill: "Pacing", name: "Race-day fuelling rehearsal",
    positions: ["Marathon", "Half marathon"],
    setup: "Your long run, and exactly the gels or drink you plan to race with.",
    how: [
      "Take on fuel at the same intervals you will use on race day — set a timer, do not go by feel.",
      "Practise opening and taking it at pace, without stopping.",
      "Note what your stomach does in the last 30 minutes.",
    ],
    reps: "Every long run over 90 minutes",
    coaching: "The gut is trainable and race day is the wrong day to find out yours is not. Nothing new on the day, ever.",
    progression: "Move to race-pace efforts within the long run while still fuelling to schedule.",
    needs: "solo",
  },
  {
    id: "rn_finish_kick", sport: "running", skill: "Speed", name: "Finishing off tired legs",
    positions: ["800m/1500m", "5k/10k"],
    setup: "A track or a measured flat stretch, at the end of a session.",
    how: [
      "After your main set, run 4 × 200m at faster than race pace.",
      "Focus on turnover and arm drive rather than stride length.",
      "Full recovery between — this is quality, not more volume.",
    ],
    reps: "4 × 200m, 3 minutes between",
    coaching: "You are teaching your legs to change gear when they do not want to. That is the only place a kick comes from.",
    progression: "Extend to 300m, or take the recovery down to 90 seconds.",
    needs: "solo",
  },
];

/**
 * Three "positions" that had one identical pool between them: General strength
 * held every drill, so the app gave a powerlifter and an Olympic lifter the
 * same technical work as someone who just lifts.
 */
const LIFTING_POSITIONS: SkillDrill[] = [
  {
    id: "wl_snatch_balance", sport: "weightlifting", skill: "Overhead position", name: "Snatch balance",
    positions: ["Olympic lifting"],
    setup: "A barbell, light. A rack helps.",
    how: [
      "Bar on the back, snatch grip, feet in pulling position.",
      "Dip and drive the bar up while dropping fast into a full overhead squat.",
      "Stand up under control with the bar locked out and stable.",
    ],
    reps: "5 × 3, adding weight only when all three are caught in the bottom",
    coaching: "You are practising the SPEED of getting under the bar, not the strength of pressing it up. If you press out, it is too heavy.",
    progression: "Move from a heaving balance to a pause version, or start from a dead stop with no dip.",
    needs: "solo",
  },
  {
    id: "wl_jerk_dip", sport: "weightlifting", skill: "Overhead position", name: "Jerk dip and drive",
    positions: ["Olympic lifting"],
    setup: "A barbell in a rack, moderate weight.",
    how: [
      "Take the bar on the shoulders, elbows slightly in front, weight in the middle of the foot.",
      "Dip a few inches straight down, keeping the torso vertical, then drive hard.",
      "Stop at full extension — do not go under the bar.",
    ],
    reps: "6 × 3 dips",
    coaching: "Straight down and straight up. Any forward lean in the dip pushes the bar out in front, and no jerk recovers from that.",
    progression: "Add a pause at the bottom of the dip, or complete the jerk once the drive is consistent.",
    needs: "solo",
  },
  {
    id: "wl_commands", sport: "weightlifting", skill: "Bracing", name: "Competition commands",
    positions: ["Powerlifting"],
    setup: "Your normal working sets, plus someone to call commands — or a timer.",
    how: [
      "Squat: hold the bar racked and still until the 'squat' call, then again at the top for 'rack'.",
      "Bench: pause the bar motionless on the chest for a full second and wait for 'press'.",
      "Deadlift: hold lockout until 'down', and control it back rather than dropping it.",
    ],
    reps: "Every top set of your last three weeks before a meet",
    coaching: "More lifts are lost to commands than to strength. Waiting is a skill and it has to be rehearsed under load.",
    progression: "Have the calls delayed unpredictably, so you hold longer than feels comfortable.",
    needs: "solo",
  },
  {
    id: "gy_stretch_position", sport: "gym", skill: "Execution", name: "Loaded stretch pauses",
    positions: ["Hypertrophy"],
    setup: "Any exercise with a loaded lengthened position — RDLs, incline curls, flyes.",
    how: [
      "Lower under control and pause for two seconds at the longest position the movement reaches.",
      "Come out of it without bouncing, and stop the set when you can no longer control the pause.",
    ],
    reps: "Last two sets of each movement",
    coaching: "The lengthened position is where most of the growth stimulus is. Rushing through it is how a set becomes cardio.",
    progression: "Extend to three seconds, or take the last set to a true failure point with the pause intact.",
    needs: "solo",
  },
  {
    id: "gy_bar_speed", sport: "gym", skill: "Technique", name: "Bar-speed check",
    positions: ["Strength"],
    setup: "Your main lift, and your phone on a tripod or propped up.",
    how: [
      "Film your working sets from the side.",
      "Compare the speed of the first rep to the last — and to the same weight last week.",
      "Stop the set when a rep is visibly slower than the one before it.",
    ],
    reps: "Every top set",
    coaching: "Speed at a given weight is the honest measure of whether you are getting stronger or just getting more tired.",
    progression: "Use the same camera angle every week so the comparison actually means something.",
    needs: "solo",
  },
  {
    id: "gy_circuit_pacing", sport: "gym", skill: "Execution", name: "Circuit pacing",
    positions: ["General fitness"],
    setup: "Three or four movements you can move between quickly, and a clock.",
    how: [
      "Work 40 seconds, rest 20, through the circuit twice without stopping.",
      "Pick a rep target for round one that you can still hit in round three.",
      "Write down the reps — the aim is the same number every round, not a heroic first one.",
    ],
    reps: "3 rounds",
    coaching: "Even rounds beat a fast start every time. Fading through a circuit trains you to fade.",
    progression: "Add a round, or shorten the rest to 15 seconds before adding any weight.",
    needs: "solo",
  },
];

export const SKILL_DRILLS: SkillDrill[] = [
  ...FOOTBALL, ...FOOTBALL_MORE, ...GOALKEEPING, ...FOOTBALL_POSITIONS,
  ...RUGBY, ...RUGBY_MORE, ...RUGBY_FORWARDS, ...RUGBY_BACKS,
  ...BASKETBALL, ...BASKETBALL_MORE, ...BASKETBALL_POSITIONS,
  ...RUNNING, ...RUNNING_MORE, ...RUNNING_POSITIONS,
  ...WEIGHTLIFTING,
  ...GYM,
  ...LIFTING_POSITIONS,
];

/**
 * Drills for a sport, ordered for the position(s) the athlete plays.
 *
 * Takes one or many: a full back who covers at centre back should see crossing
 * AND heading before anything else, because they need both.
 */
export function skillsForSport(sport: SportId, position?: string | string[] | null): SkillDrill[] {
  const all = SKILL_DRILLS.filter((d) => d.sport === sport);
  const wanted = positionList(position);
  if (!wanted.length) return all;
  const matches = (d: SkillDrill) => d.positions.some((p) => wanted.includes(p));
  // A drill with no positions listed applies to everyone — a winger still needs
  // a first touch. Position-specific ones lead, so the list opens with the work
  // that matters most for them.
  const mine = all.filter(matches);
  const general = all.filter((d) => d.positions.length === 0);
  const rest = all.filter((d) => d.positions.length > 0 && !matches(d));
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

/**
 * Skill work to attach to a program session.
 *
 * A programme that is only lifts and sprints trains a footballer to be fit,
 * not to play. Rotated by session index so a four-day week covers four
 * different technical areas rather than the same one four times, and biased to
 * the position — a winger's programme should have crossing in it.
 *
 * Solo-only: a program session has to be doable on the day it lands. A drill
 * needing three team-mates would just be skipped.
 */
/**
 * The drills that belong to THIS athlete — their positions' work plus whatever
 * applies to everyone. skillsForSport() deliberately returns the whole sport so
 * the Playbook can show it all; programming from that list is what would put
 * goalkeeper saves in a winger's session, or lineout work in a prop's.
 */
export function skillsForAthlete(sport: SportId, position?: string | string[] | null): SkillDrill[] {
  const wanted = positionList(position);
  const all = SKILL_DRILLS.filter((d) => d.sport === sport);
  if (!wanted.length) return all;
  const mine = all.filter((d) => d.positions.some((p) => wanted.includes(p)) || d.positions.length === 0);
  // A position we hold no drills for shouldn't leave them with nothing at all.
  return mine.length ? mine : all;
}

export function skillForSession(
  sport: SportId,
  position: string | string[] | null | undefined,
  index: number,
): SkillDrill | null {
  const pool = drillsYouCanDo(skillsForAthlete(sport, position), "solo");
  if (!pool.length) return null;
  // Spread across skills first, so consecutive sessions aren't two shooting
  // drills while passing never appears.
  const byskill = new Map<string, SkillDrill[]>();
  for (const d of pool) {
    const list = byskill.get(d.skill) ?? [];
    list.push(d);
    byskill.set(d.skill, list);
  }
  const skills = [...byskill.keys()];
  const chosenSkill = skills[index % skills.length];
  const options = byskill.get(chosenSkill)!;
  return options[Math.floor(index / skills.length) % options.length];
}

export const NEEDS_LABEL: Record<SkillDrill["needs"], string> = {
  solo: "On your own",
  partner: "Needs a partner",
  team: "Needs a group",
};

/**
 * Drills you can do with the people you actually have. "Partner" includes solo
 * work — if you've got someone with you, you can still do the wall drills —
 * and a group can do anything.
 */
export function drillsYouCanDo(drills: SkillDrill[], have: SkillDrill["needs"]): SkillDrill[] {
  const rank = { solo: 0, partner: 1, team: 2 } as const;
  return drills.filter((d) => rank[d.needs] <= rank[have]);
}
