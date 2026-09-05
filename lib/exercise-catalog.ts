// =============================================================================
// Imported gym/strength exercise database. ~250 movements (name + primary
// muscle) expanded into Exercise objects with rule-derived equipment, demo
// pattern, category and difficulty. Merged into the coached library so users
// get real breadth, filterable by difficulty / equipment / muscle.
// =============================================================================

import type { Exercise, ExerciseCategory, DemoPattern, Difficulty } from "./exercises";
import { GENERATED_CUES } from "./exercise-cues.generated";

// --- classifiers ------------------------------------------------------------

export function equipmentOf(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("smith")) return "Smith machine";
  if (n.includes("cable")) return "Cable";
  if (n.includes("machine") || n.includes("leg press") || n.includes("leg extension") ||
      /\bleg curl\b|hamstring curl|pulldown|pec deck|pec fly|chest fly machine/.test(n) ||
      n.includes("hip adduction") || n.includes("hip abduction") || n.includes("dip machine")) return "Machine";
  if (n.includes("dumbbell")) return "Dumbbell";
  if (n.includes("kettlebell")) return "Kettlebell";
  if (n.includes("ez bar")) return "EZ bar";
  if (n.includes("hex bar") || n.includes("trap bar")) return "Trap bar";
  /**
   * A NAMED IMPLEMENT BEATS A MOVEMENT KEYWORD.
   *
   * "Barbell Glute Bridge" and "Barbell Good Morning" were both classified as
   * BODYWEIGHT, because the bodyweight pattern below lists "glute bridge" and
   * "good morning" and was tested first. Harmless while nothing read the field
   * — and the moment the engine started building blocks around the kit an
   * athlete has, it put a barbell lift into a dumbbells-only programme and
   * called it bodyweight.
   *
   * If the name says barbell, it is a barbell. Dumbbell, cable, machine and the
   * rest are already checked above for the same reason.
   */
  if (n.includes("barbell")) return "Barbell";
  if (n.includes("landmine")) return "Landmine";
  /**
   * UNLOADED BY NAME, WHERE THE LOADED VERSION IS ITS OWN ENTRY.
   *
   * "Squat Jump" fell through to the Barbell catch-all below, on the strength
   * of the word "squat" — so a plyometric a footballer does in a car park was
   * excluded from a bodyweight-only programme and offered to somebody with a
   * rack. Same for the plain lunges and the plain split squat, each of which
   * has "Barbell ..." and "Dumbbell ..." siblings in the list: the bare name is
   * the unloaded one precisely BECAUSE the loaded ones are spelled out.
   *
   * This has to stay above the catch-all, which is why it is here rather than
   * appended to it.
   */
  if (/^(?:squat jump|squat thrust|single leg squat|split squat|lunge|reverse lunge|walking lunge|side lunge)$/.test(n)) return "Bodyweight";
  if (/push ups?|pull ups?|chin ups?|dips?|sit ups?|crunch|burpee|muscle ups?|plank|pistol|handstand|jumping jack|mountain climber|flutter|scissor|superman|russian twist|glute bridge|bodyweight|inverted row|toes to bar|hanging|leg raise|nordic|sissy|ab wheel|good morning|archer|clap|ring/.test(n)) return "Bodyweight";
  if (/bench press|squat|deadlift|barbell|clean|snatch|jerk|row|press|curl|shrug|lunge|hip thrust|rack pull|thruster|pull through|calf raise/.test(n)) return "Barbell";
  return "Other";
}

// Equipment normalised to a filter bucket.
export function equipBucket(equipment: string): string {
  const e = equipment.toLowerCase();
  if (e.includes("barbell") || e.includes("ez") || e.includes("trap") || e.includes("smith") || e.includes("landmine")) return "Barbell";
  if (e.includes("dumbbell")) return "Dumbbell";
  if (e.includes("kettlebell")) return "Kettlebell";
  if (e.includes("cable")) return "Cable";
  if (e.includes("machine")) return "Machine";
  if (e.includes("bodyweight") || e === "none" || e === "—" || e.includes("bar") && !e.includes("barbell")) return "Bodyweight";
  return "Other";
}

const ADVANCED = /snatch|clean|jerk|muscle ups?|pistol|handstand|one arm|nordic|ring |sissy|archer|clap|deficit|planche|jefferson|zercher|behind the neck|behind the back|meadows|spoto|tate|jm press/i;
const EASY = /push ups?$|bodyweight|machine|leg press|leg extension|leg curl|lat ?pulldown|pulldown|calf raise|crunch|sit ups?|glute bridge|plank|jumping jack|mountain climber|flutter|scissor|superman|russian twist|curl$|lateral raise|front raise|wrist curl|shrug|face pull|leg raise|back extension|hip adduction|hip abduction|kickback|hyperextension|side bend|good morning|reverse fly|pull through|dead ?bug/i;

export function difficultyOf(name: string): Difficulty {
  if (ADVANCED.test(name)) return "advanced";
  if (EASY.test(name)) return "easy";
  return "medium";
}

function categoryOf(muscle: string): ExerciseCategory {
  return muscle.toLowerCase().includes("whole") ? "Power" : "Strength";
}

/**
 * Which movement figure to draw for a name.
 *
 * Exported because it is not only the importer that has to guess: a coach-typed
 * name reaching lib/how-to.ts, and an athlete's own exercise saved from a
 * check-in, both need the same answer. A second copy of these patterns drifts
 * from this one and two screens then draw a different picture for one movement.
 *
 * `muscle` was never read — the name says everything this can tell.
 */
