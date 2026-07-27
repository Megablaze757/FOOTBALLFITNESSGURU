"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAsync } from "@/lib/use-async";
import { FUNNEL_STEPS, conversion, worstStep } from "@/lib/funnel";

/**
 * The funnel, for admin.
 *
 * Counts only — the RPC behind this returns aggregates and nothing else, so
 * there is no way to ask it who did what. "Where are people falling out?" is
 * answerable without identifying anyone, and building it that way means it
 * stays answerable without a consent banner.
 */
export function FunnelReport() {
  const [days, setDays] = useState(30);

  const { data, loading } = useAsync(async () => {
    const supabase = createClient();
    const [{ data: summary }, { data: daily }] = await Promise.all([
      supabase.rpc("funnel_summary", { p_days: days }),
      supabase.rpc("funnel_daily", { p_days: days }),
    ]);
    const counts: Record<string, number> = {};
    for (const r of (summary ?? []) as { event: string; people: number }[]) counts[r.event] = r.people;
    return { counts, daily: (daily ?? []) as { day: string; signups: number; activated: number; paid: number }[] };
  }, [days], `funnel:${days}`);

  if (loading) return <div className="card h-64 animate-pulse" />;

  const counts = data?.counts ?? {};
  const top = counts[FUNNEL_STEPS[0].event] ?? 0;
  const worst = worstStep(counts);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="field-label !mb-0">📉 Funnel</h2>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              aria-pressed={days === d}
              className={`tap-target rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                days === d ? "bg-pitch-400 text-ink-900" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {top === 0 ? (
        <p className="card px-4 py-6 text-center text-sm text-slate-400">
          No funnel events yet. They start recording as people sign up and use the app —
          history before this shipped isn&apos;t backfilled.
        </p>
      ) : (
        <>
          <div className="card divide-y divide-white/[0.06] overflow-hidden">
            {FUNNEL_STEPS.map((step, i) => {
              const n = counts[step.event] ?? 0;
              const prev = i === 0 ? n : counts[FUNNEL_STEPS[i - 1].event] ?? 0;
              const pctOfTop = top > 0 ? Math.round((n / top) * 100) : 0;
              const fromPrev = i === 0 ? 100 : conversion(prev, n);
              return (
                <div key={step.event} className="p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-100">{step.label}</span>
                    <span className="shrink-0 text-sm">
                      <b className="text-slate-100">{n}</b>
                      {i > 0 && (
                        <span className={fromPrev >= 50 ? "text-slate-400" : "text-readiness-red"}>
                          {" "}· {fromPrev}% of previous
                        </span>
                      )}
                    </span>
                  </div>
                  {/* A bar relative to the top of the funnel makes the shape
                      readable at a glance; the numbers give the detail. */}
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-pitch-400"
                      style={{ width: `${Math.max(pctOfTop, n > 0 ? 2 : 0)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{step.note}</p>
                </div>
              );
            })}
          </div>

          {worst ? (
            <p className="mt-3 rounded-2xl border border-pitch-400/20 bg-pitch-400/[0.04] p-4 text-sm text-slate-300">
              Biggest drop: <b className="text-slate-100">{worst.from} → {worst.to}</b>, losing{" "}
              <b className="text-slate-100">{worst.lost}</b> ({worst.rate}% get through). Fix this
              step before any other.
            </p>
          ) : (
            <p className="mt-3 text-xs text-slate-400">
              Not enough signups yet to call out a drop-off — a handful of people changing their
              mind isn&apos;t a pattern, and rebuilding around it would be worse than waiting.
            </p>
          )}
        </>
      )}
    </div>
  );
}
