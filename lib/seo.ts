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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 197 EXERCISE PAGES SHARED NINE META DESCRIPTIONS. NONE OF THEM HAD TO.
 *
 * The page used `ex.why` — and for every imported movement that is the string
 * the bulk importer generated, "Builds the legs." Forty-three pages said it.
 * Meanwhile `ex.description` held a real how-to for every one of those 197,
 * written by a person: "Back flat against the seat, feet on the platform
 * shoulder width. Press out to near-extension..."
 *
 * So the fix needed no model, no key and no review queue. The unique,
 * human-written, specific text was already in the row and the page was
 * choosing the placeholder over it.
 *
 * The curated `why` still wins where there is one. It was written to be the
 * one-line answer to "why would I do this", which is a better meta description
 * than the opening of a how-to — it is only the placeholders that lose.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Google truncates around here; past it is words nobody is shown. */
export const META_MAX = 160;

/**
 * Cut to a sentence if one ends in range, otherwise to a word.
 *
 * Never mid-word: a description ending "near-extensi" reads as broken rather
 * than as abbreviated, and it is the first thing a person sees of the page.
 */
export function trimToMeta(text: string, max = META_MAX): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= max) return clean;

  /**
   * The last full stop that ENDS A SENTENCE inside the window.
   *
   * The character after it decides, and it is read from `clean` rather than
   * from the cut: a window ending "...loaded at 3." is the middle of "3.5kg",
   * and only the character the cut threw away can tell you that.
   */
  let sentence = -1;
  for (let i = max - 1; i >= 0; i--) {
    if (clean[i] === "." && /\s/.test(clean[i + 1] ?? " ")) { sentence = i; break; }
  }
  if (sentence > max * 0.5) return clean.slice(0, sentence + 1);

  // One character of headroom, so the ellipsis fits inside `max` as well.
  const room = clean.slice(0, max - 1);
  const space = room.lastIndexOf(" ");
  const cut = space > max * 0.5 ? room.slice(0, space) : room;
  return `${cut.replace(/[,;:\-—\s]+$/, "")}…`;
}

/**
 * What an exercise page tells a search engine it is about.
 *
 * `why` first, because a curated one is purpose-written. The how-to second,
 * because it is real and unique. The generic line only when there is neither,
 * and it names the exercise so even that is not identical across pages.
 */
export function exerciseMetaDescription(ex: {
  name: string;
  why?: string | null;
  description?: string | null;
}, isStubWhy: (why: string) => boolean): string {
  const why = (ex.why ?? "").trim();
  if (why && !isStubWhy(why)) return trimToMeta(why);

  const how = (ex.description ?? "").trim();
  if (how.length >= 60) return trimToMeta(how);

  return `${ex.name}: what it works, how to do it, and the cues that matter.`;
}
