"use client";

import { useEffect } from "react";
import { Portal } from "@/components/Portal";
import { Icon } from "@/components/Icon";
import { MIN_SAMPLE, rarityLabel, rarityTone, type Rarity } from "@/lib/achievement-rarity";
import type { Achievement } from "@/lib/gamification";

/**
 * What a badge is, whether it's yours, and how many people have it.
 *
 * The grid showed a name and one line of description and nothing else — so a
 * locked badge said what to do but never how far off you were, and an unlocked
 * one was a tile that had changed colour. Neither answered the question people
 * actually have about a badge, which is whether it means anything.
 *
 * Rarity is that answer, and it is the only part that needs anyone else's data.
 * See lib/achievement-rarity.ts for why it is recorded rather than derived in
 * SQL, and migration 0074 for why the denominator is athletes who have unlocked
 * something rather than every row in profiles.
 */
export function AchievementDetail({ achievement, unlocked, rarity, sampled, onClose }: {
  achievement: Achievement;
  unlocked: boolean;
  /** Absent when nobody has recorded this one yet — NOT the same as 0%. */
  rarity?: Rarity;
  /** Whether there are enough athletes on the table to quote a percentage. */
  sampled: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  const pct = rarity?.pct ?? null;
  const showPct = sampled && pct !== null;

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
        onClick={onClose}
      >
        <div
          className="animate-scale-in max-h-[88vh] w-full max-w-sm overflow-y-auto rounded-t-3xl border border-white/10 bg-ink-800 p-6 pb-28 shadow-card sm:rounded-3xl sm:pb-6"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={achievement.name}
        >
          <div className="mb-2 flex justify-end">
            <button
              onClick={onClose}
              className="tap-target grid h-9 w-9 place-items-center rounded-full bg-white/[0.06] text-slate-300 transition hover:bg-white/10"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="text-center">
            <span
              className={`mx-auto grid h-20 w-20 place-items-center rounded-3xl ${
                unlocked ? "bg-pitch-400/15 text-pitch-400" : "bg-white/[0.03] text-slate-500 opacity-60"
              }`}
            >
              <Icon name={achievement.icon} size={40} />
            </span>
            <h2 className={`mt-3 text-xl font-extrabold ${unlocked ? "text-slate-100" : "text-slate-300"}`}>
              {achievement.name}
            </h2>
            <p className="mt-1 text-sm text-slate-400">{achievement.desc}</p>

            {/* State in words. Colour and a greyscale icon are the only things
                separating these two on the grid, and neither survives a screen
                reader or a monochrome display. */}
            <p className={`mt-3 text-sm font-bold ${unlocked ? "text-readiness-green" : "text-slate-500"}`}>
              {unlocked ? "✓ Unlocked" : "Not yet unlocked"}
            </p>
          </div>

          {/* --- Rarity ---------------------------------------------------- */}
          <div className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 text-center">
            {showPct ? (
              <>
                <p className="text-xs uppercase tracking-wider text-slate-500">How rare is it</p>
                <p className="mt-1 text-3xl font-extrabold tabular-nums" style={{ color: rarityTone(pct!) }}>
                  {pct!.toFixed(pct! < 10 ? 1 : 0)}%
                </p>
                <p className="mt-0.5 text-sm font-semibold" style={{ color: rarityTone(pct!) }}>
                  {rarityLabel(pct!)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  of active athletes have this one
                  {rarity?.holders ? ` · ${rarity.holders.toLocaleString()} ${rarity.holders === 1 ? "person" : "people"}` : ""}
                </p>
              </>
            ) : (
              /* NOT "0% of athletes have this". With a handful of people on the
                 table a single holder reads as 25%, which is arithmetically
                 true and tells you only how new the app is. Saying so is more
                 use than inventing a number, and it is the same rule the
                 nutrition targets follow about false precision. */
              <>
                <p className="text-sm font-semibold text-slate-300">Not enough athletes yet</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Rarity needs at least {MIN_SAMPLE} people before the percentage means anything.
                  It&apos;ll appear here once there are.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}
