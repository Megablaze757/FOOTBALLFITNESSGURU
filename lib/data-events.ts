// =============================================================================
// What changed, and what has to be recomputed because of it.
//
// "STATS AREN'T CHANGING WHEN DATA IS ADJUSTED."
//
// Two separate causes, and this file is the fix for the second.
//
// The first was lib/use-async.ts: `invalidate` dropped the cache and stopped
// there, so a screen already on the page never learned anything had changed.
// Clearing a cache is not a refresh — the readers have to be told. They are now.
//
// The second is here. Every write picked its own cache prefixes by hand:
// `invalidate()`, `invalidate("profile:")`, `invalidate("nutrition:")`,
// `invalidate(\`nutrition:${userId}\`)`, and a dozen writes that called nothing
// at all. Nobody can hold in their head which of eleven cache keys a weigh-in
// touches, and the ones that guessed too narrowly left the other screens stale.
//
// So a mutation names WHAT IT CHANGED, in the athlete's terms, and this decides
// which screens are now wrong. Adding a page means adding its key to a list
// here, once, rather than hunting for every write that might affect it.
//
// Deliberately coarse. A weigh-in genuinely does move the nutrition targets,
// the strength ranks, the Progress row and the coach's prescriptions, and being
// clever about which of those to skip would be optimising the cheapest thing in
// the app — a refetch — at the cost of the failure everybody notices.
// =============================================================================

import { invalidate } from "./use-async";

/**
 * The kinds of change the app can make to an athlete's own data.
 *
 * Named for what the athlete did, not for the table it landed in: the point of
 * the indirection is that a call site should not have to know which page reads
 * `training_logs`.
 */
export type DataChange =
  | "training"    // a session logged, edited or deleted
  | "nutrition"   // food or water logged, edited or deleted
  | "weight"      // a weigh-in, from /body or the check-in
  | "program"     // a block generated, assigned, swapped or completed
  | "goals"       // the goal, sport, position or preferences behind a block
  | "benchmarks"  // a tested max
  | "injury"      // a rehab plan started, advanced or closed
  | "profile"     // name, sex, age, tier, consent — anything on the row itself
  | "everything"; // a sync, a sign-in, an offline queue flushing

/**
 * Which cached pages a change makes wrong.
 *
 * Cache keys are `<page>:<userId>`, so a prefix without the id covers every
 * athlete in the tab — which is right: a coach viewing a squad has one cache
 * and several athletes in it.
 */
const AFFECTS: Record<Exclude<DataChange, "everything">, readonly string[]> = {
  // Training moves readiness, load, ranks, XP, the week's mileage and what the
  // coach says next. It is the change with the widest reach in the app.
  training: ["home:", "dashboard:", "coach:", "report:", "profile:", "essentials:", "train:"],
  // Calories eaten drive Home's "left today", the fuelling verdict and the
  // report. NOT the meal plan itself — that is rebuilt from a seed.
  nutrition: ["home:", "nutrition:", "dashboard:", "report:"],
  // Bodyweight is a divisor in every strength rank and an input to every
  // calorie target. See lib/bodyweight.ts for why it is read in four places.
  weight: ["home:", "dashboard:", "nutrition:", "coach:", "report:", "body:", "profile:"],
  program: ["home:", "coach:", "dashboard:", "train:", "essentials:"],
  goals: ["home:", "coach:", "dashboard:", "profile:", "nutrition:"],
  benchmarks: ["home:", "dashboard:", "coach:", "profile:", "benchmarks:", "report:"],
  injury: ["home:", "coach:", "dashboard:", "essentials:"],
  profile: ["home:", "profile:", "coach:", "dashboard:", "nutrition:", "essentials:"],
};

/**
 * Say what changed. Every page that reads it refetches, immediately.
 *
 * Call it AFTER the write has been accepted by the database — a refetch that
 * races the write it is reporting will read the old row and cache that instead,
 * which is worse than not refreshing at all.
 */
export function recordChanged(...changes: DataChange[]): void {
  if (changes.includes("everything")) {
    invalidate();
    return;
  }
  const prefixes = new Set<string>();
  for (const change of changes) {
    // "everything" returned above, so anything still here is a key of AFFECTS.
    for (const prefix of AFFECTS[change as Exclude<DataChange, "everything">] ?? []) prefixes.add(prefix);
  }
  for (const prefix of prefixes) invalidate(prefix);
}

/** Every page a change touches — exported so a test can check the map is sane. */
export function pagesAffectedBy(change: DataChange): readonly string[] {
  if (change === "everything") return [...new Set(Object.values(AFFECTS).flat())];
  return AFFECTS[change];
}
