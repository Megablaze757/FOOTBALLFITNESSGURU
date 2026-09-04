// =============================================================================
// THE PAGES THAT ALMOST EXIST.
//
// ═══════════════════════════════════════════════════════════════════════════
// A COLLECTION TWO RECIPES SHORT IS A PAGE THAT DOES NOT EXIST, AND NOTHING
// SAID SO.
//
// Three modules gate a page on having enough behind it — twelve recipes for a
// collection, twelve exercises for a muscle hub, twelve for an ingredient hub.
// The floors are right: below them the page is a list rather than an answer,
// and thin pages are what a site gets penalised for.
//
// But every one of those modules only ever returned what had ALREADY cleared
// its floor. So a collection sitting on eleven — one recipe from being a real,
// indexable page that answers a real search — was invisible by construction. Not
// hidden behind a filter somebody could switch off: simply not computed.
//
// This is the other side of that number. It is the only content to-do list on
// this project that is derived rather than written, and each line names both
// the cost (how many) and the prize (a page that will exist).
//
// ORDERED BY WHAT IS CHEAPEST TO FINISH, not by what would be biggest. One
// recipe for a whole new page beats five for a slightly larger one, and a list
// sorted by size buries exactly the entries worth acting on.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

import { allCollections, MIN_MEMBERS } from "./collections";
import { allHubs, hubPath, MIN_HUB_MEMBERS } from "./hubs";
import { allRecipeHubs, recipeHubPath, MIN_RECIPE_HUB } from "./recipe-hubs";
import { EXERCISES, isRunEntry, type Exercise } from "./exercises";

/**
 * How far short still counts as "nearly".
 *
 * Four. Beyond that it is not a gap to close, it is a decision to write a lot
 * of content — and a to-do list that includes everything is a to-do list
 * nobody opens.
 */
export const NEARLY = 4;

export type GapKind = "collection" | "muscle" | "equipment" | "ingredient" | "meal";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SOMETIMES THE PAGE IS ALREADY THERE AND THE TAGS DISAGREE.
 *
 * "Lats" sits on 8 of 12 while "Back" has 41, and it would be easy to read that
 * as four exercises to write. It is not: a lat pulldown tagged only "Back" is
 * an exercise that already exists and is simply described more loosely than the
 * page needs. Writing four new movements to fill a gap that a tag would close
 * is the most expensive possible way to be wrong.
 *
 * (Merging the two is NOT the answer either — "lat exercises" and "back
 * exercises" are different searches and deserve different pages. The narrower
 * tag needs to be applied more often, not abolished.)
 *
 * So each gap counts the exercises whose own text NAMES the muscle while not
 * being tagged with it. That is a fact about the catalogue rather than a guess
 * about anatomy: no taxonomy is invented here, it just reads what the entries
 * already say about themselves.
 *
 * Exported so the word-boundary rule can be driven directly. No muscle in
 * today's catalogue is a substring of a word that appears in the text, so
 * substring and word matching return identical counts on real data and a
 * mutation between them passed — the rule is right and was unproven.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function mentionsButUntagged(name: string, all: Exercise[]): number {
  const needle = name.toLowerCase();
  // Word-bounded: "abs" must not match "absolute", and "lats" must not match
  // "flats". The first version used includes() and counted both.
  const pattern = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  return all.filter((e) => {
    if (e.muscles.some((m) => m.toLowerCase() === needle)) return false;
    return pattern.test(`${e.name} ${e.why} ${e.description ?? ""} ${e.cues.join(" ")}`);
  }).length;
}

export interface Gap {
  kind: GapKind;
  /** The page's own name, as it would be titled. */
  name: string;
  /** Where it would live once it exists. */
  href: string;
  have: number;
  need: number;
  /** How many more. Always 1 or more — a gap of zero is a published page. */
  short: number;
  /** What to add, in the words somebody would act on. */
  todo: string;
  /**
   * Entries already in the catalogue that NAME this thing without being tagged
   * with it. Non-zero means the cheap fix is a tag, not new content.
   */
  retagCandidates?: number;
}

