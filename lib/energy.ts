// =============================================================================
// What a session cost, in calories — with the uncertainty left in.
//
// WHY A RANGE AND NOT A NUMBER. Every app that prints "487 kcal" is claiming a
// precision nobody has. Without a heart-rate trace the honest spread on an
// intermittent session is a quarter either way, and on resistance work the
// published estimates vary by two to three times for the SAME session. A single
// figure is not more useful than a band, it is the same guess with the error
// bar painted out — and an athlete who eats back 487 kcal that were really 300
// has been misled by the rounding, not by the training.
//
// So this returns low/mid/high and says which method it used, and the UI shows
// the band. "~450–550" is worth more than "487" because it is true.
//
// IT MUST NEVER FEED THE CALORIE TARGET. lib/nutrition.ts derives the activity
// factor from LOGGED TRAINING MINUTES, and says why in its own comment:
// "Training is counted ONCE. […] Adding measured training on top of a factor
// that already assumes it is the classic way these calculators end up several
// hundred calories high." This module is for showing somebody what they did.
// Wiring it into nutritionTargets would double-count every session, and a test
// in energy.test.ts fails if anything imports it from there.
//
// Pure + tested.
// =============================================================================

/**
 * Resting metabolic equivalents, from the Compendium of Physical Activities
 * (Ainsworth et al.), taken at the RECREATIONAL intensity — the same reading
 * lib/activities.ts gives its default RPE, so the two agree about what a plain
 * "cycling" entry means.
 *
 * A session logged harder than that scales up; see `metFor`.
 */
const ACTIVITY_MET: Record<string, number> = {
  cycling: 8.0, spin: 8.5, swimming: 7.0, padel: 7.0, tennis: 7.3,
  football: 7.0, basketball: 6.5, walking: 3.5, hiking: 5.3, climbing: 8.0,
  yoga: 3.0, boxing: 7.8, martial_arts: 10.3, rowing: 7.0, badminton: 5.5,
  squash: 7.3, golf: 4.8, skiing: 7.0, surfing: 3.0, dance: 5.5, skating: 5.5,
};

/** The RPE each activity is listed at, so a harder session can be scaled. */
const ACTIVITY_RPE: Record<string, number> = {
  cycling: 6, spin: 7, swimming: 6, padel: 6, tennis: 6, football: 7,
  basketball: 7, walking: 3, hiking: 5, climbing: 6, yoga: 3, boxing: 7,
  martial_arts: 7, rowing: 6, badminton: 5, squash: 7, golf: 3, skiing: 6,
  surfing: 6, dance: 5, skating: 5,
};

/** Resistance training, which is the least knowable of the lot. */
const STRENGTH_MET = 5.0;

/**
 * Kcal per kg per km of running, gross of resting metabolism.
 *
 * The one number here that deserves confidence. Running economy is close to
 * constant across pace — the cost is the distance, not the speed — so this is
 * the best-evidenced estimate the app can make, and the only one that does not
 * depend on somebody rating their own effort.
 */
const KCAL_PER_KG_PER_KM = 1.03;

export type BurnBasis = "distance" | "activity" | "strength" | "duration";

export interface BurnEstimate {
  low: number;
  mid: number;
  high: number;
  basis: BurnBasis;
  /** How much to trust it, in one word the UI can print. */
  confidence: "good" | "fair" | "rough";
}

export interface BurnInput {
  weightKg: number | null | undefined;
  /** Session duration. */
  minutes: number | null | undefined;
  /** The athlete's own 1-10 rating, when they gave one. */
  intensity?: number | null;
  /** An id from lib/activities.ts, when the session was one of those. */
  activityId?: string | null;
  /** Kilometres run — the strongest signal available. */
  distanceKm?: number | null;
  /** True when this was lifting rather than a named activity. */
  strength?: boolean;
}

/**
 * The band around the middle estimate, by method.
 *
 * These are not decoration. Running with a distance is genuinely good; a team
 * sport rated by the person playing it is not; and resistance training is the
 * one where the literature disagrees with itself, so it gets a band wide enough
 * to say so.
 */
const SPREAD: Record<BurnBasis, number> = {
  distance: 0.12,
  activity: 0.2,
  duration: 0.28,
  strength: 0.4,
};

const CONFIDENCE: Record<BurnBasis, BurnEstimate["confidence"]> = {
  distance: "good", activity: "fair", duration: "rough", strength: "rough",
};

/**
 * The MET for an activity, scaled by how hard they said it was.
 *
 * Bounded deliberately. An RPE of 10 against a listed 3 would otherwise treble
 * the figure, and somebody who rates every session a 10 would be told they burn
 * three thousand calories walking. Half again is as far as self-reported effort
 * should be allowed to move a number this soft.
 */
