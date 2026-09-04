// =============================================================================
// SOMETHING JUST HAPPENED THAT IS WORTH POSTING.
//
// ═══════════════════════════════════════════════════════════════════════════
// A SCHEDULE COVERS THE QUIET DAYS. IT CANNOT COVER THE GOOD ONES.
//
// lib/post-plan.ts answers "what do I post on an ordinary Tuesday" by rotating
// through catalogues that were already written. That is most days, and it is
// the right answer for most days.
//
// It is the wrong answer on the day the protein index moves, or a collection
// crosses the threshold and gains a page, or the first athlete publishes a
// profile. Those are the posts with a reason to exist — they are news rather
// than content — and they are exactly the ones that go unposted, because
// nothing tells you they happened. The data changed in a file; no screen
// mentioned it.
//
// So this reads the same catalogues the site is built from and reports what is
// NOTABLE about them right now. It is not a feed of events — nothing here is
// stored, and there is no history to consult — it is a set of questions asked
// of today's data, which is what makes it free of a table to keep in step.
//
// TRUE OR ABSENT, NEVER APPROXIMATE. Every trigger names a figure the data can
// prove, because the whole value of posting a number is that somebody can check
// it. A trigger that cannot be evidenced does not fire.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

import { history, changeSince, MIN_POINTS } from "./protein-history";
import { indexFacts, money, REFERENCE_PROTEIN } from "./protein-index";
import { publishableCollections } from "./collections";
import { publishableHubs, hubPath } from "./hubs";
import { EXERCISES, isRunEntry } from "./exercises";
import { ARTICLES } from "./articles";
import { MEALS } from "./meals-data";
import { SKILL_DRILLS } from "./skills";

/** How urgent it is that this gets posted, best first. */
export type Heat = "news" | "evergreen";

export interface Trigger {
  id: string;
  heat: Heat;
  /** What happened, in the words you would say it. */
  headline: string;
  /** The sentence handed to the writer — see lib/post-plan.ts. */
  topic: string;
  href?: string;
  factGroups: string[];
}

export interface TriggerInput {
  /** Athletes who have published a page. From the admin panel's own query. */
  publicProfiles?: number;
  /** Signups that arrived carrying a code. */
  attributedSignups?: number;
}

/**
 * A price move is the only thing on this site that changes on its own.
 *
 * Everything else moves when somebody edits a file. This moves when a
 * supermarket does, which is what makes it the one genuinely recurring reason
 * to post — and lib/protein-history.ts already refuses to invent a change it
 * has not measured, so a quiet month simply produces nothing here.
 */
function priceTriggers(): Trigger[] {
  const out: Trigger[] = [];
  const change = changeSince("cheapest");
  const facts = indexFacts();
  if (change && change.direction !== "flat" && facts) {
    out.push({
      id: `protein-move:${change.from}:${change.to}`,
      heat: "news",
      headline: `Cheapest ${REFERENCE_PROTEIN}g of protein is ${Math.abs(change.pence)}p ${change.direction}`,
      topic: `${REFERENCE_PROTEIN}g of protein from the cheapest UK source has gone from `
        + `${money(change.from)} to ${money(change.to)} since ${change.since} — ${change.percent > 0 ? "+" : ""}`
        + `${change.percent}%. It is ${facts.cheapest.name.toLowerCase()}. What that means for anyone `
        + "trying to hit a protein target on a budget.",
      href: "/cheapest-protein/",
      factGroups: ["nutrition"],
    });
  }

  const readings = history();
  if (readings.length >= 2) {
    const [previous, latest] = [readings[readings.length - 2], readings[readings.length - 1]];
    if (previous.cheapestName !== latest.cheapestName) {
      out.push({
        id: `protein-swap:${latest.date}`,
        heat: "news",
        headline: `${latest.cheapestName} is now the cheapest protein, not ${previous.cheapestName}`,
        topic: `The cheapest source of ${REFERENCE_PROTEIN}g of protein has changed hands: `
          + `${latest.cheapestName.toLowerCase()} at ${money(latest.cheapest)}, where it was `
          + `${previous.cheapestName.toLowerCase()}. The cheapest thing on the shelf is not a fixed fact.`,
        href: "/cheapest-protein/",
        factGroups: ["nutrition"],
      });
    }
  }
  return out;
}

