// =============================================================================
// The ORDER of a session, as opposed to its contents.
//
// WHY THIS EXISTS. The engines choose what a session contains and how much of
// it, and then emitted it in whatever order the picker happened to fill: one
// compound per muscle group in list order, then isolation cycling the same list
// again. Read down a real generated day and you get
//
//     Cable Woodchopper · Bicycle Crunch · Lying Leg Raise · Sit Ups
//
// — four core movements back to back, then nothing for core again all week. The
// same day put a Barbell Curl next to a Preacher Curl and Dips next to an
// overhead triceps extension.
//
// That is not a cosmetic complaint. The second exercise for a muscle is done on
// the fatigue left by the first, so it carries less load for fewer good reps and
// contributes less to the set that was prescribed. Spacing them lets the muscle
// recover while another one works, which is the entire reason supersets and
// antagonist pairing exist. The athlete's words for it: "make the engine take
// into account fatigue while doing the session, eg not 2 chest exercises next to
// each other."
//
// WHAT THIS WILL NOT DO. It does not reorder across the session's structure.
// Warm-ups stay at the front, cool-downs at the back, and a compound never gets
// pushed behind the isolation work that was put there to follow it — you do not
// squat well after leg extensions. Spacing is arranged INSIDE each of those
// tiers, where the order was arbitrary to begin with.
//
// Pure + tested.
// =============================================================================

import type { Slot } from "./movements";

export interface OrderableDrill {
  name: string;
  slot?: Slot;
  skill?: boolean;
  rehab?: boolean;
}

/**
 * The tiers, in the order they must appear.
 *
 * Anything with no slot — everything the hypertrophy engine emits — falls into
 * one middle tier and is split there by whether it is a compound, so the
 * "compounds open the session" rule survives the reshuffle.
 */
const SLOT_RANK: Record<Slot, number> = {
  warmup: 0,
  primary: 2,
  secondary: 3,
  accessory: 4,
  skill: 5,
  conditioning: 6,
  cooldown: 7,
};

/**
 * Reorder a session so consecutive exercises train different muscles.
 *
 * `muscleOf` is passed in rather than imported because the two catalogues are
 * classified in different modules and this file must not care which one a drill
 * came from — see lib/muscle-volume.ts for the callers' shared answer.
 *
 * A drill whose muscle cannot be determined is treated as its own muscle: it
 * never blocks anything and is never blocked, which is the right behaviour for
 * a run, a ball drill or a stretch.
 */
export function spaceByMuscle<T extends OrderableDrill>(
  drills: T[],
  muscleOf: (name: string) => string | null,
  isCompound: (name: string) => boolean,
): T[] {
  const items = drills ?? [];
  if (items.length < 3) return items;

  // Group into tiers, keeping the original order inside each. Reordering only
  // ever happens within a tier, so the session's shape is untouched.
  const tiers = new Map<number, T[]>();
  for (const d of items) {
    const tier = tierOf(d, isCompound);
    const list = tiers.get(tier);
    if (list) list.push(d);
    else tiers.set(tier, [d]);
  }

  const out: T[] = [];
  /**
   * The muscle carried ACROSS the tier boundary.
   *
   * Each tier used to start fresh, which left the one join it could not see:
   * the last compound and the first isolation movement are as adjacent as any
   * other pair, and a session ending its compounds on chest and opening its
   * isolation with a fly is exactly the clash this is here to prevent. Threading
   * it through closed 492 sessions' worth of avoidable clashes.
   */
  let last: string | null = null;
  for (const tier of [...tiers.keys()].sort((a, b) => a - b)) {
    const ordered = space(tiers.get(tier)!, muscleOf, last);
    out.push(...ordered);
    const tail = ordered[ordered.length - 1];
    if (tail) last = muscleOf(tail.name);
  }
  return out;
}

function tierOf<T extends OrderableDrill>(d: T, isCompound: (name: string) => boolean): number {
  // Rehab work keeps its place at the very front whatever else is true — the
  // stage's exercises are the reason the athlete can train at all, and they are
  // put first deliberately. See lib/rehab-plan.ts.
  if (d.rehab) return -1;
  if (d.slot) return SLOT_RANK[d.slot];
  if (d.skill) return SLOT_RANK.skill;
  // No slot: the hypertrophy engine. Compounds first, isolation after.
  return isCompound(d.name) ? 1.4 : 1.6;
}

/**
 * Spacing within one tier: at each position, take the eligible drill whose
 * muscle has the MOST work still to place.
 *
 * "Eligible" means its muscle differs from the one just placed. Taking simply
 * the first eligible drill is the obvious approach and it is measurably worse:
 * a leg day of one calf movement and three core movements came out
 * calf-core-core-core, because the one drill that could break the core run got
 * spent on the very first slot where it was not needed. Spending the abundant
 * muscle first and keeping the scarce one back to separate it gives
 * core-calf-core-core — one clash instead of two, which is the fewest possible
 * with three of a kind and one of another.
 *
 * That rule is the standard rearrangement greedy and it reaches the minimum
 * number of clashes whenever a clash-free order exists at all. Where one does
 * not — a tier of nothing but chest work — it degrades to the original order
 * rather than shuffling for nothing.
 *
 * STABLE. Ties are broken by the drill's original position, so a session whose
 * muscles already alternate comes out in exactly the order it went in. That is
 * what makes it safe to run over every session of every block: it can only
 * improve a plan or leave it alone.
 */
function space<T extends OrderableDrill>(
  tier: T[],
  muscleOf: (name: string) => string | null,
  carriedIn: string | null,
): T[] {
  // Two drills can still clash with what came before them, so a short tier is
  // reordered too — it is only a single drill that has nothing to arrange.
  if (tier.length < 2) return tier;

  const remaining = tier.map((drill, index) => ({ drill, index, muscle: muscleOf(drill.name) }));
  const left = new Map<string, number>();
  for (const r of remaining) if (r.muscle) left.set(r.muscle, (left.get(r.muscle) ?? 0) + 1);

  const out: T[] = [];
  let last: string | null = carriedIn;

  while (remaining.length) {
    let best = -1;
    let bestCount = -1;
    for (let i = 0; i < remaining.length; i++) {
      const r = remaining[i];
      // An unclassified drill has no muscle to clash with, so it always fits.
      if (r.muscle !== null && r.muscle === last) continue;
      const count = r.muscle ? (left.get(r.muscle) ?? 0) : 0;
      if (count > bestCount) { bestCount = count; best = i; }
    }
    if (best === -1) best = 0; // everything left trains the muscle we just did

    const [pick] = remaining.splice(best, 1);
    out.push(pick.drill);
    if (pick.muscle) left.set(pick.muscle, (left.get(pick.muscle) ?? 1) - 1);
    last = pick.muscle;
  }
  return out;
}

/**
 * The worst adjacency left in a session: how many neighbouring pairs share a
 * muscle. Zero is the goal; it is not always reachable.
 *
 * Exported for the tests, and for the same reason the volume audit is exported —
 * a claim the app makes about its own output should be measurable by anything
 * that wants to check it, not only by the code that makes the claim.
 */
export function adjacentSameMuscle<T extends OrderableDrill>(
  drills: T[],
  muscleOf: (name: string) => string | null,
): number {
  let n = 0;
  for (let i = 1; i < (drills ?? []).length; i++) {
    const a = muscleOf(drills[i - 1].name);
    const b = muscleOf(drills[i].name);
    if (a !== null && a === b) n++;
  }
  return n;
}
