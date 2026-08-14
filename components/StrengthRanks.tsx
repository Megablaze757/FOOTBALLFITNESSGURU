"use client";

import { useMemo, useState } from "react";
import type { MuscleGroup } from "@/lib/hypertrophy";
import type { TrainingLog } from "@/lib/types";
import { BodyStrengthFigure, FIGURE_ZONES } from "@/components/BodyStrengthFigure";
import {
  MUSCLE_WORD, RANKABLE_MUSCLES, STRENGTH_TIERS, bodyPartStrength, rankedLifts,
  strengthHeadline, type BodyPartStrength, type LiftRank, type Sex,
} from "@/lib/strength-standards";

/**
 * "Am I strong?" — which is a comparison, and a line going up is not one.
 *
 * The Progress tab could already say your squat had gone up 10kg. It could not
 * say whether 10kg was good, whether your press was lagging your squat, or
 * which half of you was actually being trained. This answers all three off
 * training logs that were already being loaded.
 */
export function StrengthRanks({
  logs,
  weightKg,
  sex,
}: {
  logs: TrainingLog[] | null | undefined;
  weightKg: number | null;
  sex: Sex;
}) {
  const [selected, setSelected] = useState<MuscleGroup | null>(null);

  const { ranks, parts, headline } = useMemo(() => {
    const r = weightKg ? rankedLifts(logs, weightKg, sex) : [];
    const p = bodyPartStrength(r);
    return { ranks: r, parts: p, headline: strengthHeadline(r, p) };
  }, [logs, weightKg, sex]);

  /**
   * A ratio needs a denominator. Without bodyweight the only honest thing is to
   * ask for it — inventing one would rank somebody against a stranger, and
   * showing a rank built on a guess is worse than showing none.
   */
  if (!weightKg) {
    return (
      <section className="card">
        <h3 className="text-lg font-extrabold">Strength ranks</h3>
        <p className="mt-1 text-sm text-slate-400">
          Add your bodyweight in your profile and every lift you log gets ranked. Standards are
          multiples of bodyweight, so they mean the same thing at 60kg as at 100kg.
        </p>
      </section>
    );
  }

  const detail = selected ? parts.find((p) => p.muscle === selected) ?? null : null;
  const shownOnFigure = new Set(FIGURE_ZONES.map((z) => z.muscle));

  return (
    <section className="card">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-extrabold">Strength ranks</h3>
        {ranks.length > 0 && (
          <span className="shrink-0 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-slate-400">
            {ranks.length} lift{ranks.length === 1 ? "" : "s"} ranked
          </span>
        )}
      </div>

      {/* ONE OBVIOUS TOP, which is the rule every page here is held to. Not a
          wall of equal-weight numbers — the single most useful sentence. */}
      <p className="mt-1 text-sm text-slate-300">{headline}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,200px)_1fr] sm:items-start">
        <BodyStrengthFigure parts={parts} selected={selected} onSelect={setSelected} />

        {/* The list is not a legend for the figure — it is the other half of it.
            Lats, triceps, glutes and hamstrings have no front view to appear on,
            and every muscle here is tappable at full row height, so nothing
            depends on hitting a shape on a drawing. */}
        <ul className="space-y-1.5">
          {RANKABLE_MUSCLES.map((muscle) => {
            const part = parts.find((p) => p.muscle === muscle);
            const isSel = selected === muscle;
            const tier = part?.tier ?? null;
            return (
              <li key={muscle}>
                <button
                  onClick={() => setSelected(isSel ? null : muscle)}
                  aria-pressed={isSel}
                  className={`tap-target flex min-h-[44px] w-full items-center gap-2.5 rounded-xl px-2.5 text-left transition ${
                    isSel ? "bg-white/[0.10]" : "hover:bg-white/[0.05]"
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: tier ? tier.color : "rgba(255,255,255,0.18)" }}
                    aria-hidden
                  />
                  <span className="flex-1 text-sm font-semibold capitalize text-slate-200">
                    {MUSCLE_WORD[muscle]}
                    {!shownOnFigure.has(muscle) && (
                      <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">rear</span>
                    )}
                  </span>
                  <span className="text-xs font-bold" style={{ color: tier?.color ?? "#64748b" }}>
                    {tier ? tier.name : "—"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Selecting a part explains itself rather than only glowing. */}
      {detail && (
        <p className="mt-3 rounded-xl bg-white/[0.04] p-3 text-sm text-slate-300">
          {detail.tier
            ? <>Your <strong className="capitalize text-slate-100">{MUSCLE_WORD[detail.muscle]}</strong> are{" "}
                <strong style={{ color: detail.tier.color }}>{detail.tier.name}</strong> — {detail.tier.blurb.toLowerCase()}.
                Earned from your {detail.from?.toLowerCase()}.</>
            : <>Nothing that trains your <strong className="capitalize text-slate-100">{MUSCLE_WORD[detail.muscle]}</strong>{" "}
                has been logged with a weight yet, so there is nothing to rank. That is not the same as being weak.</>}
        </p>
      )}

      {ranks.length > 0 && <LiftTable ranks={ranks} />}

      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        Ranks use your best estimated 1RM as a multiple of bodyweight, adjusted for sex — so they
        mean the same thing at 60kg as at 100kg. They are approximate population standards, not a
        measurement of you, and they only ever go up: a bad session cannot cost you a rank.
      </p>
    </section>
  );
}

/** Every ranked lift, with the exact kilos to the next rung. */
function LiftTable({ ranks }: { ranks: LiftRank[] }) {
  return (
    <ul className="mt-4 space-y-2 border-t border-white/[0.08] pt-4">
      {ranks.map((r) => (
        <li key={r.lift.key}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-slate-200">{r.lift.label}</span>
            <span className="text-xs font-bold" style={{ color: r.tier.color }}>{r.tier.name}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${Math.round(r.progress * 100)}%`, background: r.tier.color }}
            />
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {Math.round(r.best)}kg · {r.ratio.toFixed(2)}× bodyweight
            {/* The specific next thing to do, in kilos, which is the whole
                difference between a scoreboard and a coach. */}
            {r.toNextKg != null && r.nextTier
              ? ` · ${r.toNextKg}kg more for ${r.nextTier.name}`
              : " · top of the ladder"}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** The ladder itself, so the ranks above are not unexplained words. */
export function StrengthLadder() {
  return (
    <ol className="flex flex-wrap gap-1.5">
      {STRENGTH_TIERS.map((t) => (
        <li
          key={t.name}
          className="rounded-full px-2.5 py-1 text-[11px] font-bold"
          style={{ background: `${t.color}1f`, color: t.color }}
        >
          {t.name}
        </li>
      ))}
    </ol>
  );
}

export type { BodyPartStrength };
