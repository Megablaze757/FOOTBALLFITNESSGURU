/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE WEEKLY BRIEF: FACTS FIRST, THEN A MODEL, THEN A PERSON.
 *
 * One job a week — turn numbers this app already computes into an email and a
 * few social drafts, and put them in front of somebody to send. The model
 * writes the sentence; it does not decide what is true.
 *
 * THREE THINGS STOP THIS BECOMING SPAM.
 *
 *   1. EVERY NUMBER MUST COME FROM THE DATA. briefProblems() reads every price
 *      and every figure back out of the drafted copy and checks it against the
 *      facts it was given. A model that rounds 31p to "under 30p" to make the
 *      line scan is caught, and that is the failure that matters — a marketing
 *      claim about price is the one thing here a reader can check.
 *
 *   2. EVERY DRAFT GOES THROUGH THE CAP FILTER. See lib/ad-claims.ts. This is a
 *      fitness product advertising in the UK, so "lose 10kg by summer" is not a
 *      matter of taste.
 *
 *   3. NOTHING SENDS ITSELF. The output is a draft in the admin panel. The
 *      existing send path — announce-launch — is idempotent, resumable, has a
 *      dry run and filters unsubscribes, and none of that is bypassed here.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: post anything. No social API, no ad
 * account, no scheduler. Auto-posting generic copy at volume is what gets
 * accounts demoted and lists marked as spam; the bottleneck worth removing is
 * writing the first draft, not the decision to publish.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { claimFindings, blocked, type ClaimFinding } from "@/lib/ad-claims";
import {
  REFERENCE_PROTEIN,
  indexFacts,
  money,
  portionLabel,
  proteinIndex,
  type IndexEntry,
} from "@/lib/protein-index";
import { MEALS } from "@/lib/meals-data";
import { publishableCollections } from "@/lib/collections";

/** Numbers from the database that only the admin panel can look up. */
export interface LiveMetrics {
  /** Signups in the period. */
  newAthletes?: number;
  /** People on the waitlist who have not been mailed. */
  waitlist?: number;
  /** The funnel step losing the most people, from lib/funnel.ts. */
  worstStep?: { label: string; conversion: number };
}

export interface BriefFacts {
  cheapest: IndexEntry;
  dearest: IndexEntry;
  cheapestPlant: IndexEntry | null;
  cheapestAnimal: IndexEntry | null;
  plantSaving: number | null;
  spread: number;
  indexCount: number;
  recipeCount: number;
  collectionCount: number;
  referenceProtein: number;
  live: LiveMetrics;
}

export function gatherFacts(live: LiveMetrics = {}): BriefFacts | null {
  const facts = indexFacts();
  if (!facts) return null;
  return {
    cheapest: facts.cheapest,
    dearest: facts.dearest,
    cheapestPlant: facts.cheapestPlant,
    cheapestAnimal: facts.cheapestAnimal,
    plantSaving: facts.plantSaving,
    spread: facts.spread,
    indexCount: facts.count,
    recipeCount: MEALS.length,
    collectionCount: publishableCollections().length,
    referenceProtein: REFERENCE_PROTEIN,
    live,
  };
}

/**
 * The facts as lines, which is both what the prompt is given and what the
 * grounding check reads numbers out of. One source, so the copy cannot be
 * checked against a different set of numbers than it was written from.
 */
export function factLines(facts: BriefFacts): string[] {
  const lines = [
    `${facts.indexCount} foods qualify as high-protein sources you could eat a full portion of.`,
    `Cheapest ${facts.referenceProtein}g of protein: ${facts.cheapest.name.toLowerCase()} at ${money(facts.cheapest.cost)} `
      + `(${portionLabel(facts.cheapest)}).`,
    `Dearest: ${facts.dearest.name.toLowerCase()} at ${money(facts.dearest.cost)} (${portionLabel(facts.dearest)}).`,
    `That is a ${facts.spread.toFixed(1)}x spread between the cheapest and dearest.`,
    `${facts.recipeCount} recipes in the app, all costed ingredient by ingredient.`,
    `${facts.collectionCount} published recipe collections.`,
  ];
  if (facts.cheapestPlant && facts.cheapestAnimal && facts.plantSaving !== null) {
    lines.push(
      `Cheapest plant source: ${facts.cheapestPlant.name.toLowerCase()} at ${money(facts.cheapestPlant.cost)}. `
      + `Cheapest animal source: ${facts.cheapestAnimal.name.toLowerCase()} at ${money(facts.cheapestAnimal.cost)}. `
      + `The plant one saves ${money(facts.plantSaving)}.`);
  }
  if (facts.live.newAthletes !== undefined) lines.push(`${facts.live.newAthletes} new athletes this week.`);
  if (facts.live.waitlist !== undefined) lines.push(`${facts.live.waitlist} people on the waitlist not yet emailed.`);
  if (facts.live.worstStep) {
    lines.push(`Weakest funnel step: ${facts.live.worstStep.label}, `
      + `${facts.live.worstStep.conversion}% get through it.`);
  }
  return lines;
}

