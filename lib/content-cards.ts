// =============================================================================
// THE FIGURE IS THE SUBJECT, NOT A NUMBER INSIDE A SENTENCE.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE ONE FACELESS SHAPE THE NICHE ACTUALLY REWARDS.
//
// lib/reel.ts opens by recording that the card reels were slideshows and that
// "slideshows do not get watched" — text sliding over a gradient, the thing a
// feed scrolls past fastest. That was a fair reading of what was there, and it
// led to filming the app instead, which turns out to be the worst-performing
// format of the lot (see lib/content-formats.ts).
//
// Both were the same mistake in opposite directions. What the evidence says
// about faceless fitness content is narrower than either: it "competes on
// knowledge — programming logic, myth debunks, recovery science over clean
// frames". Not sentences about a product. A FACT the viewer did not have.
//
// The difference between that and the old slideshow is three things:
//
//   ONE. The figure is set large and IS the card. "£0.31" fills the frame; the
//   food that costs it is the small print under it. A sentence with a number
//   in it is a sentence; a number with a sentence under it is a fact.
//
//   TWO. It has to be something nobody else can post. This app prices thirty
//   grams of protein against real shelf prices and ranks a lift against
//   bodyweight — those figures exist here and roughly nowhere else, which is
//   the whole reason a knowledge post earns a watch.
//
//   THREE. It is SHORT. A comparison is resolved in twelve seconds and loops,
//   and a loop is counted again.
//
// These are pure data. What draws them is app/studio, and what films them is
// the recorder that already exists — so this inherits the voice, the caption
// sync and the loudness work without any of it being rebuilt.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

import { indexFacts, money, REFERENCE_PROTEIN } from "./protein-index";
import { standardPages } from "./standards-page";
import { rankLift } from "./strength-standards";

