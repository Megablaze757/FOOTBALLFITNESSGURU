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


// --- the content that was locked behind a login ------------------------------

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE BIGGEST SEO ASSET THIS APP HAS WAS DISALLOWED IN robots.txt.
 *
 * 335 recipes, each with a real method and a costed shopping list, and 268
 * exercises with muscle maps and chosen form videos — all of it behind /library
 * and /nutrition, both of which robots.txt correctly tells crawlers not to
 * bother with, because a crawler there gets a login redirect.
 *
 * Correct, and it means the one genuinely unique thing here — nobody else
 * publishes a recipe with what the week's shop costs — has never been
 * indexable. That is worth more than any amount of technique on the seven pages
 * that were public, and it needs nothing generated: the content already exists
 * and a person wrote it.
 *
 * A public page per recipe and per exercise, built at export time so a crawler
 * gets real HTML, with the app itself still behind the login.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export interface ContentPage { slug: string; id: string }

/**
 * Slugs are derived from the NAME, not the id.
 *
 * Ids are internal (`budget_red_lentil_dhal`) and read as machine output in a
 * URL; the name is what somebody searched for. Collisions are resolved by
 * appending the id rather than silently dropping a page — two recipes called
 * the same thing is a content problem, not a reason for one to 404.
 */
export function contentPages(items: { id: string; name: string }[]): ContentPage[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const base = slugify(item.name);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { slug: n === 1 ? base : `${base}-${n}`, id: item.id };
  });
}

export function findBySlug<T extends { id: string; name: string }>(
  items: T[], slug: string,
): T | null {
  const page = contentPages(items).find((p) => p.slug === slug);
  return page ? items.find((i) => i.id === page.id) ?? null : null;
}
