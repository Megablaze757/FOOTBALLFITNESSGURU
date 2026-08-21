"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAsync } from "@/lib/use-async";
import { daysAgoLocal } from "@/lib/day";
import { RangeToggle } from "@/components/admin/RangeToggle";

/**
 * The two tables support gets asked about, and could not see.
 *
 * WEIGHTS: "my weight is wrong" is unanswerable from the outside. Bodyweight is
 * written from two places — the check-in and /body — and read by four, so the
 * first question is always "which number, recorded when, and by which screen".
 * Both sources are listed here, together, because the disagreement between them
 * IS the usual bug.
 *
 * CUSTOM EXERCISES: an athlete adding a movement is telling you the library is
 * missing it. Thirty people adding "Copenhagen plank" is a catalogue entry
 * waiting to be written, and until now nobody could see that happening. The
 * count is the signal, so the list is grouped by name rather than by row.
 *
 * READ-ONLY, and narrow on purpose. A name, a number, a date. Not a check-in,
 * not a pain map, not a message.
 */

interface WeightRow {
  user_id: string; kg: number; on: string; source: "check-in" | "weigh-in";
}

const RANGES = [7, 30, 90] as const;

export function WeightLogs() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [who, setWho] = useState("");

  const { data, loading } = useAsync(async () => {
    const supabase = createClient();
    const since = daysAgoLocal(days);
    const [checkIns, weighIns, names] = await Promise.all([
      supabase.from("daily_check_ins").select("user_id, check_in_date, weight_kg")
        .not("weight_kg", "is", null).gte("check_in_date", since)
        .order("check_in_date", { ascending: false }).limit(400),
      supabase.from("body_logs").select("user_id, log_date, weight_kg")
        .not("weight_kg", "is", null).gte("log_date", since)
        .order("log_date", { ascending: false }).limit(400),
      supabase.from("profiles").select("id, full_name").limit(1000),
    ]);
    const byId = new Map(((names.data ?? []) as { id: string; full_name: string | null }[])
      .map((p) => [p.id, p.full_name ?? "—"]));
    const rows: WeightRow[] = [
      ...((checkIns.data ?? []) as { user_id: string; check_in_date: string; weight_kg: number }[])
        .map((r) => ({ user_id: r.user_id, kg: Number(r.weight_kg), on: r.check_in_date, source: "check-in" as const })),
      ...((weighIns.data ?? []) as { user_id: string; log_date: string; weight_kg: number }[])
        .map((r) => ({ user_id: r.user_id, kg: Number(r.weight_kg), on: r.log_date, source: "weigh-in" as const })),
    ].sort((a, b) => b.on.localeCompare(a.on));
    return { rows, byId, error: checkIns.error?.message ?? weighIns.error?.message ?? null };
  }, [days], `admin-weights:${days}`);

  const shown = useMemo(() => {
    const needle = who.trim().toLowerCase();
    if (!needle) return data?.rows ?? [];
    return (data?.rows ?? []).filter((r) =>
      (data?.byId.get(r.user_id) ?? "").toLowerCase().includes(needle) || r.user_id.startsWith(needle));
  }, [who, data]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block flex-1">
          <span className="field-label">Filter by name or user id</span>
          <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="all athletes" className="field" />
        </label>
        <RangeToggle value={days} options={RANGES} onChange={setDays} />
      </div>

      {data?.error ? (
        <p className="text-sm text-readiness-yellow">
          {/permission|policy|row-level/i.test(data.error)
            ? "Run migration 0095 — admins cannot read body_logs yet."
            : data.error}
        </p>
      ) : loading ? (
        <p className="py-2 text-center text-sm text-slate-500">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="py-2 text-center text-sm text-slate-500">No weights recorded in this window.</p>
      ) : (
        <div className="max-h-96 overflow-auto">
          <table className="w-full min-w-[440px] text-left text-sm">
            <thead className="sticky top-0 bg-ink-900 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="py-2 pr-3">Athlete</th><th className="py-2 pr-3">Weight</th><th className="py-2 pr-3">Date</th><th className="py-2">Where from</th></tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {shown.slice(0, 200).map((r, i) => (
                <tr key={`${r.user_id}-${r.on}-${r.source}-${i}`}>
                  <td className="py-2 pr-3 text-xs text-slate-300">{data?.byId.get(r.user_id) ?? r.user_id.slice(0, 8)}</td>
                  <td className="py-2 pr-3 text-sm font-semibold tabular-nums text-slate-100">{r.kg} kg</td>
                  <td className="py-2 pr-3 text-xs tabular-nums text-slate-400">{r.on}</td>
                  <td className="py-2 text-xs text-slate-500">{r.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-slate-500">
        Both sources, interleaved. Where the same day appears twice, the weigh-in is the one the app uses —
        the scale is the instrument and the check-in slider is memory. See lib/bodyweight.ts.
      </p>
    </div>
  );
}

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
