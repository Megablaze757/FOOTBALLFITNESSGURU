// =============================================================================
// The content engine's source of truth.
//
// Two jobs:
//
//   1. FACTS — the only claims the AI writer is allowed to build on. Every line
//      here must be something the product actually does today, because the
//      generator is explicitly told to invent nothing and to use these instead.
//      If a feature ships or changes, this list is what keeps the marketing
//      honest; if something is removed, remove it here first.
//
//   2. The content pack — pillars, angles, launch sequence — as data rather
//      than a markdown file, so it can live in the admin panel next to the
//      tools that act on it.
// =============================================================================

export interface FactGroup {
  id: string;
  label: string;
  facts: string[];
}

/**
 * Verified product facts.
 *
 * Deliberately free of numbers we can't stand behind. There is no "X athletes
 * train with us" line here and there should not be one until it's true and
 * evidenced — that claim is the single most tempting thing to fake and the
 * hardest to walk back.
 */
export const FACT_GROUPS: FactGroup[] = [
  {
    id: "readiness",
    label: "Readiness & check-in",
    facts: [
      "A daily check-in takes about 60 seconds: sleep, fatigue, soreness tapped on a body map, and optional weight.",
      "It produces a readiness score, computed on your device, that changes what it tells you to do that day.",
      "Readiness accounts for whether you played a match yesterday and how many minutes you were on.",
      "Check-ins work with no signal — they're saved on the phone and upload when you're back on.",
      "You can log resting heart rate, HRV and sleep hours by hand, or import a Garmin, Whoop or Apple Health CSV.",
    ],
  },
  {
    id: "programs",
    label: "Programs",
    facts: [
      "Programs are four-week blocks that progress Base to Build to Peak to Deload.",
      "Programs are built around your sport, your position and how many days a week you can train.",
      "You can play more than one position and the training covers all of them.",
      "Written notes are binding: type 'I don't train legs' and legs do not appear anywhere in the block.",
      "Gym users get real splits — push/pull/legs, upper/lower, Arnold, body-part, or full body.",
      "Bodybuilding blocks keep every rep between 6 and 15 and lead with compounds, then isolation work.",
      "Sessions include technical ball work, not only gym work — a centre back gets heading, a winger gets crossing.",
      "Coaches can build a program and assign it to any athlete in their squad.",
      "If the AI is unavailable the program still builds, on the device, in under a second.",
    ],
  },
  {
    id: "drills",
    label: "Drills & library",
    facts: [
      "38 technical skill drills across football, rugby, basketball and running.",
      "Every drill lists the setup, numbered steps, the volume, one coaching cue and how to progress it.",
      "Drills are marked solo, partner or team, so you can filter to what you can do alone tonight.",
      "321 exercises in the library with written technique guidance.",
      "The drill guides are free to read on the website with no signup.",
    ],
  },
  {
    id: "nutrition",
    label: "Nutrition",
    facts: [
      "Meal plans respect real life — say you eat out on Tuesdays and Tuesday is left alone.",
      "The shopping list thinks in packs, so one bag of rice covers three meals instead of buying three.",
      "You can tick off planned meals, or describe what you ate in plain words and it estimates the calories.",
    ],
  },
  {
    id: "analysis",
    label: "Video & progress",
    facts: [
      "Video form analysis runs in your browser using pose estimation — the clip does not go to an AI service.",
      "You can delete any uploaded clip, and old clips are cleared automatically.",
      "Rank tiers run from bronze up through gold, platinum and emerald, with divisions inside each.",
      "Leaderboards cover consistency, sleep and progress, for your squad and worldwide, and are opt-out.",
    ],
  },
  {
    id: "injury",
    label: "Injury",
    facts: [
      "Describe an injury in your own words and it builds a rehab-minded plan around it.",
      "It always lists the red flags that mean stop and see a professional.",
      "It does not diagnose, and says so — it is general training information, not medical advice.",
    ],
  },
  {
    id: "commercial",
    label: "Plans & access",
    facts: [
      "There is one paid plan, Pro, at £20 a month. Everything is included in it.",
      "There is a 14-day free trial on the first paid subscription.",
      "You can cancel any time from your profile, through Stripe's own billing portal.",
      "You can delete your account and everything in it, permanently, from the app.",
      "It installs to your home screen and works offline.",
    ],
  },
];

