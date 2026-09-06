import type { MetadataRoute } from "next";
import { SITE, guideSports, guidePages, contentPages } from "@/lib/seo";
import { MEALS } from "@/lib/meals-data";
import { EXERCISES, isRunEntry } from "@/lib/exercises";
import { publishableHubs, hubPath } from "@/lib/hubs";
import { publishableRecipeHubs, recipeHubPath } from "@/lib/recipe-hubs";
import { ARTICLES } from "@/lib/articles";
import { standardPages } from "@/lib/standards-page";
import { collectionSlugs } from "@/lib/collections";
import { publicAthletes } from "@/lib/public-athletes";

// Generated at build time from lib/seo.ts, which is the same source the pages
// and the internal links use — so the sitemap can't list a URL that 404s.
//
// Only public pages. Everything behind auth is disallowed in robots.txt and
// listing it here would contradict that.
export const dynamic = "force-static";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const core = [
    { url: `${SITE}/`, changeFrequency: "weekly" as const, priority: 1 },
    { url: `${SITE}/plans/`, changeFrequency: "weekly" as const, priority: 0.95 },
    /**
     * NO /waitlist. It sat here at priority 0.9 — second only to the home
     * page — while the site's calls to action all point at signup now, and
     * nothing links to it at all. A high-priority page in the sitemap that no
     * page links to is an orphan: the crawler is told it matters and given no
     * reason to believe it. Two tests caught exactly that.
     *
     * The page still works for the affiliate links and emails already out
     * there. It is simply no longer somewhere search should send anybody.
     */
    { url: `${SITE}/drills/`, changeFrequency: "monthly" as const, priority: 0.8 },
    { url: `${SITE}/guides/`, changeFrequency: "monthly" as const, priority: 0.8 },
    { url: `${SITE}/recipes/`, changeFrequency: "monthly" as const, priority: 0.85 },
    { url: `${SITE}/exercises/`, changeFrequency: "monthly" as const, priority: 0.85 },
    { url: `${SITE}/collections/`, changeFrequency: "monthly" as const, priority: 0.85 },
    { url: `${SITE}/standards/`, changeFrequency: "monthly" as const, priority: 0.85 },
    { url: `${SITE}/articles/`, changeFrequency: "weekly" as const, priority: 0.8 },
    // The index that stops every athlete page being an orphan — see the note
    // at the top of app/a/page.tsx.
    { url: `${SITE}/a/`, changeFrequency: "daily" as const, priority: 0.6 },
    // The one page here no competitor can compute. Highest of the content
    // pages because it is the one worth earning a link.
    { url: `${SITE}/cheapest-protein/`, changeFrequency: "weekly" as const, priority: 0.9 },
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

  /**
   * The topic hubs. Higher priority than a single movement: these are the
   * pages a list-shaped query ("dumbbell chest exercises") is looking for, and
   * they are what the individual pages link up into.
   */
  const hubs = publishableHubs(EXERCISES.filter((e) => !isRunEntry(e))).map(({ hub }) => ({
    url: `${SITE}${hubPath(hub)}`,
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  const articles = ARTICLES.map((a) => ({
    url: `${SITE}/articles/${a.slug}/`,
    lastModified: new Date(a.updated ?? a.published),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  const standards = standardPages().map(({ slug }) => ({
    url: `${SITE}/standards/${slug}/`,
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  const recipeHubs = publishableRecipeHubs().map(({ hub }) => ({
    url: `${SITE}${recipeHubPath(hub)}`,
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  /**
   * The opted-in athletes — the only entries here that are not in the source
   * tree. Every other URL in this file is computed from data that ships with
   * the build; these come from the database at build time, which is also what
   * makes them the only part of this sitemap that grows on its own.
   *
   * Lower than a recipe. A profile is a real page and worth indexing, but it is
   * thin next to a costed recipe, and saying otherwise about the newest and
   * least-established pages on the site would be the wrong hint.
   *
   * The always-present miss page is deliberately absent: it is noindex, and a
   * sitemap that lists a page telling crawlers not to index it is a
   * contradiction they are entitled to distrust the rest of the file over.
   */
  const athletes = (await publicAthletes()).map((a) => ({
    url: `${SITE}/a/${a.username}/`,
    changeFrequency: "weekly" as const,
    priority: 0.5,
  }));

  return [...core, ...drills, ...guides, ...collections, ...hubs, ...recipeHubs, ...standards, ...articles, ...recipes, ...exercises, ...athletes]
    // SPREAD AFTER THE DEFAULT, not before. This was `{ ...e, lastModified: now }`,
    // which overwrote the real publication date the articles above take care to
    // set — so every article claimed to have been modified at build time, on
    // every build. A lastmod that is always "just now" is the exact signal
    // Google is documented to stop trusting.
    .map((e) => ({ lastModified: now, ...e }));
}
