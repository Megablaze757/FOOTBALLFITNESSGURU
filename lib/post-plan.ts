// =============================================================================
// WHAT TO POST TODAY.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE PLAN SAID WHAT KINDS OF THING TO POST. IT NEVER SAID WHAT TO POST.
//
// lib/content.ts holds a good posting plan — four pillars, their mix, a launch
// sequence, the claims that must never be made. And every tool that makes an
// actual post still begins with a blank field: the AI writer wants a topic
// typed into it, the drill cards want a drill chosen, the reel studio wants a
// subject. So the first thing standing between the account and a post is
// somebody deciding what today's is, which is the step that does not happen on
// a busy Tuesday.
//
// This names the subject. Not from an idea generator — from the catalogues
// that already exist and were already written: 100 skill drills, hundreds of
// costed recipes, the collections, the strength standards, the articles, the
// protein index, the app's own screens. Every one of them is a post that is
// already researched.
//
// ─────────────────────────────────────────────────────────────────────────
// DERIVED FROM THE DATE. NO TABLE, NO QUEUE, NO STATE.
//
// The same trick rotatingQuest uses. A schedule computed from the day is the
// same schedule on every device, survives a reload, needs no migration and
// cannot drift — and "have I posted this?" is answerable by looking at the
// date rather than by trusting a flag somebody had to remember to set.
//
// The cost is that it cannot know what you actually posted. That is the right
// trade here: a wrong entry costs one scroll, and a queue that has to be kept
// in step with reality is the thing that stops being kept.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

import { SKILL_DRILLS } from "./skills";
import { MEALS } from "./meals-data";
import { publishableCollections } from "./collections";
import { standardPages } from "./standards-page";
import { ARTICLES } from "./articles";
import { DEMO_SCREENS } from "./demo-card";
import { PILLARS } from "./content";
import { indexFacts, money, REFERENCE_PROTEIN } from "./protein-index";
import { sportLabel } from "./seo";
import type { SportId } from "./exercises";

/** What has to be made for a post, which is not the same as what it is about. */
export type PostAsset = "Drill card" | "Reel" | "App demo" | "Recipe card" | "Text only";

export interface PlannedPost {
  /** ISO date it is for. */
  date: string;
  /** Which of the four pillars in lib/content.ts this fills. */
  pillar: string;
  pillarName: string;
  /** The thing it is about, in as few words as it takes to recognise it. */
  subject: string;
  /** The sentence handed to the AI writer. A topic, not a prompt. */
  topic: string;
  asset: PostAsset;
  /** The page it should link to, when there is one. */
  href?: string;
  /** Fact groups from lib/content.ts the writer may draw on for this one. */
  factGroups: string[];
}

interface Idea {
  subject: string;
  topic: string;
  asset: PostAsset;
  href?: string;
  factGroups: string[];
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THE WALK IS STRIDED RATHER THAN IN ORDER.
 *
 * Not for coverage. `plannedPosts` passes a TURN number — how many times this
 * pillar has come round — which is consecutive, so plain `list[turn % len]`
 * would already visit everything. (The first version indexed by the DAY, and
 * there it mattered enormously: a pillar with five slots in ten days advances
 * by ten each turn, so `day % 100` reaches ten of a hundred drills and never
 * the rest. That is what the "counts turns, not days" test protects.)
 *
 * It is for the ORDER. Each pillar's list is several catalogues concatenated —
 * the problem pillar is the protein index, then every strength standard, then
 * every recipe collection. Walking it in order posts ten consecutive strength
 * standards before the first collection, which is a month of one thing.
 * Stepping by a stride coprime to the length still visits every entry exactly
 * once, and interleaves the catalogues on the way.
 *
 * The smallest prime that does not divide the length is always coprime to it.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function strideFor(length: number): number {
  if (length <= 2) return 1;
  for (const p of [7, 5, 3, 2, 11, 13, 17, 19, 23]) {
    if (length % p !== 0) return p;
  }
  return 1;
}

export function pick<T>(list: T[], n: number): T | null {
  if (list.length === 0) return null;
  const i = (n * strideFor(list.length)) % list.length;
  return list[((i % list.length) + list.length) % list.length];
}

/**
 * The ten-day pillar cycle, spread rather than clumped.
 *
 * PILLARS gives a share out of ten. Laid out in order that is CCCCCPPBBA — five
 * coaching posts in a row, then the ask alone at the end of every cycle. The
 * mix would be right and the feed would read as a fortnight of drills followed
 * by an advert.
 *
 * Interleaved by spacing each pillar's slots evenly across the ten, so the ask
 * lands mid-cycle and the coaching posts have something between them.
 */
export function pillarCycle(): string[] {
  const slots: (string | null)[] = Array(10).fill(null);
  // Rarest first: it has the fewest slots and therefore the least room to move,
  // so it gets to choose while the cycle is still empty.
  const order = [...PILLARS].sort((a, b) => a.share - b.share);
  for (const pillar of order) {
    const gap = 10 / pillar.share;
    for (let i = 0; i < pillar.share; i++) {
      // Its ideal position, then the nearest free slot to it.
      const ideal = Math.round(i * gap + gap / 2) % 10;
      let at = ideal;
      for (let d = 0; d < 10 && slots[at] !== null; d++) {
        at = (ideal + d + 1) % 10;
      }
      slots[at] = pillar.id;
    }
  }
  /**
   * Nothing may be left empty: a null here is a day with no post at all.
   *
   * Unreachable while the shares sum to ten — the scan tries all ten positions,
   * so it finds a free one whenever one exists, and ten shares fill ten slots
   * exactly. It is here for the edit that changes a share and not this
   * function, which is the edit somebody will make. The sum is asserted in
   * lib/post-plan.test.ts so that edit fails loudly instead of quietly posting
   * twice as much coaching.
   */
  return slots.map((s) => s ?? PILLARS[0].id);
}

/** Days since a fixed Monday, so the cycle starts on a week boundary. */
const EPOCH = Date.parse("2026-01-05T00:00:00Z");

export function dayIndex(date: string): number {
  const t = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(t)) return 0;
  return Math.floor((t - EPOCH) / 86_400_000);
}

