"use client";

import { MiniBars } from "@/components/MiniBars";
import { biometricSignal, type Biometric } from "@/lib/biometrics";

/**
 * What the watch has actually been saying.
 *
 * The numbers already nudge the readiness score, and that was the whole of
 * their visible effect — a feed whose only output is a couple of points on a
 * gauge is a feed people disconnect, because nothing ever shows it earning its
 * place. Three weeks of HRV next to your own baseline does.
 *
 * Deliberately framed against the athlete's OWN baseline rather than any
 * population norm. HRV in particular is close to meaningless between people —
 * 40ms is poor for one athlete and normal for another — and the only useful
 * question is whether today is high or low for you.
 */
export function BiometricTrends({ rows }: { rows: Biometric[] }) {
  if (!rows.length) return null;

  const latest = rows[rows.length - 1] ?? null;
  const signal = biometricSignal(latest, rows);

  const series = (field: "hrv_ms" | "resting_hr" | "sleep_hours") =>
    rows
      .filter((r) => r[field] != null)
      .map((r) => ({ date: r.metric_date, value: Number(r[field]) }));

  const hrv = series("hrv_ms");
  const rhr = series("resting_hr");
  const sleep = series("sleep_hours");

  // A single reading is a dot, not a trend, and drawing it as a chart implies a
  // shape that isn't there.
  const worthCharting = (s: { date: string }[]) => s.length >= 3;

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="stat-label">⌚ From your wearable</span>
        {latest && (
          <span className="chip text-slate-400">
            {rows.length} day{rows.length === 1 ? "" : "s"} · to {new Date(latest.metric_date).toLocaleDateString()}
          </span>
        )}
      </div>

      {/* The verdict first. The charts are the evidence for it, not the point. */}
      {signal.note && <p className="mb-3 text-sm text-slate-300">{signal.note}</p>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric
          label="HRV"
          value={signal.hrv != null ? `${Math.round(signal.hrv)}ms` : "–"}
          // Higher HRV is the good direction, so a positive deviation is good news.
          delta={signal.hrvDeviationPct}
          goodWhen="up"
          baseline={signal.hrvBaseline != null ? `${Math.round(signal.hrvBaseline)}ms avg` : null}
          series={worthCharting(hrv) ? hrv : null}
          colour="#38bdf8"
          unit="ms"
          empty="Log or sync HRV to see it here."
        />
        <Metric
          label="Resting HR"
          value={signal.restingHr != null ? `${signal.restingHr}bpm` : "–"}
          delta={
            signal.restingHr != null && signal.restingHrBaseline
              ? ((signal.restingHr - signal.restingHrBaseline) / signal.restingHrBaseline) * 100
              : null
          }
          // A resting heart rate going UP is the bad direction — the opposite of
          // HRV, and the reason this takes a direction rather than assuming one.
          goodWhen="down"
          baseline={signal.restingHrBaseline != null ? `${Math.round(signal.restingHrBaseline)}bpm avg` : null}
          series={worthCharting(rhr) ? rhr : null}
          colour="#fb7185"
          unit="bpm"
          empty="Log or sync resting HR to see it here."
        />
        <Metric
          label="Sleep"
          value={signal.sleepHours != null ? `${signal.sleepHours.toFixed(1)}h` : "–"}
          delta={null}
          goodWhen="up"
          baseline={null}
          series={worthCharting(sleep) ? sleep : null}
          colour="#a78bfa"
          unit="h"
          empty="Log or sync sleep to see it here."
        />
      </div>
    </div>
  );
}

function Metric({ label, value, delta, goodWhen, baseline, series, colour, unit, empty }: {
  label: string;
  value: string;
  delta: number | null;
  goodWhen: "up" | "down";
  baseline: string | null;
  series: { date: string; value: number }[] | null;
  colour: string;
  unit: string;
  empty: string;
}) {
  // Below this a move is noise — day-to-day HRV swings several percent on
  // nothing at all, and colouring that in would manufacture a story.
  const MEANINGFUL_PCT = 5;
  const significant = delta != null && Math.abs(delta) >= MEANINGFUL_PCT;
  const good = delta != null && (goodWhen === "up" ? delta > 0 : delta < 0);

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="stat-label">{label}</span>
        {significant && (
          <span className={`text-[11px] font-bold ${good ? "text-readiness-green" : "text-readiness-yellow"}`}>
            {delta! > 0 ? "+" : ""}{Math.round(delta!)}%
          </span>
        )}
      </div>
      <div className="text-xl font-extrabold tabular-nums text-slate-100">{value}</div>
      {baseline && <div className="text-[11px] text-slate-500">vs {baseline}</div>}
      <div className="mt-2">
        {series
          ? <MiniBars data={series} color={colour} unit={unit} height={56} />
          : <p className="text-[11px] text-slate-500">{empty}</p>}
      </div>
    </div>
  );
}
