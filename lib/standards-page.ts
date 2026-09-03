// =============================================================================
// Public strength-standard pages — the query this app has the data for and no
// page to answer.
//
// "Is a 100kg bench good?" is one of the highest-intent things anybody types
// about training, and the answer is already in lib/strength-standards.ts: six
// bodyweight multiples per lift per sex, which the app uses to rank an
// athlete's own lifts. It had never been published.
//
// This is the argument for computed pages over written ones. The table below
// is a projection of numbers the product already stands behind — change a
// multiple and the page changes with it — so it cannot drift from what the app
// tells the athlete, which a written article about the same subject would do
// the first time a standard was retuned.
// =============================================================================

import {
  LIFT_STANDARDS, STRENGTH_TIERS, TOP_TIER, type LiftStandard, type Sex,
} from "./strength-standards";
import { slugify } from "./seo";

/**
 * The bodyweights a table covers.
 *
 * 50–120kg in 5s. Below 50 and above 120 the multiples are still arithmetic
 * but the population they were fitted to thins out, and printing a row implies
 * a confidence the numbers do not have.
 */
export const MIN_BODYWEIGHT = 50;
export const MAX_BODYWEIGHT = 120;
export const BODYWEIGHT_STEP = 5;

export function bodyweights(): number[] {
  const out: number[] = [];
  for (let w = MIN_BODYWEIGHT; w <= MAX_BODYWEIGHT; w += BODYWEIGHT_STEP) out.push(w);
  return out;
}

/** One row: a bodyweight, and the lift it takes to reach each tier. */
export interface StandardRow {
  bodyweight: number;
  /** Kilograms per tier, index 1..6 — tier 0 is "Untrained" and has no target. */
  targets: number[];
}

/**
 * Rounded to the nearest 2.5kg, because that is what a barbell does.
 *
 * A table that says 103.7kg is arithmetic printed at the reader; the plates
 * available are 1.25s, so the smallest honest increment is 2.5.
 */
export function roundToPlate(kg: number): number {
  return Math.round(kg / 2.5) * 2.5;
}

export function standardTable(lift: LiftStandard, sex: Sex): StandardRow[] {
  const multiples = sex === "male" ? lift.male : lift.female;
  return bodyweights().map((bodyweight) => ({
    bodyweight,
    targets: multiples.map((m) => roundToPlate(bodyweight * m)),
  }));
}

/** The tiers a table has a column for: everything above Untrained. */
export function tierColumns() {
  return STRENGTH_TIERS.filter((t) => t.index >= 1 && t.index <= TOP_TIER);
}

export interface StandardPage {
  lift: LiftStandard;
  slug: string;
}

export function standardPages(): StandardPage[] {
  return LIFT_STANDARDS.map((lift) => ({ lift, slug: slugify(lift.label) }));
}

export function findStandardPage(slug: string): StandardPage | null {
  return standardPages().find((p) => p.slug === slug) ?? null;
}

/**
 * What the page says it is, in one line each.
 *
 * Deliberately flat about what a standard is and is not: these are bodyweight
 * multiples fitted to lifters, not a target anybody has to hit and not a
 * statement about health. The app's own tier blurbs say the same thing to the
 * athlete, and the public page must not say something stronger than the
 * product does.
 */
export function standardSummary(lift: LiftStandard, sex: Sex): string {
  const multiples = sex === "male" ? lift.male : lift.female;
  const intermediate = multiples[2];
  return `At ${sex === "male" ? "80" : "65"}kg bodyweight, an intermediate ${lift.label.toLowerCase()} `
    + `is about ${roundToPlate((sex === "male" ? 80 : 65) * intermediate)}kg — ${intermediate}× bodyweight.`;
}