function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

// --- what each pillar can be about ------------------------------------------

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ONE FLAT LIST PER PILLAR, AND THAT IS NOT A TIDINESS PREFERENCE.
 *
 * The first version of `building` alternated on `n % 2` — articles on odd
 * turns, app screens on even. Which restricts the screens to EVEN values of n,
 * and 3n mod 4 over even n only ever lands on two of the four screens. Twelve
 * posts, three distinct subjects.
 *
 * That is the same failure the note on strideFor() describes, reintroduced two
 * hundred lines below it by someone who had just written it down. A stride
 * coprime to the length gives a full cycle only if it is walked over EVERY
 * integer; feed it a sub-lattice and the guarantee is gone. So each pillar gets
 * one list and one index, and there is no branching left to get wrong.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * The problem: what generic programs get wrong.
 *
 * Everything here carries a figure this app can prove — a shelf price, a
 * strength standard, a costed collection. A "the problem" post with no number
 * in it is an opinion, and opinions are what the pillar exists to beat.
 */
function problemIdeas(): Idea[] {
  const out: Idea[] = [];
  const facts = indexFacts();
  if (facts) {
    out.push({
      subject: "The protein index",
      topic: `${REFERENCE_PROTEIN}g of protein costs ${money(facts.cheapest.cost)} from `
        + `${facts.cheapest.name.toLowerCase()} and ${money(facts.dearest.cost)} from `
        + `${facts.dearest.name.toLowerCase()} — a ${facts.spread.toFixed(1)}x spread for the same protein. `
        + "Why 'eat more protein' is useless advice without a shelf price.",
      asset: "Text only",
      href: "/cheapest-protein/",
      factGroups: ["nutrition"],
    });
  }
  for (const page of standardPages()) {
    out.push({
      subject: `${page.lift.label} standards`,
      topic: `What a ${page.lift.label.toLowerCase()} is actually worth at your bodyweight, and why `
        + `"is 100kg good" is the wrong question without one.`,
      asset: "Text only",
      href: `/standards/${page.slug}/`,
      factGroups: ["analysis", "programs"],
    });
  }
  for (const { collection, members } of publishableCollections()) {
    out.push({
      subject: collection.title,
      topic: `${collection.title}: ${collection.blurb} ${members.length} of them, each costed to the `
        + "ingredient. Why a meal plan that ignores what food costs is a meal plan nobody follows.",
      asset: "Recipe card",
      href: `/collections/${collection.slug}/`,
      factGroups: ["nutrition"],
    });
  }
  return out;
}

/**
 * Build in public: what shipped, what broke.
 *
 * The only pillar with nothing in the catalogue that IS the post — what
 * shipped this week is not in the data. It gets the app's own screens and the
 * written articles, which are the closest thing to "here is the actual
 * product" that can be named automatically, and each topic says plainly that
 * the week's specifics are yours to add.
 */
