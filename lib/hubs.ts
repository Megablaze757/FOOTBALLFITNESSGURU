// =============================================================================
// Topic hubs — the pillar pages 719 exercise pages had nothing to belong to.
//
// The related blocks fixed the dead ends: every movement now links to six
// others. What that does not give you is a page for the TOPIC. Somebody
// searching "dumbbell chest exercises" is looking for a list, and the site had
// one flat index of 382 and no page that answers it.
//
// COMPUTED, AND THE GATE CAN SHUT. Same rule as lib/collections.ts: a hub
// exists only when enough movements qualify. A page listing four exercises for
// a muscle is a thin page with a keyword in the title, which is the failure
// mode of every programmatic-SEO project — and this file is one, so the guard
// is here rather than in a reviewer's head.
// =============================================================================

import type { Exercise } from "./exercises";
import { equipBucket } from "./exercise-catalog";
import { slugify } from "./seo";

/**
 * Twelve, the same floor lib/collections.ts uses.
 *
 * Below it the page is a list nobody needed: "Neck" has one movement and
 * "Grip" has two, and a page for either is a doorway, not a hub.
 */
export const MIN_HUB_MEMBERS = 12;

export type HubKind = "muscle" | "equipment";

export interface Hub {
  kind: HubKind;
  /** The value as the catalogue spells it — "Chest", "Dumbbell". */
  name: string;
  slug: string;
}

/** What a hub of this kind claims about its members, for the page's own copy. */
export const HUB_COPY: Record<HubKind, { title: (n: string) => string; blurb: (n: string, count: number) => string }> = {
  muscle: {
    title: (n) => `${n} exercises`,
    blurb: (n, count) =>
      `${count} movements that train the ${n.toLowerCase()}, with how to do each one, `
      + `what it works and the cues that matter.`,
  },
  equipment: {
    title: (n) => `${n} exercises`,
    blurb: (n, count) =>
      `${count} movements you can do with ${n.toLowerCase() === "bodyweight" ? "no kit at all" : `a ${n.toLowerCase()}`}, `
      + `with how to do each one and what it works.`,
  },
};

function valuesOf(exercise: Exercise, kind: HubKind): string[] {
  return kind === "muscle" ? exercise.muscles : [equipBucket(exercise.equipment)];
}

/**
 * Members of a hub.
 *
 * Case-insensitive on the way in because the catalogue has both "Whole Body"
 * and "Whole body" — two spellings of one muscle group, which would otherwise
 * be two hubs of half the size each, both of them below the floor.
 */
export function hubMembers(hub: Hub, all: Exercise[]): Exercise[] {
  const want = hub.name.toLowerCase();
  return all
    .filter((e) => valuesOf(e, hub.kind).some((v) => v.toLowerCase() === want))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Every hub worth publishing, largest first.
 *
 * "Other" is excluded by name: it is the equipment bucket for everything that
 * did not classify, so a page for it would be a hundred unrelated movements
 * under a heading that means nothing to a reader or a crawler.
 */
/** Only the hubs with enough behind them to be worth a page. A filter over
 *  allHubs, so the two cannot disagree about what a hub contains. */
export function publishableHubs(all: Exercise[]): { hub: Hub; members: Exercise[] }[] {
  return allHubs(all).filter(({ members }) => members.length >= MIN_HUB_MEMBERS);
}

/**
 * EVERY candidate hub, including the ones too thin to publish.
 *
 * A muscle two exercises short of a page is a page that does not exist, and
 * the only function here returned the ones already over the line — so what was
 * nearly ready could not be seen. See lib/content-gaps.ts.
 */
export function allHubs(all: Exercise[]): { hub: Hub; members: Exercise[] }[] {
  const out: { hub: Hub; members: Exercise[] }[] = [];

  for (const kind of ["muscle", "equipment"] as const) {
    const seen = new Map<string, string>(); // lowercased -> first spelling
    for (const e of all) {
      for (const v of valuesOf(e, kind)) {
        if (!v || v.toLowerCase() === "other") continue;
        if (!seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v);
      }
    }
    for (const name of seen.values()) {
      const hub: Hub = { kind, name, slug: slugify(name) };
      const members = hubMembers(hub, all);
      out.push({ hub, members });
    }
  }

  return out.sort((a, b) => b.members.length - a.members.length || a.hub.name.localeCompare(b.hub.name));
}

export function hubPath(hub: Hub): string {
  return `/exercises/${hub.kind}/${hub.slug}/`;
}

/** Resolve a URL back to the hub it names, or null. */
export function findHub(kind: HubKind, slug: string, all: Exercise[]): { hub: Hub; members: Exercise[] } | null {
  return publishableHubs(all).find((h) => h.hub.kind === kind && h.hub.slug === slug) ?? null;
}

/** The hubs a single exercise belongs to — its links back up to its topics. */
export function hubsFor(exercise: Exercise, all: Exercise[]): Hub[] {
  return publishableHubs(all)
    .filter(({ hub }) => valuesOf(exercise, hub.kind).some((v) => v.toLowerCase() === hub.name.toLowerCase()))
    .map(({ hub }) => hub);
}