export function demoOf(name: string): DemoPattern {
  const n = name.toLowerCase();
  if (/deadlift|romanian|rdl|good morning|hip thrust|glute bridge|hyperextension|back extension|pull through|swing|shrug/.test(n)) return "hinge";
  if (/lunge|split squat|step up|bulgarian/.test(n)) return "lunge";
  if (/squat|leg press|leg extension|sissy|pistol/.test(n)) return "squat";
  if (/pull ups?|chin ups?|pulldown|\brow\b|muscle ups?|face pull|pullover|reverse fly|shrug|lat |inverted row|renegade/.test(n)) return "pull";
  if (/jump|burpee|box|clean|snatch|jerk|thruster|power|wall ball|mountain climber|jumping jack|squat thrust/.test(n)) return "jump";
  if (/crunch|sit ups?|plank|leg raise|russian twist|flutter|scissor|superman|toes to bar|ab wheel|knee raise|side bend|woodchopper/.test(n)) return "plank";
  if (/calf raise/.test(n)) return "jump";
  // presses, raises, curls, extensions, chest, shoulders → press-style
  return "press";
}

function slug(name: string): string {
  return "x_" + name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

// Hand-written coaching for the most-used gym lifts (keyed by lowercased name).
// Anything not here still gets a sensible auto-generated entry.
const COACHING: Record<string, { cues: string[]; why: string }> = {
  // ── Written by hand, checked by draftProblems ──────────────────────────────
  //
  // 197 of the 382 movements here had NO coaching cues and a generated one-line
  // `why` — 43 of them said "Builds the legs." verbatim. The pages are real and
  // distinctly described (the meta description comes from the how-to, so there
  // is no duplicate-content problem), but a page with no cue on it is a page
  // that lists a movement rather than teaching it.
  //
  // These are the 24 most-searched of them. Every cue was validated against
  // lib/exercise-draft.ts — the same rules the admin drafting tool applies to a
  // model's output — and eleven failed the first pass for naming a body part or
  // a piece of kit the movement's own description never mentions. They were
  // rewritten inside each description's vocabulary rather than the rule being
  // loosened to admit them: that rule is what stops invented anatomy reaching
  // the library, and it does not stop being right when the author is a person.
  "box squat": { cues: ["Sit back to the box, do not flop", "Pause without relaxing the trunk", "Drive up the moment you touch"], why: "Squatting to a fixed height, which teaches sitting back and makes depth the same on every rep." },
  "chest press": { cues: ["Handles level with the mid-chest", "Blades back and down", "Full lockout without shrugging"], why: "A stable pressing pattern for the chest and triceps that is easy to load and easy to repeat." },
  "chest supported dumbbell row": { cues: ["Lie chest-down, dumbbells hanging beneath", "Row to your ribs, squeezing the shoulder blades", "Lower fully — the bench removes all cheating"], why: "Rowing with the torso fixed, which removes the cheat and makes the upper back do the pulling." },
  "clean and press": { cues: ["Clean the bar to the shoulders", "Stand fully and stabilise before pressing", "Strictly press overhead — two movements, not one heave"], why: "A whole-body lift that trains getting a load from the floor to overhead, which is the pattern most sports actually use." },
  "close grip lat pulldown": { cues: ["Thighs locked under the pads", "Pull to the upper chest, leading with the elbows", "Let the weight stretch the lats fully at the top"], why: "A narrow pulldown that keeps tension on the lats through a long range." },
  "dumbbell romanian deadlift": { cues: ["Soft knees, then push the hips back", "Dumbbells stay close to the legs", "Stop when the hamstrings run out of length"], why: "A hip hinge under load that builds the hamstrings and teaches the pattern behind every heavier pull." },
  "dumbbell shrug": { cues: ["Dumbbells at your sides at arm's length", "Shrug straight up and pause at the top", "Lower to a full stretch"], why: "Direct work for the upper back and traps, which most pulling leaves half-finished." },
  "dumbbell tricep extension": { cues: ["Elbows point forward, not out", "Lower behind the head for the stretch", "Extend without moving the upper arm"], why: "Overhead extension puts the triceps in a stretched position that pressing never reaches." },
  "ez bar curl": { cues: ["Take the angled grips to spare the wrists", "Curl with the elbows fixed at your sides", "Lower under control to straight"], why: "The angled bar is kinder on the wrists than a straight one, so the biceps stop the set rather than the joints." },
  "horizontal leg press": { cues: ["Feet mid-platform, shoulder width", "Lower until the hips start to tuck", "Do not lock the knees hard at the top"], why: "Loads the legs with the back supported, which is useful when the trunk is already tired from squatting." },
  "incline dumbbell curl": { cues: ["Sit back on a 45-60 degree incline", "Arms hang straight down behind the torso", "Curl without the elbows travelling forward"], why: "Starting from a stretch, which is the position a standing curl never reaches." },
  "machine bicep curl": { cues: ["Elbows on the pad, not sliding", "Curl to a hard squeeze", "Resist the whole way down"], why: "A fixed path for the biceps, which makes it easy to take the last few reps properly." },
  "machine calf raise": { cues: ["Full stretch at the bottom", "Rise all the way onto the toes", "Pause a beat at each end"], why: "Calves respond to range and to pauses, both of which are easy to control on a machine." },
  "machine row": { cues: ["Set the chest pad so the arms extend fully", "Row back and squeeze the shoulder blades", "Return under control to a full stretch"], why: "Horizontal pulling with the trunk supported, so the back does the work rather than the hips." },
  "machine shoulder press": { cues: ["Seat height puts the handles at shoulder height", "Press up smoothly to near-lockout", "Lower under control, no bouncing"], why: "Overhead pressing with the trunk supported, which keeps the load on the shoulders." },
  "pendlay row": { cues: ["Torso parallel, back flat", "Bar returns to the floor each rep", "Pull explosively to the lower chest"], why: "A dead-stop row from the floor that removes the stretch reflex and builds honest upper-back pulling strength." },
  "pistol squat": { cues: ["Sit back, do not fall forward", "Free leg straight and off the floor", "Hold a counterweight if you cannot balance"], why: "Single-leg squatting to full depth, which exposes a side-to-side difference nothing bilateral will show." },
  "seated calf raise": { cues: ["Pad across the thighs just above the knees", "Balls of the feet on the platform", "Rise onto the toes, then lower to a deep stretch"], why: "Bending the knee shifts the work to the soleus, which the standing version barely reaches." },
  "seated dumbbell shoulder press": { cues: ["Elbows slightly in front of the body", "Lower to ear height under control", "Press up and slightly together"], why: "Independent dumbbells overhead, which evens out a stronger side and lets the shoulders find their own path." },
  "seated shoulder press": { cues: ["Bar starts at collarbone height", "Push the head through at lockout", "Do not arch over the bench for extra reps"], why: "Seated overhead pressing that takes the legs and lower back out of the lift." },
  "smith machine bench press": { cues: ["Set the bench so the bar lands on the lower chest", "Unhook and press the fixed path", "Push closer to failure than you would alone"], why: "Pressing on a fixed path, so you can work close to failure without a spotter." },
  "smith machine squat": { cues: ["Feet slightly forward of the bar", "Brace before you unrack", "Same depth every rep on the fixed path"], why: "A fixed bar path that lets you push the legs hard without spending attention on balance." },
  "sumo deadlift": { cues: ["Wide stance, toes turned out", "Hips low, chest up, arms vertical", "Push the floor apart as you stand"], why: "A wider stance that shortens the pull and asks more of the hips and quads than a conventional deadlift." },
  "vertical leg press": { cues: ["Lower back flat against the pad", "Control the descent, no bouncing", "Stop before the hips lift off"], why: "A steeper pressing angle that puts the legs under load with very little demand on the trunk." },

  "shoulder press": { cues: ["Brace the core, glutes tight", "Press in a path close to your face", "Full lockout, biceps by the ears"], why: "The primary overhead pressing lift for shoulder strength and stability." },
  "military press": { cues: ["Strict — no leg drive", "Ribs down, don't lean back", "Bar over the mid-foot at lockout"], why: "A strict standing press that builds honest overhead strength." },
  "dumbbell bench press": { cues: ["Shoulder blades pinned back", "Lower to a deep stretch", "Press the dumbbells together at the top"], why: "Builds the chest through a bigger range than a barbell, evening out left/right." },
  "incline bench press": { cues: ["Bench at ~30°", "Bar to the upper chest", "Drive the feet into the floor"], why: "Emphasises the upper chest and front delts." },
  "incline dumbbell bench press": { cues: ["Bench ~30°, blades retracted", "Deep stretch at the bottom", "Control the negative"], why: "Upper-chest builder with a friendly, free range of motion." },
  "decline bench press": { cues: ["Slight decline", "Bar to the lower chest", "Keep the elbows tucked ~45°"], why: "Targets the lower chest with a strong pressing angle." },
  "dumbbell fly": { cues: ["Soft elbows, don't bend them", "Open until you feel the stretch", "Hug the weights back up"], why: "Isolates the chest with a big stretch — great for hypertrophy." },
  "machine chest fly": { cues: ["Chest tall, slight arch", "Squeeze at the middle", "Slow, controlled return"], why: "A stable, joint-friendly way to isolate and pump the chest." },
  "cable fly": { cues: ["Slight forward lean", "Meet in front of the chest", "Constant tension throughout"], why: "Constant-tension chest isolation from the cables." },
  "push ups": { cues: ["Body in a straight line, glutes tight", "Chest to the floor", "Elbows ~45°, not flared"], why: "The foundational bodyweight press — endlessly scalable." },
  "dips": { cues: ["Slight forward lean for chest", "Lower to a comfortable stretch", "Lock out strong at the top"], why: "Big compound builder for chest and triceps." },
  "bent over row": { cues: ["Hinge to ~45°, flat back", "Row to the lower ribs", "Squeeze the shoulder blades"], why: "Heavy horizontal pulling to balance all your pressing." },
  "dumbbell row": { cues: ["Flat back, brace on a bench", "Drive the elbow past the ribs", "Control the lower"], why: "Unilateral back builder that irons out left/right imbalances." },
  "seated cable row": { cues: ["Tall chest, don't round", "Pull to the belly button", "Squeeze then control back"], why: "Mid-back thickness with constant cable tension." },
  "lat pulldown": { cues: ["Drive the elbows down and back", "Chest tall, slight lean", "No heaving with the torso"], why: "Builds back width — a scalable pull-up alternative." },
  "chin ups": { cues: ["Full dead hang", "Lead with the chest", "Own the lower — no kipping"], why: "Biceps-and-back bodyweight builder; slightly easier than pull-ups." },
  "t bar row": { cues: ["Flat back, chest supported if possible", "Row to the sternum", "Big squeeze at the top"], why: "Loads the mid-back heavy and safe." },
  "barbell shrug": { cues: ["Shrug straight up to the ears", "Pause at the top", "No rolling the shoulders"], why: "Directly builds the traps." },
  "face pull": { cues: ["Pull to the forehead/eyes", "Elbows high, rotate out", "Squeeze the rear delts"], why: "Bulletproofs the shoulders and rear delts — great for posture." },
  "dumbbell lateral raise": { cues: ["Lead with the elbows", "Raise to shoulder height", "Slow negative, no swinging"], why: "The key exercise for wider, capped side delts." },
  "cable lateral raise": { cues: ["Constant tension from the cable", "Lead with the elbow", "Controlled all the way down"], why: "Side-delt isolation with tension through the whole range." },
  "dumbbell front raise": { cues: ["Raise to eye level", "No momentum", "Lower slowly"], why: "Isolates the front delts." },
  "arnold press": { cues: ["Start palms facing you", "Rotate as you press", "Full lockout overhead"], why: "Hits all three delt heads through a rotating press." },
  "upright row": { cues: ["Lead with the elbows", "Pull to mid-chest, not the chin", "Keep it slow"], why: "Builds side delts and traps (stop at chest height to spare the shoulder)." },
  "dumbbell curl": { cues: ["Elbows pinned to your sides", "Full squeeze at the top", "Slow the lower for 2-3s"], why: "The classic biceps builder." },
  "barbell curl": { cues: ["Elbows fixed, no swinging", "Curl to a full contraction", "Control the negative"], why: "Lets you load the biceps heavier than dumbbells." },

  /**
   * THE ONES ATHLETES TYPED IN THEMSELVES.
   *
   * Off a report of custom entries in the log, which is the most honest gap
   * list there is: somebody wanted the exercise, could not find it, and wrote
   * it anyway. Each gets real cues rather than a sentence about what it builds
   * — an entry with no how-to is a row that opens onto nothing, which is worse
   * than the search that failed to find it.
   */
  "incline bicep curl": { cues: ["Lie back so the arms hang behind you", "Do not let the elbows drift forward", "Stretch fully at the bottom"], why: "Sit back on an inclined bench and let the arms hang behind the body, then curl without the elbows travelling forward. That start position holds the long head of the biceps at length, which a standing curl never does — it is the stretch, not the squeeze, doing the work here." },
  "rear delt fly": { cues: ["Hinge until the chest faces the floor", "Lead with the elbows, not the hands", "Stop level with the shoulders"], why: "Hinge until the chest faces the floor and sweep the arms apart, leading with the elbows and stopping level with the shoulders. It trains the back of the shoulder, which no pressing movement reaches and which every hour at a desk quietly shortens." },
  "cable chest fly": { cues: ["Soft, fixed elbow throughout", "Bring the hands together, not just in", "Let the chest stretch at the back"], why: "Hold a soft, fixed elbow and bring the hands all the way together rather than just inward. The cable keeps tension on the chest through the whole arc, including the top, where a dumbbell fly is very nearly resting against gravity." },
  "single arm tricep extension": { cues: ["Upper arm still, beside your head", "Lower behind the head, not to the side", "Lock out without swinging"], why: "Keep the upper arm beside the head and lower behind it rather than out to the side, then lock out without swinging. Working one arm at a time stops the stronger side carrying the weaker one, which is exactly what a two-handed version hides." },
  "skull crushers": { cues: ["Elbows in and pointing at the ceiling", "Lower to the forehead or just past it", "Stop short of locking out to keep tension"], why: "Lie back, keep the elbows tucked and pointing at the ceiling, and lower the bar to the forehead or just past it. Because the arms stay overhead the long head of the triceps is loaded at length, which pushdowns never manage." },

  /**
   * THE LIFTS THE PROGRAMME IS BUILT ON.
   *
   * Fourteen of the twenty-seven staples had no coaching at all, including
   * every barbell lift a block is anchored on — so an athlete was handed a back
   * squat, the most technical and most consequential movement in their week,
   * with a generated one-liner and nothing else. A programme that names a lift
   * and cannot tell you how to do it is a spreadsheet.
   *
   * Three cues each, in the order they matter: set-up, the rep, the thing that
   * goes wrong. `why` says what the lift is for, so the reason line on the
   * session is about the movement rather than about the slot it filled.
   */
  "barbell back squat": { cues: ["Bar on the traps, elbows under the bar", "Sit between the hips — knees track over the toes", "Brace hard before you unrack, not on the way down"], why: "The most complete lower-body builder there is — quads, glutes and the whole trunk under one bar." },
  "barbell front squat": { cues: ["Elbows high, bar resting on the shoulders", "Stay upright — the bar falls if the chest drops", "Full depth before you drive"], why: "Loads the quads harder than a back squat and punishes a rounded upper back." },
  "barbell deadlift": { cues: ["Bar over the mid-foot, shins almost touching", "Take the slack out of the bar before you pull", "Push the floor away — hips and chest rise together"], why: "Trains the whole posterior chain and teaches you to brace under real load." },
  "bench press": { cues: ["Shoulder blades pinned back and down", "Bar to the lower chest, elbows ~45°", "Drive the feet into the floor as you press"], why: "The benchmark upper-body press for chest, front delts and triceps." },
  "barbell overhead press": { cues: ["Squeeze the glutes so the ribs stay down", "Move the head back, then press past the face", "Finish with the biceps by the ears"], why: "Builds honest overhead strength and shoulders that can hold a position." },
  "barbell row": { cues: ["Hinge to ~45°, back flat", "Row to the bottom of the ribs", "Stop the torso rising to help the bar"], why: "Heavy horizontal pulling — the balance to all your pressing." },
  "pull ups": { cues: ["Full dead hang between reps", "Lead with the chest, elbows down and back", "Own the lower — no kipping"], why: "The best builder of back width there is, and it costs nothing." },
  "leg press": { cues: ["Feet mid-platform, shoulder width", "Lower until the hips start to tuck, no further", "Never lock the knees out hard"], why: "Loads the quads heavily with the trunk taken out of it — useful when the back is tired." },
  "barbell hip thrust": { cues: ["Shoulder blades on the bench, chin tucked", "Drive through the heels to full lockout", "Squeeze at the top, don't arch the lower back"], why: "The strongest position to load the glutes directly." },
  "barbell lunge": { cues: ["Long step — the front shin stays near vertical", "Back knee to just above the floor", "Push through the front heel to stand"], why: "Single-leg strength and the balance a bilateral squat never asks for." },
  "bulgarian split squat": { cues: ["Back foot on the bench, laces down", "Drop straight down, torso slightly forward", "All the weight through the front foot"], why: "Brutal single-leg quad and glute work at a fraction of the spinal load." },
  "cable tricep pushdown": { cues: ["Elbows pinned to the ribs", "Extend to a full lockout", "Let the stack stretch the triceps at the top"], why: "Constant-tension triceps isolation that is easy on the elbows." },
  "leg curl": { cues: ["Hips flat on the pad", "Curl all the way to the finish", "Lower slowly — that half is the point"], why: "Trains the hamstrings at the knee, which hinges alone never do." },
  "standing calf raise": { cues: ["Rise onto the big toe, not the outside edge", "Pause at the top", "Full stretch at the bottom, no bouncing"], why: "The calves grow from the stretch and the pause — speed wastes the set." },
  "hammer curl": { cues: ["Neutral grip, thumbs up", "Elbows tight to the body", "Squeeze at the top"], why: "Hits the biceps and the brachialis/forearm for thicker arms." },
  "preacher curl": { cues: ["Armpits on the pad", "Don't fully lock out at the bottom", "Full squeeze at the top"], why: "Strict biceps isolation with no cheating." },
  "cable bicep curl": { cues: ["Elbows fixed", "Constant cable tension", "Squeeze hard at the top"], why: "Keeps tension on the biceps through the whole rep." },
  "tricep pushdown": { cues: ["Elbows glued to your sides", "Full lockout at the bottom", "Control back up"], why: "The go-to triceps isolation for the outer head." },
  "tricep rope pushdown": { cues: ["Split the rope at the bottom", "Elbows pinned", "Full extension and squeeze"], why: "Extra contraction at the bottom for the triceps." },
  "lying tricep extension": { cues: ["Lower to the forehead/behind the head", "Elbows pointing up, fixed", "Control the stretch"], why: "Builds the long head of the triceps for bigger arms." },
  "close grip bench press": { cues: ["Hands ~shoulder width", "Elbows tucked", "Bar to the lower chest"], why: "A pressing movement that overloads the triceps." },
  "leg extension": { cues: ["Squeeze the quads at the top", "Pause briefly", "Slow the lower"], why: "Isolates the quads — great for a knee-friendly quad pump." },
  "seated leg curl": { cues: ["Drive the heels down and under", "Squeeze the hamstrings", "Slow return"], why: "Isolates the hamstrings for size and knee health." },
  "lying leg curl": { cues: ["Hips pinned to the pad", "Curl fully, squeeze", "Control the negative"], why: "Direct hamstring isolation." },
  "sled leg press": { cues: ["Feet mid-platform, knees track toes", "Don't lock out hard", "Full controlled range"], why: "Loads the legs heavy with the back supported." },
  "hack squat": { cues: ["Full-foot pressure", "Knees track over the toes", "Deep but controlled"], why: "Quad-dominant squat pattern with a fixed, supported path." },
  "bodyweight squat": { cues: ["Sit back and down", "Chest up, heels down", "Full depth"], why: "The base squat pattern — master this before loading." },
  "dumbbell lunge": { cues: ["Long step, vertical front shin", "Drop the back knee straight down", "Drive through the front heel"], why: "Single-leg strength and balance that carries to sport." },
  "walking lunge": { cues: ["Big controlled steps", "Torso tall", "Push through the front foot"], why: "Builds legs and stability under continuous tension." },
  "crunches": { cues: ["Curl the ribs to the hips", "Don't yank the neck", "Slow and controlled"], why: "Targets the upper abs." },
  "hanging leg raise": { cues: ["No swinging", "Curl the pelvis up", "Lower under control"], why: "Strong lower-ab and hip-flexor builder." },
  "russian twist": { cues: ["Rotate from the ribs", "Keep the chest tall", "Controlled side to side"], why: "Trains the obliques and rotational core." },
  "cable crunch": { cues: ["Round the spine down", "Crunch with the abs, not the arms", "Squeeze at the bottom"], why: "Loadable ab work for real progression." },
  "goblet squat": { cues: ["Hold the bell at the chest", "Elbows inside the knees at the bottom", "Sit tall and deep"], why: "A joint-friendly squat that teaches depth and bracing." },
  "push press": { cues: ["Small dip from the legs", "Explode the bar up", "Punch the head through at lockout"], why: "Lets you move more overhead by adding leg drive — builds power." },
  "dumbbell shoulder press": { cues: ["Neutral, stacked wrists", "Press without flaring the ribs", "Full range each rep"], why: "Shoulder size and stability with a friendly joint path." },
  "romanian deadlift": { cues: ["Soft knees, push the hips back", "Bar close to the legs", "Feel the hamstring stretch, then stand"], why: "The best hamstring and glute builder through a big hip hinge." },
};

/**
 * Exported for the tests, not for callers.
 *
 * Two of its rules — a row with no muscle, and a row with a second one — cannot
 * be exercised through IMPORTED_EXERCISES, because no row in RAW is malformed
 * and the fixture is the whole point. Mutation testing found both guards
 * unreachable and therefore unproven, which is a guard that will not be there
 * when it is finally needed.
 */
export function build(raw: string): Exercise[] {
  // Blank lines are dropped rather than parsed into an entry with no name. The
  // list is now built from two blocks joined together, and the seam between
  // them is exactly where an empty line appears.
  const lines = raw.trim().split("\n").map((l) => l.trim()).filter(Boolean);

  /**
   * FIRST NAME WINS — because two hand-kept lists are bound to overlap.
   *
   * STAPLE_RAW was written as "the lifts the catalogue forgot", and two of
   * them, the dumbbell lateral raise and the hanging leg raise, it had not
   * forgotten. Concatenating the blocks put each of those in the catalogue
   * twice, byte for byte, which was not a cosmetic problem: the public site
   * built the same page twice under two URLs, the second one wearing a "-2"
   * slug and identical copy — a duplicate the crawler sees before we do.
   *
   * Deduping here rather than deleting the two lines: the seam will be edited
   * again, and the next overlap should be a no-op instead of a second page.
   */
  const seen = new Set<string>();
  const built: Exercise[] = [];
  for (const line of lines) {
    const [name, muscleField] = line.split("|").map((s) => s.trim());
    /**
     * A SECOND MUSCLE, COMMA-SEPARATED, AND WHY THE FORMAT HAD TO CHANGE.
     *
     * Every imported row carried exactly one muscle, which is fine for a
     * filter and not fine for the topic hubs: five genuine lat exercises —
     * Close Grip Lat Pulldown, Dumbbell Pullover, Straight Arm Pulldown among
     * them — were tagged "Back" and nothing else, so /exercises/muscle/lats/
     * sat on 8 of the 12 it needs and did not exist. Four pull-downs that
     * plainly train the lats were four exercises short of a page about the
     * lats.
     *
     * The FIRST muscle stays the primary one: categoryOf and the fallback
     * `why` both read it, so a row that gains a second muscle does not
     * silently change category or copy.
     */
    const muscles = (muscleField ?? "").split(",").map((m) => m.trim()).filter(Boolean);
    // A row with no muscle would previously build an entry with [undefined]
    // in it, which renders as an empty chip and matches no hub.
    if (!name || muscles.length === 0) continue;
    const muscle = muscles[0];
    const id = slug(name);
    if (seen.has(id)) continue;
    seen.add(id);

    const equipment = equipmentOf(name);
    /**
     * HAND-WRITTEN FIRST, GENERATED SECOND.
     *
     * COACHING is maintained by a person, one entry at a time. GENERATED_CUES
     * is rewritten wholesale by the Worker on every publish from the admin
     * drafting tool. Reading COACHING first means a movement somebody has
     * written cues for keeps them however many times the other file is
     * regenerated — machine output never overwrites a person's.
     */
    const key = name.toLowerCase();
    const coach = COACHING[key] ?? GENERATED_CUES[key];
    built.push({
      id,
      name,
      category: categoryOf(muscle),
      demo: demoOf(name),
      equipment,
      muscles,
      tempo: "Controlled",
      cues: coach?.cues ?? [],
      why: coach?.why ?? `Builds the ${muscle.toLowerCase()}.`,
      difficulty: difficultyOf(name),
      imported: true,
    } as Exercise);
  }
  return built;
}

// name | primary muscle
const RAW = `
Bench Press|Chest
Shoulder Press|Shoulders
Push Ups|Chest
Dumbbell Bench Press|Chest
Dumbbell Curl|Biceps
Sled Leg Press|Legs
Barbell Curl|Biceps
Incline Dumbbell Bench Press|Chest
Bent Over Row|Back
Incline Bench Press|Chest
Dips|Triceps
Dumbbell Shoulder Press|Shoulders
Chin Ups|Back
Dumbbell Lateral Raise|Shoulders
Leg Extension|Legs
Romanian Deadlift|Whole Body
Horizontal Leg Press|Legs
Dumbbell Row|Back
Military Press|Shoulders
Sumo Deadlift|Whole Body
Chest Press|Chest
Tricep Pushdown|Triceps
Hammer Curl|Biceps
Seated Cable Row|Back
Crunches|Core
Sit Ups|Core
Seated Dumbbell Shoulder Press|Shoulders
Muscle Ups|Whole Body
Hack Squat|Legs
Bodyweight Squat|Legs
Machine Shoulder Press|Shoulders
Machine Chest Fly|Chest
Clean and Jerk|Whole Body
Seated Leg Curl|Legs
EZ Bar Curl|Biceps
Lying Tricep Extension|Triceps
One Arm Push Ups|Chest
Close Grip Bench Press|Chest
Snatch|Whole Body
Preacher Curl|Biceps
Seated Shoulder Press|Shoulders
Barbell Shrug|Back
T Bar Row|Back
Clean|Whole Body
Lying Leg Curl|Legs
Neutral Grip Pull Ups|Back
Machine Calf Raise|Legs
Push Press|Shoulders
Dumbbell Fly|Chest
Hip Adduction|Legs
Diamond Push Ups|Chest
Smith Machine Bench Press|Chest
Dumbbell Shrug|Back
Decline Bench Press|Chest
Dumbbell Lunge|Legs
Pistol Squat|Legs
Hanging Leg Raise|Core
Machine Row|Back
Tricep Rope Pushdown|Triceps
Chest Supported Dumbbell Row|Back
Dumbbell Romanian Deadlift|Whole Body
Clean and Press|Whole Body
Smith Machine Squat|Legs
Rack Pull|Whole Body
Dumbbell Tricep Extension|Triceps
Box Squat|Legs
Pendlay Row|Back
Incline Dumbbell Curl|Biceps
Cable Bicep Curl|Biceps
Seated Calf Raise|Legs
Close Grip Lat Pulldown|Back,Lats
Upright Row|Shoulders
Vertical Leg Press|Legs
Machine Bicep Curl|Biceps
Zercher Squat|Legs
Machine Seated Crunch|Core
Cable Lateral Raise|Shoulders
Stiff Leg Deadlift|Whole Body
Jumping Jack|Core
Arnold Press|Shoulders
Hang Clean|Whole Body
Dumbbell Reverse Fly|Back
Incline Dumbbell Fly|Chest
Dumbbell Concentration Curl|Biceps
Decline Push Up|Chest
Back Extension|Back
Cable Crunch|Core
Dumbbell Front Raise|Shoulders
Seated Dip Machine|Triceps
Tricep Extension|Triceps
Good Morning|Legs
Floor Press|Chest
Dumbbell Pullover|Back,Lats
Hip Abduction|Legs
Cable Fly|Chest
Dumbbell Floor Press|Chest
Lunge|Legs
Barbell Lunge|Legs
Single Leg Squat|Legs
Handstand Push Ups|Shoulders
Dumbbell Squat|Legs
Burpees|Whole Body
Thruster|Whole Body
Face Pull|Shoulders
Barbell Calf Raise|Legs
Wrist Curl|Forearms
Close Grip Push Up|Chest
Overhead Squat|Legs
Russian Twist|Core
Decline Sit Up|Core
Lying Dumbbell Tricep Extension|Triceps
Paused Bench Press|Chest
Lying Leg Raise|Core
Glute Bridge|Legs
Power Snatch|Whole Body
Bench Dips|Triceps
Cable Overhead Tricep Extension|Triceps
Behind The Neck Press|Shoulders
Machine Reverse Fly|Back
Split Squat|Legs
Cable Reverse Fly|Back
Dumbbell Deadlift|Whole Body
Dumbbell Calf Raise|Legs
Push Jerk|Whole Body
Squat Jump|Legs
Reverse Barbell Curl|Forearms
Sissy Squat|Legs
Dumbbell Tricep Kickback|Triceps
Decline Dumbbell Bench Press|Chest
Reverse Grip Lat Pulldown|Back,Lats
Close Grip Dumbbell Bench Press|Chest
Single Leg Press|Legs
Barbell Reverse Lunge|Legs
Belt Squat|Legs
Incline Push Up|Chest
Barbell Glute Bridge|Legs
Reverse Grip Bench Press|Chest
Reverse Lunge|Legs
Standing Leg Curl|Legs
Cable Pull Through|Legs
Landmine Squat|Legs
Straight Arm Pulldown|Back,Lats
Safety Bar Squat|Legs
Dumbbell Wrist Curl|Forearms
Dumbbell Upright Row|Shoulders
Deficit Deadlift|Whole Body
Strict Curl|Biceps
Snatch Deadlift|Whole Body
Machine Back Extension|Back
Decline Crunch|Core
Sumo Squat|Legs
Hang Power Clean|Whole Body
Single Leg Romanian Deadlift|Whole Body
Pause Deadlift|Whole Body
Barbell Hack Squat|Legs
Bench Pull|Back
Machine Tricep Extension|Triceps
Seated Dumbbell Tricep Extension|Triceps
Side Lunge|Legs
Jefferson Deadlift|Whole Body
Bicycle Crunch|Core
Yates Row|Back,Lats
Reverse Wrist Curl|Forearms
Pin Squat|Legs
Side Crunch|Core
Pause Squat|Legs
Inverted Row|Back
Machine Lateral Raise|Shoulders
Hex Bar Shrug|Back
Single Leg Dumbbell Deadlift|Whole Body
Smith Machine Shrug|Back
Dumbbell Side Bend|Core
Barbell Front Raise|Shoulders
Half Squat|Legs
Split Jerk|Whole Body
Log Press|Shoulders
Bench Pin Press|Chest
JM Press|Triceps
Ab Wheel Rollout|Core
Clean High Pull|Whole Body
Hanging Knee Raise|Core
Glute Kickback|Legs
Ring Dips|Triceps
Behind The Back Deadlift|Whole Body
Clean Pull|Whole Body
Wide Grip Bench Press|Chest
Hip Extension|Legs
Squat Thrust|Whole Body
Single Leg Deadlift|Whole Body
Pike Push Up|Shoulders
Walking Lunge|Legs
Viking Press|Shoulders
Cheat Curl|Biceps
Archer Push Ups|Chest
Reverse Grip Tricep Pushdown|Triceps
Glute Ham Raise|Legs
Reverse Crunches|Core
Z Press|Shoulders
Close Grip Incline Bench Press|Chest
Reverse Hyperextension|Back
Side Leg Raise|Legs
Zercher Deadlift|Whole Body
Snatch Pull|Whole Body
Cable Upright Row|Back
Barbell Pullover|Back
Machine Shrug|Back
Toes To Bar|Core
Dumbbell Snatch|Whole Body
Landmine Press|Shoulders
Incline Hammer Curl|Biceps
Cable Kickback|Legs
Seated Dumbbell Curl|Biceps
Cable Woodchopper|Core
Cable Leg Extension|Legs
Meadows Row|Back
Cable Shrug|Back
One Arm Lat Pulldown|Back
Spoto Press|Chest
Spider Curl|Biceps
Standing Cable Crunch|Core
Overhead Cable Curl|Biceps
Zottman Curl|Biceps
Renegade Row|Back
Incline Cable Curl|Biceps
Lying Cable Curl|Biceps
One Arm Landmine Press|Shoulders
Dumbbell Front Squat|Legs
One Arm Seated Cable Row|Back
Cable Hammer Curl|Biceps
Tate Press|Triceps
Dumbbell Split Squat|Legs
Dumbbell Z Press|Shoulders
Wall Ball|Whole Body
Dumbbell Reverse Curl|Forearms
Clap Pull Up|Whole Body
Ring Muscle Ups|Whole Body
Dumbbell Thruster|Whole Body
Decline Dumbbell Fly|Chest
Dumbbell Face Pull|Shoulders
Dumbbell High Pull|Whole Body
Dumbbell Push Press|Shoulders
Dumbbell Clean and Press|Whole Body
Flutter Kicks|Core
Mountain Climbers|Core
Donkey Calf Raise|Legs
Superman|Core
Scissor Kicks|Core

Incline Bicep Curl|Biceps
Rear Delt Fly|Shoulders
Cable Chest Fly|Chest
Single Arm Tricep Extension|Triceps
Skull Crushers|Triceps
`;

/**
 * THE LIFTS THE CATALOGUE FORGOT.
 *
 * This list has 23 squat variants — Box, Pause, Pin, Zercher, Sissy, Safety
 * Bar, Half — and no back squat. It has Decline, Incline, Close Grip and Floor
 * presses, and Bench Press, but no overhead press, no barbell row, no pull-up,
 * no lat pulldown, no conventional deadlift and no leg press that isn't a sled.
 *
 * Every one of those is a variation of a lift that is not in here, which is the
 * signature of a list scraped from the long tail of a database. It shows up in
 * the generated plans: a four-week block came out with "Dumbbell Deadlift" and
 * "Sled Leg Press" as its main lower-body work, because the movements a coach
 * would actually have chosen were not available to choose.
 *
 * These are the ones the programme is built on. They are listed separately from
 * RAW so it stays a clean record of what was imported, and so `STAPLES` below
 * can prefer them for the slot that anchors a session.
 */
const STAPLE_RAW = `
Barbell Back Squat|Legs
Barbell Front Squat|Legs
Barbell Deadlift|Whole Body
Barbell Overhead Press|Shoulders
Barbell Row|Back
Pull Ups|Back
Lat Pulldown|Back
Leg Press|Legs
Barbell Hip Thrust|Legs
Dumbbell Lateral Raise|Shoulders
Cable Tricep Pushdown|Triceps
Leg Curl|Legs
Standing Calf Raise|Legs
Hanging Leg Raise|Core
Plank|Core
Bulgarian Split Squat|Legs
`;

/**
 * The movements a session should be BUILT on, by name.
 *
 * A hypertrophy block opens each muscle group with one compound, and which one
 * it opens with is the most consequential choice in the session. Ranking the
 * pool by "has coaching cues" got "Close Grip Bench Press" as a chest main lift
 * — a triceps press, and the plan said so in its own reason line while calling
 * it a chest lift — and "Cheat Curl" and "JM Press" as anchors.
 *
 * These are not the only movements that can fill a primary slot; they are the
 * ones that win it when they are available and eligible. Novelty belongs in the
 * accessory work, where getting it slightly wrong costs one exercise rather
 * than the spine of the whole block.
 */
export const STAPLES: readonly string[] = [
  // The classics, in rank order. These anchor a session first.
  "Barbell Back Squat", "Barbell Front Squat", "Barbell Deadlift", "Romanian Deadlift",
  "Bench Press", "Incline Bench Press", "Barbell Overhead Press", "Barbell Row",
  "Pull Ups", "Chin Ups", "Lat Pulldown", "Seated Cable Row", "Leg Press",
  "Barbell Hip Thrust", "Dumbbell Bench Press", "Dumbbell Shoulder Press",
  "Dumbbell Row", "Dips", "Barbell Lunge", "Bulgarian Split Squat",
  "Barbell Curl", "Cable Tricep Pushdown", "Leg Curl", "Leg Extension",
  "Standing Calf Raise", "Dumbbell Lateral Raise", "Hanging Leg Raise",

  /**
   * ENOUGH DISTINCT STAPLES TO ANCHOR EVERY DAY A MUSCLE IS TRAINED.
   *
   * The rule that a session opens on a staple, and the rule that a week does
   * not repeat a lift, were in direct conflict — and the conflict was invisible
   * until lib/movement-key.ts made "Bench Press" and "Dumbbell Bench Press" one
   * lift rather than two. Counted by MOVEMENT rather than by catalogue row, the
   * list above held exactly one staple each for biceps, calves, core and
   * glutes, and two for chest and triceps.
   *
   * A full-body three-day week trains chest three times and a six-day one
   * trains it six times. With two chest staples the engine could satisfy
   * "opens on a staple" only by repeating one, which is how an athlete got a
   * bench press on Monday and the dumbbell bench press on Tuesday.
   *
   * These are the additions that make the two rules satisfiable: every group
   * now has at least three distinct movements worth building a session on.
   * Appended rather than interleaved, so the classics above still outrank them
   * — a chest day still opens on a bench press when one is available.
   */
  // chest — was bench press and incline only
  "Decline Bench Press", "Push Ups", "Chest Press",
  // biceps — was one curl
  "Hammer Curl", "Preacher Curl", "Incline Dumbbell Curl",
  // triceps — was dips and a pushdown
  "Lying Tricep Extension", "Cable Overhead Tricep Extension",
  // calves — was the standing raise alone, which is half the muscle
  "Seated Calf Raise", "Donkey Calf Raise", "Machine Calf Raise",
  // core — was the hanging leg raise alone
  "Plank", "Cable Crunch", "Ab Wheel Rollout", "Russian Twist",
  // glutes — was the hip thrust alone
  "Glute Bridge", "Cable Pull Through", "Glute Ham Raise", "Glute Kickback",
  // shoulders — three already, but a six-day week can want more
  "Arnold Press", "Face Pull", "Upright Row",
];

export const IMPORTED_EXERCISES: Exercise[] = build(`${RAW}${STAPLE_RAW}`);
