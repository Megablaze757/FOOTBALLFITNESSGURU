"use client";

import { useMemo, useState } from "react";
import {
  exerciseOptions, exerciseProgress, metricsFor, valueAt,
  type Direction, type Metric,
} from "@/lib/exercise-stats";
import type { TrainingLog } from "@/lib/types";

/**
 * "Is my squat going up?" — the question the Progress page couldn't answer.
 *
 * Total volume tells you that you trained. It doesn't tell you that you got
 * better, and those are different things: a month of easy sessions and a month
 * of hard ones look identical on a volume bar.
 */
export function ExerciseProgress({ logs, windowDays }: { logs: TrainingLog[]; windowDays?: number }) {
  const options = useMemo(() => exerciseOptions(logs), [logs]);

  // Held as a key rather than an index so the selection survives new sessions
  // arriving and reordering the list underneath it.
  const [picked, setPicked] = useState<string>("");
  const [wanted, setWanted] = useState<Metric>("e1rm");

  const selected = options.find((o) => o.key === picked) ?? options[0];
  const metrics = metricsFor(selected?.hasLoad ?? false, selected?.hasDuration ?? false);
  // Derived, not stored: switching from a barbell lift to press-ups must not
  // leave "Est. 1RM" selected with nothing behind it.
  const metric = metrics.some((m) => m.id === wanted) ? wanted : metrics[0].id;
  const unit = metrics.find((m) => m.id === metric)?.unit ?? "";

  const progress = useMemo(
    () => (selected ? exerciseProgress(logs, selected.name, metric) : null),
    [logs, selected, metric]
  );

  const series = (progress?.points ?? [])
    .map((p) => ({ date: p.date, value: valueAt(p, metric) }))
    .filter((p): p is { date: string; value: number } => p.value != null);

  if (!options.length) {
    return (
      <section className="card p-5">
        <h2 className="field-label">Exercise progress</h2>
        <p className="rounded-2xl bg-white/[0.04] px-4 py-6 text-center text-xs text-slate-500">
          Log a drill and we&apos;ll chart the measure it actually uses — weight and reps for
          lifts, hold time for planks and isometrics.
        </p>
      </section>
    );
  }

  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="field-label !mb-0">Exercise progress</h2>
          {windowDays && <p className="text-[11px] text-slate-500">Last {windowDays} days</p>}
        </div>
        {progress?.changePct != null && (
          <TrendBadge direction={progress.direction} changePct={progress.changePct} />
        )}
      </div>

      <label className="block">
        <span className="sr-only">Exercise</span>
        <select
          value={selected?.key ?? ""}
          onChange={(e) => setPicked(e.target.value)}
          className="field [color-scheme:dark]"
        >
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.name} — {o.sessions} session{o.sessions === 1 ? "" : "s"}
            </option>
          ))}
        </select>
      </label>

      {metrics.length > 1 && (
        <div className="mt-3 flex gap-2">
          {metrics.map((m) => (
            <button
              key={m.id}
              onClick={() => setWanted(m.id)}
              aria-pressed={metric === m.id}
              className={`min-h-[44px] min-h-[2.25rem] flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                metric === m.id
                  ? "bg-pitch-400 text-on-accent"
                  : "bg-white/[0.04] text-slate-400 hover:bg-white/[0.08] hover:text-slate-200"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4">
        <Chart series={series} unit={unit} best={progress?.best ?? null} label={`${selected?.name} — ${metrics.find((m) => m.id === metric)?.label}`} />
      </div>

      {progress?.best && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
          <Stat label={metric === "reps" ? "Best session" : "Personal best"} value={`${progress.best.value.toLocaleString()}${unit}`} sub={friendlyDate(progress.best.date)} />
          <Stat
            label="Latest"
            value={series.length ? `${series[series.length - 1].value.toLocaleString()}${unit}` : "—"}
            sub={series.length ? friendlyDate(series[series.length - 1].date) : ""}
          />
        </div>
      )}

      {series.length === 1 && (
        <p className="mt-3 text-center text-xs text-slate-500">
          One session so far. Log it again and the line starts telling you something.
        </p>
      )}
      {metric === "e1rm" && (
        <p className="mt-3 text-[11px] text-slate-500">
          Estimated from your heaviest set each day. It&apos;s a projection, not a max you&apos;ve
          lifted — don&apos;t go and test it without a spotter.
        </p>
      )}
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.04] p-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-lg font-extrabold text-slate-100">{value}</div>
      <div className="text-[10px] text-slate-500">{sub}</div>
    </div>
  );
}

function TrendBadge({ direction, changePct }: { direction: Direction; changePct: number }) {
  const tone =
    direction === "improving" ? "bg-readiness-green/15 text-readiness-green"
    : direction === "declining" ? "bg-readiness-red/15 text-readiness-red"
    : "bg-white/[0.06] text-slate-400";
  const arrow = direction === "improving" ? "↑" : direction === "declining" ? "↓" : "→";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>
      {arrow} {changePct > 0 ? "+" : ""}{changePct}%
    </span>
  );
}

const W = 320;
const H = 168;
const PAD = { top: 14, right: 10, bottom: 22, left: 34 };

/**
 * Pure SVG, like the rest of the charts here — a charting library would be a
 * larger download than the whole page.
 */
function Chart({ series, unit, best, label }: {
  series: { date: string; value: number }[];
  unit: string;
  best: { value: number; date: string } | null;
  label: string;
}) {
  if (!series.length) {
    return <p className="rounded-2xl bg-white/[0.04] px-4 py-8 text-center text-xs text-slate-500">Nothing to chart for this one yet.</p>;
  }

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const values = series.map((p) => p.value);

  // Leave headroom, and don't zero-base a 1RM chart — anchoring 140kg against
  // zero flattens a good month into a straight line.
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const span = rawMax - rawMin || Math.max(1, rawMax * 0.1);
  const min = Math.max(0, rawMin - span * 0.25);
  const max = rawMax + span * 0.25;

  const n = series.length;
  const x = (i: number) => PAD.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - ((v - min) / (max - min)) * innerH;

  const d = series.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const area = `${d} L ${x(n - 1).toFixed(1)} ${(PAD.top + innerH).toFixed(1)} L ${x(0).toFixed(1)} ${(PAD.top + innerH).toFixed(1)} Z`;
  const gid = `grad-${label.replace(/\W/g, "")}`;

  const first = series[0].value;
  const last = series[n - 1].value;
  const summary = `${label}. ${n} session${n === 1 ? "" : "s"}, from ${first}${unit} to ${last}${unit}.`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={summary}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e3b53f" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#e3b53f" stopOpacity="0" />
        </linearGradient>
      </defs>

      {[max, (max + min) / 2, min].map((g, i) => (
        <g key={i}>
          <line x1={PAD.left} y1={y(g)} x2={W - PAD.right} y2={y(g)} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
          <text x={PAD.left - 5} y={y(g) + 3} textAnchor="end" fontSize="8" fill="#8391a6">
            {Math.round(g).toLocaleString()}
          </text>
        </g>
      ))}

      {n > 1 && <path d={area} fill={`url(#${gid})`} />}
      <path d={d} fill="none" stroke="#e3b53f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {series.map((p, i) => {
        const isBest = best != null && p.value === best.value && p.date === best.date;
        return (
          <circle
            key={p.date}
            cx={x(i)} cy={y(p.value)}
            r={isBest ? 4 : 2.5}
            fill={isBest ? "#e3b53f" : "#0b0f14"}
            stroke="#e3b53f"
            strokeWidth="1.5"
          />
        );
      })}

      {/* First, middle and last only — 30 dates across 320px is a smudge. */}
      {[...new Set([0, Math.floor((n - 1) / 2), n - 1])].map((i) => (
        <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="8" fill="#8391a6">
          {series[i].date.slice(5)}
        </text>
      ))}
    </svg>
  );
}

function friendlyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
