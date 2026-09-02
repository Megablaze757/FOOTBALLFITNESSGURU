"use client";

import { RankBadge } from "@/components/RankBadge";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAsync } from "@/lib/use-async";
import { computeXp, levelFor, EMPTY_STATS, type Standing } from "@/lib/gamification";
import { BOARDS, rankBoard, boardView, placeAbove, type AthleteStats, type BoardId, type Ranked } from "@/lib/leaderboard";

interface Row {
  user_id: string;
  name: string;
  check_ins_7: number;
  avg_sleep: number | null;
  sessions_7: number;
  minutes_7: number;
  completed_7: number;
  streak: number;
}

/**
 * Leaderboards on things anyone can win this week.
 *
 * XP alone rewards having joined earliest, which is a poor thing to rank people
 * on — someone excellent who signed up on Monday can never catch someone
 * mediocre who signed up in January. Consistency, sleep and work done all reset
 * weekly, so the boards stay winnable.
 */
export function Leaderboards({ userId }: { userId: string }) {
  const [scope, setScope] = useState<"squad" | "world">("world");
  const [boardId, setBoardId] = useState<BoardId>("consistent");

  const { data, loading, error } = useAsync(async () => {
    const { data, error } = await createClient().rpc("leaderboard_stats", { p_scope: scope });
    if (error) throw error;
    return (data ?? []) as Row[];
  }, [scope]);

  const athletes = useMemo<AthleteStats[]>(() => (data ?? []).map((r) => {
    const xp = computeXp({
      // Spread first so a new stat added to ActivityStats defaults sensibly
      // here instead of breaking every call site that builds one by hand.
      ...EMPTY_STATS,
      checkIns: r.check_ins_7, streak: r.streak, trainingSessions: r.sessions_7,
      completedSessions: r.completed_7, completedBlocks: 0, benchmarks: 0,
      videos: 0, nutritionLogs: 0, checkInsLast7: r.check_ins_7,
      // Neither is in the leaderboard view, and neither is a term in computeXp
      // — they only carry badges, which the board does not show. Zero here
      // cannot shift a row's position.
      perfectDays: 0, comebacks: 0,
      // XP reads longestStreak (it must never go down — see computeXp), and the
      // leaderboard view has no date list to derive one from. The current
      // streak IS the best streak we can see over a seven-day aggregate, and
      // leaving it at 0 would drop the streak component from every row and
      // silently re-order the board.
      longestStreak: r.streak,
      weeksActive: 0, perfectDaysLast7: 0,
      // The leaderboard view aggregates seven days of activity and does not
      // carry rest days. Zero, rather than a guess that would rank people on a
      // number nobody measured.
      restDaysLogged: 0,
    });
    return {
      userId: r.user_id,
      name: r.name,
      checkInsLast7: r.check_ins_7,
      avgSleep: r.avg_sleep == null ? null : Number(r.avg_sleep),
      sessionsLast7: r.sessions_7,
      minutesLast7: r.minutes_7,
      completedLast7: r.completed_7,
      streak: r.streak,
      xp,
      level: levelFor(xp).level,
    };
  }), [data]);

  const board = BOARDS.find((b) => b.id === boardId)!;
  const ranked = useMemo(() => rankBoard(board, athletes), [board, athletes]);
  const { top, below } = boardView(ranked, userId);
  const mine = below ?? top.find((r) => r.stats.userId === userId) ?? null;

  /**
   * Standing is a fact about the whole ladder, so it is read off the XP board
   * at world scope — never off whichever board is on screen. Being top of
   * "longest streak" in a squad of four is not being no. 1 in the world, and
   * passing that rank through would have printed Apex beside their name.
   *
   * Squad scope gets no standing rather than a squad-shaped one. standingRank
   * needs LADDER_MIN_ATHLETES anyway, so this is belt and braces.
   */
  const standings = useMemo(() => {
    if (scope !== "world") return new Map<string, Standing>();
    const byXp = rankBoard(BOARDS.find((b) => b.id === "xp")!, athletes);
    return new Map(byXp.map((r) => [r.stats.userId, { athletes: byXp.length, position: r.rank }]));
  }, [scope, athletes]);

  const levelOf = (r: Ranked) => levelFor(r.stats.xp, standings.get(r.stats.userId) ?? null);

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="field-label !mb-0">🏆 Leaderboards</h2>
        <div className="flex shrink-0 gap-1 rounded-full bg-white/[0.04] p-0.5">
          {(["squad", "world"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              aria-pressed={scope === s}
              // A filled segmented control, so it keeps its own colours rather
              // than the outlined chip look — but it takes the 44px floor, and
              // the aria-pressed it never had.
              className={`min-h-[44px] rounded-full px-3 text-xs font-semibold transition ${
                scope === s ? "bg-pitch-400 text-on-accent" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {s === "squad" ? "My squad" : "World"}
            </button>
          ))}
        </div>
      </div>

      <div className="no-scrollbar -mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
        {BOARDS.map((b) => (
          <button
            key={b.id}
            onClick={() => setBoardId(b.id)}
            aria-pressed={boardId === b.id}
            className="chip-option chip-option-sm"
          >
            <span aria-hidden>{b.icon}</span> {b.label}
          </button>
        ))}
      </div>

      <p className="mb-3 text-xs text-slate-500">{board.blurb}</p>

      {error ? (
        <p className="py-6 text-center text-sm text-readiness-red">
          Couldn&apos;t load the board — has migration 0041 been applied?
        </p>
      ) : loading ? (
        <div className="h-32 animate-pulse rounded-2xl bg-white/5" />
      ) : ranked.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">
          Nobody on this board yet{scope === "squad" ? " in your squad" : ""} — log a few days and it&apos;s yours.
        </p>
      ) : (
        <>
          {/* ═══════════════════════════════════════════════════════════════
              YOUR RANK, IN WORDS, BEFORE THE LIST OF OTHER PEOPLE.

              The board drew a badge beside every name and highlighted your row,
              which answers "what rank is that person" and not "what rank am I"
              — you had to find yourself in a list to be told. And a badge is a
              coloured shape: without its name, Gold 3 and Silver 1 are two
              similar circles, which is the same confusion that produced the
              wrong-rank report on Home.
              ═══════════════════════════════════════════════════════════════ */}
          {mine && (() => {
            const lvl = levelOf(mine);
            return (
              <div className="mb-3 flex items-center gap-3 rounded-xl bg-pitch-400/[0.06] px-3 py-2.5 ring-1 ring-pitch-400/20">
                <RankBadge tier={lvl.tier} division={lvl.division} color={lvl.color} size={34} className="shrink-0" title={lvl.rank} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-extrabold text-slate-100">
                    {ordinal(mine.rank)} of {ranked.length}
                  </span>
                  {/* The rank's NAME, not only its colour. */}
                  <span className="block text-xs text-slate-400">{lvl.rank} · {board.label}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-bold tabular-nums text-slate-100">{mine.display}</span>
                  {mine.rank > 1 && (
                    <span className="block text-[11px] text-slate-500">
                      {gapTo(ranked, mine.rank)}
                    </span>
                  )}
                </span>
              </div>
            );
          })()}

          <ol className="space-y-1.5">
            {top.map((r) => {
              const isMe = r.stats.userId === userId;
              return (
                <li
                  key={r.stats.userId}
                  className={`flex items-center gap-3 rounded-xl px-2.5 py-2 ${isMe ? "bg-pitch-400/[0.08] ring-1 ring-pitch-400/25" : ""}`}
                >
                  <span className={`w-6 shrink-0 text-center text-sm font-extrabold ${r.rank <= 3 ? "text-accent-400" : "text-slate-500"}`}>
                    {["🥇", "🥈", "🥉"][r.rank - 1] ?? r.rank}
                  </span>
                  {/* THE RANK, BESIDE THE NAME.
                      A board is a list of strangers without it: 14 check-ins
                      says nothing about whether that person is three weeks in
                      or three years. The badge is drawn from their level, which
                      the board already computes. */}
                  {(() => {
                    const lvl = levelOf(r);
                    return (
                      <RankBadge
                        tier={lvl.tier}
                        division={lvl.division}
                        color={lvl.color}
                        size={22}
                        className="shrink-0"
                        title={lvl.rank}
                      />
                    );
                  })()}
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-100">
                    {r.stats.name}{isMe && <span className="ml-1.5 text-xs text-accent-400">you</span>}
                  </span>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-slate-200">{r.display}</span>
                </li>
              );
            })}
          </ol>

          {/* If you're outside the top ten, say where you actually are —
              otherwise the board is just other people. */}
          {below && (
            <div className="mt-2 flex items-center gap-3 rounded-xl bg-pitch-400/[0.08] px-2.5 py-2 ring-1 ring-pitch-400/25">
              <span className="w-6 shrink-0 text-center text-sm font-extrabold text-slate-400">{below.rank}</span>
              {/* The same badge every other row carries. Leaving it off the one
                  row that is about you was the odd one out. */}
              {(() => {
                const lvl = levelOf(below);
                return <RankBadge tier={lvl.tier} division={lvl.division} color={lvl.color} size={22} className="shrink-0" title={lvl.rank} />;
              })()}
              <span className="min-w-0 flex-1 truncate text-sm text-slate-100">
                {below.stats.name}<span className="ml-1.5 text-xs text-accent-400">you</span>
              </span>
              <span className="shrink-0 text-sm font-bold tabular-nums text-slate-200">{below.display}</span>
            </div>
          )}
          {!mine && (
            <p className="mt-2 text-center text-xs text-slate-500">
              You&apos;re not on this board yet — {board.blurb.toLowerCase()} is all it takes.
            </p>
          )}
        </>
      )}

      {scope === "world" && (
        <p className="mt-3 text-[11px] text-slate-600">
          World boards show first names only. Opt out any time in your profile.
        </p>
      )}
    </div>
  );
}

/** "1st", "22nd", "13th" — the English rule, including the teens exception. */
function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/**
 * How far off the place above, in the board's own unit.
 *
 * A rank on its own is a verdict; a rank plus "2 check-ins behind 13th" is
 * something to do this week. Only shown when the gap is real — an equal score
 * ranked lower on a tie-break is not a gap you can close by training.
 */
function gapTo(ranked: Ranked[], myRank: number): string {
  const me = ranked.find((r) => r.rank === myRank);
  // NOT rank - 1. Ranks skip over ties, so on a board reading 1, 1, 3 there is
  // no second place and this said nothing at all to the athlete in third.
  const above = placeAbove(ranked, myRank);
  if (!me || !above) return "";
  const gap = Math.round((above.value - me.value) * 10) / 10;
  return gap > 0 ? `${gap} behind ${ordinal(above.rank)}` : `level with ${ordinal(above.rank)}`;
}
