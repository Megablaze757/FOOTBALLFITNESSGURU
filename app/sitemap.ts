import type { MetadataRoute } from "next";
import { SITE, guideSports, guidePages, contentPages } from "@/lib/seo";
import { MEALS } from "@/lib/meals-data";
import { EXERCISES, isRunEntry } from "@/lib/exercises";
import { collectionSlugs } from "@/lib/collections";

// Generated at build time from lib/seo.ts, which is the same source the pages
// and the internal links use — so the sitemap can't list a URL that 404s.
//
// Only public pages. Everything behind auth is disallowed in robots.txt and
// listing it here would contradict that.
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const core = [
    { url: `${SITE}/`, changeFrequency: "weekly" as const, priority: 1 },
    { url: `${SITE}/plans/`, changeFrequency: "weekly" as const, priority: 0.95 },
    { url: `${SITE}/waitlist/`, changeFrequency: "weekly" as const, priority: 0.9 },
    { url: `${SITE}/drills/`, changeFrequency: "monthly" as const, priority: 0.8 },
    { url: `${SITE}/guides/`, changeFrequency: "monthly" as const, priority: 0.8 },
    { url: `${SITE}/recipes/`, changeFrequency: "monthly" as const, priority: 0.85 },
    { url: `${SITE}/exercises/`, changeFrequency: "monthly" as const, priority: 0.85 },
    { url: `${SITE}/collections/`, changeFrequency: "monthly" as const, priority: 0.85 },
    { url: `${SITE}/privacy/`, changeFrequency: "yearly" as const, priority: 0.2 },
    { url: `${SITE}/terms/`, changeFrequency: "yearly" as const, priority: 0.2 },
  ];

  const drills = guideSports().map((sport) => ({
    url: `${SITE}/drills/${sport}/`,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  const guides = guidePages().map(({ sport, slug }) => ({
    url: `${SITE}/guides/${sport}/${slug}/`,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  /**
   * The recipes and exercises, which are most of the site now.
   *
   * Around six hundred pages against the seven that were here before — and none
   * of them generated: the recipes were written, the prices researched, the
   * macros computed from the same food database the planner shops from. They
   * were simply behind a login, which robots.txt correctly told crawlers not to
   * follow.
   *
   * Lower priority than the core pages and no higher than the guides. Priority
   * is a hint about relative importance WITHIN a site, and telling Google six
   * hundred pages matter as much as the homepage says nothing at all.
   */
  const recipes = contentPages(MEALS).map(({ slug }) => ({
    url: `${SITE}/recipes/${slug}/`,
    changeFrequency: "yearly" as const,
    priority: 0.6,
  }));

  const exercises = contentPages(EXERCISES.filter((e) => !isRunEntry(e))).map(({ slug }) => ({
    url: `${SITE}/exercises/${slug}/`,
    changeFrequency: "yearly" as const,
    priority: 0.6,
  }));

  /**
   * The collection pages, which rank above the recipes they list on purpose.
   *
   * A collection is the page a search like "cheap high protein meals" is
   * actually looking for, and it is the one page type here that no recipe site
   * with uncosted ingredients can produce. Only the ones that cleared
   * MIN_MEMBERS are listed, because collectionSlugs() is the same function the
   * route uses — a collection the data cannot fill has no file to point at.
   */
  const collections = collectionSlugs().map((slug) => ({
    url: `${SITE}/collections/${slug}/`,
    changeFrequency: "monthly" as const,
    priority: 0.75,
  }));

  return [...core, ...drills, ...guides, ...collections, ...recipes, ...exercises]
    .map((e) => ({ ...e, lastModified: now }));
}
