"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAsync } from "@/lib/use-async";
import { computeXp, levelFor } from "@/lib/gamification";
import { BOARDS, rankBoard, placeOf, type AthleteStats, type BoardId } from "@/lib/leaderboard";

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
      checkIns: r.check_ins_7, streak: r.streak, trainingSessions: r.sessions_7,
      completedSessions: r.completed_7, completedBlocks: 0, benchmarks: 0,
      videos: 0, nutritionLogs: 0, checkInsLast7: r.check_ins_7,
      // The leaderboard view aggregates seven days and has no date list to
      // read across, and XP does not use these.
      longestStreak: 0, weeksActive: 0, perfectDaysLast7: 0,
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
  const mine = placeOf(ranked, userId);

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
                scope === s ? "bg-pitch-400 text-ink-900" : "text-slate-400 hover:text-slate-200"
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
          <ol className="space-y-1.5">
            {ranked.slice(0, 10).map((r) => {
              const isMe = r.stats.userId === userId;
              return (
                <li
                  key={r.stats.userId}
                  className={`flex items-center gap-3 rounded-xl px-2.5 py-2 ${isMe ? "bg-pitch-400/[0.08] ring-1 ring-pitch-400/25" : ""}`}
                >
                  <span className={`w-6 shrink-0 text-center text-sm font-extrabold ${r.rank <= 3 ? "text-pitch-400" : "text-slate-500"}`}>
                    {["🥇", "🥈", "🥉"][r.rank - 1] ?? r.rank}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-100">
                    {r.stats.name}{isMe && <span className="ml-1.5 text-xs text-pitch-400">you</span>}
                  </span>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-slate-200">{r.display}</span>
                </li>
              );
            })}
          </ol>

          {/* If you're outside the top ten, say where you actually are —
              otherwise the board is just other people. */}
          {mine && mine.rank > 10 && (
            <div className="mt-2 flex items-center gap-3 rounded-xl bg-pitch-400/[0.08] px-2.5 py-2 ring-1 ring-pitch-400/25">
              <span className="w-6 shrink-0 text-center text-sm font-extrabold text-slate-400">{mine.rank}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-slate-100">
                {mine.stats.name}<span className="ml-1.5 text-xs text-pitch-400">you</span>
              </span>
              <span className="shrink-0 text-sm font-bold tabular-nums text-slate-200">{mine.display}</span>
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
