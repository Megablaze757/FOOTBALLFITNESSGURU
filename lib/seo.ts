// =============================================================================
// Public URLs and slugs.
//
// One place that knows which pages exist publicly, so the sitemap, the internal
// links and the pages themselves can't drift apart. A sitemap listing a URL
// that 404s is worse than no sitemap.
// =============================================================================

import { SPORTS, type SportId } from "./exercises";
import { positionsForSport } from "./coach";
import { hasSkills } from "./skills";

export const SITE = "https://pocketathlete.com";

/** "Centre back" → "centre-back". Stable: it's in the URL, so changing this
 *  later means redirects or lost rankings. */
export function slugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Sports we publish public guides for — the ones with technical drills to
 *  write about. A gym page of the same shape would be a stub. */
export function guideSports(): SportId[] {
  return SPORTS.map((s) => s.id).filter((id) => hasSkills(id));
}

export interface GuidePage { sport: SportId; position: string; slug: string }

/** Every public position guide, e.g. football × "Centre back". */
export function guidePages(): GuidePage[] {
  const out: GuidePage[] = [];
  for (const sport of guideSports()) {
    for (const position of positionsForSport(sport)) {
      out.push({ sport, position, slug: slugify(position) });
    }
  }
  return out;
}

/** Resolve a slug back to the exact position label the data is keyed by. */
export function positionFromSlug(sport: SportId, slug: string): string | null {
  return positionsForSport(sport).find((p) => slugify(p) === slug) ?? null;
}

export function sportLabel(sport: SportId): string {
  return SPORTS.find((s) => s.id === sport)?.label ?? sport;
}
