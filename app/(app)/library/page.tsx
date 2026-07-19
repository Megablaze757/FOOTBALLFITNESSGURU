"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { EXERCISES, EXERCISE_CATEGORIES, SPORTS, DIFFICULTIES, EQUIPMENT_BUCKETS, getExercisesForSport, demoImplement, rowToExercise, exerciseEquip, withinLevel, type Exercise, type ExerciseCategory, type SportId, type Difficulty } from "@/lib/exercises";
import { ExerciseDemo } from "@/components/ExerciseDemo";
import { ExerciseModal } from "@/components/ExerciseDetail";

// How many cards to render at once. Every card carries an animated SVG demo, so
// showing all 300+ was both a 44-screen page and a scrolling performance issue.
const PAGE = 24;

const DIFF_COLOR: Record<Difficulty, string> = { easy: "#34d399", medium: "#e3b53f", advanced: "#fb5d6b" };
const DIFF_LABEL: Record<Difficulty, string> = { easy: "Beginner", medium: "Intermediate", advanced: "Advanced" };

export default function LibraryPage() {
  const user = useCurrentUser();
  const [sport, setSport] = useState<SportId | "all">("all");
  const [cat, setCat] = useState<ExerciseCategory | "All">("All");
  const [level, setLevel] = useState<Difficulty>("advanced");
  const [equip, setEquip] = useState<string | "all">("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Exercise | null>(null);
  const [custom, setCustom] = useState<Exercise[]>([]);
  const [shown, setShown] = useState(PAGE);

  // Default to the athlete's sport + level, and pull in coach-authored exercises.
  useEffect(() => {
    let active = true;
    const supabase = createClient();
    supabase.from("profiles").select("sport, level").eq("id", user.id).maybeSingle().then(({ data }) => {
      const p = data as { sport?: string; level?: string } | null;
      if (active && p?.sport && SPORTS.some((sp) => sp.id === p.sport)) setSport(p.sport as SportId);
      if (active && (p?.level === "easy" || p?.level === "medium" || p?.level === "advanced")) setLevel(p.level);
    });
    supabase.from("custom_exercises").select("*").then(({ data }) => {
      if (active && data) setCustom(data.map(rowToExercise));
    });
    return () => { active = false; };
  }, [user.id]);

  const list = useMemo(() => {
    const all = [...custom, ...getExercisesForSport(sport)];
    const query = q.trim().toLowerCase();
    return all.filter((e) =>
      (sport === "all" || !e.sports || e.sports.includes(sport)) &&
      (cat === "All" || e.category === cat) &&
      withinLevel(e, level) &&
      (equip === "all" || exerciseEquip(e) === equip) &&
      (!query || e.name.toLowerCase().includes(query) || e.muscles.some((m) => m.toLowerCase().includes(query)))
    );
  }, [sport, cat, level, equip, q, custom]);

  // Narrowing the filters shouldn't leave you deep in a previous page.
  useEffect(() => { setShown(PAGE); }, [sport, cat, level, equip, q]);

  return (
    <div className="animate-fade-up space-y-4">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Exercise library</h1>
        <p className="mt-1 text-sm text-slate-400">{EXERCISES.length} exercises — filter by sport, level, equipment &amp; muscle.</p>
      </header>

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exercises or muscles…" className="field" />

      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        <Pill label="All sports" active={sport === "all"} onClick={() => setSport("all")} small />
        {SPORTS.map((s) => (
          <Pill key={s.id} label={`${s.emoji} ${s.label}`} active={sport === s.id} onClick={() => setSport(s.id)} small />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="self-center text-xs text-slate-500">Level ≤</span>
        {DIFFICULTIES.map((d) => (
          <Pill key={d.id} label={d.label} active={level === d.id} onClick={() => setLevel(d.id)} small />
        ))}
      </div>

      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        <Pill label="Any kit" active={equip === "all"} onClick={() => setEquip("all")} small />
        {EQUIPMENT_BUCKETS.map((eq) => (
          <Pill key={eq} label={eq} active={equip === eq} onClick={() => setEquip(eq)} small />
        ))}
      </div>

      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        <Pill label="All" active={cat === "All"} onClick={() => setCat("All")} small />
        {EXERCISE_CATEGORIES.map((c) => (
          <Pill key={c} label={c} active={cat === c} onClick={() => setCat(c)} small />
        ))}
      </div>

      <p className="text-xs text-slate-500">
        {list.length} exercises{list.length > shown ? ` · showing ${shown}` : ""}
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.slice(0, shown).map((ex) => (
          <button
            key={ex.id}
            onClick={() => setOpen(ex)}
            className="card card-hover flex items-center gap-4 p-4 text-left"
          >
            <span className="grid h-20 w-16 shrink-0 place-items-center rounded-2xl border border-white/10 bg-black/40">
              <ExerciseDemo pattern={ex.demo} implement={demoImplement(ex)} animated={false} className="h-16 w-12" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                {ex.difficulty && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: DIFF_COLOR[ex.difficulty] }} title={DIFF_LABEL[ex.difficulty]} />}
                <span className="truncate text-xs text-slate-400">{ex.muscles[0] ?? ex.category} · {exerciseEquip(ex)}</span>
              </span>
              <span className="mt-1 block truncate font-bold text-slate-100">{ex.name}</span>
            </span>
          </button>
        ))}
      </div>
      {list.length === 0 && <p className="card px-4 py-8 text-center text-sm text-slate-500">No exercises match those filters.</p>}

      {list.length > shown && (
        <button onClick={() => setShown((n) => n + PAGE)} className="btn-ghost">
          Show {Math.min(PAGE, list.length - shown)} more
        </button>
      )}

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
