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

    /**
     * Median time from signup to each milestone.
     *
     * The roadmap's D7 target rests on how long the first run takes, and that
     * was answerable only with a stopwatch and one phone. Every funnel event now
     * carries `since_signup_s` (see lib/funnel.ts), so it's a query.
     *
     * Done in SQL (`funnel_timing`, migration 0063) rather than here, to keep
     * the promise at the top of this file: aggregates only, never individual
     * rows. Computing the median client-side would have meant selecting event
     * rows, which weakens that for no reason. Median not mean — one person who
     * signs up and returns three weeks later ruins an average.
     */
    const { data: timing } = await supabase.rpc("funnel_timing", { p_days: days });
    // Why the first step leaks. Its two causes need opposite fixes — mail that
    // never arrived versus a screen people abandoned — and one merged number
    // cannot tell you which you have.
    const { data: breakdown } = await supabase.rpc("funnel_signup_breakdown", { p_days: days });
    const medians: Record<string, number | null> = {};
    for (const r of (timing ?? []) as { event: string; median_seconds: number | null }[]) {
      medians[r.event] = r.median_seconds;
    }

    return {
      counts,
      medians,
      breakdown: (breakdown ?? []) as { bucket: string; people: number; note: string }[],
      daily: (daily ?? []) as { day: string; signups: number; activated: number; paid: number }[],
    };
  }, [days], `funnel:${days}`);

  if (loading) return <div className="card h-64 animate-pulse" />;

  const counts = data?.counts ?? {};
  const top = counts[FUNNEL_STEPS[0].event] ?? 0;
  const worst = worstStep(counts);
  const medians = data?.medians;
  const breakdown = data?.breakdown ?? [];

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
          {/* HOW LONG THE FIRST RUN TAKES.
              This was the one number nobody could get at: it needed a stopwatch
              and a real phone, so "is onboarding too long?" was answered by
              reading code. Every event now carries seconds-since-signup, so it's
              just a query. Medians, because one person who signs up and comes
              back three weeks later would make an average meaningless. */}
          <div className="card mb-3 p-4">
            <div className="stat-label mb-2">Median time from signup</div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <FirstRunStat label="To onboarded" seconds={medians?.onboarded ?? null} />
              <FirstRunStat label="To a program" seconds={medians?.program_built ?? null} />
              <FirstRunStat label="To training" seconds={medians?.first_session ?? null} />
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Only counts accounts that got there. A rising number here shows up as falling D7
              retention a week later.
            </p>
          </div>

          {/* WHERE THE FIRST DROP ACTUALLY GOES.
              Signed up -> Onboarded was the biggest loss on the report and also
              the least actionable, because it contained three different things:
              people whose confirmation mail never landed, people who reached the
              app and stopped, and people who only signed up an hour ago. The
              first needs deliverability work, the second needs the onboarding
              screen changing, and the third needs nothing at all. */}
          {breakdown.length > 0 && (
            <div className="card mb-3 p-4">
              <div className="stat-label mb-2">What happened to this month&apos;s signups</div>
              <ul className="space-y-2">
                {breakdown.map((b) => (
                  <li key={b.bucket} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0">
                      <span className="text-sm font-semibold text-slate-200">{b.bucket}</span>
                      <span className="block text-xs leading-snug text-slate-500">{b.note}</span>
                    </span>
                    <span className="shrink-0 text-lg font-extrabold tabular-nums text-slate-100">{b.people}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

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

/**
 * A duration, in the largest unit that still reads as a number.
 *
 * "4,812s" is data; "1h 20m" is an answer. Null when nobody has reached that
 * milestone in the window — shown as an em dash rather than 0, because "no data"
 * and "instant" are opposite conclusions.
 */
function FirstRunStat({ label, seconds }: { label: string; seconds: number | null }) {
  const text =
    seconds == null ? "—"
      : seconds < 90 ? `${seconds}s`
        : seconds < 5400 ? `${Math.round(seconds / 60)}m`
          : seconds < 172800 ? `${Math.round(seconds / 3600)}h`
            : `${Math.round(seconds / 86400)}d`;
  return (
    <div>
      <div className="text-xl font-extrabold tabular-nums text-slate-100">{text}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}
