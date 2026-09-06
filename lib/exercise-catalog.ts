// =============================================================================
// Imported gym/strength exercise database. ~250 movements (name + primary
// muscle) expanded into Exercise objects with rule-derived equipment, demo
// pattern, category and difficulty. Merged into the coached library so users
// get real breadth, filterable by difficulty / equipment / muscle.
// =============================================================================

import type {
  Exercise,
  ExerciseCategory,
  DemoPattern,
  Difficulty,
} from "./exercises";
import { GENERATED_CUES } from "./exercise-cues.generated";

// --- classifiers ------------------------------------------------------------

export function equipmentOf(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("smith")) return "Smith machine";
  if (n.includes("cable")) return "Cable";
  if (
    n.includes("machine") ||
    n.includes("leg press") ||
    n.includes("leg extension") ||
    /\bleg curl\b|hamstring curl|pulldown|pec deck|pec fly|chest fly machine/.test(
      n,
    ) ||
    n.includes("hip adduction") ||
    n.includes("hip abduction") ||
    n.includes("dip machine")
  )
    return "Machine";
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
  if (
    /^(?:squat jump|squat thrust|single leg squat|split squat|lunge|reverse lunge|walking lunge|side lunge)$/.test(
      n,
    )
  )
    return "Bodyweight";
  if (
    /push ups?|pull ups?|chin ups?|dips?|sit ups?|crunch|burpee|muscle ups?|plank|pistol|handstand|jumping jack|mountain climber|flutter|scissor|superman|russian twist|glute bridge|bodyweight|inverted row|toes to bar|hanging|leg raise|nordic|sissy|ab wheel|good morning|archer|clap|ring/.test(
      n,
    )
  )
    return "Bodyweight";
  if (
    /bench press|squat|deadlift|barbell|clean|snatch|jerk|row|press|curl|shrug|lunge|hip thrust|rack pull|thruster|pull through|calf raise/.test(
      n,
    )
  )
    return "Barbell";
  return "Other";
}

// Equipment normalised to a filter bucket.
export function equipBucket(equipment: string): string {
  const e = equipment.toLowerCase();
  if (
    e.includes("barbell") ||
    e.includes("ez") ||
    e.includes("trap") ||
    e.includes("smith") ||
    e.includes("landmine")
  )
    return "Barbell";
  if (e.includes("dumbbell")) return "Dumbbell";
  if (e.includes("kettlebell")) return "Kettlebell";
  if (e.includes("cable")) return "Cable";
  if (e.includes("machine")) return "Machine";
  if (
    e.includes("bodyweight") ||
    e === "none" ||
    e === "—" ||
    (e.includes("bar") && !e.includes("barbell"))
  )
    return "Bodyweight";
  return "Other";
}

const ADVANCED =
  /snatch|clean|jerk|muscle ups?|pistol|handstand|one arm|nordic|ring |sissy|archer|clap|deficit|planche|jefferson|zercher|behind the neck|behind the back|meadows|spoto|tate|jm press/i;
const EASY =
  /push ups?$|bodyweight|machine|leg press|leg extension|leg curl|lat ?pulldown|pulldown|calf raise|crunch|sit ups?|glute bridge|plank|jumping jack|mountain climber|flutter|scissor|superman|russian twist|curl$|lateral raise|front raise|wrist curl|shrug|face pull|leg raise|back extension|hip adduction|hip abduction|kickback|hyperextension|side bend|good morning|reverse fly|pull through|dead ?bug/i;

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
  if (
    /deadlift|romanian|rdl|good morning|hip thrust|glute bridge|hyperextension|back extension|pull through|swing|shrug/.test(
      n,
    )
  )
    return "hinge";
  if (/lunge|split squat|step up|bulgarian/.test(n)) return "lunge";
  if (/squat|leg press|leg extension|sissy|pistol/.test(n)) return "squat";
  if (
    /pull ups?|chin ups?|pulldown|\brow\b|muscle ups?|face pull|pullover|reverse fly|shrug|lat |inverted row|renegade/.test(
      n,
    )
  )
    return "pull";
  if (
    /jump|burpee|box|clean|snatch|jerk|thruster|power|wall ball|mountain climber|jumping jack|squat thrust/.test(
      n,
    )
  )
    return "jump";
  if (
    /crunch|sit ups?|plank|leg raise|russian twist|flutter|scissor|superman|toes to bar|ab wheel|knee raise|side bend|woodchopper/.test(
      n,
    )
  )
    return "plank";
  if (/calf raise/.test(n)) return "jump";
  // presses, raises, curls, extensions, chest, shoulders → press-style
  return "press";
}

function slug(name: string): string {
  return (
    "x_" +
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
  );
}

