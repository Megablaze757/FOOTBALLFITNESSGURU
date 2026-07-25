"use client";

import { useEffect, useState } from "react";
import { invokeAI } from "@/lib/api";
import {
  parseChallenges, localChallenges, evaluateChallenges,
  type Challenge, type WeekActivity,
} from "@/lib/challenges";
import type { ActivityStats } from "@/lib/gamification";

interface Props {
  userId: string;
  stats: ActivityStats;
  week: WeekActivity;
  sport?: string | null;
  goal?: string | null;
}

/** Challenges are set once a week; the key changes when the week does. */
function weekKey(userId: string): string {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const weekNo = Math.floor((now.getTime() - jan1.getTime()) / (7 * 86400_000));
  return `apex-challenges-${userId}-${now.getFullYear()}-${weekNo}`;
}

/**
 * Three personalised objectives for the week. The AI writes the wording and
 * picks the target; the metric comes from a fixed vocabulary so progress is
 * ordinary arithmetic — see lib/challenges.ts for why that matters.
 *
 * Cached per week in localStorage: challenges that reshuffle on every page load
 * aren't challenges, and it keeps this to one AI call a week per athlete.
 */
export function WeeklyChallenges({ userId, stats, week, sport, goal }: Props) {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [source, setSource] = useState<"ai" | "local">("local");

  useEffect(() => {
    const key = weekKey(userId);
    const cached = localStorage.getItem(key);
    if (cached) {
      try {
        const { list, src } = JSON.parse(cached) as { list: Challenge[]; src: "ai" | "local" };
        if (Array.isArray(list) && list.length) {
          setChallenges(list);
          setSource(src === "ai" ? "ai" : "local");
          return;
        }
      } catch { /* corrupt cache — fall through and regenerate */ }
    }

    // Show the local set immediately so the card is never empty, then upgrade
    // in place if the AI answers.
    const fallback = localChallenges(stats, week);
    setChallenges(fallback);

    let active = true;
    invokeAI<{ challenges?: unknown }>("generate-challenges", { activity: week, sport, goal })
      .then((res) => {
        if (!active) return;
        const parsed = parseChallenges(res?.challenges);
        // Fewer than three usable ones means the model mostly ignored the
        // vocabulary; the local set is better than a half-empty card.
        const list = parsed.length >= 3 ? parsed : fallback;
        const src = parsed.length >= 3 ? "ai" : "local";
        setChallenges(list);
        setSource(src);
        localStorage.setItem(key, JSON.stringify({ list, src }));
      })
      .catch(() => {
        if (!active) return;
        localStorage.setItem(key, JSON.stringify({ list: fallback, src: "local" }));
      });
    return () => { active = false; };
    // Generated once per week — deliberately not re-run as activity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (!challenges.length) return null;
  const progress = evaluateChallenges(challenges, week);
  const done = progress.filter((p) => p.complete).length;

  return (
    <div className="card p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="field-label !mb-0">This week&apos;s challenges</h2>
        <span className="text-xs text-slate-400">{done}/{progress.length}</span>
      </div>
      <p className="mb-3 text-xs text-slate-500">
        {source === "ai" ? "Picked for you based on what you've been skipping." : "Aimed at whatever you've been skipping."}
        {" "}Resets Monday.
      </p>

      <ul className="space-y-2">
        {progress.map(({ challenge: c, current, pct, complete }) => (
          <li
            key={c.id}
            className={`rounded-2xl border p-3 transition ${complete ? "border-pitch-400/40 bg-pitch-400/[0.07]" : "border-white/10 bg-white/[0.03]"}`}
          >
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.05] text-lg">{c.icon}</span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-bold ${complete ? "text-pitch-400" : "text-slate-100"}`}>
                  {c.title}{complete && " ✓"}
                </span>
                <span className="block text-xs text-slate-400">{c.blurb}</span>
              </span>
              <span className="chip shrink-0 text-pitch-400">+{c.xp}</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                <span
                  className={`block h-full rounded-full transition-all ${complete ? "bg-pitch-400" : "bg-slate-400"}`}
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-slate-500">{Math.min(current, c.target)}/{c.target}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
