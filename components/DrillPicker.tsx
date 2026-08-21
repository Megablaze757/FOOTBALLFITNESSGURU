"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getExercisesForSport, exerciseEquip, rowToExercise, type Exercise, type SportId } from "@/lib/exercises";
import { customExerciseRow } from "@/lib/exercise-guess";
import type { TrainingDrill } from "@/lib/types";
import { exerciseMeasure, formatMeasuredDose } from "@/lib/exercise-measure";

function starterDose(name: string): TrainingDrill {
  const measure = exerciseMeasure(name);
  if (measure === "seconds") return { name, sets: 3, reps: 0, load_kg: null, measure, duration_seconds: 30 };
  if (measure === "metres") return { name, sets: 3, reps: 0, load_kg: null, measure, distance_m: 30 };
  return { name, sets: 3, reps: 10, load_kg: null, measure: "reps" };
}

/**
 * Search the exercise library, or take what's already scheduled for today.
 *
 * Logging used to be a free-text box with six hardcoded suggestions, so the
 * 250-movement library the athlete browses elsewhere was unreachable at the one
 * moment they need it — and the drills their own program prescribed had to be
 * retyped from memory, spelled differently every time. Names that don't match
 * the library also break the history leaderboard and the load calculations,
 * which key on the drill name.
 *
 * "MY CUSTOM EXERCISES DISAPPEAR — I HAVE TO RE-ADD THEM EVERY TIME."
 *
 * They were right, and it was two separate holes meeting.
 *
 * The pool was `getExercisesForSport(sport)` — the static catalogue, and only
 * that. An exercise saved through CustomExerciseForm showed up on the library
 * page, which loads `custom_exercises` and merges it in, and was invisible here
 * at the one moment it exists to be used. So the search said "nothing matches"
 * about a movement the athlete had personally entered.
 *
 * And the way out of that dead end was the free-text row below this picker,
 * which appends `{ name: "" }` to the log and saves it nowhere. It logs the
 * session correctly and teaches the app nothing, so the next check-in asks for
 * the same name again, spelled slightly differently, and the history for that
 * movement quietly splits in two.
 *
 * Both halves are fixed here: the athlete's own exercises join the pool, and a
 * name the library has never heard of can be added to it from the search box.
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
  const [mine, setMine] = useState<Exercise[]>([]);
  const [saving, setSaving] = useState(false);
  const already = useMemo(() => new Set(chosen.map((n) => n.toLowerCase())), [chosen]);

  // Their own exercises, and any their coach has authored — the same query the
  // library page runs. RLS decides who owns what; there is no filter to pass.
  useEffect(() => {
    let active = true;
    createClient().from("custom_exercises").select("*").then(({ data }) => {
      if (active && data) setMine(data.map(rowToExercise));
    });
    return () => { active = false; };
  }, []);

  const pool = useMemo(() => {
    const library = getExercisesForSport(sport);
    const known = new Set(library.map((e) => e.name.toLowerCase()));
    // Their own first. A name somebody typed themselves is the name they will
    // search for, and it should not sit under eight library near-misses.
    return [...mine.filter((e) => !known.has(e.name.toLowerCase())), ...library];
  }, [sport, mine]);

  const query = q.trim();
  const results = useMemo(() => {
    const needle = query.toLowerCase();
    if (needle.length < 2) return [];
    const hit = (e: Exercise) =>
      e.name.toLowerCase().includes(needle) || e.muscles.some((m) => m.toLowerCase().includes(needle));
    // Names that start with the query first — typing "squat" should surface
    // "Squat" before "Bulgarian split squat".
    return pool.filter(hit)
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(needle) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(needle) ? 0 : 1;
        return aStarts - bStarts || a.name.localeCompare(b.name);
      })
      .slice(0, 8);
  }, [query, pool]);

  // Offered whenever the library has no entry by exactly this name — not only
  // when the search comes back empty. "Zercher squat" returns six squats and
  // none of them are the one they did.
  const exact = results.some((e) => e.name.toLowerCase() === query.toLowerCase());
  const canAdd = query.length >= 2 && !exact && !already.has(query.toLowerCase());

  /**
   * Log it now, save it in the background.
   *
   * The log is the thing the athlete asked for and it must never wait on a
   * round trip or fail with it — offline, signed out, RLS refusing, the set
   * still gets recorded. Saving is what stops them typing it again next week.
   */
  async function addAndKeep(name: string) {
    onAdd(starterDose(name));
    setQ("");

    const supabase = createClient();
    const { data: session } = await supabase.auth.getSession();
    const owner = session.session?.user.id;
    if (!owner) return;
    if (mine.some((e) => e.name.toLowerCase() === name.toLowerCase())) return;

    setSaving(true);
    const { data } = await supabase
      .from("custom_exercises").insert(customExerciseRow(name, owner)).select("*").maybeSingle();
    setSaving(false);
    if (data) setMine((list) => [rowToExercise(data), ...list]);
  }

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
                className="tap-target rounded-full border border-pitch-400/30 bg-pitch-400/[0.07] px-3 py-1.5 text-xs font-medium text-pitch-400 transition hover:bg-pitch-400/15"
              >
                + {d.name} <span className="text-pitch-400/60">{formatMeasuredDose(d)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search exercises, or type your own…"
          className="field py-2"
          aria-label="Search exercises"
        />
        {query.length >= 2 && (
          <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
            {results.map((e) => {
              const used = already.has(e.name.toLowerCase());
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    disabled={used}
                    onClick={() => { onAdd(starterDose(e.name)); setQ(""); }}
                    className="flex min-h-[44px] w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-left transition hover:bg-white/[0.06] disabled:opacity-40"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-100">
                        {e.name}
                        {e.custom && <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-pitch-400">yours</span>}
                      </span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {e.muscles[0] ?? e.category} · {exerciseEquip(e)}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-pitch-400">{used ? "added" : "+"}</span>
                  </button>
                </li>
              );
            })}

            {canAdd && (
              <li>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void addAndKeep(query)}
                  className="flex min-h-[44px] w-full items-center gap-2 rounded-xl border border-dashed border-pitch-400/40 bg-pitch-400/[0.05] px-3 py-2 text-left transition hover:bg-pitch-400/[0.12] disabled:opacity-40"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-pitch-400">
                      {results.length === 0 ? "Nothing matches — add" : "Add"} &ldquo;{query}&rdquo;
                    </span>
                    <span className="block truncate text-[11px] text-slate-500">
                      Logs it now and keeps it, so it&apos;s here next time
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-pitch-400">{saving ? "…" : "+"}</span>
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
