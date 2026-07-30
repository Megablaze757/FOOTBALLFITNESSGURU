"use client";

import { getExercise, type Exercise } from "@/lib/exercises";
import type { RecoveryProtocol } from "@/lib/essentials";

/**
 * A rehab protocol card, extracted from the Guides page.
 *
 * Injury now has its own page (see app/(app)/injury) rather than living as the
 * third tab of Guides, and both need this. It was only ever local because it had
 * one caller.
 */
export function ProtocolCard({ p, highlight, collapsed, onOpenExercise }: {
  p: RecoveryProtocol;
  highlight?: boolean;
  // Browsing the full library: show a one-line summary until asked for detail.
  collapsed?: boolean;
  onOpenExercise?: (ex: Exercise) => void;
}) {
  const body = <ProtocolBody p={p} onOpenExercise={onOpenExercise} />;
  if (collapsed) {
    return (
      <details className="card p-4">
        <summary className="flex cursor-pointer items-center gap-2 list-none">
          <span className="text-xl">{p.icon}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-slate-100">{p.title}</span>
            <span className="block text-[11px] uppercase tracking-wide text-slate-500">{p.when}</span>
          </span>
          <span className="shrink-0 text-xs text-pitch-400">View plan ›</span>
        </summary>
        <div className="mt-3">{body}</div>
      </details>
    );
  }
  return (
    <div className={`card p-4 ${highlight ? "border-readiness-red/25" : ""}`}>
      <div className="flex items-center gap-2">
        <span className="text-xl">{p.icon}</span>
        <div>
          <div className="text-sm font-bold text-slate-100">{p.title}</div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">{p.when}</div>
        </div>
      </div>
      {body}
    </div>
  );
}

function ProtocolBody({ p, onOpenExercise }: {
  p: RecoveryProtocol;
  onOpenExercise?: (ex: Exercise) => void;
}) {
  return (
    <>
      <ul className="mt-3 space-y-1.5 text-sm text-slate-300">
        {p.steps.map((s) => <li key={s} className="flex gap-2"><span className="text-pitch-400">✓</span>{s}</li>)}
      </ul>

      {/* Staged return-to-play — progress on criteria, not on dates. */}
      {p.stages && (
        <details className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <summary className="cursor-pointer text-sm font-semibold text-pitch-400">
            Return-to-play plan ({p.stages.length} stages)
          </summary>
          <ol className="mt-3 space-y-3">
            {p.stages.map((st) => (
              <li key={st.phase} className="border-l-2 border-pitch-500/40 pl-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-slate-100">{st.phase}</span>
                  <span className="chip text-slate-400">{st.window}</span>
                </div>
                <p className="mt-1 text-sm text-slate-300">{st.focus}</p>
                <p className="mt-1 text-xs text-slate-500">
                  <span className="font-semibold text-slate-400">Move on when:</span> {st.criteria}
                </p>
              </li>
            ))}
          </ol>
        </details>
      )}

      {p.redFlags && (
        <div className="mt-3 rounded-xl border border-readiness-red/30 bg-readiness-red/[0.06] p-3">
          <div className="text-xs font-bold uppercase tracking-wide text-readiness-red">🚩 Stop and get assessed if</div>
          <ul className="mt-1.5 space-y-1 text-sm text-slate-300">
            {p.redFlags.map((f) => <li key={f} className="flex gap-2"><span className="text-readiness-red">•</span>{f}</li>)}
          </ul>
        </div>
      )}

      {p.exerciseIds && (
        <div className="mt-3">
          <div className="stat-label mb-1.5">Rehab exercises</div>
          <div className="flex flex-wrap gap-1.5">
            {p.exerciseIds.map((id) => {
              const ex = getExercise(id);
              if (!ex) return null;
              return (
                <button key={id} onClick={() => onOpenExercise?.(ex)} className="chip hover:border-pitch-500/50 hover:text-pitch-400">
                  {ex.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
