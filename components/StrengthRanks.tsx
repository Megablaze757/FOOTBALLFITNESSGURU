"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { MuscleGroup } from "@/lib/hypertrophy";
import type { TrainingLog } from "@/lib/types";
import { todayLocal } from "@/lib/day";
import { weightIsStale, weightProvenance, type Bodyweight } from "@/lib/bodyweight";
import { loggedWeeklySets, verdictFor, volumeAdvice } from "@/lib/muscle-volume";
import { BodyStrengthFigure, FIGURE_VIEWS, type BodyView } from "@/components/BodyStrengthFigure";
import {
  MUSCLE_WORD, RANKABLE_MUSCLES, STRENGTH_TIERS, bodyPartStrength, rankedLifts,
  strengthHeadline, weakestLink, type BodyPartStrength, type LiftRank, type Sex,
  type TestedMax,
} from "@/lib/strength-standards";

/**
 * "Am I strong?" — which is a comparison, and a line going up is not one.
 *
 * The Progress tab could already say your squat had gone up 10kg. It could not
 * say whether 10kg was good, whether your press was lagging your squat, or
 * which half of you was actually being trained. This answers all three off
 * training logs that were already being loaded.
 */
/** The window the sets-per-week figure is averaged over. Matches the log the
 *  Progress tab already loads, so this costs no extra query. */
const VOLUME_WINDOW_DAYS = 28;

