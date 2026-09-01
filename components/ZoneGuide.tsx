"use client";

import { useMemo } from "react";
import {
  ZONE_LIST, hrZones, paceZones, formatPace, formatPaceRange,
  thresholdPaceFromBenchmarks, RUN_TYPES,
  type HrZoneRange, type PaceZoneRange,
} from "@/lib/running";

/**
 * What the five training zones are, in plain words.
 *
 * "Zone 2" is meaningless until someone tells you it's the pace you could hold
 * a conversation at, and every run prescription in the app is written in zones
 * — so this is the page those prescriptions point back to. Every athlete sees
 * the definitions; anyone who has logged a 5k or 10k also sees their OWN paces
 * beside them, which is the difference between a reference table and coaching.
 *
 * Deliberately shows the effort description first and the numbers second. The
 * talk test is the only zone tool available to someone with no watch, and it is
 * also the more reliable of the two on a hot day or up a hill.
 */
export function ZoneGuide({ metrics, age, restingHr, maxHr }: {
  /** The athlete's logged benchmarks — a 5k/10k time turns the table personal. */
  metrics?: Record<string, number> | null;
  age?: number | null;
  restingHr?: number | null;
  maxHr?: number | null;
}) {
  const threshold = useMemo(() => thresholdPaceFromBenchmarks(metrics), [metrics]);
  const paces = useMemo(() => (threshold ? paceZones(threshold) : null), [threshold]);
  const hr = useMemo(() => hrZones({ age, restingHr, maxHr }), [age, restingHr, maxHr]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">
        Every run in your plan has a zone. Go by how it feels, not the numbers — that works on a hot
        day, up a hill, and with no watch.
      </p>

      <ul className="space-y-2">
        {ZONE_LIST.map((z) => {
          const pace = paces?.find((p) => p.zone === z.id);
          const beats = hr?.find((h) => h.zone === z.id);
          return (
            <li key={z.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3">
              <div className="flex items-center gap-2">
                <span
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-extrabold text-ink-900"
                  style={{ background: z.colour }}
                >
                  {z.id}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-slate-100">{z.name}</span>
                  <span className="block text-xs text-slate-500">
                    RPE {z.rpe[0]}–{z.rpe[1]} · {z.pctMaxHr[0]}–{z.pctMaxHr[1]}% of max HR
                  </span>
                </span>
              </div>

              <p className="mt-2 text-sm text-slate-300">{z.purpose}</p>
              <p className="mt-1 text-xs text-slate-400">{z.feel}</p>

              {(pace || beats) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {pace && <YourNumber label="Your pace" value={`${formatPaceRange(pace)}/km`} />}
                  {beats && <YourNumber label="Your HR" value={`${beats.low}–${beats.high} bpm`} />}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Say where the personal numbers came from, or what would produce them.
          A table of paces with no stated origin is the kind of thing people
          either distrust or over-trust, and both are worse than knowing. */}
      <PaceSource threshold={threshold} hr={hr} paces={paces} />
    </div>
  );
}

function YourNumber({ label, value }: { label: string; value: string }) {
  return (
    <span className="chip border-pitch-400/30 bg-pitch-400/10 text-pitch-400">
      <span className="text-slate-400">{label}</span> {value}
    </span>
  );
}

function PaceSource({ threshold, hr, paces }: {
  threshold: number | null;
  hr: HrZoneRange[] | null;
  paces: PaceZoneRange[] | null;
}) {
  if (!paces && !hr) {
    return (
      <p className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3 text-xs text-slate-400">
        These are the standard bands. Log a <strong className="text-slate-200">5k or 10k time</strong> on
        Benchmarks and every zone above gets your own pace instead — and add your age or resting heart
        rate on Profile for the heart-rate ranges.
      </p>
    );
  }
  return (
    <p className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3 text-xs text-slate-400">
      {threshold && (
        <>
          Paces are worked out from your logged race times — your threshold is{" "}
          <strong className="text-slate-200">{formatPace(threshold)}/km</strong>, the pace you could
          hold for about an hour. Re-test and they all move with you.{" "}
        </>
      )}
      {hr && !threshold && <>Heart-rate ranges come from your profile. </>}
      {!hr && <>Add your age or resting heart rate on Profile for heart-rate ranges too.</>}
    </p>
  );
}

/**
 * Every run type, each pointing at the zone it lives in.
 *
 * Sits under the zone table because the zones are the vocabulary and these are
 * the sentences — reading them the other way round means learning every
 * names before knowing what any of them mean.
 */
export function RunTypeGuide() {
  return (
    <ul className="space-y-2">
      {RUN_TYPES.map((r) => {
        const zone = ZONE_LIST.find((z) => z.id === r.primaryZone)!;
        return (
          <li key={r.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-slate-100">{r.label}</span>
              <span
                className="rounded-lg px-2 py-0.5 text-[11px] font-bold text-ink-900"
                style={{ background: zone.colour }}
              >
                Zone {zone.id}
              </span>
              {r.hard ? (
                <span className="chip text-[11px] text-readiness-yellow">Hard day</span>
              ) : (
                <span className="chip text-[11px] text-slate-400">Easy day</span>
              )}
              <span className="text-xs text-slate-500">{r.minutes[0]}–{r.minutes[1]} min</span>
            </div>
            <p className="mt-1.5 text-sm text-slate-300">{r.purpose}</p>
            <p className="mt-1 text-xs text-slate-400">{r.howTo}</p>
            {/* The failure mode is the most useful line here — it's the thing
                people get wrong, and it's what a coach would actually say. */}
            <p className="mt-1.5 text-xs text-slate-500">
              <span className="font-semibold text-slate-400">Watch for:</span> {r.watchFor}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
