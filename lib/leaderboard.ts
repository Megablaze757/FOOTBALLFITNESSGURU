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
  /**
   * Lifetime XP, for the rank badge only — see migration 0105.
   *
   * Deliberately NOT the `xp` below, which is a week's worth and is what the
   * boards rank on. Conflating them is what put an Iron badge on every athlete
   * regardless of what they had done. Null means nobody has computed it yet,
   * which is not zero: draw no badge rather than the lowest one.
   */
  lifetimeXp?: number | null;
  xp: number;
  level: number;
  /** Their sport, for the sport board. Null means they never said. */
  sport?: string | null;
  /** Their primary position, for the position board. */
  position?: string | null;
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
    // "XP this week", not "Total XP earned". The value below is computed from
    // the seven-day window leaderboard_stats returns, and always was — the
    // blurb promised a lifetime total the board has never ranked on. Lifetime
    // XP is a different number and lives on AthleteStats.lifetimeXp, where the
    // rank badge reads it.
    blurb: "XP earned this week",
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

export interface BoardView {
  /** The rows to render, in order. */
  top: Ranked[];
  /** The viewer's own row, ONLY when it is not already in `top`. */
  below: Ranked | null;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WHICH ROWS TO SHOW, AND WHETHER TO REPEAT YOURS UNDERNEATH.
 *
 * This used to be two expressions in the component that had to agree and did
 * not: the list rendered `ranked.slice(0, 10)` and the extra row appeared when
 * `mine.rank > 10`. Rank and array position are not the same thing the moment
 * anybody ties, and on a check-ins board everybody ties.
 *
 * Thirteen athletes, three on 7/7, three on 6/7, six on 5/7. The last of those
 * sixes is RANK 7 at INDEX 11. Not in the first ten rows, and 7 is not greater
 * than 10, so they appeared nowhere on their own leaderboard — while the board
 * in front of them showed ranks 1, 1, 1, 4, 4, 4, 7, 7, 7, 7.
 *
 * The rule is now asked once, of the list that was actually built: is my row in
 * it? A rank is not a position and must never be used as one.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function boardView(ranked: Ranked[], userId: string, limit = 10): BoardView {
  const top = ranked.slice(0, limit);
  const mine = placeOf(ranked, userId);
  const shown = top.some((r) => r.stats.userId === userId);
  return { top, below: mine && !shown ? mine : null };
}

/**
 * The place immediately above, which is NOT rank minus one.
 *
 * Ranks skip over ties: with 1, 1, 3 there is no second place, so looking for
 * `myRank - 1` finds nobody and the athlete is told nothing at all — silently,
 * on exactly the boards where ties are most common.
 */
export function placeAbove(ranked: Ranked[], myRank: number): Ranked | null {
  let best: Ranked | null = null;
  for (const r of ranked) {
    if (r.rank >= myRank) continue;
    if (!best || r.rank > best.rank) best = r;
  }
  return best;
}


// =============================================================================
// WHO YOU ARE RANKED AGAINST.
//
// ═══════════════════════════════════════════════════════════════════════════
// A GLOBAL BOARD IS A BOARD ALMOST NOBODY IS ON.
//
// One list for everybody means the same ten names every week and ninety
// percent of people looking at strangers they will never catch. A board only
// motivates the people who can imagine being near the top of it, so the useful
// boards are the small ones: other centre backs, other footballers.
//
// Nothing here is fetched separately. The same rows serve every scope, so
// switching is instant and costs no round trip — the filter is the whole
// feature.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

export type ScopeId = "world" | "squad" | "sport" | "position";

export interface Scope {
  id: ScopeId;
  label: string;
  /** What it says when it is the only person on it. */
  lonely: string;
}

/**
 * How many others it takes before a board is a board.
 *
 * Two. "You are 1st of 1" is not an achievement and reads as a bug; at three
 * there is somebody above or below you, which is the only thing a rank can
 * tell you.
 */
export const MIN_FIELD = 3;

/**
 * Narrow the field, using the viewer's own row as the yardstick.
 *
 * TAKEN FROM THE VIEWER'S ROW, not from a profile passed in beside it. The
 * board and the filter then cannot disagree about what sport somebody plays:
 * there is one source, and it is the same row everyone else is compared to.
 *
 * Case- and space-insensitive, because "Centre back" and "centre back" are one
 * position and a board that splits them in two is worse than no board.
 */
export function inScope(athletes: AthleteStats[], scope: ScopeId, userId: string): AthleteStats[] {
  if (scope === "world" || scope === "squad") return athletes;
  const me = athletes.find((a) => a.userId === userId);
  const key = (a: AthleteStats) => (scope === "sport" ? a.sport : a.position);
  const mine = norm(me ? key(me) : null);
  // Nobody can be ranked against a field they are not in. An athlete who has
  // not set a position gets an empty board, not everybody else's.
  if (!mine) return [];
  return athletes.filter((a) => norm(key(a)) === mine);
}

function norm(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

/**
 * Whether a scope is worth offering at all.
 *
 * A tab that opens onto "nobody here" is worse than a tab that is not there:
 * the athlete reads it as the feature being broken rather than as a fact about
 * how many other left-backs have signed up.
 */
export function scopeReady(athletes: AthleteStats[], scope: ScopeId, userId: string): boolean {
  return inScope(athletes, scope, userId).length >= MIN_FIELD;
}
