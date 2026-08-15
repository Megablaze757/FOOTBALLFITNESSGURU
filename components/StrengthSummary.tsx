"use client";

import Link from "next/link";
import type { ActivityStats } from "@/lib/gamification";
import { RANKABLE_MUSCLES, STRENGTH_TIERS, tierAt } from "@/lib/strength-standards";

/**
 * What the rewards page had no way of saying: whether any of it worked.
 *
 * Every other card here counts turning up — days checked in, sessions logged,
 * quests done. Useful, and none of it answers "am I stronger than I was". The
 * ranks existed on the Progress tab and the page whose entire subject is
 * progression did not mention them.
 *
 * A SUMMARY, NOT A SECOND COPY. The full breakdown — every lift, the kilos to
 * the next rung, the body figure — lives on Progress, and duplicating it here
 * would be two screens to keep in step. This says the one thing worth knowing
 * and points at the other one.
 */
export function StrengthSummary({ stats }: { stats: ActivityStats }) {
  const best = tierAt(stats.bestStrengthTier);
  const ranked = stats.musclesRanked;
  const total = RANKABLE_MUSCLES.length;

  /**
   * Nothing ranked yet says so plainly and says what to do about it.
   *
   * The alternative — showing "Untrained" against a full set of grey bars — is
   * the app passing a verdict on somebody it has no evidence about. Not tested
   * is not weak.
   */
  if (stats.strengthTiers === 0) {
    return (
      <section className="card p-5">
        <h2 className="field-label !mb-1">Strength</h2>
        <p className="text-sm text-slate-400">
          Log a squat, bench, deadlift or press with a weight in your check-in and every lift gets
          ranked against your bodyweight — plus XP for every rung you climb.
        </p>
        <Link href="/journal" className="mt-3 inline-block text-sm font-semibold text-pitch-400">
          Log a session →
        </Link>
      </section>
    );
  }

  return (
    <section className="card p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="field-label !mb-0">Strength</h2>
        <Link href="/dashboard" className="text-xs font-semibold text-pitch-400">Every lift →</Link>
      </div>

      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-400">Your best lift is</p>
          <p className="truncate text-2xl font-extrabold" style={{ color: best.color }}>{best.name}</p>
          <p className="mt-0.5 text-xs text-slate-500">{best.blurb}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-extrabold tabular-nums text-slate-100">{ranked}<span className="text-base text-slate-500">/{total}</span></p>
          <p className="text-xs text-slate-500">muscles ranked</p>
        </div>
      </div>

      {/* The ladder, with where they are on it. Seven rungs is few enough to
          show whole, and seeing the ones above is the point of a ladder. */}
      <ol className="mt-4 flex gap-1" aria-label="Strength ladder">
        {STRENGTH_TIERS.map((t) => {
          const reached = t.index <= stats.bestStrengthTier;
          return (
            <li
              key={t.name}
              className="h-1.5 flex-1 rounded-full transition-colors"
              style={{ background: reached ? t.color : "rgba(255,255,255,0.09)" }}
              title={t.name}
            />
          );
        })}
      </ol>
      <p className="mt-2 text-xs text-slate-500">
        {ranked < total
          ? `${total - ranked} muscle group${total - ranked === 1 ? "" : "s"} still unranked — one logged lift each is all it takes.`
          : "Every muscle group ranked."}
      </p>

      {/* TWO LADDERS ON ONE SCREEN, AND NOW A SENTENCE SAYING WHY.
          This page shows a level (Iron → Apex) at the top and a strength tier
          (Untrained → World Class) here, and they are deliberately different
          vocabularies so that "Gold" cannot mean two unrelated things at once
          — see the note at the top of lib/strength-standards.ts. Keeping them
          apart was right; never explaining it was not. An athlete looking at
          two ladders with no relationship stated assumes one of them is
          broken, or that they are behind on both. */}
      <p className="mt-2 border-t border-white/[0.06] pt-2 text-[11px] leading-relaxed text-slate-500">
        Two different things, on purpose: your <strong className="text-slate-400">level</strong> above
        rewards showing up — every check-in, session and meal logged pushes it up, and it never
        falls. Your <strong className="text-slate-400">strength tier</strong> here is a comparison
        against everyone else at your bodyweight, and only lifting more moves it.
      </p>
    </section>
  );
}
