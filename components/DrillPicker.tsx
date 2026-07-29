"use client";

import { useMemo, useState } from "react";
import { getExercisesForSport, exerciseEquip, type Exercise, type SportId } from "@/lib/exercises";
import type { TrainingDrill } from "@/lib/types";

/**
 * Search the exercise library, or take what's already scheduled for today.
 *
 * Logging used to be a free-text box with six hardcoded suggestions, so the
 * 250-movement library the athlete browses elsewhere was unreachable at the one
 * moment they need it — and the drills their own program prescribed had to be
 * retyped from memory, spelled differently every time. Names that don't match
 * the library also break the history leaderboard and the load calculations,
 * which key on the drill name.
 */
export function DrillPicker({ planned, chosen, onAdd, sport = "all" }: {
  planned: TrainingDrill[];
  chosen: string[];
  onAdd: (drill: TrainingDrill) => void;
  /**
   * The athlete's sport. Searched the whole library regardless before, so a
   * rugby player typing "drill" got football-only work back — the library page
   * has filtered by sport for ages and this, the other way into the same
   * catalogue, did not.
   */
  sport?: SportId | "all";
}) {
  const [q, setQ] = useState("");
  const already = useMemo(() => new Set(chosen.map((n) => n.toLowerCase())), [chosen]);

  const pool = useMemo(() => getExercisesForSport(sport), [sport]);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (query.length < 2) return [];
    const hit = (e: Exercise) =>
      e.name.toLowerCase().includes(query) || e.muscles.some((m) => m.toLowerCase().includes(query));
    // Names that start with the query first — typing "squat" should surface
    // "Squat" before "Bulgarian split squat".
    return pool.filter(hit)
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(query) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(query) ? 0 : 1;
        return aStarts - bStarts || a.name.localeCompare(b.name);
      })
      .slice(0, 8);
  }, [q, pool]);

  const remaining = planned.filter((d) => !already.has(d.name.toLowerCase()));

  return (
    <div className="space-y-3">
      {/* Today's plan first — it's the most likely answer to "what did you do?" */}
      {remaining.length > 0 && (
        <div>
          <span className="mb-1.5 block text-xs text-slate-500">From today&apos;s session — tap to log</span>
          <div className="flex flex-wrap gap-2">
            {remaining.map((d) => (
              <button
                key={d.name}
                type="button"
                onClick={() => onAdd({ ...d })}
                className="rounded-full border border-pitch-400/30 bg-pitch-400/[0.07] px-3 py-1.5 text-xs font-medium text-pitch-400 transition hover:bg-pitch-400/15"
              >
                + {d.name} <span className="text-pitch-400/60">{d.sets}×{d.reps}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search the exercise library…"
          className="field py-2"
          aria-label="Search exercises"
        />
        {q.trim().length >= 2 && (
          <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
            {results.length === 0 ? (
              <li className="px-1 py-2 text-xs text-slate-500">
                Nothing matches — add it as a custom drill below.
              </li>
            ) : results.map((e) => {
              const used = already.has(e.name.toLowerCase());
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    disabled={used}
                    onClick={() => { onAdd({ name: e.name, sets: 3, reps: 10, load_kg: null }); setQ(""); }}
                    className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-left transition hover:bg-white/[0.06] disabled:opacity-40"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-100">{e.name}</span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {e.muscles[0] ?? e.category} · {exerciseEquip(e)}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-pitch-400">{used ? "added" : "+"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