export function metFor(activityId: string, rpe: number | null | undefined): number {
  const base = ACTIVITY_MET[activityId];
  if (base == null) return 0;
  const listed = ACTIVITY_RPE[activityId] ?? 5;
  if (rpe == null || !Number.isFinite(rpe) || rpe <= 0) return base;
  const ratio = Math.min(1.5, Math.max(0.6, rpe / listed));
  return base * ratio;
}

/** Kcal for `minutes` at `met` for someone of `kg`. The standard MET equation. */
export function metCalories(met: number, kg: number, minutes: number): number {
  return (met * 3.5 * kg) / 200 * minutes;
}

/**
 * What that session probably cost.
 *
 * Returns null when there is not enough to say — no weight, or no duration and
 * no distance. A guess made from nothing is the one thing worse than a range.
 */
export function sessionBurn(input: BurnInput): BurnEstimate | null {
  const kg = Number(input.weightKg);
  if (!Number.isFinite(kg) || kg <= 0) return null;

  const minutes = Number.isFinite(Number(input.minutes)) ? Math.max(0, Number(input.minutes)) : 0;
  const km = Number.isFinite(Number(input.distanceKm)) ? Math.max(0, Number(input.distanceKm)) : 0;

  let mid: number;
  let basis: BurnBasis;

  if (km > 0) {
    // Distance beats everything else available, and does not need an RPE.
    mid = KCAL_PER_KG_PER_KM * kg * km;
    basis = "distance";
  } else if (minutes <= 0) {
    return null;
  } else if (input.activityId && ACTIVITY_MET[input.activityId] != null) {
    mid = metCalories(metFor(input.activityId, input.intensity), kg, minutes);
    basis = "activity";
  } else if (input.strength) {
    mid = metCalories(STRENGTH_MET, kg, minutes);
    basis = "strength";
  } else {
    /**
     * Something was logged, with a duration and maybe an effort, and nothing
     * says what it was. The RPE is all there is: 5 is taken as moderate, and
     * the band is wide because this is the weakest case the app has.
     */
    const rpe = Number.isFinite(Number(input.intensity)) ? Number(input.intensity) : 5;
    mid = metCalories(Math.min(12, Math.max(2, rpe * 1.1)), kg, minutes);
    basis = "duration";
  }

  const spread = SPREAD[basis];
  return {
    low: Math.round((mid * (1 - spread)) / 10) * 10,
    mid: Math.round(mid / 10) * 10,
    high: Math.round((mid * (1 + spread)) / 10) * 10,
    basis,
    confidence: CONFIDENCE[basis],
  };
}

/** "450–550 kcal" — the band, never a single number pretending to be exact. */
export function burnRangeLabel(estimate: BurnEstimate | null): string | null {
  if (!estimate) return null;
  if (estimate.low === estimate.high) return `~${estimate.mid} kcal`;
  return `${estimate.low}–${estimate.high} kcal`;
}

/** Why it is only that good, said in one line under the number. */
export function burnBasisNote(estimate: BurnEstimate | null): string | null {
  if (!estimate) return null;
  return {
    distance: "From the distance you ran — the most reliable estimate here.",
    activity: "From the activity and how hard you rated it.",
    strength: "Lifting is the hardest to estimate; treat this as a wide guess.",
    duration: "From duration and effort alone, with nothing to say what it was.",
  }[estimate.basis];
}

/**
 * What the whole day cost, summed across sessions.
 *
 * A day is not one session. Spin at seven and padel at one is two entries with
 * their own activity, duration and effort, and costing the day as "135 minutes
 * of something" throws away the only information that made the estimate worth
 * printing. So each activity drill is estimated on its own terms and the bands
 * are added — which also means the day's band is honestly wider than any single
 * session's, because it is.
 *
 * Falls back to the day's totals when nothing was logged as a named activity,
 * which is the case for a plain gym session.
 */
export function dayBurn(
  sessions: { activityId?: string | null; minutes: number; intensity?: number | null; distanceKm?: number | null }[],
  fallback: BurnInput,
): BurnEstimate | null {
  const parts = sessions
    .map((s) => sessionBurn({ ...s, weightKg: fallback.weightKg }))
    .filter((e): e is BurnEstimate => e !== null);

  if (!parts.length) return sessionBurn(fallback);

  const total = parts.reduce(
    (t, p) => ({ low: t.low + p.low, mid: t.mid + p.mid, high: t.high + p.high }),
    { low: 0, mid: 0, high: 0 },
  );
  // The day is only as trustworthy as its least trustworthy session.
  const order: BurnEstimate["confidence"][] = ["good", "fair", "rough"];
  const confidence = parts
    .map((p) => p.confidence)
    .sort((a, b) => order.indexOf(b) - order.indexOf(a))[0];
  const basis = parts.length === 1 ? parts[0].basis : "activity";

  return {
    low: Math.round(total.low / 10) * 10,
    mid: Math.round(total.mid / 10) * 10,
    high: Math.round(total.high / 10) * 10,
    basis,
    confidence,
  };
}
