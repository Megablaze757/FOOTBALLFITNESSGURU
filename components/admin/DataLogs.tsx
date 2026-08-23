"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAsync } from "@/lib/use-async";
import { daysAgoLocal } from "@/lib/day";
import { RangeToggle } from "@/components/admin/RangeToggle";

/**
 * What support can see, which is deliberately very little.
 *
 * CUSTOM EXERCISES: an athlete adding a movement is telling you the library is
 * missing it. Thirty people adding "Copenhagen plank" is a catalogue entry
 * waiting to be written, and until now nobody could see that happening. The
 * count is the signal, so the list is grouped by name rather than by row. It is
 * about the CATALOGUE, not about the person — the name is here only so the
 * count means something.
 *
 * THERE WAS A WEIGHT TABLE HERE and it is gone. It listed every athlete's
 * bodyweight against their name, from both the check-in and the scale, so that
 * support could answer "my weight is wrong". That is a real question and this
 * was a real answer to it, and it still was not worth an internal screen that
 * shows what everybody in the app weighs. Migration 0096 drops the read policy
 * that fed it, because deleting a component while leaving the grant open is not
 * a privacy fix, it is a privacy fix you cannot see failing.
 */

export function CustomExerciseLog() {
  const { data, loading } = useAsync(async () => {
    const supabase = createClient();
    const [rows, names] = await Promise.all([
      supabase.from("custom_exercises").select("id, name, coach_id, category, created_at")
        .order("created_at", { ascending: false }).limit(500),
      supabase.from("profiles").select("id, full_name").limit(1000),
    ]);
    const byId = new Map(((names.data ?? []) as { id: string; full_name: string | null }[])
      .map((p) => [p.id, p.full_name ?? "—"]));
    return {
      rows: (rows.data ?? []) as { id: string; name: string; coach_id: string; category: string; created_at: string }[],
      byId,
      error: rows.error?.message ?? null,
    };
  }, [], "admin-custom-exercises");

  /**
   * Grouped by name, because the COUNT is the point.
   *
   * One person adding a movement is noise. Thirty people adding the same one is
   * the catalogue telling you what it is missing, and a flat list sorted by
   * date buries exactly that.
   */
  const grouped = useMemo(() => {
    const byName = new Map<string, { name: string; count: number; people: Set<string>; latest: string; category: string }>();
    for (const row of data?.rows ?? []) {
      const key = row.name.trim().toLowerCase();
      const held = byName.get(key);
      if (held) {
        held.count += 1;
        held.people.add(row.coach_id);
        if (row.created_at > held.latest) held.latest = row.created_at;
      } else {
        byName.set(key, { name: row.name.trim(), count: 1, people: new Set([row.coach_id]), latest: row.created_at, category: row.category });
      }
    }
    return [...byName.values()].sort((a, b) => b.count - a.count || b.latest.localeCompare(a.latest));
  }, [data]);

  if (data?.error) {
    return (
      <p className="text-sm text-readiness-yellow">
        {/permission|policy|row-level/i.test(data.error)
          ? "Run migration 0095 — admins cannot read custom_exercises yet."
          : data.error}
      </p>
    );
  }
  if (loading) return <p className="py-2 text-center text-sm text-slate-500">Loading…</p>;
  if (grouped.length === 0) return <p className="py-2 text-center text-sm text-slate-500">Nobody has added their own exercise yet.</p>;

  return (
    <div className="space-y-3">
      <div className="max-h-96 overflow-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="sticky top-0 bg-ink-900 text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="py-2 pr-3">Exercise</th><th className="py-2 pr-3">Added by</th><th className="py-2 pr-3">Times</th><th className="py-2">Last added</th></tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {grouped.slice(0, 200).map((g) => (
              <tr key={g.name}>
                <td className="py-2 pr-3 text-sm text-slate-100">
                  {g.name}
                  <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-600">{g.category}</span>
                </td>
                <td className="py-2 pr-3 text-xs text-slate-400">
                  {g.people.size === 1
                    ? data?.byId.get([...g.people][0]) ?? "—"
                    : `${g.people.size} people`}
                </td>
                <td className="py-2 pr-3 text-sm font-semibold tabular-nums text-slate-200">{g.count}</td>
                <td className="py-2 text-xs tabular-nums text-slate-500">{g.latest.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">
        Anything several people have added is a movement the library should carry. Adding it to
        lib/exercises.ts gives it a demo, coaching cues and muscle labels that a typed name never gets.
      </p>
    </div>
  );
}
