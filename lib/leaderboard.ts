// =============================================================================
// Leaderboards.
//
// XP alone rewards being here longest, which is a poor thing to rank people on
// — someone who joined in January is unbeatable by someone excellent who joined
// last week. These boards rank on behaviours anyone can win this week:
// consistency, sleep, work done, improvement.
//
// Pure + tested. The queries live in the page; this decides what "best" means.
// =============================================================================

export interface AthleteStats {
  userId: string;
  name: string;
  /** Check-ins in the last 7 days. */
  checkInsLast7: number;
  /** Mean sleep score (1–10) over the last 7 days, null if never logged. */
  avgSleep: number | null;
  /** Training sessions in the last 7 days. */
  sessionsLast7: number;
  /** Minutes trained in the last 7 days. */
  minutesLast7: number;
  /** Consecutive check-in days ending today. */
  streak: number;
  /** Program sessions ticked off in the last 7 days. */
  completedLast7: number;
  xp: number;
  level: number;
}

export type BoardId = "consistent" | "sleep" | "work" | "streak" | "adherence" | "xp";

export interface Board {
  id: BoardId;
  label: string;
  icon: string;
  /** What the number means, shown under the title. */
  blurb: string;
  /** Null excludes them from this board — no data is not last place. */
  value: (a: AthleteStats) => number | null;
  format: (v: number) => string;
}

export const BOARDS: Board[] = [
  {
    id: "consistent", label: "Most consistent", icon: "📋",
    blurb: "Check-ins this week",
    value: (a) => a.checkInsLast7,
    format: (v) => `${v}/7 days`,
  },
  {
    id: "sleep", label: "Best sleep", icon: "😴",
    blurb: "Average sleep score this week",
    // Somebody who logged sleep once and slept well isn't the best sleeper.
    value: (a) => (a.avgSleep != null && a.checkInsLast7 >= 3 ? a.avgSleep : null),
    format: (v) => `${v.toFixed(1)}/10`,
  },
  {
    id: "work", label: "Most work done", icon: "🏋️",
    blurb: "Minutes trained this week",
    value: (a) => a.minutesLast7,
    format: (v) => (v >= 60 ? `${Math.round(v / 60)}h ${v % 60}m` : `${v}m`),
  },
  {
    id: "streak", label: "Longest streak", icon: "🔥",
    blurb: "Consecutive days checked in",
    value: (a) => a.streak,
    format: (v) => `${v} day${v === 1 ? "" : "s"}`,
  },
  {
    id: "adherence", label: "Sticking to the plan", icon: "✅",
    blurb: "Program sessions completed this week",
    value: (a) => a.completedLast7,
    format: (v) => `${v} session${v === 1 ? "" : "s"}`,
  },
  {
    id: "xp", label: "Overall", icon: "👑",
    blurb: "Total XP earned",
    value: (a) => a.xp,
    format: (v) => `${v.toLocaleString()} XP`,
  },
];

export interface Ranked {
  rank: number;
  stats: AthleteStats;
  value: number;
  display: string;
}

/**
 * Rank athletes on one board.
 *
 * Anyone with no data for that metric is left out rather than shown last —
 * a board that lists everyone who has never logged sleep as "worst sleeper"
 * is both wrong and unkind. Ties share a rank, so two people on 7/7 are both
 * first and the next is third.
 */
export function rankBoard(board: Board, athletes: AthleteStats[]): Ranked[] {
  const scored = athletes
    .map((stats) => ({ stats, value: board.value(stats) }))
    .filter((r): r is { stats: AthleteStats; value: number } => r.value != null && r.value > 0)
    .sort((a, b) => b.value - a.value || a.stats.name.localeCompare(b.stats.name));

  let lastValue: number | null = null;
  let lastRank = 0;
  return scored.map((r, i) => {
    const rank = r.value === lastValue ? lastRank : i + 1;
    lastValue = r.value;
    lastRank = rank;
    return { rank, stats: r.stats, value: r.value, display: board.format(r.value) };
  });
}

/** Where one athlete sits on a board, or null if they aren't on it. */
export function placeOf(ranked: Ranked[], userId: string): Ranked | null {
  return ranked.find((r) => r.stats.userId === userId) ?? null;
}
