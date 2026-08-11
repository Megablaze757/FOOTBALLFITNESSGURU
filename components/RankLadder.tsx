"use client";

import { useState } from "react";
import { rankLadder, rankFor, type LevelInfo } from "@/lib/gamification";

/**
 * The whole ladder, so a rank means something.
 *
 * "Gold II" tells you nothing on its own — you can't tell whether that's good
 * without seeing what's above and below it. Collapsed by default because it's
 * reference material, not something to look at daily.
 */
export function RankLadder({ level }: { level: LevelInfo }) {
  const [open, setOpen] = useState(false);
  const ladder = rankLadder();
  const currentIndex = ladder.findIndex((t) => t.tier === level.tier);

  return (
    <div className="card p-4">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center justify-between gap-2 text-left"
      >
        <span>
          <span className="block text-sm font-bold text-slate-100">All ranks</span>
          <span className="block text-xs text-slate-500">
            You&apos;re {currentIndex + 1} of {ladder.length} tiers in
          </span>
        </span>
        <span className={`shrink-0 text-xs text-slate-500 transition ${open ? "rotate-180" : ""}`} aria-hidden>▾</span>
      </button>

      {open && (
        <ol className="mt-3 space-y-1.5 border-t border-white/5 pt-3">
          {ladder.map((t, i) => {
            const reached = i <= currentIndex;
            const isCurrent = i === currentIndex;
            // Where this tier's divisions start and end, so "how far to
            // Emerald?" is answerable rather than mysterious.
            const next = ladder[i + 1];
            const range = next ? `Levels ${t.fromLevel}–${next.fromLevel - 1}` : `Level ${t.fromLevel}+`;
            return (
              <li
                key={t.tier}
                className={`flex items-center gap-3 rounded-xl px-2 py-1.5 ${
                  isCurrent ? "bg-white/[0.06]" : ""
                }`}
              >
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-base ${reached ? "" : "grayscale"}`}
                  style={{ background: reached ? `${t.color}22` : "rgba(255,255,255,0.03)" }}
                >
                  {t.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="block text-sm font-semibold"
                    style={{ color: reached ? t.color : undefined }}
                  >
                    {t.tier}
                    {isCurrent && <span className="ml-2 text-xs text-slate-400">— you are here</span>}
                  </span>
                  <span className="block text-[11px] text-slate-500">{range}</span>
                </span>
                {!reached && i === currentIndex + 1 && (
                  <span className="shrink-0 text-[11px] font-semibold text-pitch-400">
                    {t.fromLevel - level.level} level{t.fromLevel - level.level === 1 ? "" : "s"} away
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/** The three divisions inside a tier, for the level card. */
export function DivisionDots({ level }: { level: LevelInfo }) {
  if (!level.division) return null;
  const order = ["III", "II", "I"];
  const at = order.indexOf(level.division);
  return (
    <span className="flex items-center gap-1" title={`${level.tier} ${level.division}`}>
      {order.map((d, i) => (
        <span
          key={d}
          className="h-1.5 w-4 rounded-full"
          style={{ background: i <= at ? level.color : "rgba(255,255,255,0.12)" }}
        />
      ))}
      <span className="ml-1 text-[11px] text-slate-500">{rankFor(level.level).division}</span>
    </span>
  );
}
