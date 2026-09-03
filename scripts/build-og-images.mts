#!/usr/bin/env node
// =============================================================================
// Generate the link-preview images into public/og/.
//
// WHY A SCRIPT AND NOT `opengraph-image.tsx`. Next's generated OG images are
// produced by a route, and this site is `output: "export"` — there is no route
// at runtime to produce anything. These are plain files, committed, served by
// the same static host as everything else, and a crawler that fetches one gets
// a PNG rather than a 404 from a function that does not exist.
//
// Rasterised with the Playwright Chromium that is already a devDependency and
// already used by npm run shots. Nothing new is installed for this.
//
//   PW_CHROMIUM=... node --import tsx scripts/build-og-images.mts
// =============================================================================

import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { buildOgCardSvg, OG_SECTIONS, OG_WIDTH, OG_HEIGHT } from "../lib/og";
import { MEALS } from "../lib/meals-data";
import { EXERCISES, isRunEntry } from "../lib/exercises";
import { publishableCollections } from "../lib/collections";
import { indexFacts, money, REFERENCE_PROTEIN } from "../lib/protein-index";
import { standardPages } from "../lib/standards-page";
import { ARTICLES } from "../lib/articles";
import { guidePages } from "../lib/seo";
import { SKILL_DRILLS } from "../lib/skills";

const MOVEMENTS = EXERCISES.filter((e) => !isRunEntry(e));
const facts = indexFacts();

/**
 * One card per section, with the section's real count on it.
 *
 * The numbers are the point: "382 exercises" is a reason to click and "Exercise
 * library" is not, and both cost the same to render.
 */
const CARDS: Record<string, { kicker: string; title: string; subtitle?: string }> = {
  default: {
    kicker: "PocketAthlete",
    title: "Training that knows what you did yesterday",
    subtitle: "Daily readiness, position-specific programs, and nutrition costed to the ingredient.",
  },
  exercises: {
    kicker: "Exercise library",
    title: `${MOVEMENTS.length} movements, with the cues that matter`,
    subtitle: "How to do it, what it works, and when to use it. Free, no account needed.",
  },
  recipes: {
    kicker: "Recipes",
    title: `${MEALS.length} meals, costed to the ingredient`,
    subtitle: "Real supermarket prices, macros, and a shopping list that thinks in packs.",
  },
  guides: {
    kicker: "Position guides",
    title: `What your position actually needs to train`,
    subtitle: `${guidePages().length} guides across every position we cover.`,
  },
  drills: {
    kicker: "Skill drills",
    title: `${SKILL_DRILLS.length} drills you can do on your own`,
    subtitle: "The setup, the steps, and the one cue that decides whether it works.",
  },
  collections: {
    kicker: "Collections",
    title: `${publishableCollections().length} recipe collections`,
    subtitle: "Cheapest, highest protein, fastest — picked by the numbers, not by hand.",
  },
  articles: {
    kicker: "Articles",
    title: "Written from our own data, not from memory",
    subtitle: "Every figure computed, so nothing on the page goes stale in a drawer.",
  },
  standards: {
    kicker: "Strength standards",
    title: "What your lift is worth at your bodyweight",
    subtitle: `${standardPages().length} lifts, from untrained to world class.`,
  },
  "cheapest-protein": {
    kicker: "Protein index",
    title: facts
      ? `The cheapest ${REFERENCE_PROTEIN}g of protein is ${money(facts.cheapest.cost)}`
      : "What protein actually costs",
    subtitle: facts
      ? `${facts.count} foods costed at UK supermarket prices. The dearest is ${facts.spread.toFixed(1)}× more.`
      : undefined,
  },
  plans: {
    kicker: "Pricing",
    title: "One plan, everything included",
    subtitle: "Programs, the coach, nutrition, video analysis and the injury planner.",
  },
};

const OUT = "public/og";

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
  const page = await browser.newPage({ viewport: { width: OG_WIDTH, height: OG_HEIGHT } });

  const written: string[] = [];
  const render = async (slug: string, card: { kicker: string; title: string; subtitle?: string }) => {
    await page.setContent(
      `<body style="margin:0">${buildOgCardSvg(card)}</body>`,
      { waitUntil: "load" },
    );
    const png = await page.screenshot({ type: "png" });
    writeFileSync(`${OUT}/${slug}.png`, png);
    written.push(slug);
  };

  for (const slug of OG_SECTIONS) {
    const card = CARDS[slug];
    if (!card) throw new Error(`OG_SECTIONS lists "${slug}" and CARDS has no card for it`);
    await render(slug, card);
  }

  // Per-page for the ones people share deliberately. The 719 exercise and
  // recipe pages use their section image: 719 more files is 20MB in the repo
  // and minutes of build for pages that are found by search rather than sent
  // to a friend.
  for (const a of ARTICLES) {
    await render(`articles-${a.slug}`, { kicker: "Article", title: a.title, subtitle: a.description });
  }
  for (const { lift, slug } of standardPages()) {
    await render(`standards-${slug}`, {
      kicker: "Strength standards",
      title: `${lift.label} standards by bodyweight`,
      subtitle: "What each tier takes, for men and women, from untrained to world class.",
    });
  }

  await browser.close();
  console.log(`${written.length} images written to ${OUT}/`);
}

await main();