function buildingIdeas(): Idea[] {
  const out: Idea[] = ARTICLES.map((article) => ({
    subject: article.title,
    topic: `${article.title}. ${article.description} Post the finding, not the article — `
      + "the link goes at the end.",
    asset: "Text only" as PostAsset,
    href: `/articles/${article.slug}/`,
    factGroups: ["analysis", "nutrition"],
  }));
  for (const screen of DEMO_SCREENS) {
    out.push({
      subject: `${screen.label} screen`,
      topic: `Show the ${screen.label.toLowerCase()} screen and what it does: ${screen.caption} `
        + "Say what changed about it recently and why — the specifics of the week are yours to add.",
      asset: "App demo",
      href: "/",
      factGroups: ["readiness", "programs", "analysis"],
    });
  }
  return out;
}

/**
 * The ask: direct, once per cycle.
 *
 * TWO MESSAGES, NOT ONE REPEATED. The pillar in lib/content.ts asks for both
 * ("what the app does, then the link" and "what founding members get"), and an
 * account that posts the identical advert every tenth day is one people learn
 * to scroll past. The concrete detail rotates too, so the same message twice is
 * not the same post twice.
 */
function askIdeas(): Idea[] {
  const out: Idea[] = [];
  for (const meal of MEALS.slice(0, 12)) {
    out.push({
      subject: `What it does — ${meal.name.toLowerCase()}`,
      topic: "What the app does in four lines: a 60-second check-in that changes today's session, "
        + "programs built for your position, and every meal costed to the ingredient — "
        + `${meal.name.toLowerCase()} included. Then the link.`,
      asset: "Text only",
      href: "/",
      factGroups: ["readiness", "programs", "nutrition", "commercial"],
    });
    out.push({
      subject: `What founding members get — ${meal.name.toLowerCase()}`,
      topic: "What founding members get, and what the price is locked at for as long as they stay. "
        + "Lead with one concrete thing the app does rather than the offer — "
        + `costing ${meal.name.toLowerCase()} to the ingredient, for instance. Then the terms, plainly.`,
      asset: "Text only",
      href: "/plans/",
      factGroups: ["commercial", "nutrition"],
    });
  }
  return out;
}

/** How many distinct subjects a pillar has to draw on. Exported so the
 *  rotation test can assert it uses ALL of them rather than an arbitrary few. */
export function ideaCount(pillarId: string): number {
  return ideasFor(pillarId).length;
}

/**
 * Built once. The catalogues are compiled into the bundle and cannot change
 * while the process runs, and a sixty-day plan would otherwise rebuild every
 * list sixty times — publishableCollections() walks every recipe.
 */
let ideas: Record<string, Idea[]> | null = null;

function ideasFor(pillarId: string): Idea[] {
  ideas ??= {
    coaching: SKILL_DRILLS.map((drill) => ({
      subject: `${drill.name} (${sportLabel(drill.sport as SportId)})`,
      topic: `The ${drill.name.toLowerCase()} drill for ${sportLabel(drill.sport as SportId).toLowerCase()}: `
        + `${drill.setup}. ${drill.reps}. The thing that separates doing it from doing it well: ${drill.coaching}`,
      asset: "Drill card" as PostAsset,
      href: `/drills/${drill.sport}/`,
      factGroups: ["drills", "programs"],
    })),
    problem: problemIdeas(),
    building: buildingIdeas(),
    ask: askIdeas(),
  };
  return ideas[pillarId] ?? [];
}

/**
 * The plan, from `from` for `days` days.
 *
 * Every entry is a subject the catalogue can already fill, so nothing here is
 * an instruction to go and think of something.
 */
export function plannedPosts(from: string, days = 7): PlannedPost[] {
  const cycle = pillarCycle();
  const out: PlannedPost[] = [];

  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    const n = dayIndex(date);
    const pillarId = cycle[((n % cycle.length) + cycle.length) % cycle.length];
    const pillar = PILLARS.find((p) => p.id === pillarId) ?? PILLARS[0];
    /**
     * The subject index counts CYCLES, not days.
     *
     * Passing the day number means a pillar that gets five slots in ten days
     * advances its subject by ten each time it comes round, so the stride is
     * multiplied by ten and the coprimality argument above is destroyed. How
     * many times this pillar has come up is the number that matters.
     */
    const turn = Math.floor(n / cycle.length) * pillar.share
      + cycle.slice(0, ((n % cycle.length) + cycle.length) % cycle.length).filter((p) => p === pillarId).length;
    const idea = pick(ideasFor(pillar.id), turn);
    if (!idea) continue;
    out.push({
      date,
      pillar: pillar.id,
      pillarName: pillar.name,
      subject: idea.subject,
      topic: idea.topic,
      asset: idea.asset,
      href: idea.href,
      factGroups: idea.factGroups,
    });
  }
  return out;
}
