// =============================================================================
// Are these two exercise names the same lift?
//
// Reported by an athlete: "gave same exercise 2 days in a row, barbell bench
// press then bench press". Both engines de-duplicated by catalogue id, which
// answers a narrower question than the one that matters — the catalogue holds
// Bench Press, Dumbbell Bench Press and Smith Machine Bench Press as three
// rows, and Machine Shrug and Dumbbell Shrug as two, so a week could prescribe
// a shrug on Monday and the same shrug on Thursday with nothing objecting.
//
// A measured audit of 2,700 generated blocks found 4,464 of these pairs.
//
// WHAT COUNTS AS THE SAME LIFT. Only the implement is stripped. Everything that
// changes which part of a muscle is loaded stays in the key, because those are
// genuinely different exercises and a good block contains several of them:
//
//   Machine Shrug        ==  Dumbbell Shrug         (same movement, other kit)
//   Bench Press          ==  Dumbbell Bench Press
//   Leg Extension        ==  Cable Leg Extension
//   Standing Calf Raise  !=  Seated Calf Raise      (gastrocnemius vs soleus)
//   Bench Press          !=  Incline Bench Press    (different part of chest)
//   Deadlift             !=  Romanian Deadlift      (different pattern)
//
// Angle and stance are already handled by `regionOfMovement` in lib/hypertrophy
// — this is the axis that had nothing looking at it.
// =============================================================================

/**
 * Words that name the KIT rather than the movement.
 *
 * "Weighted" and "assisted" are here on the same reasoning: a weighted pull-up,
 * an assisted pull-up and a pull-up are one exercise loaded three ways, and
 * prescribing two of them in a week is prescribing the same thing twice.
 *
 * Deliberately NOT here: sled, medicine ball, swiss ball, landmine. Each of
 * those changes the movement itself — a landmine press is not an overhead
 * press with different kit, it is a different press.
 */
const IMPLEMENT = new Set([
  "barbell", "dumbbell", "db", "cable", "machine", "smith", "kettlebell", "kb",
  "band", "banded", "resistance", "bodyweight", "weighted", "assisted", "plate",
  "ez", "ezbar", "hex", "trap", "olympic", "bar", "barbells", "dumbbells",
]);

/**
 * "bar" is only kit when it follows one of these.
 *
 * On its own it is part of a name that means something else — a bar muscle-up
 * is a bar muscle-up — so stripping it unconditionally would merge movements
 * that share nothing.
 */
const BAR_PREFIX = new Set(["ez", "hex", "trap", "olympic", "safety", "swiss", "cambered"]);

/** Spellings of one word. Not stemming — just the handful that actually collide. */
const SYNONYM: Record<string, string> = {
  flye: "fly", flyes: "fly", flies: "fly", flys: "fly",
  pulldown: "pull down", pullup: "pull up", pullups: "pull up",
  chinup: "chin up", chinups: "chin up", pushup: "push up", pushups: "push up",
  situp: "sit up", situps: "sit up", stepup: "step up", stepups: "step up",
  ohp: "overhead press", rdl: "romanian deadlift",
};

/**
 * Singularise the last word only, and never a word that ends in a double s.
 *
 * The floor is three letters, not four: "Chin Ups" tokenises to "chin" + "ups",
 * and a four-letter floor left it as "chin ups" — which is exactly the pair
 * this function exists to collapse. "Press" is protected by the double-s rule,
 * not by the length.
 */
function singular(word: string): string {
  if (word.length > 2 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/**
 * The identity of the lift, ignoring what it is loaded with.
 *
 * Stable enough to use as a Map key and as a Set member; two names produce the
 * same string exactly when they are the same exercise for programming purposes.
 */
export function movementKey(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((w) => (SYNONYM[w] ?? w).split(" "));

  const kept: string[] = [];
  words.forEach((word, i) => {
    if (word === "bar") {
      // Kit only when something like "hex" or "ez" came immediately before it.
      if (BAR_PREFIX.has(words[i - 1] ?? "")) return;
      kept.push(word);
      return;
    }
    if (IMPLEMENT.has(word)) return;
    kept.push(word);
  });

  if (!kept.length) return name.toLowerCase().trim();
  kept[kept.length - 1] = singular(kept[kept.length - 1]);
  return kept.join(" ");
}

/** Whether two names are the same lift with different kit on it. */
export function sameMovement(a: string, b: string): boolean {
  return movementKey(a) === movementKey(b);
}

/**
 * Prefer candidates that are not already spoken for, without ever emptying the
 * list.
 *
 * Every use of this is a PREFERENCE and not a filter, and that is the whole
 * reason it is one function rather than five copies. A muscle group with a
 * shallow pool — calves have two movements worth prescribing — must still get
 * its exercise on the second day it is trained, so where avoiding a repeat
 * would leave nothing, the repeat is the better answer and the caller gets its
 * original list back.
 */
export function preferUnused<T>(items: T[], avoid: ReadonlySet<string>, nameOf: (item: T) => string): T[] {
  if (!avoid.size || items.length < 2) return items;
  const fresh = items.filter((item) => !avoid.has(movementKey(nameOf(item))));
  return fresh.length ? fresh : items;
}
