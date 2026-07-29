// =============================================================================
// What the app looks like for YOUR sport.
//
// lib/sport-terms.ts already fixed the vocabulary — a runner isn't asked
// "Match today?" any more. This goes further, because vocabulary was never the
// main tell. A weightlifter opened the app and found video analysis and agility
// drills above the bar work, a benchmarks page offering a Yo-Yo IR1 level, and
// a football green accent. Nothing was *wrong* exactly; it just clearly wasn't
// built for them, which is the thing people actually notice.
//
// So each sport gets: its own accent, its own ordering of the tools, the
// benchmarks its athletes actually test, and one honest line about what the app
// will do for them.
//
// Pure data. A new sport is a row here, not a hunt through components.
// =============================================================================

import type { SportId } from "./exercises";

export interface SportTool {
  href: string;
  title: string;
  icon: string;
}

export interface SportProfile {
  id: SportId;
  label: string;
  emoji: string;
  /**
   * Accent for this sport, used where the app wants to feel like it belongs to
   * them. All chosen to clear 4.5:1 against the app's dark surfaces — see
   * sport-profile.test.ts, which checks the contrast rather than trusting me.
   */
  accent: string;
  /** One line under the greeting. What the app is for, in their terms. */
  tagline: string;
  /**
   * Tools in the order this athlete needs them. Same set everywhere — hiding
   * features by sport would mean a footballer who wants to lift can't — but a
   * lifter shouldn't have to scan past video analysis to find their plan.
   */
  tools: SportTool[];
  /** Benchmark keys worth offering first. Others stay available, just later. */
  headlineMetrics: string[];
}

// Every sport gets the same six destinations; only the order changes.
const TOOL: Record<string, SportTool> = {
  plan: { href: "/coach", title: "My plan", icon: "🏋️" },
  exercises: { href: "/library", title: "Exercises", icon: "📚" },
  video: { href: "/train", title: "Video analysis", icon: "🎥" },
  nutrition: { href: "/nutrition", title: "Nutrition", icon: "🍽️" },
  guides: { href: "/essentials", title: "Guides", icon: "🎯" },
  progress: { href: "/dashboard", title: "Progress", icon: "📈" },
};

const order = (...keys: (keyof typeof TOOL)[]) => keys.map((k) => TOOL[k]);

const PROFILES: Record<SportId, SportProfile> = {
  football: {
    id: "football",
    label: "Football",
    emoji: "⚽",
    accent: "#4ade80",
    tagline: "Train for the weekend, recover for the one after.",
    tools: order("plan", "video", "progress", "guides", "exercises", "nutrition"),
    headlineMetrics: ["sprint_10m", "sprint_40m", "vertical_jump_cm", "yo_yo_level", "squat_1rm"],
  },
  rugby: {
    id: "rugby",
    label: "Rugby",
    emoji: "🏉",
    accent: "#f0824a",
    // Rugby was aliased to football's vocabulary and football's tests. Contact
    // load, not just running load, is what a rugby player is managing.
    tagline: "Get bigger, hit harder, and still be right on Saturday.",
    tools: order("plan", "progress", "guides", "video", "exercises", "nutrition"),
    headlineMetrics: ["squat_1rm", "bench_1rm", "sprint_40m", "bronco_s", "deadlift_1rm"],
  },
  basketball: {
    id: "basketball",
    label: "Basketball",
    emoji: "🏀",
    accent: "#fb923c",
    tagline: "Jump higher, change direction faster, land safely.",
    tools: order("plan", "video", "progress", "exercises", "guides", "nutrition"),
    headlineMetrics: ["vertical_jump_cm", "lane_agility_s", "sprint_20m", "squat_1rm"],
  },
  running: {
    id: "running",
    label: "Running",
    emoji: "🏃",
    accent: "#38bdf8",
    // Runners get injured from load errors more than anything else, so Progress
    // — which is where the acute:chronic ratio lives — comes first.
    tagline: "Build mileage without buying an injury.",
    tools: order("progress", "plan", "nutrition", "guides", "exercises", "video"),
    headlineMetrics: ["run_5k_min", "run_10k_min", "run_1500m_min", "squat_1rm"],
  },
  weightlifting: {
    id: "weightlifting",
    label: "Weightlifting",
    emoji: "🏋️",
    accent: "#c084fc",
    tagline: "Add kilos to the bar without stalling or breaking.",
    tools: order("plan", "progress", "video", "exercises", "nutrition", "guides"),
    headlineMetrics: ["snatch_1rm", "clean_jerk_1rm", "front_squat_1rm", "squat_1rm", "ohp_1rm"],
  },
  gym: {
    id: "gym",
    label: "Gym & fitness",
    emoji: "💪",
    accent: "#e3b53f",
    tagline: "A plan that progresses, instead of the same session forever.",
    tools: order("plan", "exercises", "progress", "nutrition", "video", "guides"),
    headlineMetrics: ["bench_1rm", "squat_1rm", "deadlift_1rm", "pullups_max", "ohp_1rm"],
  },
};

/** Interface profile for a sport. Unknown or missing falls back to football. */
export function sportProfile(sport: string | null | undefined): SportProfile {
  return PROFILES[(sport ?? "football") as SportId] ?? PROFILES.football;
}

/**
 * Benchmark keys ordered for this sport: the ones they'd actually test first,
 * then everything else. Nothing is removed — someone can still log whatever
 * they like — but the first thing they see is relevant to them.
 */
export function metricsForSport(sport: string | null | undefined, all: { key: string }[]): string[] {
  const headline = sportProfile(sport).headlineMetrics;
  const rest = all.map((m) => m.key).filter((k) => !headline.includes(k));
  // Only keep headline keys that really exist in the catalogue, so a typo here
  // can't render a metric with no label or unit.
  const known = new Set(all.map((m) => m.key));
  return [...headline.filter((k) => known.has(k)), ...rest];
}
