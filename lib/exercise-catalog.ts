// =============================================================================
// Imported gym/strength exercise database. ~250 movements (name + primary
// muscle) expanded into Exercise objects with rule-derived equipment, demo
// pattern, category and difficulty. Merged into the coached library so users
// get real breadth, filterable by difficulty / equipment / muscle.
// =============================================================================

import type { Exercise, ExerciseCategory, DemoPattern, Difficulty } from "./exercises";

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
  if (n.includes("landmine")) return "Landmine";
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

function demoOf(name: string, muscle: string): DemoPattern {
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

function build(raw: string): Exercise[] {
  return raw.trim().split("\n").map((line) => {
    const [name, muscle] = line.split("|").map((s) => s.trim());
    const equipment = equipmentOf(name);
    return {
      id: slug(name),
      name,
      category: categoryOf(muscle),
      demo: demoOf(name, muscle),
      equipment,
      muscles: [muscle],
      tempo: "Controlled",
      cues: [],
      why: `Builds the ${muscle.toLowerCase()}.`,
      difficulty: difficultyOf(name),
      imported: true,
    } as Exercise;
  });
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
Close Grip Lat Pulldown|Back
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
Dumbbell Pullover|Back
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
Reverse Grip Lat Pulldown|Back
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
Straight Arm Pulldown|Back
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
Yates Row|Back
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
`;

export const IMPORTED_EXERCISES: Exercise[] = build(RAW);
