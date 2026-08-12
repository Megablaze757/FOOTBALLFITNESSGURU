"use client";

import { evaluateChallenges, type Challenge, type WeekActivity } from "@/lib/challenges";
import { pickChallenges, type ChallengeWindow } from "@/lib/challenge-pool";
import { todayLocal } from "@/lib/day";
import type { SportId } from "@/lib/exercises";
import type { GoalType, TrainingFocus } from "@/lib/coach";

interface Props {
  /** The last 7 days, which the weekly board is scored against. */
  week: WeekActivity;
  /**
   * The same counters for TODAY ONLY, which the daily board is scored against.
   *
   * Both boards read `week` at first, and a daily card is worthless that way:
   * "take the rest day" showed 4/1 and complete on a Tuesday morning, because
   * four rest days had happened somewhere in the previous seven. A card that is
   * already ticked before you get out of bed is a receipt, not a challenge.
   */
  today: WeekActivity;
  ctx: {
    sport?: SportId | null;
    goal?: GoalType | null;
    position?: string | string[] | null;
    focus?: TrainingFocus | null;
  };
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
 *     metric from a fixed seven-item vocabulary (see lib/challenges.ts — a
 *     free-text goal creates a challenge nothing can check). So the entire
 *     contribution of an inference was phrasing.
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
export function WeeklyChallenges({ week, today, ctx }: Props) {
  /**
   * Seeds, not randomness. The daily set turns over at midnight and the weekly
   * set on the same day each week — a board that reshuffles on every page load
   * is not a board, and it is the first thing anyone notices.
   */
  const dayNumber = Math.floor(Date.parse(`${todayLocal()}T00:00:00Z`) / 86_400_000);
  // Each board is both PICKED and SCORED against its own window, so "aim at the
  // gap" means today's gap for today's card and the week's gap for the week's.
  const daily = pickChallenges({ ...ctx, window: "daily", week: today, seed: dayNumber, count: 2 });
  const weekly = pickChallenges({ ...ctx, window: "weekly", week, seed: Math.floor(dayNumber / 7), count: 3 });

  if (!daily.length && !weekly.length) return null;

  return (
    <div className="card p-5">
      <ChallengeGroup
        heading="Today"
        note="Resets at midnight."
        list={daily}
        week={today}
        window="daily"
      />
      {weekly.length > 0 && (
        <div className={daily.length ? "mt-5 border-t border-white/[0.06] pt-4" : ""}>
          <ChallengeGroup
            heading="This week"
            note="Aimed at whatever you've been skipping. Resets Monday."
            list={weekly}
            week={week}
            window="weekly"
          />
        </div>
      )}
    </div>
  );
}

function ChallengeGroup({ heading, note, list, week, window: w }: {
  heading: string;
  note: string;
  list: Challenge[];
  week: WeekActivity;
  window: ChallengeWindow;
}) {
  if (!list.length) return null;
  const progress = evaluateChallenges(list, week);
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
            key={`${w}-${c.id}`}
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