// Hand-written coaching for the most-used gym lifts (keyed by lowercased name).
// Anything not here still gets a sensible auto-generated entry.
const COACHING: Record<string, { cues: string[]; why: string }> = {
  // ── Written by hand, checked by draftProblems ──────────────────────────────
  //
  // 197 of the 393 movements here had NO coaching cues and a generated one-line
  // `why` — 43 of them said "Builds the legs." verbatim. The pages are real and
  // distinctly described (the meta description comes from the how-to, so there
  // is no duplicate-content problem), but a page with no cue on it is a page
  // that lists a movement rather than teaching it.
  //
  // ALL OF THEM ARE HERE NOW. 92 were already written; the remaining 173 were
  // done in six passes, and every one of those was run through
  // lib/exercise-draft.ts — the same rules the admin drafting tool applies to a
  // model's output. Eight failed, and all eight for the same reason: a cue
  // naming a body part or a piece of kit the movement's own description never
  // mentions. "Drive through the heels, not the toes" on a glute bridge whose
  // description says nothing about toes; "bar" on a bench pull whose
  // description only ever says "barbell"; "chest" on a Zercher deadlift.
  //
  // They were rewritten inside each description's vocabulary rather than the
  // rule being loosened to admit them. That rule is what stops invented anatomy
  // reaching the library, and it does not stop being right when the author is a
  // person — one of the eight was "Have a spotter hand it to you", where the
  // validator could only see the noun. Being unable to tell that from a body
  // part is the cost of a check that cannot be talked round, and it is worth
  // paying.
  //
  // HERE RATHER THAN IN exercise-cues.generated.ts, deliberately: that file is
  // rewritten wholesale by the Worker on every publish from the drafting tool,
  // and this map always wins over it. Hand-written work belongs where a machine
  // cannot silently replace it.

  "ab wheel rollout": {
    cues: [
      "Keep the hips and ribs in a straight line",
      "Roll out only as far as you can hold",
      "Shorten the range if the back arches",
    ],
    why: "Trains the trunk to resist being pulled into extension, which is what it actually does under a heavy bar.",
  },
  "archer push ups": {
    cues: [
      "Hands very wide",
      "Lower toward one hand at a time",
      "Keep the other arm straight out",
    ],
    why: "Shifts almost all the load onto one arm while the other assists, which is the real stepping stone to a one-arm push-up.",
  },
  "arnold press": {
    cues: [
      "Start palms facing you",
      "Rotate as you press",
      "Full lockout overhead",
    ],
    why: "Hits all three delt heads through a rotating press.",
  },
  "back extension": {
    cues: [
      "Set the pad at hip height",
      "Hinge down under control",
      "Stop at straight, do not arch past it",
    ],
    why: "Trains the back to hold a hinge, which is what keeps it flat when you deadlift or row anything heavy.",
  },
  "barbell back squat": {
    cues: [
      "Bar on the traps, elbows under the bar",
      "Sit between the hips — knees track over the toes",
      "Brace hard before you unrack, not on the way down",
    ],
    why: "The most complete lower-body builder there is — quads, glutes and the whole trunk under one bar.",
  },
  "barbell calf raise": {
    cues: [
      "Balls of the feet on a block",
      "Rise as high as you can, pause",
      "Lower slowly to a full stretch",
    ],
    why: "Loaded across the back so you can add real weight, which is what the calves need and rarely get.",
  },
  "barbell curl": {
    cues: [
      "Elbows fixed, no swinging",
      "Curl to a full contraction",
      "Control the negative",
    ],
    why: "Lets you load the biceps heavier than dumbbells.",
  },
  "barbell deadlift": {
    cues: [
      "Bar over the mid-foot, shins almost touching",
      "Take the slack out of the bar before you pull",
      "Push the floor away — hips and chest rise together",
    ],
    why: "Trains the whole posterior chain and teaches you to brace under real load.",
  },
  "barbell front raise": {
    cues: [
      "Overhand grip at the thighs",
      "Raise to shoulder height with soft elbows",
      "Ribs down — do not lean back to swing",
    ],
    why: "Loads the front of the shoulder directly, through a range a press never takes it through.",
  },
  "barbell front squat": {
    cues: [
      "Elbows high, bar resting on the shoulders",
      "Stay upright — the bar falls if the chest drops",
      "Full depth before you drive",
    ],
    why: "Loads the quads harder than a back squat and punishes a rounded upper back.",
  },
  "barbell glute bridge": {
    cues: [
      "Drive through the heels to lift the hips",
      "Squeeze hard with the torso in line",
      "Finish with the ribs down, do not arch",
    ],
    why: "Loads the glutes directly at the top of a hip extension, which is where a squat gives them almost nothing.",
  },
  "barbell hack squat": {
    cues: [
      "Bar on the floor behind your heels",
      "Grip it behind you and stand",
      "Keep it close to the legs throughout",
    ],
    why: "A quad-biased pull from behind the heels that predates the machine, and needs nothing but a bar and a floor.",
  },
  "barbell hip thrust": {
    cues: [
      "Shoulder blades on the bench, chin tucked",
      "Drive through the heels to full lockout",
      "Squeeze at the top, don't arch the lower back",
    ],
    why: "The strongest position to load the glutes directly.",
  },
  "barbell lunge": {
    cues: [
      "Long step — the front shin stays near vertical",
      "Back knee to just above the floor",
      "Push through the front heel to stand",
    ],
    why: "Single-leg strength and the balance a bilateral squat never asks for.",
  },
  "barbell overhead press": {
    cues: [
      "Squeeze the glutes so the ribs stay down",
      "Move the head back, then press past the face",
      "Finish with the biceps by the ears",
    ],
    why: "Builds honest overhead strength and shoulders that can hold a position.",
  },
  "barbell pullover": {
    cues: [
      "Soft elbows, fixed throughout",
      "Lower to a strong stretch",
      "Start light and never let it drop",
    ],
    why: "A long stretch over the head with a bar, which loads more than a dumbbell but is harder to control.",
  },
  "barbell reverse lunge": {
    cues: [
      "Step back, lower under control",
      "Keep the torso upright",
      "Drive through the front heel to stand",
    ],
    why: "Stepping backwards rather than forwards suits a sore knee, and loading it with a bar makes it a genuine strength lift.",
  },
  "barbell row": {
    cues: [
      "Hinge to ~45°, back flat",
      "Row to the bottom of the ribs",
      "Stop the torso rising to help the bar",
    ],
    why: "Heavy horizontal pulling — the balance to all your pressing.",
  },
  "barbell shrug": {
    cues: [
      "Shrug straight up to the ears",
      "Pause at the top",
      "No rolling the shoulders",
    ],
    why: "Directly builds the traps.",
  },
  "behind the back deadlift": {
    cues: [
      "Grip it behind your legs",
      "Keep it against the back of the thighs",
      "Start light — the setup is awkward",
    ],
    why: "Gripping behind the legs keeps you more upright than a conventional pull and shifts the work to the quads.",
  },
  "behind the neck press": {
    cues: [
      "Lower to about ear level, no further",
      "Keep the torso upright throughout",
      "Swap to a normal press if it strains",
    ],
    why: "An overhead press from behind the head, and one that only makes sense if the shoulder mobility is genuinely there.",
  },
  "belt squat": {
    cues: [
      "Belt around the hips, stand on the platform",
      "Squat with nothing on your back",
      "Let the load hang, do not lean into it",
    ],
    why: "The load hangs from the hips instead of the spine, so the legs can work hard when the lower back cannot.",
  },
  "bench dips": {
    cues: [
      "Lower until the upper arms are parallel",
      "Keep the back close to the bench",
      "Do not go excessively deep",
    ],
    why: "Triceps work from a bench and nothing else, which makes it the fallback when there is no kit at all.",
  },
  "bench pin press": {
    cues: [
      "Set the pins at your sticking height",
      "Press from a dead stop each rep",
      "Never bounce it off the pins",
    ],
    why: "Every rep starts from a dead stop, which kills momentum and shows you exactly where the press is weak.",
  },
  "bench press": {
    cues: [
      "Shoulder blades pinned back and down",
      "Bar to the lower chest, elbows ~45°",
      "Drive the feet into the floor as you press",
    ],
    why: "The benchmark upper-body press for chest, front delts and triceps.",
  },
  "bench pull": {
    cues: [
      "Lie chest-down, barbell hanging beneath",
      "Row to the underside of the bench",
      "Lower to full extension every rep",
    ],
    why: "The bench takes the lower back and all body English out, which makes it the honest measure of rowing strength.",
  },
  "bent over row": {
    cues: [
      "Hinge to ~45°, flat back",
      "Row to the lower ribs",
      "Squeeze the shoulder blades",
    ],
    why: "Heavy horizontal pulling to balance all your pressing.",
  },
  "bicycle crunch": {
    cues: [
      "Rotate with the ribs, not the elbow",
      "Bring the opposite shoulder to the knee",
      "Switch smoothly, as if pedalling",
    ],
    why: "Adds rotation to a crunch, which is what the trunk does in every sprint and every change of direction.",
  },
  "bodyweight squat": {
    cues: ["Sit back and down", "Chest up, heels down", "Full depth"],
    why: "The base squat pattern — master this before loading.",
  },
  "box squat": {
    cues: [
      "Sit back to the box, do not flop",
      "Pause without relaxing the trunk",
      "Drive up the moment you touch",
    ],
    why: "Squatting to a fixed height, which teaches sitting back and makes depth the same on every rep.",
  },
  "bulgarian split squat": {
    cues: [
      "Back foot on the bench, laces down",
      "Drop straight down, torso slightly forward",
      "All the weight through the front foot",
    ],
    why: "Brutal single-leg quad and glute work at a fraction of the spinal load.",
  },
  burpees: {
    cues: [
      "Brace so the hips do not sag",
      "Kick the legs back in one move",
      "Jump the feet in, then jump up",
    ],
    why: "Floor to overhead and back in one rep, which raises the heart rate faster than almost anything else with no kit.",
  },
  "cable bicep curl": {
    cues: ["Elbows fixed", "Constant cable tension", "Squeeze hard at the top"],
    why: "Keeps tension on the biceps through the whole rep.",
  },
  "cable chest fly": {
    cues: [
      "Soft, fixed elbow throughout",
      "Bring the hands together, not just in",
      "Let the chest stretch at the back",
    ],
    why: "Hold a soft, fixed elbow and bring the hands all the way together rather than just inward. The cable keeps tension on the chest through the whole arc, including the top, where a dumbbell fly is very nearly resting against gravity.",
  },
  "cable crunch": {
    cues: [
      "Round the spine down",
      "Crunch with the abs, not the arms",
      "Squeeze at the bottom",
    ],
    why: "Loadable ab work for real progression.",
  },
  "cable fly": {
    cues: [
      "Slight forward lean",
      "Meet in front of the chest",
      "Constant tension throughout",
    ],
    why: "Constant-tension chest isolation from the cables.",
  },
  "cable hammer curl": {
    cues: [
      "Rope on a low pulley, palms facing in",
      "Hold the neutral grip throughout",
      "Lower to a full stretch",
    ],
    why: "Constant tension with a neutral grip, which makes it one of the better ways to load the brachialis.",
  },
  "cable kickback": {
    cues: [
      "Hinge forward, upper arm fixed",
      "Extend the forearm back",
      "Squeeze hard at full extension",
    ],
    why: "The cable keeps tension right through to lockout, which is exactly where a dumbbell version has none.",
  },
  "cable lateral raise": {
    cues: [
      "Constant tension from the cable",
      "Lead with the elbow",
      "Controlled all the way down",
    ],
    why: "Side-delt isolation with tension through the whole range.",
  },
  "cable leg extension": {
    cues: [
      "Ankle cuff on a low pulley",
      "Extend the knee against the resistance",
      "Return under control, do not let it snap",
    ],
    why: "A joint-friendly way to load knee extension when a machine's fixed path does not suit you.",
  },
  "cable overhead tricep extension": {
    cues: [
      "Elbows pointing forward, fixed there",
      "Extend the arms fully overhead",
      "Return to a full stretch under control",
    ],
    why: "The cable keeps tension on through the whole range, and overhead is where the long head is actually stretched.",
  },
  "cable pull through": {
    cues: [
      "Rope between the legs, face away",
      "Hinge and let it travel back",
      "Drive the hips forward hard to stand",
    ],
    why: "The cable pulls you into the hinge, which teaches the pattern better than almost anything else in the gym.",
  },
  "cable reverse fly": {
    cues: [
      "Cross the cables, handle in the far hand",
      "Sweep out and back in a wide arc",
      "Squeeze the rear delts at the end",
    ],
    why: "Cables hold tension right through the arc, which is exactly where dumbbells lose it at the bottom.",
  },
  "cable shrug": {
    cues: [
      "Stand at a low pulley",
      "Shrug up and hold",
      "Lower under control every rep",
    ],
    why: "Constant tension through the full range, which is what a cable does better than free weight.",
  },
  "cable tricep pushdown": {
    cues: [
      "Elbows pinned to the ribs",
      "Extend to a full lockout",
      "Let the stack stretch the triceps at the top",
    ],
    why: "Constant-tension triceps isolation that is easy on the elbows.",
  },
  "cable upright row": {
    cues: [
      "Lead with the elbows all the way up",
      "Pull to chest height",
      "Lower under control, do not drop it",
    ],
    why: "The cable keeps tension consistent through the pull, which a bar loses as it comes up.",
  },
  "cable woodchopper": {
    cues: [
      "Pull down and across to the opposite hip",
      "Rotate through the trunk",
      "Keep the hips relatively stable",
    ],
    why: "Resisting rotation while producing it is what the trunk does in every throw, swing and change of direction.",
  },
  "cheat curl": {
    cues: [
      "Controlled hip drive past the sticking point",
      "Lower as slowly as you can",
      "No slow lowering, no point",
    ],
    why: "Deliberate cheating to overload the lowering, and it only works if the lowering is genuinely slow.",
  },
  "chest press": {
    cues: [
      "Handles level with the mid-chest",
      "Blades back and down",
      "Full lockout without shrugging",
    ],
    why: "A stable pressing pattern for the chest and triceps that is easy to load and easy to repeat.",
  },
  "chest supported dumbbell row": {
    cues: [
      "Lie chest-down, dumbbells hanging beneath",
      "Row to your ribs, squeezing the shoulder blades",
      "Lower fully — the bench removes all cheating",
    ],
    why: "Rowing with the torso fixed, which removes the cheat and makes the upper back do the pulling.",
  },
  "chin ups": {
    cues: [
      "Full dead hang",
      "Lead with the chest",
      "Own the lower — no kipping",
    ],
    why: "Biceps-and-back bodyweight builder; slightly easier than pull-ups.",
  },
  "clap pull up": {
    cues: [
      "Pull until the chest reaches the bar",
      "Catch with slightly bent arms",
      "Never catch with the arms locked",
    ],
    why: "A pull-up explosive enough to leave the bar, which trains the top-end speed a strict pull-up never asks for.",
  },
  clean: {
    cues: [
      "Keep the bar close past the knees",
      "Extend the hips, knees and ankles",
      "Catch it on the shoulders and stand",
    ],
    why: "Takes a bar from the floor to the front of the shoulders, and teaches you to extend hard and then move fast underneath.",
  },
  "clean and jerk": {
    cues: [
      "Stand fully before you start the jerk",
      "Dip and drive, do not press it up",
      "Punch under and lock it out",
    ],
    why: "Takes a bar from the floor to overhead in two lifts, and demands power, timing and a solid overhead position.",
  },
  "clean and press": {
    cues: [
      "Clean the bar to the shoulders",
      "Stand fully and stabilise before pressing",
      "Strictly press overhead — two movements, not one heave",
    ],
    why: "A whole-body lift that trains getting a load from the floor to overhead, which is the pattern most sports actually use.",
  },
  "clean high pull": {
    cues: [
      "Pull the bar to upper-chest height",
      "Elbows high and outside",
      "Finish tall before the arms bend",
    ],
    why: "Bridges a pull and a full clean, so you train the second pull without having to receive the bar.",
  },
  "clean pull": {
    cues: [
      "Pull as high as you can, arms straight",
      "Finish on the toes, hips fully extended",
      "No catch — just the pull",
    ],
    why: "Builds the pulling strength for a clean without the technical demand of catching it.",
  },
  "close grip bench press": {
    cues: ["Hands ~shoulder width", "Elbows tucked", "Bar to the lower chest"],
    why: "A pressing movement that overloads the triceps.",
  },
  "close grip dumbbell bench press": {
    cues: [
      "Palms facing each other throughout",
      "Keep them touching as you press",
      "Lower to the chest with elbows tucked",
    ],
    why: "The neutral grip is far kinder to the shoulder than a flat press, which makes it the substitute when benching hurts.",
  },
  "close grip incline bench press": {
    cues: [
      "Grip about shoulder width",
      "Elbows tucked as you lower",
      "Lower to the upper chest",
    ],
    why: "Combines upper-chest work with a heavy triceps demand, which is two jobs from one lift.",
  },
  "close grip lat pulldown": {
    cues: [
      "Thighs locked under the pads",
      "Pull to the upper chest, leading with the elbows",
      "Let the weight stretch the lats fully at the top",
    ],
    why: "A narrow pulldown that keeps tension on the lats through a long range.",
  },
  "close grip push up": {
    cues: [
      "Hands shoulder width or narrower",
      "Elbows tucked tight to the ribs",
      "Press back up without flaring out",
    ],
    why: "Tucking the elbows turns a push-up into triceps work, and needs nothing but the floor.",
  },
  crunches: {
    cues: [
      "Curl the ribs to the hips",
      "Don't yank the neck",
      "Slow and controlled",
    ],
    why: "Targets the upper abs.",
  },
  "decline bench press": {
    cues: [
      "Slight decline",
      "Bar to the lower chest",
      "Keep the elbows tucked ~45°",
    ],
    why: "Targets the lower chest with a strong pressing angle.",
  },
  "decline crunch": {
    cues: [
      "Feet secured, shoulders curl toward the hips",
      "Hold at the top for a beat",
      "Keep it a crunch, not a sit-up",
    ],
    why: "The decline adds resistance to a crunch while keeping the range short, so the tension stays on the abs.",
  },
  "decline dumbbell bench press": {
    cues: [
      "Kick them up, then get set",
      "Lower to the lower chest with control",
      "Press up and slightly together",
    ],
    why: "The decline angle takes the shoulders out of it and puts the work squarely on the lower chest.",
  },
  "decline dumbbell fly": {
    cues: [
      "Fixed soft elbow bend throughout",
      "Open wide, feel the stretch",
      "Keep it slow — momentum is the danger",
    ],
    why: "A wide arc over the lower chest, and one of the few chest movements that stretches rather than presses.",
  },
  "decline push up": {
    cues: [
      "Feet on a bench, hands on the floor",
      "Keep the body rigid throughout",
      "Lower the chest under control",
    ],
    why: "Elevating the feet puts more bodyweight through the arms and shifts the work to the upper chest.",
  },
  "decline sit up": {
    cues: [
      "Secure the feet, then lie back",
      "Curl up to sitting",
      "Control the lowering, do not drop",
    ],
    why: "The decline adds range and resistance to a sit-up, which is how you make core work progressive.",
  },
  "deficit deadlift": {
    cues: [
      "Stand on a plate or low platform",
      "Hold a flat back through the extra range",
      "Stop the set the moment it rounds",
    ],
    why: "Standing on a plate lengthens the range and makes the start much harder, which is where most deadlifts are lost.",
  },
  "diamond push ups": {
    cues: [
      "Thumbs and index fingers form a diamond",
      "Keep the elbows tucked as you lower",
      "Press up without flaring the hands out",
    ],
    why: "A press with the hands close together under the chest, which makes an ordinary push-up considerably harder.",
  },
  dips: {
    cues: [
      "Slight forward lean for chest",
      "Lower to a comfortable stretch",
      "Lock out strong at the top",
    ],
    why: "Big compound builder for chest and triceps.",
  },
  "donkey calf raise": {
    cues: [
      "Hinge forward with the weight over the hips",
      "Balls of the feet on a block",
      "Rise onto the toes, then lower to a stretch",
    ],
    why: "The hinged position lengthens the calf under load, which is why the old-school lifters swore by it.",
  },
  "dumbbell bench press": {
    cues: [
      "Shoulder blades pinned back",
      "Lower to a deep stretch",
      "Press the dumbbells together at the top",
    ],
    why: "Builds the chest through a bigger range than a barbell, evening out left/right.",
  },
  "dumbbell calf raise": {
    cues: [
      "Balls of the feet on a block",
      "Rise up and pause at the top",
      "Lower to a deep stretch",
    ],
    why: "One leg at a time is easier to load than a bar, and the calves need more load than most people give them.",
  },
  "dumbbell clean and press": {
    cues: [
      "Clean them to the shoulders and stand",
      "Press overhead from a tall position",
      "Lower under control, do not drop them",
    ],
    why: "Floor to overhead with dumbbells, which is a whole-body lift that needs nothing but a pair of weights.",
  },
  "dumbbell concentration curl": {
    cues: [
      "Brace the elbow inside the thigh",
      "Curl to the shoulder and squeeze",
      "Lower to full extension",
    ],
    why: "The braced elbow makes cheating impossible, so the biceps get every rep you actually pay for.",
  },
  "dumbbell curl": {
    cues: [
      "Elbows pinned to your sides",
      "Full squeeze at the top",
      "Slow the lower for 2-3s",
    ],
    why: "The classic biceps builder.",
  },
  "dumbbell deadlift": {
    cues: [
      "Hinge at the hips, keep the back flat",
      "Grip them, then drive the hips forward",
      "Keep them close to the thighs",
    ],
    why: "Keeps the load closer to your centre of mass than a bar, which is easier on the lower back.",
  },
  "dumbbell face pull": {
    cues: [
      "Hinge forward, dumbbells hanging",
      "Pull up with the elbows high and wide",
      "Rotate the shoulders back at the top",
    ],
    why: "A postural movement for the rear shoulders, and it wants a hard squeeze rather than a heavy weight.",
  },
  "dumbbell floor press": {
    cues: [
      "Lower until the triceps touch the floor",
      "Pause on the floor, then press",
      "Keep the knees bent and the feet planted",
    ],
    why: "The floor cuts the range short, which is what makes this the press to reach for when a shoulder is unhappy.",
  },
  "dumbbell fly": {
    cues: [
      "Soft elbows, don't bend them",
      "Open until you feel the stretch",
      "Hug the weights back up",
    ],
    why: "Isolates the chest with a big stretch — great for hypertrophy.",
  },
  "dumbbell front raise": {
    cues: ["Raise to eye level", "No momentum", "Lower slowly"],
    why: "Isolates the front delts.",
  },
  "dumbbell front squat": {
    cues: [
      "Dumbbells at shoulder height, elbows up",
      "Keep the elbows high all the way down",
      "Drive up through the mid-foot",
    ],
    why: "Front-loaded so the torso has to stay tall, and the elbows dropping is what tells you it has failed.",
  },
  "dumbbell high pull": {
    cues: [
      "Start from a hang at the thighs",
      "Extend the hips explosively",
      "Pull to chest height, elbows high",
    ],
    why: "The hips do the work and the arms only finish it, which is the pattern behind every explosive lift.",
  },
  "dumbbell lateral raise": {
    cues: [
      "Lead with the elbows",
      "Raise to shoulder height",
      "Slow negative, no swinging",
    ],
    why: "The key exercise for wider, capped side delts.",
  },
  "dumbbell lunge": {
    cues: [
      "Long step, vertical front shin",
      "Drop the back knee straight down",
      "Drive through the front heel",
    ],
    why: "Single-leg strength and balance that carries to sport.",
  },
  "dumbbell pullover": {
    cues: [
      "Both hands on one dumbbell",
      "Soft elbow bend, fixed throughout",
      "Control the stretch at the bottom",
    ],
    why: "A long stretch across the lats and ribcage that almost no other back movement gives you.",
  },
  "dumbbell push press": {
    cues: [
      "Dip a few inches, torso vertical",
      "Drive hard through the legs",
      "Punch them overhead in one move",
    ],
    why: "Leg drive lets you move more overhead than a strict press, and teaches the whole body to work as one.",
  },
  "dumbbell reverse curl": {
    cues: [
      "Overhand grip, elbows at the sides",
      "Keep the wrists neutral throughout",
      "Do not let the wrists collapse",
    ],
    why: "An overhand curl that hits the forearms hard, and it is far weaker than a normal curl, so go light.",
  },
  "dumbbell reverse fly": {
    cues: [
      "Hinge at the hips, keep the back flat",
      "Raise wide, squeeze the shoulder blades",
      "Stay light — do not shrug the traps",
    ],
    why: "Works the rear shoulders and upper back directly, which is what balances a programme full of pressing.",
  },
  "dumbbell romanian deadlift": {
    cues: [
      "Soft knees, then push the hips back",
      "Dumbbells stay close to the legs",
      "Stop when the hamstrings run out of length",
    ],
    why: "A hip hinge under load that builds the hamstrings and teaches the pattern behind every heavier pull.",
  },
  "dumbbell row": {
    cues: [
      "Flat back, brace on a bench",
      "Drive the elbow past the ribs",
      "Control the lower",
    ],
    why: "Unilateral back builder that irons out left/right imbalances.",
  },
  "dumbbell shoulder press": {
    cues: [
      "Neutral, stacked wrists",
      "Press without flaring the ribs",
      "Full range each rep",
    ],
    why: "Shoulder size and stability with a friendly joint path.",
  },
  "dumbbell shrug": {
    cues: [
      "Dumbbells at your sides at arm's length",
      "Shrug straight up and pause at the top",
      "Lower to a full stretch",
    ],
    why: "Direct work for the upper back and traps, which most pulling leaves half-finished.",
  },
  "dumbbell side bend": {
    cues: [
      "One dumbbell only, never two",
      "Bend directly sideways at the waist",
      "Come back to fully upright",
    ],
    why: "Loads the trunk sideways, which is a direction almost nothing else in a programme trains.",
  },
  "dumbbell snatch": {
    cues: [
      "Start with it between the feet",
      "Extend the hips and knees explosively",
      "Punch the hand through to lockout",
    ],
    why: "Far easier to learn than a barbell snatch and a genuinely useful power exercise for anyone who plays a sport.",
  },
  "dumbbell split squat": {
    cues: [
      "Lower straight down, front shin vertical",
      "Back knee approaches the floor",
      "Drive through the front heel",
    ],
    why: "Keeping the torso tall is what keeps the load on the front leg, and dumbbells make that easy to feel.",
  },
  "dumbbell squat": {
    cues: [
      "Feet shoulder width, chest tall",
      "Sit down and back to parallel",
      "Drive through the mid-foot",
    ],
    why: "A full squat without needing a rack, which makes it the one most people can actually do at home.",
  },
  "dumbbell thruster": {
    cues: [
      "Squat to depth with them at the shoulders",
      "Drive up and press in one motion",
      "Return to the shoulders, then squat again",
    ],
    why: "A squat and an overhead press in one motion, which raises the heart rate faster than either does alone.",
  },
  "dumbbell tricep extension": {
    cues: [
      "Elbows point forward, not out",
      "Lower behind the head for the stretch",
      "Extend without moving the upper arm",
    ],
    why: "Overhead extension puts the triceps in a stretched position that pressing never reaches.",
  },
  "dumbbell tricep kickback": {
    cues: [
      "Upper arm parallel and locked there",
      "Extend the forearm until straight",
      "Light weight — this is not a strength lift",
    ],
    why: "A peak-contraction movement where the upper arm is locked, so the triceps get squeezed hard at full extension.",
  },
  "dumbbell upright row": {
    cues: [
      "Pull up the body, leading with the elbows",
      "Stop at chest height, no higher",
      "Let the wrists find their own path",
    ],
    why: "Dumbbells let the wrists and shoulders find a natural path, which makes this the kinder version of the movement.",
  },
  "dumbbell wrist curl": {
    cues: [
      "Forearm braced on the thigh, palm up",
      "Let the wrist extend fully",
      "Curl up and squeeze at the top",
    ],
    why: "One side at a time allows a fuller range than a bar, and the forearms respond to range as much as load.",
  },
  "dumbbell z press": {
    cues: [
      "Legs straight out on the floor",
      "Stay tall through the spine",
      "Start much lighter than a seated press",
    ],
    why: "No back support and no leg drive, which makes it brutally honest about shoulder and trunk stability.",
  },
  "ez bar curl": {
    cues: [
      "Take the angled grips to spare the wrists",
      "Curl with the elbows fixed at your sides",
      "Lower under control to straight",
    ],
    why: "The angled bar is kinder on the wrists than a straight one, so the biceps stop the set rather than the joints.",
  },
  "face pull": {
    cues: [
      "Pull to the forehead/eyes",
      "Elbows high, rotate out",
      "Squeeze the rear delts",
    ],
    why: "Works the rear delts and upper back directly, which is what balances a programme full of pressing.",
  },
  "floor press": {
    cues: [
      "Lower until the upper arms touch down",
      "Pause briefly, then press",
      "That pause is a stop, not a bounce",
    ],
    why: "The floor stops the range early, which spares the shoulder and overloads the top half of the press.",
  },
  "flutter kicks": {
    cues: [
      "Legs straight and just off the floor",
      "Press the lower back into the floor",
      "Raise the legs if the back arches",
    ],
    why: "Small fast kicks that keep the abs working continuously, with the lower back pressed flat as the test.",
  },
  "glute ham raise": {
    cues: [
      "Lower the torso forward, resisting all the way",
      "Pull back up with the hamstrings",
      "Use a band until the strength is there",
    ],
    why: "One of the very few movements that loads the hamstrings at both ends at once, and it is brutally hard.",
  },
  "glute kickback": {
    cues: [
      "Drive the leg back and up",
      "Squeeze at the top for a beat",
      "Keep the lower back still, do not arch",
    ],
    why: "Loads hip extension directly, which a squat gives the glutes almost none of.",
  },
  "goblet squat": {
    cues: [
      "Hold the bell at the chest",
      "Elbows inside the knees at the bottom",
      "Sit tall and deep",
    ],
    why: "A joint-friendly squat that teaches depth and bracing.",
  },
  "good morning": {
    cues: [
      "Push the hips back, keep the back flat",
      "Soft knees, never locked out",
      "Start with an empty bar",
    ],
    why: "A hinge loaded across the back, which teaches the hips to drive and exposes any rounding immediately.",
  },
  "hack squat": {
    cues: [
      "Full-foot pressure",
      "Knees track over the toes",
      "Deep but controlled",
    ],
    why: "Quad-dominant squat pattern with a fixed, supported path.",
  },
  "half squat": {
    cues: [
      "Squat to a quarter or half depth",
      "Drive back up hard",
      "Keep full-depth squats in the programme",
    ],
    why: "Overloads the top range for sport, and it works as a supplement to full-depth squatting rather than a replacement.",
  },
  "hammer curl": {
    cues: [
      "Neutral grip, thumbs up",
      "Elbows tight to the body",
      "Squeeze at the top",
    ],
    why: "Hits the biceps and the brachialis/forearm for thicker arms.",
  },
  "handstand push ups": {
    cues: [
      "Hands slightly wider than the shoulders",
      "Lower until the head lightly touches",
      "Build up with pike push-ups first",
    ],
    why: "An overhead press with your whole bodyweight on it, and a genuine test of shoulders that can hold a line.",
  },
  "hang clean": {
    cues: [
      "Start with the bar at mid-thigh",
      "Extend the hips hard, then pull under",
      "Catch it on the shoulders",
    ],
    why: "Starting from the hang removes the floor, so you can learn the second pull where the power actually comes from.",
  },
  "hang power clean": {
    cues: [
      "Start with the bar at mid-thigh",
      "Extend hard, then pull under",
      "Catch it with the hips above parallel",
    ],
    why: "Less mobility than a full clean and easier to learn, which is why it is the usual entry point for team-sport athletes.",
  },
  "hanging knee raise": {
    cues: [
      "Raise the knees toward the chest",
      "Curl the pelvis at the top",
      "Get the swing out before adding range",
    ],
    why: "The sensible step toward a full hanging leg raise, and it teaches the pelvis to curl rather than the hips to swing.",
  },
  "hanging leg raise": {
    cues: ["No swinging", "Curl the pelvis up", "Lower under control"],
    why: "Strong lower-ab and hip-flexor builder.",
  },
  "hex bar shrug": {
    cues: [
      "Stand inside the trap bar",
      "Shrug straight up, not backwards",
      "Pause at the top before lowering",
    ],
    why: "The handles sit beside you rather than in front, which makes this the most comfortable heavy shrug available.",
  },
  "hip abduction": {
    cues: [
      "Pads on the outside of the knees",
      "Push apart, hold, return under control",
      "Lean forward or back to shift the feel",
    ],
    why: "Loads the muscles that drive the legs apart, which stabilise the knee on every stride and rarely get trained.",
  },
  "hip adduction": {
    cues: [
      "Squeeze the legs together, hold a beat",
      "Open under control, do not let it snap",
      "Stop at a comfortable stretch",
    ],
    why: "Loads the muscles that pull the legs together, which almost nothing else in a gym programme trains directly.",
  },
  "hip extension": {
    cues: [
      "Set up with the hips free to move",
      "Extend until the torso is in line",
      "Stop at straight, do not arch past it",
    ],
    why: "Trains the glutes to finish a hip extension, which is the end of every sprint stride and every jump.",
  },
  "horizontal leg press": {
    cues: [
      "Feet mid-platform, shoulder width",
      "Lower until the hips start to tuck",
      "Do not lock the knees hard at the top",
    ],
    why: "Loads the legs with the back supported, which is useful when the trunk is already tired from squatting.",
  },
  "incline bench press": {
    cues: [
      "Bench at ~30°",
      "Bar to the upper chest",
      "Drive the feet into the floor",
    ],
    why: "Emphasises the upper chest and front delts.",
  },
  "incline bicep curl": {
    cues: [
      "Lie back so the arms hang behind you",
      "Do not let the elbows drift forward",
      "Stretch fully at the bottom",
    ],
    why: "Sit back on an inclined bench and let the arms hang behind the body, then curl without the elbows travelling forward. That start position holds the long head of the biceps at length, which a standing curl never does — it is the stretch, not the squeeze, doing the work here.",
  },
  "incline cable curl": {
    cues: [
      "Arms hang back behind the torso",
      "Curl up and squeeze",
      "Lower all the way to the stretch",
    ],
    why: "Combines the incline's stretch with the cable's constant tension, which neither gives you on its own.",
  },
  "incline dumbbell bench press": {
    cues: [
      "Bench ~30°, blades retracted",
      "Deep stretch at the bottom",
      "Control the negative",
    ],
    why: "Upper-chest builder with a friendly, free range of motion.",
  },
  "incline dumbbell curl": {
    cues: [
      "Sit back on a 45-60 degree incline",
      "Arms hang straight down behind the torso",
      "Curl without the elbows travelling forward",
    ],
    why: "Starting from a stretch, which is the position a standing curl never reaches.",
  },
  "incline dumbbell fly": {
    cues: [
      "Bench at thirty degrees",
      "Soft elbow bend, fixed throughout",
      "Open to a stretch, then arc back",
    ],
    why: "An incline arc that biases the upper chest, and one of the few chest movements that is a stretch rather than a press.",
  },
  "incline hammer curl": {
    cues: [
      "Sit back, arms hanging, neutral grip",
      "Do not let the elbows drift forward",
      "Lower to a full stretch",
    ],
    why: "The incline puts the biceps on stretch at the bottom, which is the hardest and most productive part of a curl.",
  },
  "incline push up": {
    cues: [
      "Hands on a bench, body straight",
      "Lower the chest to the surface",
      "Lower the hands as you get stronger",
    ],
    why: "The higher the hands, the easier the press, which makes this the way to build to a full push-up rather than grinding out bad ones.",
  },
  "inverted row": {
    cues: [
      "Stay rigid from head to heels",
      "Pull the chest to the bar",
      "Raise the bar to make it easier",
    ],
    why: "A horizontal pull scaled by nothing more than bar height, which makes it the most adjustable back exercise there is.",
  },
  "jefferson deadlift": {
    cues: [
      "Straddle it, one foot either side",
      "One hand in front, one behind",
      "Do equal sets with the stance reversed",
    ],
    why: "An asymmetric pull that loads the body unevenly on purpose, which is a demand almost no other lift makes.",
  },
  "jm press": {
    cues: [
      "Elbows travel forward as you lower",
      "Lower toward the upper chest",
      "Keep it light while you learn it",
    ],
    why: "A hybrid of a close-grip bench and a skull crusher, and a powerlifting staple for building lockout strength.",
  },
  "jumping jack": {
    cues: [
      "Jump the feet wide, arms overhead",
      "Land on the balls of the feet",
      "Keep the knees slightly bent",
    ],
    why: "Raises the heart rate in seconds with no kit and no space, which is why it survives in every warm-up.",
  },
  "landmine press": {
    cues: [
      "Hold the end at your shoulder",
      "Press up and slightly forward",
      "Follow the bar's natural arc",
    ],
    why: "The angled path is much friendlier to the shoulder than a strict vertical press, and still loads it hard.",
  },
  "landmine squat": {
    cues: [
      "Hold the end at chest height",
      "Feet shoulder width, squat straight down",
      "Let the bar's arc hold you upright",
    ],
    why: "The bar's arc counterbalances you, which keeps the torso upright and makes a good squat pattern easy to feel.",
  },
  "lat pulldown": {
    cues: [
      "Drive the elbows down and back",
      "Chest tall, slight lean",
      "No heaving with the torso",
    ],
    why: "Builds back width — a scalable pull-up alternative.",
  },
  "leg curl": {
    cues: [
      "Hips flat on the pad",
      "Curl all the way to the finish",
      "Lower slowly — that half is the point",
    ],
    why: "Trains the hamstrings at the knee, which hinges alone never do.",
  },
  "leg extension": {
    cues: ["Squeeze the quads at the top", "Pause briefly", "Slow the lower"],
    why: "Isolates the quads — great for a knee-friendly quad pump.",
  },
  "leg press": {
    cues: [
      "Feet mid-platform, shoulder width",
      "Lower until the hips start to tuck, no further",
      "Never lock the knees out hard",
    ],
    why: "Loads the quads heavily with the trunk taken out of it — useful when the back is tired.",
  },
  "log press": {
    cues: [
      "Neutral grip on the handles",
      "Clean it to the chest first",
      "Push the head through at lockout",
    ],
    why: "A thick neutral grip held away from the body makes this far harder than a barbell press, so expect less weight.",
  },
  lunge: {
    cues: [
      "Step out long, not short",
      "Front shin roughly vertical",
      "Push back through the front heel",
    ],
    why: "One leg at a time, through a long range, which exposes the side-to-side difference a two-legged squat hides.",
  },
  "lying cable curl": {
    cues: [
      "Lie facing the pulley, arms overhead",
      "Curl the handle toward your forehead",
      "Keep the upper arms still",
    ],
    why: "An unusual angle that keeps the biceps loaded at full stretch, which is where most curls give up.",
  },
  "lying dumbbell tricep extension": {
    cues: [
      "Palms facing each other throughout",
      "Bend the elbows to lower beside the head",
      "Extend without letting the elbows drift",
    ],
    why: "Each arm works on its own, and dumbbells sit easier on the elbows than a straight bar does.",
  },
  "lying leg curl": {
    cues: [
      "Hips pinned to the pad",
      "Curl fully, squeeze",
      "Control the negative",
    ],
    why: "Direct hamstring isolation.",
  },
  "lying leg raise": {
    cues: [
      "Hands under the hips for support",
      "Raise the legs to vertical",
      "Stop the set when the back arches",
    ],
    why: "Trains the abs to hold the pelvis while the legs move, which is what stops a back arching under load.",
  },
  "lying tricep extension": {
    cues: [
      "Lower to the forehead/behind the head",
      "Elbows pointing up, fixed",
      "Control the stretch",
    ],
    why: "Builds the long head of the triceps for bigger arms.",
  },
  "machine back extension": {
    cues: [
      "Pad against the upper back, brace",
      "Extend back smoothly against the pad",
      "Stop at neutral, do not force it",
    ],
    why: "Loads the back extending against resistance on a fixed path, which is hard to do safely any other way.",
  },
  "machine bicep curl": {
    cues: [
      "Elbows on the pad, not sliding",
      "Curl to a hard squeeze",
      "Resist the whole way down",
    ],
    why: "A fixed path for the biceps, which makes it easy to take the last few reps properly.",
  },
  "machine calf raise": {
    cues: [
      "Full stretch at the bottom",
      "Rise all the way onto the toes",
      "Pause a beat at each end",
    ],
    why: "Calves respond to range and to pauses, both of which are easy to control on a machine.",
  },
  "machine chest fly": {
    cues: [
      "Chest tall, slight arch",
      "Squeeze at the middle",
      "Slow, controlled return",
    ],
    why: "A stable, joint-friendly way to isolate and pump the chest.",
  },
  "machine lateral raise": {
    cues: [
      "Pads against the outside of the arms",
      "Raise to shoulder height and squeeze",
      "Lower under control, no swing",
    ],
    why: "The fixed path removes the swinging that ruins most lateral raises, so the shoulders do the whole job.",
  },
  "machine reverse fly": {
    cues: [
      "Chest against the pad, elbows soft",
      "Sweep wide, squeeze the shoulder blades",
      "Control the return, do not drop the stack",
    ],
    why: "Works the rear delts against a fixed path, so the upper back does the job without the torso helping.",
  },
  "machine row": {
    cues: [
      "Set the chest pad so the arms extend fully",
      "Row back and squeeze the shoulder blades",
      "Return under control to a full stretch",
    ],
    why: "Horizontal pulling with the trunk supported, so the back does the work rather than the hips.",
  },
  "machine seated crunch": {
    cues: [
      "Pad against the chest, grip the handles",
      "Crunch by shortening the abs",
      "Return under control, do not let it drop",
    ],
    why: "One of the few ways to add load to the abs progressively, which most core work never manages.",
  },
  "machine shoulder press": {
    cues: [
      "Seat height puts the handles at shoulder height",
      "Press up smoothly to near-lockout",
      "Lower under control, no bouncing",
    ],
    why: "Overhead pressing with the trunk supported, which keeps the load on the shoulders.",
  },
  "machine shrug": {
    cues: [
      "Handles at your sides",
      "Shrug straight up and pause",
      "Lower under control every rep",
    ],
    why: "A fixed path means you can load the traps heavily without balance ever being the limit.",
  },
  "machine tricep extension": {
    cues: [
      "Elbows at the machine's pivot point",
      "Extend and squeeze at lockout",
      "Return under control, do not drop it",
    ],
    why: "A fixed path means you can take the triceps to failure without the technique falling apart.",
  },
  "meadows row": {
    cues: [
      "Stand side-on, hinge at the hips",
      "Brace the other hand on your knee",
      "Let the shoulder stretch forward at the bottom",
    ],
    why: "The landmine angle gives an unusually long range through the lat, which a straight bar cannot reach.",
  },
  "military press": {
    cues: [
      "Strict — no leg drive",
      "Ribs down, don't lean back",
      "Bar over the mid-foot at lockout",
    ],
    why: "A strict standing press that builds honest overhead strength.",
  },
  "mountain climbers": {
    cues: [
      "Body straight in a push-up position",
      "Drive one knee toward the chest",
      "Keep the hips low and level",
    ],
    why: "Core and conditioning at once, and the hips popping up is what turns it into neither.",
  },
  "muscle ups": {
    cues: [
      "Pull as high as you can, leaning back",
      "Whip the chest over the bar",
      "Turn the wrists on top before pressing",
    ],
    why: "Joins a high pull to a dip in one movement, and rewards a pull that is genuinely explosive rather than merely strong.",
  },
  "neutral grip pull ups": {
    cues: [
      "Lead with the chest, not the chin",
      "Drive the elbows down and back",
      "Lower to a full hang each rep",
    ],
    why: "The most shoulder-friendly of the pull-up grips, and a good choice when a wide grip pinches at the top.",
  },
  "one arm landmine press": {
    cues: [
      "Hold the bar end at one shoulder",
      "Press up and across",
      "Keep the hips square as it pushes you",
    ],
    why: "Pressing on one side while the torso refuses to rotate, which is half the exercise and all of the point.",
  },
  "one arm lat pulldown": {
    cues: [
      "Let the shoulder stretch fully at the top",
      "Pull the elbow down toward your hip",
      "Match the reps on both sides",
    ],
    why: "Working one side at a time exposes a strength difference the bar version hides completely.",
  },
  "one arm push ups": {
    cues: [
      "Feet wide, working elbow tucked in",
      "Keep the hips square to the floor",
      "Lower under control, then press",
    ],
    why: "A press with an enormous anti-rotation demand, so the chest works while the trunk fights being twisted off square.",
  },
  "one arm seated cable row": {
    cues: [
      "Let the shoulder travel forward at the stretch",
      "Pull to the side of your abdomen",
      "Match the reps on both sides",
    ],
    why: "One side at a time gives more range and shows up an imbalance the two-handed version hides.",
  },
  "overhead cable curl": {
    cues: [
      "Arms out at shoulder height",
      "Curl the handles toward your ears",
      "Light weight, hard squeeze at the top",
    ],
    why: "The overhead position keeps the biceps under tension where they are shortest, which a normal curl never does.",
  },
  "overhead squat": {
    cues: [
      "Push up into the bar the whole time",
      "Keep it over the mid-foot",
      "Start with a broomstick, not a bar",
    ],
    why: "A full squat with the bar locked out overhead, and the most honest test of mobility in the gym.",
  },
  "pause deadlift": {
    cues: [
      "Pull to just below the knee and stop",
      "Hold the position for two seconds",
      "Keep it close through the pause",
    ],
    why: "The pause exposes the hips shooting up or the bar drifting away, and forces you to hold position under load.",
  },
  "pause squat": {
    cues: [
      "Hold at depth for two to three seconds",
      "Stay braced through the whole pause",
      "Drive up without rocking forward",
    ],
    why: "Removes the stretch reflex entirely, which exposes exactly how weak you are out of the bottom.",
  },
  "paused bench press": {
    cues: [
      "Rest it motionless on the chest",
      "Stay tight through the pause",
      "Expect less weight than touch-and-go",
    ],
    why: "Removing the bounce makes every rep start from a dead stop, which is where a bench press is genuinely weakest.",
  },
  "pendlay row": {
    cues: [
      "Torso parallel, back flat",
      "Bar returns to the floor each rep",
      "Pull explosively to the lower chest",
    ],
    why: "A dead-stop row from the floor that removes the stretch reflex and builds honest upper-back pulling strength.",
  },
  "pike push up": {
    cues: [
      "Walk the feet in, hips high",
      "Lower the crown of the head to the floor",
      "Move the feet closer to make it harder",
    ],
    why: "The closer the feet come to the hands, the more vertical the press, which makes it the honest route to a handstand push-up.",
  },
  "pin squat": {
    cues: [
      "Set the pins at your target depth",
      "Release the tension for a beat",
      "Drive up from a dead stop",
    ],
    why: "Starting from a dead stop on the pins removes all momentum, and is the most honest test of a sticking point.",
  },
  "pistol squat": {
    cues: [
      "Sit back, do not fall forward",
      "Free leg straight and off the floor",
      "Hold a counterweight if you cannot balance",
    ],
    why: "Single-leg squatting to full depth, which exposes a side-to-side difference nothing bilateral will show.",
  },
  plank: {
    cues: [
      "Forearms under the shoulders",
      "Squeeze the glutes, pull the ribs down",
      "Stop when the hips drop or lift",
    ],
    why: "The brace is the exercise, not the holding on — two good short holds beat one sloppy long one.",
  },
  "power snatch": {
    cues: [
      "Receive it with the hips above parallel",
      "Keep the bar close on the way up",
      "Lock the arms out overhead",
    ],
    why: "The same explosive pull as a snatch with far less mobility needed, which makes it the one most people can train.",
  },
  "preacher curl": {
    cues: [
      "Armpits on the pad",
      "Don't fully lock out at the bottom",
      "Full squeeze at the top",
    ],
    why: "Strict biceps isolation with no cheating.",
  },
  "pull ups": {
    cues: [
      "Full dead hang between reps",
      "Lead with the chest, elbows down and back",
      "Own the lower — no kipping",
    ],
    why: "The best builder of back width there is, and it costs nothing.",
  },
  "push jerk": {
    cues: [
      "Dip and drive, then re-bend the knees",
      "Receive it with the arms straight",
      "Stand up once it is locked out",
    ],
    why: "Teaches you to drop under a bar rather than press it, which is where the extra weight over a push press comes from.",
  },
  "push press": {
    cues: [
      "Small dip from the legs",
      "Explode the bar up",
      "Punch the head through at lockout",
    ],
    why: "Lets you move more overhead by adding leg drive — builds power.",
  },
  "push ups": {
    cues: [
      "Body in a straight line, glutes tight",
      "Chest to the floor",
      "Elbows ~45°, not flared",
    ],
    why: "The foundational bodyweight press — endlessly scalable.",
  },
  "rack pull": {
    cues: [
      "Set the pins just below the knee",
      "Brace before you break it off the pins",
      "Stop the moment the back wants to round",
    ],
    why: "Overloads the top half of the deadlift from the pins, so you handle more than the floor would ever let you lift.",
  },
  "rear delt fly": {
    cues: [
      "Hinge until the chest faces the floor",
      "Lead with the elbows, not the hands",
      "Stop level with the shoulders",
    ],
    why: "Hinge until the chest faces the floor and sweep the arms apart, leading with the elbows and stopping level with the shoulders. It trains the back of the shoulder, which no pressing movement reaches and which every hour at a desk quietly shortens.",
  },
  "renegade row": {
    cues: [
      "Feet wide in a push-up position",
      "Row one dumbbell to the hip",
      "Keep the hips absolutely square",
    ],
    why: "The anti-rotation demand is the exercise — if the hips twist, the weight is too heavy.",
  },
  "reverse barbell curl": {
    cues: [
      "Overhand grip, wrists straight",
      "Keep the elbows at your sides",
      "Go lighter than you think",
    ],
    why: "An overhand curl that builds the forearm and brachialis, and expect far less weight than a normal curl.",
  },
  "reverse crunches": {
    cues: [
      "Knees bent at ninety degrees",
      "Curl the hips off the floor",
      "Lift with the abs, not with a swing",
    ],
    why: "Curls the pelvis rather than the shoulders, which loads the lower abs a normal crunch barely reaches.",
  },
  "reverse grip bench press": {
    cues: [
      "Get a spotter to help you unrack it",
      "Elbows tucked, lower to the lower chest",
      "Never unrack this one alone",
    ],
    why: "An underhand grip biases the upper chest and sits easily on the shoulder, but the unrack is the dangerous part.",
  },
  "reverse grip lat pulldown": {
    cues: [
      "Underhand grip about shoulder width",
      "Drive the elbows down close to the ribs",
      "Chest tall, do not round toward the bar",
    ],
    why: "An underhand pull that brings the lower lats and biceps in, and lets most people pull more than a wide grip.",
  },
  "reverse grip tricep pushdown": {
    cues: [
      "Underhand grip on a straight bar",
      "Elbows tight to the sides",
      "Go lighter than a normal pushdown",
    ],
    why: "The reversed grip biases the medial head, and the grip runs out before the triceps do.",
  },
  "reverse hyperextension": {
    cues: [
      "Hips at the edge, legs hanging",
      "Raise until they are in line with the torso",
      "Never swing them up with momentum",
    ],
    why: "Loads hip extension with the torso fixed, which is a rare thing to be able to train directly.",
  },
  "reverse wrist curl": {
    cues: [
      "Forearms braced, palms facing down",
      "Raise the backs of the hands toward you",
      "Use a fraction of your usual weight",
    ],
    why: "Trains the forearms in the direction the palm-up version ignores, and it is far weaker, so go very light.",
  },
  "ring dips": {
    cues: [
      "Lower under control to about parallel",
      "Press up and turn the rings out",
      "Build on bars before you try these",
    ],
    why: "The rings move, so you stabilise them as well as press — far harder than the same dip on bars.",
  },
  "ring muscle ups": {
    cues: [
      "Set the false grip before you pull",
      "Roll the shoulders over the rings",
      "Press out with the rings turned out",
    ],
    why: "The false grip is the prerequisite and takes weeks to build, which is why most transitions stall without one.",
  },
  "romanian deadlift": {
    cues: [
      "Soft knees, push the hips back",
      "Bar close to the legs",
      "Feel the hamstring stretch, then stand",
    ],
    why: "The best hamstring and glute builder through a big hip hinge.",
  },
  "russian twist": {
    cues: [
      "Rotate from the ribs",
      "Keep the chest tall",
      "Controlled side to side",
    ],
    why: "Trains the obliques and rotational core.",
  },
  "safety bar squat": {
    cues: [
      "Yoke on the shoulders, hands on the handles",
      "Brace the upper back hard",
      "Expect it to push you forward",
    ],
    why: "The answer when shoulder mobility makes holding a straight bar painful, and it loads the upper back harder.",
  },
  "scissor kicks": {
    cues: [
      "Legs straight and off the floor",
      "Cross one leg over the other",
      "Keep the lower back pressed down",
    ],
    why: "Keeps the abs loaded continuously while the legs alternate, with the lower back staying flat throughout.",
  },
  "seated cable row": {
    cues: [
      "Tall chest, don't round",
      "Pull to the belly button",
      "Squeeze then control back",
    ],
    why: "Mid-back thickness with constant cable tension.",
  },
  "seated calf raise": {
    cues: [
      "Pad across the thighs just above the knees",
      "Balls of the feet on the platform",
      "Rise onto the toes, then lower to a deep stretch",
    ],
    why: "Bending the knee shifts the work to the soleus, which the standing version barely reaches.",
  },
  "seated dip machine": {
    cues: [
      "Sit tall with the back supported",
      "Press down until the arms are almost straight",
      "Return under control, do not drop",
    ],
    why: "All the triceps work of a dip with the back supported, which makes it the sensible substitute.",
  },
  "seated dumbbell curl": {
    cues: [
      "Sit upright, dumbbells at your sides",
      "Elbows fixed as you curl",
      "Lower to a full stretch",
    ],
    why: "Sitting removes the hips entirely, which makes it stricter than the standing version by default.",
  },
  "seated dumbbell shoulder press": {
    cues: [
      "Elbows slightly in front of the body",
      "Lower to ear height under control",
      "Press up and slightly together",
    ],
    why: "Independent dumbbells overhead, which evens out a stronger side and lets the shoulders find their own path.",
  },
  "seated dumbbell tricep extension": {
    cues: [
      "Sit upright with the back supported",
      "Lower behind the head under control",
      "Extend to a full lockout",
    ],
    why: "Back support stops you leaning away to cheat, which is what makes the seated version the stricter one.",
  },
  "seated leg curl": {
    cues: [
      "Drive the heels down and under",
      "Squeeze the hamstrings",
      "Slow return",
    ],
    why: "Isolates the hamstrings for size and knee health.",
  },
  "seated shoulder press": {
    cues: [
      "Bar starts at collarbone height",
      "Push the head through at lockout",
      "Do not arch over the bench for extra reps",
    ],
    why: "Seated overhead pressing that takes the legs and lower back out of the lift.",
  },
  "shoulder press": {
    cues: [
      "Brace the core, glutes tight",
      "Press in a path close to your face",
      "Full lockout, biceps by the ears",
    ],
    why: "The primary overhead pressing lift for shoulder strength and stability.",
  },
  "side crunch": {
    cues: [
      "Lie on your side with the knees bent",
      "Crunch the ribs toward the hip",
      "Lower under control, keep it small",
    ],
    why: "A short, direct movement for the obliques, which most core work only loads by accident.",
  },
  "side leg raise": {
    cues: [
      "Body in a straight line on your side",
      "Raise the top leg as high as it goes",
      "Keep the hips stacked, do not roll back",
    ],
    why: "Trains the muscles that hold the hip steady on one leg, which is most of what running actually asks of them.",
  },
  "side lunge": {
    cues: [
      "Step wide, sit the hips back",
      "Toes point forward, chest tall",
      "Other leg stays straight",
    ],
    why: "Trains the adductors and the sideways movement that forward lunges miss entirely.",
  },
  "single arm tricep extension": {
    cues: [
      "Upper arm still, beside your head",
      "Lower behind the head, not to the side",
      "Lock out without swinging",
    ],
    why: "Keep the upper arm beside the head and lower behind it rather than out to the side, then lock out without swinging. Working one arm at a time stops the stronger side carrying the weaker one, which is exactly what a two-handed version hides.",
  },
  "single leg deadlift": {
    cues: [
      "Free leg extends straight behind",
      "Keep the hips level throughout",
      "Drive the hip forward to stand",
    ],
    why: "A hinge on one leg where the free leg acts as the counterbalance, and the hips have to stay level to do it.",
  },
  "single leg dumbbell deadlift": {
    cues: [
      "Dumbbell in the opposite hand",
      "Free leg extends straight behind",
      "Go slow — balance is the limit",
    ],
    why: "A hinge on one leg where balance runs out before strength does, which is exactly the point.",
  },
  "single leg press": {
    cues: [
      "One foot centred on the platform",
      "Lower under control to about ninety",
      "Press back without locking out",
    ],
    why: "One leg at a time evens up a difference the two-legged press hides completely.",
  },
  "single leg romanian deadlift": {
    cues: [
      "Free leg extends straight behind",
      "Hips stay square to the floor",
      "Lower until the hamstring stretches",
    ],
    why: "A hinge on one leg, which trains the hamstring and the balance a two-legged lift never asks for.",
  },
  "single leg squat": {
    cues: [
      "Sit back and down, not straight down",
      "Knee tracks over the foot",
      "Use a box to catch you",
    ],
    why: "The hardest thing a leg can do without a barbell, and it demands balance and control as much as strength.",
  },
  "sissy squat": {
    cues: [
      "Rise onto the balls of the feet",
      "Keep the hips and shoulders in line",
      "Stop if there is any joint pain",
    ],
    why: "Lets the knees travel forward under control, which loads the quads through a range a normal squat never reaches.",
  },
  "sit ups": {
    cues: [
      "Roll up through the spine, not off the floor",
      "Keep the knees bent and the feet down",
      "Lower under control, do not drop",
    ],
    why: "Trains the core to curl the spine segment by segment, which is what the trunk actually does when you get up off the floor.",
  },
  "skull crushers": {
    cues: [
      "Elbows in and pointing at the ceiling",
      "Lower to the forehead or just past it",
      "Stop short of locking out to keep tension",
    ],
    why: "Lie back, keep the elbows tucked and pointing at the ceiling, and lower the bar to the forehead or just past it. Because the arms stay overhead the long head of the triceps is loaded at length, which pushdowns never manage.",
  },
  "sled leg press": {
    cues: [
      "Feet mid-platform, knees track toes",
      "Don't lock out hard",
      "Full controlled range",
    ],
    why: "Loads the legs heavy with the back supported.",
  },
  "smith machine bench press": {
    cues: [
      "Set the bench so the bar lands on the lower chest",
      "Unhook and press the fixed path",
      "Push closer to failure than you would alone",
    ],
    why: "Pressing on a fixed path, so you can work close to failure without a spotter.",
  },
  "smith machine shrug": {
    cues: [
      "Unlock the bar at thigh height",
      "Shrug straight up and pause",
      "Lower under control, do not drop",
    ],
    why: "The machine takes the balance out entirely, so all you do is shrug and the traps can be loaded heavily.",
  },
  "smith machine squat": {
    cues: [
      "Feet slightly forward of the bar",
      "Brace before you unrack",
      "Same depth every rep on the fixed path",
    ],
    why: "A fixed bar path that lets you push the legs hard without spending attention on balance.",
  },
  snatch: {
    cues: [
      "Keep the bar close on the way up",
      "Extend fully before you pull under",
      "Catch it locked out and stand",
    ],
    why: "One pull from the floor to overhead, and the most technical lift in the gym — worth learning slowly with a light bar.",
  },
  "snatch deadlift": {
    cues: [
      "Take a very wide, snatch-width grip",
      "Hips lower and chest higher than usual",
      "Keep it close through the longer range",
    ],
    why: "A wide grip drops the hips and lifts the chest, which builds the snatch position as much as it builds strength.",
  },
  "snatch pull": {
    cues: [
      "Snatch-width grip, arms straight",
      "Pull as high as you can",
      "Finish tall on the toes",
    ],
    why: "All the pulling power of the snatch with none of the catch, which makes it trainable long before the lift is.",
  },
  "spider curl": {
    cues: [
      "Lie chest-down, arms hanging straight",
      "Curl up and pause at the top",
      "Lower to a full stretch",
    ],
    why: "The arms hang vertically, so tension peaks at the top of the curl rather than the middle.",
  },
  "split jerk": {
    cues: [
      "Dip and drive, then split the feet",
      "Front shin vertical, back knee soft",
      "Catch it with the arms locked out",
    ],
    why: "Splitting the feet gives you a much bigger base to receive a bar in, which is why the heaviest overhead lifts use it.",
  },
  "split squat": {
    cues: [
      "Long stride, back heel raised",
      "Travel straight down, not forward",
      "Drive up through the front foot",
    ],
    why: "One leg at a time with the stance fixed, which removes the balance problem and leaves only the strength.",
  },
  "spoto press": {
    cues: [
      "Stop about an inch above the chest",
      "Hold it there for a second",
      "Use around eighty percent of your bench",
    ],
    why: "Nothing touches, so you control the bar in the hardest position for a full second — good for a sticking point off the chest.",
  },
  "squat jump": {
    cues: [
      "Dip to a quarter squat, then jump",
      "Land soft with the knees bent",
      "Stop when the jumps get lower",
    ],
    why: "Trains the legs to produce force fast, which is the quality that decides a sprint start or a header.",
  },
  "squat thrust": {
    cues: [
      "Hands to the floor, kick the feet back",
      "Keep the hips level in the plank",
      "Jump the feet in and stand",
    ],
    why: "A burpee without the jump, which keeps the heart rate up while sparing the knees and the landing.",
  },
  "standing cable crunch": {
    cues: [
      "Rope behind the head, face away",
      "Curl the ribs toward the hips",
      "Keep the hips fixed, bend the spine",
    ],
    why: "Loads a crunch progressively, which is something almost no bodyweight core work manages.",
  },
  "standing calf raise": {
    cues: [
      "Rise onto the big toe, not the outside edge",
      "Pause at the top",
      "Full stretch at the bottom, no bouncing",
    ],
    why: "The calves grow from the stretch and the pause — speed wastes the set.",
  },
  "standing leg curl": {
    cues: [
      "Brace the standing leg",
      "Curl the heel toward the glute",
      "Keep the thigh still throughout",
    ],
    why: "One leg at a time makes a hamstring imbalance obvious, and an imbalance is what a two-legged curl hides.",
  },
  "stiff leg deadlift": {
    cues: [
      "Hinge at the hips, keep the back flat",
      "Legs stay nearly straight throughout",
      "Go lighter than a conventional deadlift",
    ],
    why: "A hinge with the legs nearly locked, which puts a long stretch on the hamstrings and teaches the hips to drive.",
  },
  "straight arm pulldown": {
    cues: [
      "Arms straight but not locked",
      "Pull down to the thighs in an arc",
      "Bending the elbows defeats the point",
    ],
    why: "Isolates the lats without the biceps joining in, which almost no other pulling movement manages.",
  },
  "strict curl": {
    cues: [
      "Back and glutes flat against the wall",
      "Elbows and hips do not move",
      "Expect to drop a third of your weight",
    ],
    why: "The wall makes cheating physically impossible, so the number you lift is the number the biceps actually moved.",
  },
  "sumo deadlift": {
    cues: [
      "Wide stance, toes turned out",
      "Hips low, chest up, arms vertical",
      "Push the floor apart as you stand",
    ],
    why: "A wider stance that shortens the pull and asks more of the hips and quads than a conventional deadlift.",
  },
  "sumo squat": {
    cues: [
      "Toes turned out about forty-five degrees",
      "Squat straight down between the legs",
      "Knees track out over the toes",
    ],
    why: "A wide stance with the toes out brings the adductors and glutes in heavily, which a narrow squat barely touches.",
  },
  superman: {
    cues: [
      "Lie face-down, arms extended overhead",
      "Raise the arms, chest and legs together",
      "Lift to a comfortable height, do not crank",
    ],
    why: "A gentle way to load the lower back and glutes with nothing but the floor.",
  },
  "t bar row": {
    cues: [
      "Flat back, chest supported if possible",
      "Row to the sternum",
      "Big squeeze at the top",
    ],
    why: "Loads the mid-back heavy and safe.",
  },
  "tate press": {
    cues: [
      "Palms facing forward above the chest",
      "Flare the elbows and arc them in",
      "Start very light while you learn it",
    ],
    why: "An odd-feeling press that loads the triceps hard at lockout, which is exactly where a bench press is lost.",
  },
  thruster: {
    cues: [
      "Hold the bar in a front rack",
      "Squat deep, then drive straight up",
      "Never pause at the top of the squat",
    ],
    why: "A squat and an overhead press welded together, so the legs pass the bar straight to the arms without a pause.",
  },
  "toes to bar": {
    cues: [
      "Bring the toes all the way to the bar",
      "Lower under control, no swinging",
      "Learn it strict before you kip",
    ],
    why: "Needs strong abs and open hamstrings at the same time, which is why so few people can do it strictly.",
  },
  "tricep extension": {
    cues: [
      "Elbows fixed and pointing forward",
      "Extend until straight, then squeeze",
      "Only the forearm moves",
    ],
    why: "Isolates the triceps by fixing the elbow, so the one thing that moves is the forearm.",
  },
  "tricep pushdown": {
    cues: [
      "Elbows glued to your sides",
      "Full lockout at the bottom",
      "Control back up",
    ],
    why: "The go-to triceps isolation for the outer head.",
  },
  "tricep rope pushdown": {
    cues: [
      "Split the rope at the bottom",
      "Elbows pinned",
      "Full extension and squeeze",
    ],
    why: "Extra contraction at the bottom for the triceps.",
  },
  "upright row": {
    cues: [
      "Lead with the elbows",
      "Pull to mid-chest, not the chin",
      "Keep it slow",
    ],
    why: "Builds side delts and traps (stop at chest height to spare the shoulder).",
  },
  "vertical leg press": {
    cues: [
      "Lower back flat against the pad",
      "Control the descent, no bouncing",
      "Stop before the hips lift off",
    ],
    why: "A steeper pressing angle that puts the legs under load with very little demand on the trunk.",
  },
  "viking press": {
    cues: [
      "Neutral grip at shoulder height",
      "Brace hard before you press",
      "Follow the machine's arc, do not fight it",
    ],
    why: "A fixed arc and a neutral grip usually let you press more than a barbell, and sit easier on the shoulders.",
  },
  "walking lunge": {
    cues: ["Big controlled steps", "Torso tall", "Push through the front foot"],
    why: "Builds legs and stability under continuous tension.",
  },
  "wall ball": {
    cues: [
      "Squat to full depth every rep",
      "Drive up and throw at the target",
      "Let the catch travel into the next squat",
    ],
    why: "A squat and a throw joined together, so the legs pass force straight into the ball with nothing wasted.",
  },
  "wide grip bench press": {
    cues: [
      "Grip wider than your normal bench",
      "Lower to the upper chest",
      "Stop if the front of the shoulder pinches",
    ],
    why: "A wider grip shortens the range and biases the chest, at the cost of a more exposed shoulder position.",
  },
  "wrist curl": {
    cues: [
      "Forearms braced, palms facing up",
      "Let it roll to the fingertips",
      "Only the wrists move",
    ],
    why: "Direct work for the forearms, which almost every programme leaves entirely to grip on other lifts.",
  },
  "yates row": {
    cues: [
      "Lean forward about twenty to thirty degrees",
      "Underhand grip, row to the lower abdomen",
      "Keep it strict, never jerk it up",
    ],
    why: "A more upright row that allows heavier loading, and the underhand grip brings the lower lats in.",
  },
  "z press": {
    cues: [
      "Sit with the legs straight in front",
      "Press without leaning back",
      "Too heavy if you collapse forward",
    ],
    why: "No back support and no leg drive, so the trunk does everything — which is exactly what makes it worth doing.",
  },
  "zercher deadlift": {
    cues: [
      "Hook it into the crooks of the elbows",
      "Stand with the torso upright",
      "Use padding — the arms give out first",
    ],
    why: "Holding the bar in the elbows forces an upright torso and a hard upper-back brace all the way up.",
  },
  "zercher squat": {
    cues: [
      "Bar in the crooks of the elbows",
      "Squat with the chest tall",
      "Start light — it is hard on the arms",
    ],
    why: "Holding the bar in the elbows forces a very upright squat, so any forward lean shows up immediately.",
  },
  "zottman curl": {
    cues: [
      "Curl up with the palms facing up",
      "Rotate the wrists at the top",
      "Lower slowly with the palms down",
    ],
    why: "A strong curl on the way up and a forearm-biased lowering on the way down, from one rep.",
  },
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
  const lines = raw
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

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
    const muscles = (muscleField ?? "")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);
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
  "Barbell Back Squat",
  "Barbell Front Squat",
  "Barbell Deadlift",
  "Romanian Deadlift",
  "Bench Press",
  "Incline Bench Press",
  "Barbell Overhead Press",
  "Barbell Row",
  "Pull Ups",
  "Chin Ups",
  "Lat Pulldown",
  "Seated Cable Row",
  "Leg Press",
  "Barbell Hip Thrust",
  "Dumbbell Bench Press",
  "Dumbbell Shoulder Press",
  "Dumbbell Row",
  "Dips",
  "Barbell Lunge",
  "Bulgarian Split Squat",
  "Barbell Curl",
  "Cable Tricep Pushdown",
  "Leg Curl",
  "Leg Extension",
  "Standing Calf Raise",
  "Dumbbell Lateral Raise",
  "Hanging Leg Raise",

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
  "Decline Bench Press",
  "Push Ups",
  "Chest Press",
  // biceps — was one curl
  "Hammer Curl",
  "Preacher Curl",
  "Incline Dumbbell Curl",
  // triceps — was dips and a pushdown
  "Lying Tricep Extension",
  "Cable Overhead Tricep Extension",
  // calves — was the standing raise alone, which is half the muscle
  "Seated Calf Raise",
  "Donkey Calf Raise",
  "Machine Calf Raise",
  // core — was the hanging leg raise alone
  "Plank",
  "Cable Crunch",
  "Ab Wheel Rollout",
  "Russian Twist",
  // glutes — was the hip thrust alone
  "Glute Bridge",
  "Cable Pull Through",
  "Glute Ham Raise",
  "Glute Kickback",
  // shoulders — three already, but a six-day week can want more
  "Arnold Press",
  "Face Pull",
  "Upright Row",
];

export const IMPORTED_EXERCISES: Exercise[] = build(`${RAW}${STAPLE_RAW}`);
