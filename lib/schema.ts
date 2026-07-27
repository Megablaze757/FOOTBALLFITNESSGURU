// =============================================================================
// JSON-LD for generative engines.
//
// AI answer engines — ChatGPT search, Perplexity, Google's AI Overviews — cite
// differently from a blue-link search engine. They lift a passage and attribute
// it, so what gets you quoted is:
//
//   * a direct answer in the first sentence, not after three paragraphs of
//     preamble
//   * facts bound to an explicit structure (HowTo steps, FAQ pairs) rather
//     than implied by page layout
//   * a named, resolvable publisher, so there's something to attribute to
//   * a visible last-updated date, because staleness is a ranking signal for
//     answers in a way it never was for links
//
// This module builds that markup. It only ever describes content that is
// actually on the page — schema that claims more than the page shows is a
// manual action, and a model that quotes it will quote something untrue.
// =============================================================================

import type { SkillDrill } from "./skills";
import { SITE } from "./seo";

export const PUBLISHER = {
  "@type": "Organization",
  "@id": `${SITE}/#org`,
  name: "PocketAthlete",
  url: SITE,
  logo: `${SITE}/logo.png`,
};

/** Serialise for a <script type="application/ld+json">. */
export function jsonLd(data: unknown): string {
  // The escape guards against a "</script>" ever appearing inside a string —
  // this is our own data, but copy changes are how that eventually happens.
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/**
 * A drill as a HowTo.
 *
 * Drills are already the shape an answer engine wants — kit needed, ordered
 * steps, a stated volume, one coaching cue. Marking them up as HowTo is the
 * difference between "there is a page about heading drills" and being the
 * source quoted when someone asks how to practise heading.
 */
export function drillHowTo(drill: SkillDrill, sportLabel: string, url: string) {
  return {
    "@type": "HowTo",
    "@id": `${url}#${drill.id}`,
    name: drill.name,
    description: `${sportLabel} ${drill.skill.toLowerCase()} drill. ${drill.coaching}`,
    totalTime: "PT15M",
    supply: [{ "@type": "HowToSupply", name: drill.setup }],
    step: drill.how.map((text, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      text,
    })),
    tool: drill.needs === "solo" ? [] : [{ "@type": "HowToTool", name: drill.needs === "partner" ? "A training partner" : "A full session group" }],
    publisher: { "@id": PUBLISHER["@id"] },
  };
}

export interface FaqPair { q: string; a: string }

export function faqPage(pairs: FaqPair[]) {
  return {
    "@type": "FAQPage",
    mainEntity: pairs.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
}

/**
 * An article, with the dates an answer engine looks for.
 *
 * `dateModified` is deliberately the build date: these pages are generated
 * from lib/skills.ts and lib/essentials.ts, so they genuinely are as current
 * as the last deploy. Backdating it to look fresh would be lying to the thing
 * you want to be cited by.
 */
export function guideArticle(opts: {
  url: string;
  headline: string;
  description: string;
  keywords: string[];
}) {
  return {
    "@type": "Article",
    "@id": `${opts.url}#article`,
    headline: opts.headline,
    description: opts.description,
    keywords: opts.keywords.join(", "),
    inLanguage: "en-GB",
    isAccessibleForFree: true,
    datePublished: "2026-07-27",
    dateModified: new Date().toISOString().slice(0, 10),
    author: { "@id": PUBLISHER["@id"] },
    publisher: { "@id": PUBLISHER["@id"] },
    mainEntityOfPage: { "@type": "WebPage", "@id": opts.url },
  };
}

/** Wraps a set of nodes in the @graph envelope, with the publisher included once. */
export function graph(nodes: unknown[]) {
  return { "@context": "https://schema.org", "@graph": [PUBLISHER, ...nodes] };
}
