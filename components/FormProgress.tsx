"use client";

import { useState } from "react";
import type { VideoAnalysis } from "@/lib/types";
import { MiniBars } from "@/components/MiniBars";

export interface Clip {
  id: string;
  date: string;
  label: string;
  analysis: VideoAnalysis;
}

const form = (a: VideoAnalysis) => (Number.isFinite(a.form_score) ? a.form_score : a.symmetry_score);

export function FormProgress({ clips }: { clips: Clip[] }) {
  // clips arrive oldest → newest
  const [aIdx, setAIdx] = useState(0);
  const [bIdx, setBIdx] = useState(clips.length - 1);

  const series = clips.map((c) => ({ date: c.date, value: form(c.analysis) }));
  const latest = clips[clips.length - 1];
  const first = clips[0];
  const delta = clips.length >= 2 ? form(latest.analysis) - form(first.analysis) : 0;

  return (
    <section className="space-y-4">
      <div className="card p-5">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="field-label !mb-0">Form over time</h2>
          {clips.length >= 2 && (
            <span className={`chip ${delta >= 0 ? "text-readiness-green" : "text-readiness-red"}`}>
              {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} pts
            </span>
          )}
        </div>
        <MiniBars data={series} unit=" form" />
        <p className="mt-2 text-xs text-slate-400">
          {clips.length < 2
            ? "Upload another clip to start tracking your form trend."
            : delta >= 0
              ? "Your movement quality is trending up — keep at the drills."
              : "Form has dipped recently — check the coaching cues and manage load."}
        </p>
      </div>

      {clips.length >= 2 && (
        <div className="card p-5">
          <h2 className="field-label mb-3">Compare two clips</h2>
          <div className="grid grid-cols-2 gap-3">
            <ClipPicker clips={clips} idx={aIdx} onPick={setAIdx} />
            <ClipPicker clips={clips} idx={bIdx} onPick={setBIdx} />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <CompareCol c={clips[aIdx]} other={clips[bIdx]} />
            <CompareCol c={clips[bIdx]} other={clips[aIdx]} />
          </div>
        </div>
      )}
    </section>
  );
}

function ClipPicker({ clips, idx, onPick }: { clips: Clip[]; idx: number; onPick: (i: number) => void }) {
  return (
    <select
      value={idx}
      onChange={(e) => onPick(Number(e.target.value))}
      className="field !py-2 text-sm"
    >
      {clips.map((c, i) => (
        <option key={c.id} value={i} className="bg-ink-800">
          {c.date} · {c.label}
        </option>
      ))}
    </select>
  );
}

function CompareCol({ c, other }: { c: Clip; other: Clip }) {
  const f = form(c.analysis);
  const of = form(other.analysis);
  const diff = f - of;
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-extrabold text-slate-100">{f}</span>
        {diff !== 0 && (
          <span className={`text-xs font-semibold ${diff > 0 ? "text-readiness-green" : "text-readiness-red"}`}>
            {diff > 0 ? "+" : ""}{diff}
          </span>
        )}
      </div>
      <div className="stat-label">Form · {c.date}</div>
      <dl className="mt-2 space-y-1 text-xs text-slate-400">
        <Row label="Symmetry" value={`${c.analysis.symmetry_score}`} />
        <Row label="Valgus L/R" value={`${c.analysis.biomechanics.knee_valgus_left}°/${c.analysis.biomechanics.knee_valgus_right}°`} />
        <Row label="Reps" value={`${c.analysis.rep_count ?? 0}`} />
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt>{label}</dt>
      <dd className="font-medium text-slate-300">{value}</dd>
    </div>
  );
}