export function StrengthRanks({
  logs,
  bodyweight,
  sex,
  tested,
}: {
  logs: TrainingLog[] | null | undefined;
  bodyweight: Bodyweight | null;
  sex: Sex;
  /** Tested maxes from the Benchmarks page — better evidence than an estimate. */
  tested?: TestedMax[] | null;
}) {
  const [selected, setSelected] = useState<MuscleGroup | null>(null);
  const [view, setView] = useState<BodyView>("front");
  const weightKg = bodyweight?.kg ?? null;

  const { ranks, parts, headline, weak } = useMemo(() => {
    const r = weightKg ? rankedLifts(logs, weightKg, sex, tested) : [];
    const p = bodyPartStrength(r);
    return { ranks: r, parts: p, headline: strengthHeadline(r, p), weak: weakestLink(p) };
  }, [logs, weightKg, sex, tested]);

  /**
   * WHAT THEY ARE ACTUALLY DOING, beside what they have achieved.
   *
   * A rank on its own is a scoreboard. "Chest: Novice" and "chest: 4 sets a
   * week" together are a decision — the first says where you are, the second
   * says why, and neither alone tells anybody what to change on Thursday.
   */
  const weeklySets = useMemo(
    () => loggedWeeklySets((logs ?? []).filter((l) => String(l.log_date ?? "") >= sinceVolume()), VOLUME_WINDOW_DAYS),
    [logs],
  );

  /**
   * A ratio needs a denominator. Without bodyweight the only honest thing is to
   * ask for it — inventing one would rank somebody against a stranger, and
   * showing a rank built on a guess is worse than showing none.
   *
   * IT MUST ASK FOR IT SOMEWHERE THAT EXISTS. This used to say "add your
   * bodyweight in your profile", and there is no weight field on the profile
   * page — it named the one place you cannot do it, to people who had already
   * entered their weight in the check-in. Both real routes are now links.
   */
  if (!weightKg) {
    return (
      <section className="card">
        <h3 className="text-lg font-extrabold">Strength ranks</h3>
        <p className="mt-1 text-sm text-slate-400">
          Add your weight and every lift you log gets ranked. Standards are multiples of
          bodyweight, so they mean the same thing at 60kg as at 100kg.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link href="/journal" className="btn-ghost">Daily check-in</Link>
          <Link href="/body" className="btn-ghost">Weigh in</Link>
        </div>
      </section>
    );
  }

  const detail = selected ? parts.find((p) => p.muscle === selected) ?? null : null;
  const today = todayLocal();
  const provenance = weightProvenance(bodyweight, today);
  const stale = weightIsStale(bodyweight, today);

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

      {/* AND THE LAGGING PART IS TAPPABLE FROM THE SENTENCE THAT NAMES IT.
          A finding you have to go and look for yourself is half a finding: this
          selects it on the figure and in the list below, so "your shoulders are
          two tiers behind" and the picture agree without the reader hunting. */}
      {weak && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4">
          {selected !== weak.muscle && (
            <button
              onClick={() => {
                setSelected(weak.muscle);
                setView(BACK_MUSCLES.has(weak.muscle) ? "back" : "front");
              }}
              className="tap-target inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-pitch-400"
            >
              Show me <span aria-hidden>→</span>
            </button>
          )}
          {/* AND THEN THE THING THAT FIXES IT.
              Naming a lagging muscle and stopping there is a diagnosis with no
              prescription: the athlete now knows their shoulders are behind and
              still has to go and think of shoulder exercises themselves. The
              library already searched muscle names — it just had no way in. */}
          <Link
            href={`/library?q=${encodeURIComponent(MUSCLE_WORD[weak.muscle])}`}
            className="tap-target inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-pitch-400"
          >
            Train {MUSCLE_WORD[weak.muscle]} <span aria-hidden>→</span>
          </Link>
        </div>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,200px)_1fr] sm:items-start">
        <BodyStrengthFigure
          parts={parts}
          selected={selected}
          onSelect={setSelected}
          view={view}
          onViewChange={setView}
        />

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
                  onClick={() => {
                    setSelected(isSel ? null : muscle);
                    // Turn the body round rather than lighting a muscle on the
                    // side you cannot see. Tapping "glutes" and having nothing
                    // visibly happen reads as a broken control.
                    if (!isSel) setView(BACK_MUSCLES.has(muscle) ? "back" : "front");
                  }}
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
                  </span>
                  <span className="text-right">
                    <span className="block text-xs font-bold" style={{ color: tier?.color ?? "#64748b" }}>
                      {tier ? tier.name : "—"}
                    </span>
                    {/* The sets that produced it. Muted, because the rank is the
                        headline and this is the reason for it. */}
                    <span className={`block text-[10px] tabular-nums ${VERDICT_TONE[verdictFor(weeklySets[muscle] ?? 0)]}`}>
                      {(weeklySets[muscle] ?? 0) > 0 ? `${weeklySets[muscle]} sets/wk` : "no sets logged"}
                    </span>
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
                Earned from your {detail.from?.toLowerCase()}.{" "}
                {/* The actionable half: how much work is going in, and whether
                    that amount is doing anything. */}
                You are averaging <strong className="tabular-nums text-slate-100">{weeklySets[detail.muscle] ?? 0}</strong>{" "}
                sets a week over the last {VOLUME_WINDOW_DAYS} days — {volumeAdvice(weeklySets[detail.muscle] ?? 0)}.</>
            : <>Nothing that trains your <strong className="capitalize text-slate-100">{MUSCLE_WORD[detail.muscle]}</strong>{" "}
                has been logged with a weight yet, so there is nothing to rank. That is not the same as being weak.</>}
        </p>
      )}

      {ranks.length > 0 && <LiftTable ranks={ranks} />}

      {/* SHOW THE DENOMINATOR. Every rank on this card is a multiple of one
          number, so an athlete who disagrees with a rank needs to be able to
          see which weight produced it and how old it is — otherwise the only
          available reaction to a wrong rank is to distrust the whole feature. */}
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        Ranked against <strong className="tabular-nums text-slate-400">{weightKg}kg</strong>
        {provenance ? `, ${provenance}` : ""}. Ranks use your best estimated 1RM as a multiple of
        bodyweight, adjusted for sex, and they only ever go up: a bad session cannot cost you a rank.
      </p>

      {/* A stale weight still ranks you — refusing to would put this card back
          in the invisible state it spent its whole life in. It just says so,
          and the fix is one tap rather than a hunt for the right screen. */}
      {stale && (
        <Link href="/body" className="tap-target mt-1 inline-flex min-h-[44px] items-center text-[11px] font-semibold text-pitch-400">
          That weight is a while old — update it →
        </Link>
      )}
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
            <span className="flex items-baseline gap-1.5 text-sm font-semibold text-slate-200">
              {r.lift.label}
              {/* A max you actually lifted outranks one worked out from a set of
                  five, and the athlete should be able to see which they are
                  looking at — otherwise a tested 140kg squat and an estimated
                  one are the same row and the Benchmarks page looks ignored. */}
              {r.source === "tested" && (
                <span className="rounded bg-pitch-400/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-pitch-400">
                  tested
                </span>
              )}
            </span>
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

/** Which side of the body each muscle is on, so the list can turn the figure. */
const BACK_MUSCLES = new Set<MuscleGroup>(FIGURE_VIEWS.back.map((r) => r.muscle));

/** Muted, and only the two that need attention carry a colour. */
const VERDICT_TONE: Record<string, string> = {
  untrained: "text-slate-600",
  maintenance: "text-amber-500/80",
  productive: "text-slate-500",
  excessive: "text-rose-400/80",
};

/** The first day of the volume window, in the athlete's own local days. */
function sinceVolume(): string {
  const d = new Date();
  d.setDate(d.getDate() - (VOLUME_WINDOW_DAYS - 1));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type { BodyPartStrength };