function gapTriggers(): Trigger[] {
  const out: Trigger[] = [];
  /**
   * The biggest collection, which is the one a list-shaped search is after.
   *
   * An earlier draft here tried to report collections that ALMOST publish — a
   * page one recipe short is a page that does not exist and nothing says so —
   * and could not: publishableCollections() returns only the ones that cleared
   * the floor, so the near misses are not in the data it hands back. That is a
   * change to lib/collections.ts, not something to fake here, and half a
   * feature with a confident name is worse than none.
   */
  const collections = publishableCollections();
  if (collections.length > 0) {
    const biggest = [...collections].sort((a, b) => b.members.length - a.members.length)[0];
    out.push({
      id: `collection:${biggest.collection.slug}`,
      heat: "evergreen",
      headline: `${biggest.collection.title} — ${biggest.members.length} recipes`,
      topic: `${biggest.collection.title}: ${biggest.collection.blurb} ${biggest.members.length} of them, `
        + "every one costed to the ingredient. The page a search for it is actually looking for.",
      href: `/collections/${biggest.collection.slug}/`,
      factGroups: ["nutrition"],
    });
  }

  const hubs = publishableHubs(EXERCISES.filter((e) => !isRunEntry(e)));
  if (hubs.length > 0) {
    const biggest = [...hubs].sort((a, b) => b.members.length - a.members.length)[0];
    out.push({
      id: `hub:${biggest.hub.slug}`,
      heat: "evergreen",
      headline: `${biggest.members.length} exercises under "${biggest.hub.name}"`,
      topic: `${biggest.hub.name}: ${biggest.members.length} movements, each with the muscles worked, `
        + "the equipment needed and a chosen form video. The list a search for it is actually after.",
      href: hubPath(biggest.hub),
      factGroups: ["drills", "programs"],
    });
  }
  return out;
}

/** The loop closing is a post in itself, and only once it is true. */
function loopTriggers(input: TriggerInput): Trigger[] {
  const out: Trigger[] = [];
  const pages = input.publicProfiles ?? 0;
  if (pages > 0) {
    out.push({
      id: `profiles:${pages}`,
      heat: pages < 10 ? "news" : "evergreen",
      headline: `${pages} athlete${pages === 1 ? "" : "s"} publishing a public page`,
      topic: `${pages} athlete${pages === 1 ? " has" : "s have"} chosen to publish a page with their rank, `
        + "sport and position on it — earned from sessions trained and food tracked, not bought. "
        + "Opt-in, and it shows nothing else.",
      href: "/a/",
      factGroups: ["analysis", "commercial"],
    });
  }
  return out;
}

/** The scale of the thing, which is a post whenever it is not being posted. */
function scaleTriggers(): Trigger[] {
  const movements = EXERCISES.filter((e) => !isRunEntry(e)).length;
  return [{
    id: `scale:${MEALS.length}:${movements}:${SKILL_DRILLS.length}`,
    heat: "evergreen",
    headline: `${MEALS.length} costed recipes, ${movements} exercises, ${SKILL_DRILLS.length} drills`,
    topic: `${MEALS.length} recipes costed to the ingredient, ${movements} exercises with muscle maps, `
      + `${SKILL_DRILLS.length} sport drills with coaching cues. All free to read, no account needed. `
      + "Say what the catalogue is, not that it is big.",
    href: "/recipes/",
    factGroups: ["nutrition", "drills", "programs"],
  }];
}

function articleTriggers(): Trigger[] {
  const newest = [...ARTICLES].sort((a, b) => (b.updated ?? b.published).localeCompare(a.updated ?? a.published))[0];
  if (!newest) return [];
  return [{
    id: `article:${newest.slug}`,
    heat: "evergreen",
    headline: newest.title,
    topic: `${newest.title}. ${newest.description} Post the finding itself — the link goes last.`,
    href: `/articles/${newest.slug}/`,
    factGroups: ["analysis", "nutrition"],
  }];
}

/**
 * Everything worth posting about right now, news first.
 *
 * The order is the whole point: a price move is worth interrupting the schedule
 * for and the size of the catalogue is not, and the two look identical in a
 * list sorted by anything else.
 */
export function postTriggers(input: TriggerInput = {}): Trigger[] {
  /**
   * EMITTED IN NO PARTICULAR ORDER, ON PURPOSE.
   *
   * The evergreen ones are listed first so the sort below is the only thing
   * deciding what leads. An earlier version emitted them in roughly the right
   * order already, which made the sort a no-op — dead code with a confident
   * comment over it, and a mutation that removed it passed every test. Putting
   * the always-present evergreen entries at the front means a news trigger
   * that fails to reach the top is a visible failure rather than a silent one.
   */
  const all = [
    ...scaleTriggers(),
    ...articleTriggers(),
    ...gapTriggers(),
    ...priceTriggers(),
    ...loopTriggers(input),
  ];
  const rank: Record<Heat, number> = { news: 0, evergreen: 1 };
  return all.sort((a, b) => rank[a.heat] - rank[b.heat]);
}

/** Whether the protein series can say anything about a trend yet. */
export function trendReady(): boolean {
  return history().length >= MIN_POINTS;
}
