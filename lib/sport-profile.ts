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
import type { IconName } from "@/components/Icon";

export interface SportTool {
  href: string;
  title: string;
  /** A name from components/Icon.tsx — not an emoji. See the note there. */
  icon: IconName;
  /**
   * This destination's own colour.
   *
   * The grid used to be seven identical gold outlines in seven identical
   * squares, which gives the eye nothing to choose between — you had to READ
   * every tile to find the one you wanted, so nothing invited a tap. Colour is
   * the fastest thing the eye sorts on, well before shape and long before text.
   *
   * Chosen so no two adjacent tiles share a hue, and pulled from colours the
   * theme already uses at text weight — so each has been checked against this
   * background rather than picked for looking nice against white.
   */
  tint: string;
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
  /**
   * The four numbers this sport's dashboard leads with.
   *
   * Progress showed everyone the same row — injury risk, fatigue trend, average
   * sleep, weight change — which is a reasonable set for nobody in particular.
   * A runner's week is mileage. A lifter's is weight moved, and their body weight
   * matters because they compete against it. A rugby player's is contact.
   *
   * Four, always: it's a 2x2 on a phone and a single row on a desktop, and a
   * fifth would orphan.
   */
  dashboardStats: [DashboardStat, DashboardStat, DashboardStat, DashboardStat];
}

/**
 * A stat the Progress page can show. The dashboard owns how each is computed and
 * labelled; this type just constrains what a sport is allowed to ask for, so a
 * typo here is a compile error rather than a blank tile.
 */
export type DashboardStat =
  | "injuryRisk"
  | "fatigueTrend"
  | "avgSleep"
  | "weightChange"
  | "sessions"
  | "distance"      // running
  | "avgPace"       // running
  | "tonnage"       // weightlifting, gym
  | "contactLoad";  // rugby

// Every sport gets the same seven destinations; only the order changes.
const TOOL: Record<string, SportTool> = {
  plan: { href: "/coach", title: "Training", icon: "barbell", tint: "#e3b53f" },
  exercises: { href: "/library", title: "Exercises", icon: "book", tint: "#38bdf8" },
  video: { href: "/train", title: "Video analysis", icon: "video", tint: "#c084fc" },
  nutrition: { href: "/nutrition", title: "Food", icon: "plate", tint: "#4ade80" },
  guides: { href: "/essentials", title: "Guides", icon: "target", tint: "#fb923c" },
  progress: { href: "/dashboard", title: "Performance", icon: "chart", tint: "#5fd3c4" },
  // Its own page now, not a deep link into a tab. See app/(app)/injury.
  // Red, and the only tile that gets it. Reserved so the one destination you
  // reach because something hurts is the one your eye lands on first.
  injury: { href: "/injury", title: "Recovery", icon: "plaster", tint: "#fb5d6b" },
};

const order = (...keys: (keyof typeof TOOL)[]) => keys.map((k) => TOOL[k]);

const PROFILES: Record<SportId, SportProfile> = {
  football: {
    id: "football",
    label: "Football",
    emoji: "⚽",
    accent: "#4ade80",
    tagline: "Train for the weekend, recover for the one after.",
    tools: order("plan", "video", "progress", "nutrition", "injury", "exercises", "guides"),
    headlineMetrics: ["sprint_10m", "sprint_40m", "vertical_jump_cm", "yo_yo_level", "squat_1rm"],
    dashboardStats: ["injuryRisk", "sessions", "avgSleep", "fatigueTrend"],
  },
  rugby: {
    id: "rugby",
    label: "Rugby",
    emoji: "🏉",
    accent: "#f0824a",
    // Rugby was aliased to football's vocabulary and football's tests. Contact
    // load, not just running load, is what a rugby player is managing.
    tagline: "Get bigger, hit harder, and still be right on Saturday.",
    tools: order("plan", "progress", "nutrition", "injury", "guides", "video", "exercises"),
    headlineMetrics: ["squat_1rm", "bench_1rm", "sprint_40m", "bronco_s", "deadlift_1rm"],
    dashboardStats: ["contactLoad", "injuryRisk", "sessions", "avgSleep"],
  },
  basketball: {
    id: "basketball",
    label: "Basketball",
    emoji: "🏀",
    accent: "#fb923c",
    tagline: "Jump higher, change direction faster, land safely.",
    tools: order("plan", "video", "progress", "nutrition", "injury", "exercises", "guides"),
    headlineMetrics: ["vertical_jump_cm", "lane_agility_s", "sprint_20m", "squat_1rm"],
    dashboardStats: ["injuryRisk", "sessions", "avgSleep", "fatigueTrend"],
  },
  running: {
    id: "running",
    label: "Running",
    emoji: "🏃",
    accent: "#38bdf8",
    // Runners get injured from load errors more than anything else, so Progress
    // — which is where the acute:chronic ratio lives — comes first.
    tagline: "Build mileage without buying an injury.",
    tools: order("progress", "plan", "injury", "nutrition", "guides", "exercises", "video"),
    headlineMetrics: ["run_5k_min", "run_10k_min", "run_1500m_min", "squat_1rm"],
    /**
     * PACE IS THE OTHER HALF OF A RUNNER'S WEEK, and it was missing because
     * nothing could record it: the mm:ss field and the live pace lived only on
     * the runner fast path, so the app held a distance and a duration rounded
     * to the nearest minute. It has both properly now, so the number a runner
     * actually talks about can finally be shown. Fatigue trend gives way for
     * it — the fatigue chart is further down this page, and pace is not
     * anywhere else.
     */
    dashboardStats: ["distance", "avgPace", "injuryRisk", "avgSleep"],
  },
  weightlifting: {
    id: "weightlifting",
    label: "Weightlifting",
    emoji: "🏋️",
    accent: "#c084fc",
    tagline: "Add kilos to the bar without stalling or breaking.",
    tools: order("plan", "progress", "nutrition", "injury", "video", "exercises", "guides"),
    headlineMetrics: ["snatch_1rm", "clean_jerk_1rm", "front_squat_1rm", "squat_1rm", "ohp_1rm"],
    dashboardStats: ["tonnage", "weightChange", "avgSleep", "fatigueTrend"],
  },
  gym: {
    id: "gym",
    label: "Gym & fitness",
    emoji: "💪",
    accent: "#e3b53f",
    tagline: "A plan that progresses, instead of the same session forever.",
    tools: order("plan", "nutrition", "exercises", "progress", "injury", "video", "guides"),
    headlineMetrics: ["bench_1rm", "squat_1rm", "deadlift_1rm", "pullups_max", "ohp_1rm"],
    dashboardStats: ["tonnage", "weightChange", "sessions", "avgSleep"],
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
