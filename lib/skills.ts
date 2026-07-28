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

export const SKILL_DRILLS: SkillDrill[] = [
  ...FOOTBALL, ...FOOTBALL_MORE, ...GOALKEEPING,
  ...RUGBY, ...RUGBY_MORE,
  ...BASKETBALL, ...BASKETBALL_MORE,
  ...RUNNING, ...RUNNING_MORE,
  ...WEIGHTLIFTING,
  ...GYM,
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