export function allFacts(): string[] {
  return FACT_GROUPS.flatMap((g) => g.facts);
}

// --- The content pack --------------------------------------------------------

export interface Pillar {
  id: string;
  name: string;
  purpose: string;
  /** Share of a posting week, out of 10. */
  share: number;
  prompts: string[];
}

export const PILLARS: Pillar[] = [
  {
    id: "coaching",
    name: "Free coaching",
    purpose: "A real drill, fully explained. Useful even if they never sign up.",
    share: 5,
    prompts: [
      "One drill, its coaching cue, and why most people do it wrong",
      "Drills you can do with a wall and a ball",
      "What to actually look for when you practise this",
    ],
  },
  {
    id: "problem",
    name: "The problem",
    purpose: "Name what generic programs get wrong. No product mention needed.",
    share: 2,
    prompts: [
      "Why a centre back and a winger shouldn't train the same",
      "Why a program that ignores your sleep is guessing",
      "Why 'football fitness' is not just running",
    ],
  },
  {
    id: "building",
    name: "Build in public",
    purpose: "What shipped, what broke, what's next. Progress is the content.",
    share: 2,
    prompts: [
      "What shipped this week and what it fixes",
      "Something that broke and what it taught me",
      "A decision I made that makes the product less impressive on purpose",
    ],
  },
  {
    id: "ask",
    name: "The ask",
    purpose: "Join the waitlist. Direct, once.",
    share: 1,
    prompts: [
      "What the app does, in four lines, then the link",
      "What founding members get",
    ],
  },
];

export interface LaunchStep {
  when: string;
  what: string;
  detail: string;
}

export const LAUNCH_SEQUENCE: LaunchStep[] = [
  { when: "T-21", what: "Start posting", detail: "Free coaching only. No launch talk. Build an audience with a reason to follow." },
  { when: "T-14", what: "Name it", detail: "Say what you've been building and when it opens. First waitlist push." },
  { when: "T-7", what: "Show it", detail: "Screen recordings. The program generating. Readiness dropping after a bad night." },
  { when: "T-3", what: "Founding framing", detail: "Waitlist closes when you open. Founding price locked for as long as they stay." },
  { when: "T-0", what: "Open", detail: "Post the day you email the list. Reply to everything for 48 hours." },
  { when: "T+7", what: "Proof", detail: "Real user screenshots, with permission. Now you can talk about results." },
];

export const CHANNELS = [
  { name: "TikTok / Reels / Shorts", note: "The drill videos. Highest ceiling — solo drills are inherently watchable." },
  { name: "Instagram carousels", note: "Position guides. Saves and shares are the signal." },
  { name: "Club WhatsApp groups", note: "Your highest-converting channel and the one you'll neglect. One message with a real drill link beats a month of posting into the void." },
  { name: "Reddit", note: "r/bootroom, r/running. Post the free guide, never the product — they'll reward the breakdown and destroy an advert." },
  { name: "X", note: "Build in public. Small audience, but it's where early adopters are." },
];

/** Claims that must never appear, whoever wrote the copy. */
export const NEVER_CLAIM = [
  "User numbers, revenue or growth you don't have",
  "Testimonials or results from anyone who hasn't given them in writing",
  "“Trusted by pros / academies / clubs” unless it is literally true",
  "Anything medical — not 'fixes', not 'prevents injury', not 'diagnoses'",
  "A specific promised result, like adding 5kg to a lift in four weeks",
];
