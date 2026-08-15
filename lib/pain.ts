// =============================================================================
// How sore are you TODAY?
//
// The check-in stores a pain map and nothing ever ages it out. An athlete who
// marked a knee at 7/10 in March and was fine by April keeps getting programmes
// built around a knee injury, forever, unless they remember to go back into the
// check-in and drag the slider to zero. Nobody does that: you stop reporting a
// thing when it stops hurting, which the app read as "still 7/10".
//
// A STALE 7/10 AND A CURRENT 7/10 WERE THE SAME VALUE. That is the whole bug.
// The number was never wrong; it just had no date attached to it at the point
// of use, so the engine could not tell a report from a memory.
//
// The injury page already knew this and solved it locally — it refuses to
// pre-fill the body map from a check-in older than three days, on the grounds
// that seeding a three-week-old knee onto today's map "would be a confident lie
// about where it hurts". Exactly right, and it was one page. The programme
// builder, the session view and the home screen all read the raw map.
//
// WHY DECAY RATHER THAN A CUT-OFF. A hard expiry at N days means an injury is
// fully accounted for on day N and completely ignored on day N+1, which is not
// how tissue works and produces a programme that lurches. Fading it matches
// what is actually known: confidence in a report decreases with its age, and
// the sensible response to decreasing confidence is decreasing caution, not a
// cliff.
//
// This does not replace asking. The right long-term answer is for the check-in
// to open with "your knee was sore on Tuesday — still?", so the app has a fresh
// answer instead of a decayed guess. Until then, a fading number beats a
// permanent one.
// =============================================================================

import type { PainMap } from "./types";

/**
 * How long a report is taken at face value.
 *
 * Three days, matching the rule the injury page already applied to seeding the
 * body map. Two constants meaning "recent enough to trust" would eventually
 * disagree, and the disagreement would show up as the injury page and the
 * programme having different opinions about the same knee.
 */
export const PAIN_FRESH_DAYS = 3;

/**
 * When a report stops counting entirely.
 *
 * Two weeks. Long enough that a real strain reported once is still shaping the
 * programme through the part of its recovery an athlete is most likely to
 * re-injure, short enough that a season of forgotten check-ins does not leave
 * somebody permanently rehabbing an ankle that healed in October.
 */
export const PAIN_STALE_DAYS = 14;

/** Whole days between two local ISO days. Negative clamps to 0. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/**
 * The weight a report of this age still carries: 1 while fresh, fading to 0.
 *
 * Exported so a screen can SAY how much it is discounting rather than quietly
 * doing it — an athlete who sees their programme stop avoiding a sore knee
 * deserves to know why.
 */
export function painConfidence(ageDays: number): number {
  if (ageDays <= PAIN_FRESH_DAYS) return 1;
  if (ageDays >= PAIN_STALE_DAYS) return 0;
  return (PAIN_STALE_DAYS - ageDays) / (PAIN_STALE_DAYS - PAIN_FRESH_DAYS);
}

/**
 * What the athlete is sore with TODAY, given when they last said so.
 *
 * `reportedOn` absent means there is no check-in at all, which is not the same
 * as no pain — it is no information — and the honest output is an empty map
 * rather than the last thing anybody happened to say.
 */
export function currentPain(
  painMap: PainMap | null | undefined,
  reportedOn: string | null | undefined,
  today: string,
): PainMap {
  if (!painMap || !reportedOn) return {};
  const weight = painConfidence(daysBetween(reportedOn, today));
  if (weight <= 0) return {};
  const out: PainMap = {};
  for (const [area, raw] of Object.entries(painMap)) {
    const level = Number(raw) || 0;
    if (level <= 0) continue;
    // Rounded, not floored: 7/10 at half confidence is a 4, which is exactly
    // the threshold the engine treats as sore. Flooring would drop it to 3 and
    // silently stop training around a knee that is still probably sore.
    const faded = Math.round(level * weight);
    if (faded > 0) out[area] = faded;
  }
  return out;
}

/** True when a report is old enough that the app is discounting it. */
export function painIsFading(reportedOn: string | null | undefined, today: string): boolean {
  if (!reportedOn) return false;
  const age = daysBetween(reportedOn, today);
  return age > PAIN_FRESH_DAYS && age < PAIN_STALE_DAYS;
}

/** One sentence explaining the discount, or null while the report is fresh. */
export function painAgeNote(reportedOn: string | null | undefined, today: string): string | null {
  if (!reportedOn) return null;
  const age = daysBetween(reportedOn, today);
  if (age <= PAIN_FRESH_DAYS) return null;
  if (age >= PAIN_STALE_DAYS) {
    return `Your last check-in was ${age} days ago, so it is no longer shaping your training. Check in to update it.`;
  }
  return `Your last check-in was ${age} days ago, so we are easing off how much it shapes your training. Check in if it still hurts.`;
}