/**
 * Cheapest first, then by how much is already there.
 *
 * Two entries both one short are equal on cost, and the one with more behind it
 * is the more established topic — so it breaks the tie. Name last, so the order
 * cannot wobble between runs when the catalogue is reordered.
 *
 * SEPARATE AND EXPORTED because it cannot be told from `(a, b) => b.have -
 * a.have` using today's data: all three floors are 12, so `have` and `short`
 * are perfectly anti-correlated and the two sorts agree on every row. A
 * mutation swapping them passed. They stop agreeing the moment one floor moves,
 * which is exactly when nobody would be looking.
 */
export function byCheapest(a: Gap, b: Gap): number {
  return a.short - b.short || b.have - a.have || a.name.localeCompare(b.name);
}

export function contentGaps(): Gap[] {
  const gaps: Gap[] = [];

  for (const { collection, members } of allCollections()) {
    // The zero case is unreachable with today's collections and kept anyway:
    // an idea that matches no recipe at all is not a near miss, it is a line in
    // a file. Proven by a direct test rather than by this loop — see
    // lib/content-gaps.test.ts.
    if (members.length >= MIN_MEMBERS || members.length === 0) continue;
    gaps.push({
      kind: "collection",
      name: collection.title,
      href: `/collections/${collection.slug}/`,
      have: members.length,
      need: MIN_MEMBERS,
      short: MIN_MEMBERS - members.length,
      todo: `${MIN_MEMBERS - members.length} more recipe(s) that fit "${collection.blurb}"`,
    });
  }

  const movements = EXERCISES.filter((e) => !isRunEntry(e));
  for (const { hub, members } of allHubs(movements)) {
    if (members.length >= MIN_HUB_MEMBERS || members.length === 0) continue;
    const short = MIN_HUB_MEMBERS - members.length;
    const retag = hub.kind === "muscle" ? mentionsButUntagged(hub.name, movements) : 0;
    gaps.push({
      kind: hub.kind,
      name: hub.name,
      href: hubPath(hub),
      have: members.length,
      need: MIN_HUB_MEMBERS,
      short,
      retagCandidates: retag || undefined,
      /**
       * A LEAD, NOT AN INSTRUCTION — and the difference is not academic.
       *
       * Of the two this first reported, one was right and one was not. Five
       * exercises mentioning "lats" were all genuine lat movements tagged only
       * "Back", and tagging them published the page. The single "hip flexors"
       * match was Sit Ups, whose description mentions them to say the load
       * should NOT go there; tagging it would have been simply false.
       *
       * So the wording asks somebody to look. A heuristic that reads text and
       * reports a count is worth having and is not worth obeying.
       */
      todo: retag > 0
        ? `${retag} existing exercise(s) already mention "${hub.name.toLowerCase()}" without being tagged with it — `
          + `worth checking before writing ${short} new one(s), but read each: a description can mention a muscle `
          + `to say the load should NOT go there`
        : hub.kind === "muscle"
          ? `${short} more exercise(s) that train the ${hub.name.toLowerCase()}`
          : `${short} more exercise(s) using a ${hub.name.toLowerCase()}`,
    });
  }

  for (const { hub, members } of allRecipeHubs()) {
    if (members.length >= MIN_RECIPE_HUB || members.length === 0) continue;
    gaps.push({
      kind: hub.kind === "meal" ? "meal" : "ingredient",
      name: hub.name,
      href: recipeHubPath(hub),
      have: members.length,
      need: MIN_RECIPE_HUB,
      short: MIN_RECIPE_HUB - members.length,
      todo: hub.kind === "meal"
        ? `${MIN_RECIPE_HUB - members.length} more ${hub.name.toLowerCase()} recipe(s)`
        : `${MIN_RECIPE_HUB - members.length} more recipe(s) built on ${hub.name.toLowerCase()}`,
    });
  }

  return gaps.sort(byCheapest);
}

/** The ones worth putting in front of somebody. */
export function nearMisses(): Gap[] {
  return contentGaps().filter((g) => g.short <= NEARLY);
}

/**
 * One line for the top of the panel, or null when there is nothing to do.
 *
 * Counts PAGES rather than items, because that is the unit somebody decides
 * about: "eleven recipes unlocks four pages" is a different proposition from
 * "eleven recipes".
 */
export function gapSummary(): string | null {
  const near = nearMisses();
  if (near.length === 0) return null;
  const items = near.reduce((n, g) => n + g.short, 0);
  return `${items} more item${items === 1 ? "" : "s"} would publish ${near.length} `
    + `new page${near.length === 1 ? "" : "s"}.`;
}
