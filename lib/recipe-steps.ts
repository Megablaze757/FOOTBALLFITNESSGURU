// =============================================================================
// A recipe's method, as something you can follow one line at a time.
//
// Lifted out of lib/meal-plan.ts for the same reason the recipes themselves
// were: the scoring engine and the way a method reads on a phone change for
// completely different reasons. It is re-exported from meal-plan, so no caller
// had to move.
//
// The immediate reason is narrower. lib/recipe-difficulty.ts counts a recipe's
// steps to work out how much of you it needs, and the planner sorts on that
// rating — so meal-plan has to be able to import the rating, and the rating has
// to be able to count steps. Left where it was, those two imports are a cycle.
// Typed structurally rather than against `Meal` so this module imports nothing
// at all and cannot be at one end of a cycle again.
// =============================================================================

/** Everything either function here reads off a recipe. */
export interface MethodSource {
  method: string;
  steps?: string[];
  tip?: string;
}

/**
 * A meal's method as steps you can follow one at a time.
 *
 * Splits on SENTENCE boundaries only, never on commas. Comma-splitting looked
 * tempting — most of these methods are comma-separated instructions — but it
 * mangles the ones with an aside in them ("season hard (turmeric and black
 * salt, if you have them)") and turns "Cheap, high protein and it freezes"
 * into three imaginary steps. A conservative split is never wrong; an
 * aggressive one is wrong in a way that makes the app look careless.
 */
export function recipeSteps(meal: MethodSource): string[] {
  return splitMethod(meal).steps;
}

/**
 * The bit of a method that is commentary rather than instruction.
 *
 * Most of these recipes end on an aside — "Cheap, high protein and it freezes",
 * "Around 1,000 kcal without feeling like a challenge". True, useful, and not a
 * step. Numbering it tells someone to go and do it, which is the kind of small
 * wrongness that makes a whole feature feel machine-generated.
 */
export function recipeNote(meal: MethodSource): string | undefined {
  return meal.tip ?? splitMethod(meal).note;
}

/**
 * Verbs a cooking instruction actually starts with.
 *
 * A list, not a parts-of-speech guess. The set of imperatives used in a recipe
 * is small and closed, and enumerating it is both more accurate than a
 * heuristic and honest about where it will fail — a method starting with a verb
 * that isn't here degrades to "treated as a note", which is safe, rather than
 * to a mangled step.
 */
const COOK_VERBS = new Set([
  "add", "assemble", "bake", "beat", "blend", "blitz", "boil", "bring", "build",
  "chop", "combine", "cook", "cover", "crack", "crisp", "crumble", "cube", "cut",
  "defrost", "dice", "drain", "dress", "drizzle", "everything", "fill", "finish",
  "fold", "fork", "fry", "grate", "grill", "heat", "keep", "layer", "leave",
  "let", "loosen", "mash", "meanwhile", "microwave", "mix", "oven", "pan",
  "plate", "pour", "press", "push", "put", "reduce", "reheat", "rinse", "roast",
  "scramble", "sear", "season", "serve", "shake", "simmer", "slice", "snap",
  "soften", "spread", "sprinkle", "squeeze", "steam", "stir", "take", "toast",
  "top", "toss", "turn", "warm", "wilt", "whisk", "spoon", "tip", "rice",
  "pasta", "potatoes", "beans", "lentils", "oven's", "under",
]);

function isInstruction(sentence: string): boolean {
  const first = sentence.trim().toLowerCase().replace(/^[^a-z]+/, "").split(/[\s,]/)[0] ?? "";
  return COOK_VERBS.has(first);
}

/**
 * Split a prose method into steps plus a trailing note.
 *
 * Sentence boundaries only — never commas. Comma-splitting was tempting, since
 * most of these are comma-separated instructions, but it turns an aside like
 * "season hard (turmeric and black salt, if you have them)" into two steps and
 * "Cheap, high protein and it freezes" into three. A conservative split is
 * never wrong; an aggressive one is wrong in a way that looks careless.
 *
 * Trailing sentences that don't begin with a cooking verb are lifted out as the
 * note. Only TRAILING ones: a non-instruction in the middle is usually context
 * for the step after it ("The tofu needs to be dry. Fry it hard...") and pulling
 * that to the bottom would break the sequence.
 */
function splitMethod(meal: MethodSource): { steps: string[]; note?: string } {
  if (meal.steps?.length) return { steps: meal.steps, note: meal.tip };

  const sentences = meal.method
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);

  const steps = [...sentences];
  const notes: string[] = [];
  // Peel commentary off the end, but never take the last instruction with it —
  // a method must always have at least one step.
  while (steps.length > 1 && !isInstruction(steps[steps.length - 1])) {
    notes.unshift(steps.pop()!);
  }

  return { steps, note: notes.length ? notes.join(" ") : undefined };
}
