"use client";

import { getExercise, type Exercise } from "@/lib/exercises";
import { Icon } from "@/components/Icon";
import type { RecoveryProtocol } from "@/lib/essentials";

/**
 * A rehab protocol, as a row you open — not a wall you scroll past.
 *
 * NOTHING EXPANDS BY DEFAULT ANY MORE. Each protocol carries five steps, four
 * red flags, a four-stage return-to-play plan and five exercises — about 175
 * words. The `highlight` variant rendered all of that open, and the injury page
 * used it for every area the athlete's last check-in flagged. Two sore areas
 * meant ~350 words of somebody else's rehab plan on arrival, before they had
 * tapped anything.
 *
 * That is the "wall of text" complaint precisely, and it came from a well-meant
 * decision: if we know your ankle hurts, show you the ankle protocol. Knowing
 * which protocol is relevant is the useful part. Dumping it open is not.
 *
 * So `relevant` now changes the *marking* — a gold edge and a badge — while
 * every card stays shut until asked. The information is one tap away and the
 * page is a list you can see the whole of.
 */
export function ProtocolCard({ p, relevant, reason, onOpenExercise }: {
  p: RecoveryProtocol;
  /** Matches what they told us — gets an accent and a badge, not an open body. */
  relevant?: boolean;
  /** Why it's relevant, e.g. "from your log". Shown on the badge. */
  reason?: string;
  onOpenExercise?: (ex: Exercise) => void;
}) {
  return (
    <details
      className={`group/p card overflow-hidden transition ${
        relevant ? "border-pitch-400/30" : ""
      }`}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
        <Icon name={p.icon} size={22} className="text-pitch-400" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2">
            <span className="text-sm font-bold text-slate-100">{p.title}</span>
            {relevant && (
              <span className="rounded-full bg-pitch-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-pitch-400">
                {reason ?? "for you"}
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-[11px] uppercase tracking-wide text-slate-500">{p.when}</span>
        </span>
        <span className="shrink-0 text-xs text-slate-500 transition group-open/p:rotate-180" aria-hidden>▾</span>
      </summary>
      <div className="border-t border-white/[0.08] p-4">
        <ProtocolBody p={p} onOpenExercise={onOpenExercise} />
      </div>
    </details>
  );
}

function ProtocolBody({ p, onOpenExercise }: {
  p: RecoveryProtocol;
  onOpenExercise?: (ex: Exercise) => void;
}) {
  return (
    <>
      {/* The steps are what someone opened this for. Everything else on the
          card is reference and sits below or behind a disclosure. */}
      <ul className="space-y-1.5 text-sm text-slate-300">
        {p.steps.map((s) => <li key={s} className="flex gap-2"><span className="text-pitch-400">✓</span>{s}</li>)}
      </ul>

      {p.exerciseIds && (
        <div className="mt-3">
          <div className="stat-label mb-1.5">Rehab exercises</div>
          <div className="flex flex-wrap gap-1.5">
            {p.exerciseIds.map((id) => {
              const ex = getExercise(id);
              if (!ex) return null;
              return (
                <button key={id} onClick={() => onOpenExercise?.(ex)} className="chip-option chip-option-sm hover:border-pitch-500/50 hover:text-pitch-400">
                  {ex.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Staged return-to-play — progress on criteria, not on dates. Behind a
          disclosure because it is four stages of prose you need in week two,
          not in the first thirty seconds. */}
      {p.stages && (
        <details className="group/rtp mt-3 rounded-xl border border-white/10 bg-white/[0.02]">
          <summary className="flex cursor-pointer list-none items-center justify-between p-3 text-sm font-semibold text-pitch-400">
            <span>Return-to-play plan <span className="font-normal text-slate-500">({p.stages.length} stages)</span></span>
            <span className="text-xs text-slate-500 transition group-open/rtp:rotate-180" aria-hidden>▾</span>
          </summary>
          <ol className="space-y-3 border-t border-white/[0.06] p-3">
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

      {/* Red flags stay OUT of a disclosure. Everything else here can wait; a
          sign that means stop and get assessed cannot be behind a tap. Kept
          tight so it reads as a checklist rather than a paragraph. */}
      {p.redFlags && (
        <div className="mt-3 rounded-xl border border-readiness-red/30 bg-readiness-red/[0.06] p-3">
          <div className="text-xs font-bold uppercase tracking-wide text-readiness-red">🚩 Stop and get assessed if</div>
          <ul className="mt-1.5 space-y-1 text-sm text-slate-300">
            {p.redFlags.map((f) => <li key={f} className="flex gap-2"><span className="text-readiness-red">•</span>{f}</li>)}
          </ul>
        </div>
      )}
    </>
  );
}