/** One big figure and the words that make it mean something. */
export interface CardFace {
  /** The figure, already formatted. This is the biggest thing on screen. */
  figure: string;
  /** What the figure is OF. Small, under it. */
  caption: string;
  /** Optional line above the figure — the category, not a sentence. */
  kicker?: string;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THREE STAGES, AND THE SHOT CHANGES AT EACH ONE.
 *
 * lib/reel-retention.ts refuses a reel that spends more than 60% of itself on
 * one route — "a reel that never leaves a single route is a screenshot with
 * captions over it, whatever its beats say". It flagged the first version of
 * these cards, and it was right to: a static card with a ring moving around it
 * is the slideshow this project already abandoned once.
 *
 * So a card is not one picture, it is three. app/studio renders it at a stage,
 * and each stage is its own route: the setup, the reveal, and the proof. The
 * picture genuinely changes, the rule passes for the reason it was written
 * rather than by being relaxed, and the reveal is a cut instead of a
 * highlight.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const CARD_STAGES = 3;

export interface ContentCard {
  id: string;
  /** Which format in lib/content-formats.ts this is an instance of. */
  format: "knowledge" | "comparison";
  /** The line that has to earn the next second. Not a label. */
  hook: string;
  /**
   * What is said over each stage, written rather than generated.
   *
   * A first version built these from the card's own fields — "£0.31." over the
   * first shot — and the caption guard caught it: a one-token sentence is a
   * one-word caption, which reads as a glitch. Templated narration is stilted
   * narration, and this is the part of a reel that sounds most obviously
   * machine-made when it is assembled rather than written.
   */
  lines: string[];
  /**
   * One face for a knowledge card, two for a comparison.
   *
   * Two is the whole device: a gap the viewer has to resolve is what stops a
   * thumb, and resolving it is what keeps them to the end.
   */
  faces: CardFace[];
  /** The sentence under the whole thing — why it is true, in the app's words. */
  footer: string;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BUILT FROM THE INDEX, NEVER TYPED OUT.
 *
 * lib/reel-script.ts records what happens otherwise: prices written as words
 * in a script, correct on the day and quietly wrong the first time a shelf
 * price moves. Everything below is derived, so a card cannot state a figure
 * the app does not currently compute.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function proteinGapCard(): ContentCard | null {
  const facts = indexFacts();
  if (!facts) return null;
  const times = Math.round(facts.spread);
  return {
    id: "protein-gap",
    format: "comparison",
    hook: `You're paying ${times}x for the same protein.`,
    lines: [
      `${REFERENCE_PROTEIN} grams of protein from ${facts.cheapest.name.toLowerCase()} costs `
        + `${money(facts.cheapest.cost)}.`,
      `The same ${REFERENCE_PROTEIN} grams from ${facts.dearest.name.toLowerCase()} runs you `
        + `${money(facts.dearest.cost)} — same protein, ${times} times the money.`,
      `PocketAthlete prices ${facts.count} foods off real shelf prices, so you can just buy the `
        + "cheap one.",
    ],
    faces: [
      {
        kicker: `${REFERENCE_PROTEIN}g of protein`,
        figure: money(facts.cheapest.cost),
        caption: facts.cheapest.name,
      },
      {
        kicker: `${REFERENCE_PROTEIN}g of protein`,
        figure: money(facts.dearest.cost),
        caption: facts.dearest.name,
      },
    ],
    footer: `Same ${REFERENCE_PROTEIN} grams. ${facts.count} foods priced from real shelf prices.`,
  };
}

/**
 * The same lift, ranked at two bodyweights.
 *
 * The tier words come from rankLift — the function the app ranks a real logged
 * lift with — so the card cannot invent a tier the app would not award.
 */
export function bodyweightGapCard(): ContentCard | null {
  const page = standardPages().find((p) => p.slug === "bench-press") ?? standardPages()[0];
  if (!page) return null;
  const LOAD = 100;
  const LIGHT = 60;
  const HEAVY = 120;
  const tier = (kg: number) => rankLift(page.lift, LOAD, kg, "male")?.tier.name;
  const light = tier(LIGHT);
  const heavy = tier(HEAVY);
  if (!light || !heavy) return null;
  return {
    id: "bodyweight-gap",
    format: "comparison",
    hook: `Your ${LOAD}kg ${page.lift.label.toLowerCase()} means nothing.`,
    lines: [
      `A ${LOAD}kg ${page.lift.label.toLowerCase()} at ${LIGHT}kg bodyweight is ${light.toLowerCase()}.`,
      `The same bar at ${HEAVY}kg is ${heavy.toLowerCase()} — nothing about the lift changed, `
        + "only who lifted it.",
      "PocketAthlete ranks what you log against your own bodyweight, across seven tiers.",
    ],
    faces: [
      { kicker: `${LOAD}kg at ${LIGHT}kg bodyweight`, figure: light, caption: "Same bar." },
      { kicker: `${LOAD}kg at ${HEAVY}kg bodyweight`, figure: heavy, caption: "Same bar." },
    ],
    footer: "A lift is worth what it is worth at your bodyweight, across 7 tiers.",
  };
}

/** What the cheapest protein actually is, which surprises people. */
export function cheapestProteinCard(): ContentCard | null {
  const facts = indexFacts();
  if (!facts?.cheapestPlant) return null;
  return {
    id: "cheapest-protein",
    format: "knowledge",
    hook: `The cheapest ${REFERENCE_PROTEIN}g of protein in the shop.`,
    lines: [
      `The cheapest ${REFERENCE_PROTEIN} grams of protein you can buy is `
        + `${facts.cheapest.name.toLowerCase()}.`,
      `It runs ${money(facts.cheapest.cost)}, which is cheaper than all ${facts.count - 1} of the `
        + "others, and it is not close.",
      "PocketAthlete costs every recipe off the same shelf prices, before you shop.",
    ],
    faces: [
      {
        kicker: facts.cheapest.name,
        figure: money(facts.cheapest.cost),
        caption: `for ${REFERENCE_PROTEIN}g of protein`,
      },
    ],
    footer: `Cheaper than every one of the other ${facts.count - 1} foods priced.`,
  };
}

export function contentCards(): ContentCard[] {
  return [proteinGapCard(), bodyweightGapCard(), cheapestProteinCard()]
    .filter((c): c is ContentCard => c !== null);
}

export function cardById(id: string): ContentCard | null {
  return contentCards().find((c) => c.id === id) ?? null;
}

/**
 * Everything wrong with a card, in the order a publisher would care.
 *
 * Checked here rather than discovered in a recording: a card is filmed by a
 * machine nobody is watching, and a figure that is empty or a hook that is a
 * label should fail in the studio.
 */
export function cardProblems(card: ContentCard): string[] {
  const problems: string[] = [];
  if (!card.hook.trim()) problems.push("has no hook");
  /**
   * A hook is a reason, not a name. The same rule the reel hooks are held to —
   * a feed gives about a second, and a label spends it saying what the thing
   * is called to somebody with no reason to care yet.
   */
  if (card.hook.trim().split(/\s+/).length < 3) problems.push(`"${card.hook}" is a label, not a hook`);
  if (!card.faces.length) problems.push("has nothing to show");
  if (card.format === "comparison" && card.faces.length !== 2) {
    problems.push(`a comparison with ${card.faces.length} face(s) has nothing to compare`);
  }
  if (card.format === "knowledge" && card.faces.length !== 1) {
    problems.push(`a knowledge card with ${card.faces.length} figures has no single subject`);
  }
  card.faces.forEach((f, i) => {
    if (!f.figure.trim()) problems.push(`face ${i + 1} has no figure, which is the whole card`);
    if (!f.caption.trim()) problems.push(`face ${i + 1}'s figure is of nothing`);
    /**
     * THE FIGURE IS THE SUBJECT. A "figure" long enough to be a sentence means
     * somebody wrote prose into the slot that exists to be set at 200px, and
     * it will be unreadable rather than large.
     */
    if (f.figure.trim().split(/\s+/).length > 3) {
      problems.push(`face ${i + 1}'s figure "${f.figure}" is a sentence, not a figure`);
    }
  });
  if (!card.footer.trim()) problems.push("has no line saying why it is true");

  /**
   * ONE LINE PER STAGE, and the app named before the last of them. A reel that
   * saves its own name for the sign-off has spent every "it" and "this one"
   * before that on nothing — the same rule the tours are held to.
   */
  if (card.lines.length !== CARD_STAGES) {
    problems.push(`has ${card.lines.length} lines for ${CARD_STAGES} stages`);
  }
  card.lines.forEach((line, i) => {
    if (!line.trim()) problems.push(`stage ${i + 1} has nothing to say over it`);
    if (line.trim().split(/\s+/).length < 4) {
      problems.push(`stage ${i + 1} is "${line}" — too short to be a sentence`);
    }
  });
  /**
   * NAMED SOMEWHERE IN THE WRITTEN LINES, which is not the same as "not in the
   * last one". The sign-off is appended by the script builder, not written
   * here, so a line that names the app and then hands over to it satisfies the
   * rule this mirrors — lib/reel-retention.ts wants the name before the
   * SIGN-OFF, and it checks the assembled script for real.
   */
  if (card.lines.length && !card.lines.some((l) => /PocketAthlete/i.test(l))) {
    problems.push("never names the app, so every \"it\" in it refers to nothing");
  }
  return problems;
}