export function briefPrompt(facts: BriefFacts): { system: string; user: string } {
  const system = [
    "You write short marketing copy for PocketAthlete, a UK nutrition and training app",
    "for amateur athletes. Its distinctive feature is that every ingredient in every",
    "recipe is costed at real supermarket prices.",
    "",
    "You are given this week's facts. Use ONLY numbers that appear in them. Do not round,",
    "estimate, combine or infer a figure — if a number is not in the facts, do not use one.",
    "",
    "Reply with JSON only, in exactly this shape:",
    '{"subject": "...", "email": "...", "social": ["...", "...", "..."]}',
    "",
    '"subject": an email subject line, under 60 characters, no emoji.',
    '"email": 80-150 words to people who asked to hear from us. Lead with the most',
    "surprising number. Plain sentences. No greeting, no sign-off, no subject repeated.",
    '"social": exactly 3 standalone posts, each under 280 characters, each built on a',
    "different fact. No hashtags, no emoji, no calls to download anything.",
    "",
    "This is regulated advertising in the UK. Never state or imply a rate or amount of",
    "weight loss. Never claim a food boosts metabolism, burns fat or detoxes anything.",
    "Never promise a result, guarantee an outcome, or claim to prevent or treat injury.",
    "Never say the app is the best or the UK's number one. Describe what the data says",
    "and nothing else.",
  ].join("\n");

  const user = ["This week's facts:", "", ...factLines(facts).map((l) => `- ${l}`)].join("\n");
  return { system, user };
}

export interface BriefDraft {
  subject: string;
  email: string;
  social: string[];
}

export function parseBrief(raw: string): BriefDraft | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : raw).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const { subject, email, social } = parsed as Record<string, unknown>;
  if (typeof subject !== "string" || typeof email !== "string" || !Array.isArray(social)) return null;
  if (!social.every((s): s is string => typeof s === "string")) return null;

  return {
    subject: subject.trim(),
    email: email.trim(),
    social: social.map((s) => s.trim()).filter(Boolean),
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EVERY NUMBER IN THE COPY MUST BE A NUMBER FROM THE DATA.
 *
 * The whole value of this post is that its figures are real. A model that
 * writes "under 30p" because it scans better than "31p" has turned the one
 * genuinely checkable claim into a wrong one, and a price is exactly the claim
 * a reader will check.
 *
 * Prices are checked absolutely — every £ figure must appear in the facts.
 * Whole numbers are checked from 10 up: below that they are almost always
 * prose ("three ways to..."), and a rhetorical "three" is not a statistic
 * anybody can be misled by. A wrong small number that IS a claim — "5kg in 4
 * weeks" — is caught by the CAP filter instead, which is the better tool for it.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function allowedNumbers(facts: BriefFacts): Set<string> {
  const allowed = new Set<string>();
  const add = (n: number) => {
    allowed.add(String(n));
    allowed.add(n.toFixed(0));
    allowed.add(n.toFixed(1));
    allowed.add(n.toFixed(2));
  };

  for (const line of factLines(facts)) {
    for (const [, n] of line.matchAll(/(\d+(?:\.\d+)?)/g)) add(Number(n));
  }
  // Percentages of a stated share are derivable from the same figures.
  for (const entry of proteinIndex()) add(Math.round(entry.energyShare * 100));
  return allowed;
}

export interface BriefProblem {
  where: string;
  problem: string;
}

export function briefProblems(draft: BriefDraft, facts: BriefFacts): BriefProblem[] {
  const problems: BriefProblem[] = [];
  const allowed = allowedNumbers(facts);

  const parts: [string, string][] = [
    ["subject", draft.subject],
    ["email", draft.email],
    ...draft.social.map((s, i) => [`social ${i + 1}`, s] as [string, string]),
  ];

  for (const [where, text] of parts) {
    for (const finding of claimFindings(text)) {
      problems.push({
        where,
        problem: `${finding.risk === "blocked" ? "BLOCKED" : "check"} — ${finding.rule}: `
          + `"${finding.matched}". ${finding.why}`,
      });
    }

    for (const [, price] of text.matchAll(/£\s*(\d+(?:\.\d+)?)/g)) {
      if (!allowed.has(price) && !allowed.has(Number(price).toFixed(2))) {
        problems.push({ where, problem: `£${price} is not a number from this week's facts` });
      }
    }
    for (const [, pence] of text.matchAll(/(\d+)\s*p\b/g)) {
      if (!allowed.has((Number(pence) / 100).toFixed(2))) {
        problems.push({ where, problem: `${pence}p is not a number from this week's facts` });
      }
    }
    // Prices and pence are checked above, and "£0.31" contains "31" — scanning
    // the raw text for whole numbers reports the same figure twice, once
    // correctly and once as an invented statistic.
    const withoutMoney = text
      .replace(/£\s*\d+(?:\.\d+)?/g, " ")
      .replace(/\b\d+\.\d+\b/g, " ")
      .replace(/\b\d+\s*p\b/g, " ");
    for (const [, whole] of withoutMoney.matchAll(/\b(\d{2,})\b/g)) {
      if (!allowed.has(whole)) {
        problems.push({ where, problem: `${whole} is not a number from this week's facts` });
      }
    }
  }

  if (draft.subject.length > 60) {
    problems.push({ where: "subject", problem: `${draft.subject.length} characters, wanted under 60` });
  }
  if (draft.social.length !== 3) {
    problems.push({ where: "social", problem: `${draft.social.length} posts, wanted 3` });
  }
  for (const [i, post] of draft.social.entries()) {
    if (post.length > 280) {
      problems.push({ where: `social ${i + 1}`, problem: `${post.length} characters, wanted under 280` });
    }
  }
  const words = draft.email.split(/\s+/).filter(Boolean).length;
  if (words < 60 || words > 200) {
    problems.push({ where: "email", problem: `${words} words, wanted roughly 80-150` });
  }

  return problems;
}

/** True when nothing in the brief may be sent, whatever a reviewer thinks. */
export function briefBlocked(draft: BriefDraft): boolean {
  return [draft.subject, draft.email, ...draft.social].some((t) => blocked(claimFindings(t)));
}

export type { ClaimFinding };
