"use client";

import type { HomeStat } from "@/lib/home-stats";

/**
 * Your week, in the numbers your sport is actually measured in.
 *
 * WHAT THIS REPLACED. Home closed on a rank badge and "480 XP to go" — a
 * number about using the app, on the screen you open to find out how your
 * training is going. The audit that prompted this reported the app reading like
 * "a second job", which is what a tracker becomes when it starts issuing
 * scores. The XP has a whole page of its own, one tap away on Performance.
 *
 * Which three appear is decided by what this athlete actually does, not by what
 * they signed up as — see lib/home-stats.ts.
 */
export function HomeStats({ stats }: { stats: HomeStat[] }) {
  if (!stats.length) return null;
  return (
    <section className="card p-4 sm:p-5">
      <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">This week</h2>
      <div className={`grid gap-3 ${stats.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {stats.map((s) => (
          <div key={s.key} className="min-w-0 rounded-2xl bg-white/[0.04] p-3">
            <div className="truncate text-xl font-extrabold text-slate-100 sm:text-2xl">{s.value}</div>
            <div className="stat-label truncate">{s.label}</div>
            {s.sub && (
              <div className="mt-1 flex items-center gap-1 text-[11px] leading-tight text-slate-500">
                <Arrow trend={s.trend} goodWhen={s.goodWhen} />
                <span className="truncate">{s.sub}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * The direction, coloured honestly.
 *
 * Green for the good direction and amber for the other — except where there
 * isn't one. More minutes is not better than fewer and more contact is load to
 * manage, so those get a plain grey arrow rather than a verdict nobody asked
 * for. A faster pace is a SMALLER number, which is why `goodWhen` exists at all
 * and why a down arrow on it is green.
 */
function Arrow({ trend, goodWhen }: { trend: HomeStat["trend"]; goodWhen: HomeStat["goodWhen"] }) {
  if (!trend) return null;
  const glyph = trend === "up" ? "↑" : trend === "down" ? "↓" : "↔";
  const good = goodWhen !== "either" && trend !== "flat" && (goodWhen === trend);
  const bad = goodWhen !== "either" && trend !== "flat" && !good;
  const colour = good ? "text-readiness-green" : bad ? "text-accent-400" : "text-slate-500";
  return <span className={`shrink-0 font-bold ${colour}`} aria-hidden>{glyph}</span>;
}
