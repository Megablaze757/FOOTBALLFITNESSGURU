// =============================================================================
// Articles — the blog, and the checks that decide whether one is worth having.
//
// I argued against this: 793 computed pages already compete for the same crawl
// budget, and a written article goes stale the moment a number in it moves.
// It is being built anyway, so the job is to build the version where that
// objection is handled rather than the version where it comes true.
//
// Three rules do the work:
//
//   1. AN ARTICLE IS DATA, NOT A MARKDOWN FILE. It is a typed object in
//      lib/articles.ts, so it is reviewed as a diff and a broken one fails the
//      build rather than shipping.
//
//   2. EVERY NUMBER IS INTERPOLATED, NEVER TYPED. `${money(facts.cheapest)}`,
//      not "£0.31". The same rule llms.txt already lives under: a count typed
//      into prose is a count that goes stale silently, with your name on it.
//      articleProblems() fails on a bare number in the body.
//
//   3. IT MUST EARN ITS LINKS. An article with no internal links is a leaf
//      that took crawl budget from the pages that convert. Three minimum, all
//      to pages that exist.
// =============================================================================

import { captionProblems } from "./caption";

export interface ArticleSection {
  heading: string;
  /** Paragraphs. Numbers arrive already interpolated by the article's author. */
  body: string[];
}

export interface ArticleLink {
  /** An internal path, e.g. "/exercises/muscle/chest/". */
  href: string;
  text: string;
}

export interface Article {
  slug: string;
  /** Shown as the H1 and as the <title>. */
  title: string;
  /** The meta description. */
  description: string;
  /** What this page is trying to rank for — checked to appear where it must. */
  keyword: string;
  /** ISO date. Articles are dated because a reader should know how old it is. */
  published: string;
  updated?: string;
  /** The opening, before the first heading. */
  intro: string[];
  sections: ArticleSection[];
  /** Rendered as FAQPage schema as well as on the page. */
  faq?: { q: string; a: string }[];
  links: ArticleLink[];
}

/** Google truncates a title around here. */
export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 160;
/** Below this it is a note, not an article, and it competes with better pages. */
export const MIN_WORDS = 600;
export const MIN_LINKS = 3;

export function articleWords(article: Article): number {
  const text = [
    ...article.intro,
    ...article.sections.flatMap((s) => [s.heading, ...s.body]),
    ...(article.faq ?? []).flatMap((f) => [f.q, f.a]),
  ].join(" ");
  return text.split(/\s+/).filter(Boolean).length;
}

/** The first hundred words, where the subject has to be stated. */
export function opening(article: Article): string {
  return article.intro.join(" ").split(/\s+/).slice(0, 100).join(" ");
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE OPTIMISER, AS A LIST OF FAILURES RATHER THAN A SCORE.
 *
 * A score out of a hundred is something you feel good about; a list of what is
 * wrong is something you fix. Every rule here is a thing that measurably costs
 * the page — a truncated title, a subject the first paragraph never states, a
 * number that will be wrong in a month, a claim we are not allowed to make.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function articleProblems(article: Article, knownPaths: Set<string>): string[] {
  const problems: string[] = [];
  const keyword = article.keyword.toLowerCase();
  const has = (text: string) => text.toLowerCase().includes(keyword);

  if (!/^[a-z0-9][a-z0-9-]*$/.test(article.slug)) problems.push(`"${article.slug}" is not a usable URL`);
  if (article.title.length > TITLE_MAX) problems.push(`the title is ${article.title.length} characters — Google shows about ${TITLE_MAX}`);
  if (!has(article.title)) problems.push(`the title does not contain "${article.keyword}"`);
  if (article.description.length > DESCRIPTION_MAX) problems.push(`the description is ${article.description.length} characters`);
  if (article.description.length < 70) problems.push("the description is too short to say anything");
  if (!has(article.description)) problems.push(`the description does not contain "${article.keyword}"`);
  if (!has(opening(article))) problems.push(`the first hundred words never say "${article.keyword}"`);

  const words = articleWords(article);
  if (words < MIN_WORDS) problems.push(`${words} words — under ${MIN_WORDS} it competes with better pages of ours`);

  if (!article.sections.length) problems.push("no sections, so no H2s to structure it");
  for (const s of article.sections) {
    if (!s.body.length) problems.push(`"${s.heading}" is a heading with nothing under it`);
  }

  if (article.links.length < MIN_LINKS) problems.push(`${article.links.length} internal links — a leaf page takes crawl budget and gives nothing back`);
  for (const l of article.links) {
    if (!knownPaths.has(l.href)) problems.push(`links to ${l.href}, which is not a page on this site`);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(article.published)) problems.push("the published date is not an ISO date");

  /**
   * A BARE NUMBER IN THE BODY IS A NUMBER SOMEBODY TYPED.
   *
   * Interpolated ones arrive as digits too, so this cannot tell them apart at
   * runtime — which is why the real check is the source-level one in
   * lib/articles.test.ts. This catches the ones that are obviously prose
   * counts: a figure with a unit or a currency in front of it.
   */
  const body = [...article.intro, ...article.sections.flatMap((s) => s.body)].join(" ");
  for (const problem of captionProblems(body)) {
    // The caption rules check a caption's shape too; only the claim rules apply here.
    if (!/characters|hashtags|behind "more"/.test(problem)) problems.push(problem);
  }

  return problems;
}
