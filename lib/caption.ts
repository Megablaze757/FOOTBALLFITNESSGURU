// =============================================================================
// Captions — the words that go in the box under the post.
//
// WHY THIS IS NOT THE AI WRITER. The writer in the content engine is for a
// topic somebody typed. This is for the post that was just exported, and for
// that the caption is not a creative problem: the drill has a name, a setup,
// three steps, a cue and a volume, all already written by a person. A model
// asked to rewrite those can only make them longer or make them wrong.
//
// So this is a template over real rows, which means it is free, instant,
// identical every time, and cannot invent a claim. The one place a model still
// earns its keep is a topic with no data behind it — that tab is still there.
//
// SHOWING OFF THE APP IS A FACT, NOT AN ADVERT. The closing line is drawn from
// lib/content.ts's verified facts, picked by which one the drill actually
// demonstrates. "Every drill in the app has the cue written out like this" is
// true and checkable; "the best training app" is neither, and NEVER_CLAIM says
// so.
// =============================================================================

import type { SkillDrill } from "./skills";
import { FACT_GROUPS } from "./content";
import { DEMO_SCREENS, type DemoScreen } from "./demo-card";

/** Instagram truncates a caption at 125 characters with a "more" link. */
export const CAPTION_FOLD = 125;
/** Instagram's hard limit. */
export const CAPTION_MAX = 2200;

/**
 * Hashtags, deliberately few.
 *
 * Thirty tags is a 2016 tactic that now reads as spam and is what the content
 * pack calls a hashtag wall. Four: the sport, the skill, and two the account
 * wants to own.
 */
export function hashtags(drill: SkillDrill): string[] {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return [...new Set([`#${slug(drill.sport)}training`, `#${slug(drill.skill)}`, "#pocketathlete", "#traindeliberately"])];
}

/**
 * The one verified fact this drill is evidence for.
 *
 * Keyed off what the post actually showed, so the claim and the picture agree:
 * a drill card with a cue on it earns the line about every drill having a cue,
 * and nothing else.
 */
export function supportingFact(): string {
  const drills = FACT_GROUPS.find((g) => g.id === "drills");
  return drills?.facts[0] ?? "";
}

export interface CaptionParts {
  hook: string;
  body: string;
  cta: string;
  tags: string[];
}

/**
 * The hook is its own line and under the fold.
 *
 * Everything past 125 characters is behind "... more", which most people never
 * tap. A caption whose first line is "Wall passing reps 1. Pass firmly against
 * the wall with the inside of the foot. 2. Take the return..." has spent its
 * only visible line on step one.
 */
export function drillCaption(drill: SkillDrill, opts: { link?: string } = {}): CaptionParts {
  const link = opts.link ?? "pocketathlete.com/drills";
  const steps = drill.how.slice(0, 3).map((s, i) => `${i + 1}. ${s}`);
  /**
   * The cue is the hook — unless the cue is longer than the fold.
   *
   * One drill's coaching line is 140 characters, so using it whole would have
   * put "... more" in the middle of the one sentence the post exists for. It
   * is not trimmed, because a coaching cue cut mid-clause is worse than a
   * plainer opener: it moves into the body intact and the name leads instead.
   */
  const longCue = drill.coaching.length > CAPTION_FOLD;
  return {
    hook: longCue ? `${drill.name} — the cue that makes it work` : drill.coaching,
    body: [
      ...(longCue ? [drill.coaching, ""] : []),
      `${drill.name} — ${drill.reps}`,
      "",
      `You need: ${drill.setup}`,
      "",
      ...steps,
    ].join("\n"),
    cta: `${supportingFact()} Free, no account needed — ${link}`,
    tags: hashtags(drill),
  };
}

/** A caption for an app-demo post: what the screen shows, in its own words. */
export function demoCaption(screen: DemoScreen, opts: { link?: string } = {}): CaptionParts {
  const meta = DEMO_SCREENS.find((s) => s.id === screen);
  if (!meta) throw new Error(`unknown demo screen: ${screen}`);
  const group = FACT_GROUPS.find((g) => g.id === screen)
    ?? FACT_GROUPS.find((g) => g.id === "readiness")!;
  return {
    hook: meta.caption,
    // Three facts, not the whole group: a caption is not a feature list.
    body: group.facts.slice(0, 3).map((f) => `— ${f}`).join("\n"),
    cta: `${opts.link ?? "pocketathlete.com"} — free, and no account needed to look.`,
    tags: ["#pocketathlete", "#footballtraining", "#sportsscience", "#traindeliberately"],
  };
}

export function renderCaption(parts: CaptionParts): string {
  return [parts.hook, "", parts.body, "", parts.cta, "", parts.tags.join(" ")].join("\n").trim();
}

/**
 * Everything a caption must not do, checked rather than remembered.
 *
 * Same reason lib/ad-claims.ts exists for the marketing brief: these are
 * templates today, and the first person to edit one will not have read
 * NEVER_CLAIM in lib/content.ts.
 */
export function captionProblems(text: string): string[] {
  const problems: string[] = [];
  if (text.length > CAPTION_MAX) problems.push(`${text.length} characters — Instagram's limit is ${CAPTION_MAX}`);

  const firstLine = text.split("\n")[0] ?? "";
  if (firstLine.length > CAPTION_FOLD) {
    problems.push(`the first line is ${firstLine.length} characters — everything past ${CAPTION_FOLD} is behind "more"`);
  }

  const tags = text.match(/#\w+/g) ?? [];
  if (tags.length > 6) problems.push(`${tags.length} hashtags reads as spam`);

  const rules: [RegExp, string][] = [
    // The words in between are the point: "prevents hamstring injuries" and
    // "fixes that nagging knee pain" both slipped a rule that demanded the two
    // halves be adjacent. Bounded so it cannot reach across a full stop into
    // an unrelated sentence.
    [/\b(prevent|cure|treat|heal|fix)\w*\b[^.!?]{0,30}?\b(injur|pain|strain|tear|niggle)/i, "a medical claim"],
    [/\b(guarantee|guaranteed|will add|you will gain)\b/i, "a promised result"],
    [/\b(best|number one|no\.?\s?1|leading)\s+(app|training|coach)/i, "an unsubstantiated superlative"],
    /**
     * An AUDIENCE size, not a drill's. "A 5v2 rondo with 4 players" is a
     * setup instruction and tripped this rule, which would have blocked a
     * caption for describing the exercise. So: a number big enough to be a
     * boast (three digits, or grouped with commas), or a joining verb in
     * front of it.
     */
    [/\b(?:\d{3,}|\d{1,3}(?:,\d{3})+)\+?\s*(?:athletes|users|players|downloads|members)\b/i, "a user number"],
    [/\b(?:join|over|more than)\s+\d[\d,]*\s*(?:athletes|users|players|members)\b/i, "a user number"],
    [/\b(trusted by|used by)\s+(pros|professionals|academies|clubs)/i, "an affiliation claim"],
  ];
  for (const [re, why] of rules) {
    if (re.test(text)) problems.push(why);
  }
  return problems;
}
