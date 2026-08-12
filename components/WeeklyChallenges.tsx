"use client";

import { evaluateChallenges } from "@/lib/challenges";
import type { Board } from "@/lib/challenge-pool";

interface Props {
  /**
   * Both boards, built by lib/challenge-pool. Each carries the activity it was
   * picked against, so a card cannot be scored against a window it was not
   * chosen for — the bug that made daily cards arrive pre-ticked ("take the
   * rest day", 4/1, complete on a Tuesday morning), because `week` and `today`
   * are the same type and swapping them compiles cleanly.
   *
   * Built on the page rather than here because the page also has to award XP
   * for what is complete, and two copies of the seed arithmetic would
   * eventually disagree — paying XP for a challenge the athlete never saw.
   */
  boards: { daily: Board; weekly: Board };
}

/**
 * Today's and this week's objectives, picked for this athlete.
 *
 * WHAT THIS REPLACED. Every mount fired `generate-challenges` at a language
 * model, cached the answer in localStorage for a week, and fell back to a local
 * set when it failed. Three things were wrong with that and only one of them
 * was the cost:
 *
 *   - The model was never allowed to write the RULE, only the words around a
 *     metric from a fixed vocabulary (see lib/challenges.ts — a free-text goal
 *     creates a challenge nothing can check). So the entire contribution of an
 *     inference was phrasing.
 *   - Nobody could read what it would say to an athlete next Tuesday. A written
 *     pool is reviewable; a prompt is a hope.
 *   - It was one call per athlete per week, forever, on free model tiers that
 *     are rate-limited and get deprecated without notice — and when they fail
 *     the athlete silently gets the local set anyway.
 *
 * The pool is the same output, chosen rather than generated: deterministic,
 * testable, free, and picked against sport, goal and position the way the
 * programme engine picks movements.
 */
export function WeeklyChallenges({ boards }: Props) {
  const { daily, weekly } = boards;
  if (!daily.list.length && !weekly.list.length) return null;

  return (
    <div className="card p-5">
      <ChallengeGroup
        heading="Today"
        note="Resets at midnight."
        board={daily}
      />
      {weekly.list.length > 0 && (
        <div className={daily.list.length ? "mt-5 border-t border-white/[0.06] pt-4" : ""}>
          <ChallengeGroup
            heading="This week"
            note="Aimed at whatever you've been skipping. Resets Monday."
            board={weekly}
          />
        </div>
      )}
    </div>
  );
}

function ChallengeGroup({ heading, note, board }: {
  heading: string;
  note: string;
  board: Board;
}) {
  if (!board.list.length) return null;
  // Scored against the activity the board was PICKED with, never against
  // anything passed separately — that pairing is the whole point of Board.
  const progress = evaluateChallenges(board.list, board.activity);
  const done = progress.filter((p) => p.complete).length;

  return (
    <>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="field-label !mb-0">{heading}</h2>
        <span className="text-xs text-slate-400">{done}/{progress.length}</span>
      </div>
      <p className="mb-3 text-xs text-slate-500">{note}</p>

      <ul className="space-y-2">
        {progress.map(({ challenge: c, current, pct, complete }) => (
          <li
            key={`${board.window}-${c.id}`}
            className={`rounded-2xl border p-3 transition ${
              complete ? "border-pitch-400/40 bg-pitch-400/[0.07]" : "border-white/10 bg-white/[0.03]"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.05] text-lg">{c.icon}</span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-bold ${complete ? "text-pitch-400" : "text-slate-100"}`}>
                  {c.title}{complete && " ✓"}
                </span>
                <span className="block text-xs text-slate-400">{c.blurb}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-xs font-bold tabular-nums text-slate-300">{current}/{c.target}</span>
                <span className="block text-[10px] text-slate-500">+{c.xp} XP</span>
              </span>
            </div>
            <span className="mt-2 block h-1 overflow-hidden rounded-full bg-white/[0.06]">
              <span
                className="block h-full rounded-full transition-all"
                style={{ width: `${pct}%`, background: complete ? "#e3b53f" : "#5fd3c4" }}
              />
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
