"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { EXERCISES, EXERCISE_CATEGORIES, SPORTS, getExercisesForSport, demoImplement, rowToExercise, type Exercise, type ExerciseCategory, type SportId } from "@/lib/exercises";
import { ExerciseDemo } from "@/components/ExerciseDemo";
import { ExerciseModal } from "@/components/ExerciseDetail";

export default function LibraryPage() {
  const user = useCurrentUser();
  const [sport, setSport] = useState<SportId | "all">("all");
  const [cat, setCat] = useState<ExerciseCategory | "All">("All");
  const [open, setOpen] = useState<Exercise | null>(null);
  const [custom, setCustom] = useState<Exercise[]>([]);

  // Default to the athlete's sport, and pull in any coach-authored team exercises.
  useEffect(() => {
    let active = true;
    const supabase = createClient();
    supabase.from("profiles").select("sport").eq("id", user.id).maybeSingle().then(({ data }) => {
      const s = (data as { sport?: string } | null)?.sport as SportId | undefined;
      if (active && s && SPORTS.some((sp) => sp.id === s)) setSport(s);
    });
    supabase.from("custom_exercises").select("*").then(({ data }) => {
      if (active && data) setCustom(data.map(rowToExercise));
    });
    return () => { active = false; };
  }, [user.id]);

  const list = useMemo(() => {
    const all = [...custom, ...getExercisesForSport(sport)];
    const bySport = sport === "all" ? all : all.filter((e) => !e.sports || e.sports.includes(sport));
    return cat === "All" ? bySport : bySport.filter((e) => e.category === cat);
  }, [sport, cat, custom]);

  return (
    <div className="animate-fade-up space-y-5">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Exercise library</h1>
        <p className="mt-1 text-sm text-slate-400">{EXERCISES.length} coached exercises across every sport — demos, cues and why each one helps you.</p>
      </header>

      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        <Pill label="All sports" active={sport === "all"} onClick={() => setSport("all")} />
        {SPORTS.map((s) => (
          <Pill key={s.id} label={`${s.emoji} ${s.label}`} active={sport === s.id} onClick={() => setSport(s.id)} />
        ))}
      </div>

      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        <Pill label="All" active={cat === "All"} onClick={() => setCat("All")} small />
        {EXERCISE_CATEGORIES.map((c) => (
          <Pill key={c} label={c} active={cat === c} onClick={() => setCat(c)} small />
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((ex) => (
          <button
            key={ex.id}
            onClick={() => setOpen(ex)}
            className="card card-hover flex items-center gap-4 p-4 text-left"
          >
            <span className="grid h-20 w-16 shrink-0 place-items-center rounded-2xl border border-white/10 bg-black/40">
              <ExerciseDemo pattern={ex.demo} implement={demoImplement(ex)} className="h-16 w-12" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="chip text-pitch-400">{ex.category}</span>
              <span className="mt-1.5 block truncate font-bold text-slate-100">{ex.name}</span>
              <span className="mt-0.5 block truncate text-xs text-slate-400">{ex.tempo}</span>
            </span>
          </button>
        ))}
      </div>

      {open && <ExerciseModal ex={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Pill({ label, active, onClick, small }: { label: string; active: boolean; onClick: () => void; small?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border font-medium transition ${small ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-sm"} ${
        active ? "border-pitch-400/40 bg-pitch-400/10 text-pitch-400" : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]"
      }`}
    >
      {label}
    </button>
  );
}
