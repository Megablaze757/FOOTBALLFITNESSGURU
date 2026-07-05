"use client";

import { createClient } from "@/lib/supabase/client";
import { useAsync } from "@/lib/use-async";
import { CustomExerciseForm } from "@/components/CustomExerciseForm";

interface Row { id: string; name: string; category: string; sport: string | null }

// Coach's team-exercise manager: list + add form + delete. Shown on /squad.
export function TeamExercises({ coachId }: { coachId: string }) {
  const { data, loading, reload } = useAsync(async () => {
    const { data } = await createClient()
      .from("custom_exercises").select("id, name, category, sport")
      .eq("coach_id", coachId).order("created_at", { ascending: false });
    return (data ?? []) as Row[];
  }, [coachId]);

  async function remove(id: string) {
    await createClient().from("custom_exercises").delete().eq("id", id);
    reload();
  }

  const rows = data ?? [];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="field-label !mb-0">Team exercises</h2>
        <span className="text-xs text-slate-500">{rows.length} added</span>
      </div>
      <p className="text-xs text-slate-400">Drills you add here appear in your athletes&apos; exercise library.</p>

      <CustomExerciseForm coachId={coachId} onAdded={reload} />

      {loading ? (
        <div className="card h-16 animate-pulse" />
      ) : rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="card flex items-center justify-between p-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-100">{r.name}</div>
                <div className="text-xs text-slate-500">{r.category}{r.sport ? ` · ${r.sport}` : ""}</div>
              </div>
              <button onClick={() => remove(r.id)} className="shrink-0 text-xs text-slate-400 hover:text-readiness-red">Remove</button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
