"use client";

import { useState } from "react";
import { rankLadder, rankFor, type LevelInfo } from "@/lib/gamification";
import { RankBadge } from "@/components/RankBadge";

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
            // A standing is not a level, so it gets its requirement instead of a
            // level range — listing "Levels 28+" beside Apex would read as a rung
            // you climb to, which is the one thing it is not.
            const standing = t.earnedBy === "standing";
            const range = standing
              ? t.note ?? ""
              : next && next.earnedBy === "level"
                ? `Levels ${t.fromLevel}–${next.fromLevel - 1}`
                : `Level ${t.fromLevel}+`;
            return (
              <li
                key={t.tier}
                className={`flex items-center gap-3 rounded-xl px-2 py-1.5 ${
                  isCurrent ? "bg-white/[0.06]" : ""
                }`}
              >
                {/* Unreached tiers dim rather than greyscale: the badge is drawn
                    in the tier's own colour, and `grayscale` on an emoji was the
                    only way to lock one before. Opacity keeps the shape — which
                    is what tells you what you are climbing towards. */}
                <span
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${reached ? "" : "opacity-35"}`}
                  style={{ background: reached ? `${t.color}18` : "rgba(255,255,255,0.03)" }}
                >
                  <RankBadge tier={t.tier} color={reached ? t.color : "#8b93a1"} size={26} />
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
                {standing && (
                  <span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Standing
                  </span>
                )}
                {!standing && !reached && i === currentIndex + 1 && (
                  <span className="shrink-0 text-[11px] font-semibold text-pitch-400">
                    {t.fromLevel - level.level} level{t.fromLevel - level.level === 1 ? "" : "s"} away
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {open && (
        <p className="mt-3 border-t border-white/5 pt-3 text-[11px] leading-relaxed text-slate-500">
          The first nine are levels — you climb them and keep them. The last two are
          standings: they compare you with everyone else, so they can be taken back if
          somebody overtakes you. Neither is awarded until at least 100 athletes are on
          the ladder, because &ldquo;top 1%&rdquo; of a dozen people is not a top 1%.
        </p>
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
