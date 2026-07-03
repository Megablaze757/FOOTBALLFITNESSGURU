"use client";

import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { BenchmarkForm } from "@/components/BenchmarkForm";
import { METRIC_CATALOG, metricDef, improvementDelta } from "@/lib/benchmarks";
import type { StrengthBenchmark } from "@/lib/types";

export default function BenchmarksPage() {
  const user = useCurrentUser();

  const { data, loading, reload } = useAsync(async () => {
    const supabase = createClient();
    const { data: rows } = await supabase
      .from("strength_benchmarks")
      .select("*")
      .eq("user_id", user.id)
      .order("test_date", { ascending: false })
      .limit(20);
    return (rows ?? []) as StrengthBenchmark[];
  }, [user.id]);

  const benchmarks = data ?? [];
  const latestByMetric = computeLatest(benchmarks);

  return (
    <div className="animate-fade-up space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Benchmarks</h1>
          <p className="mt-1 text-sm text-slate-400">Track strength &amp; speed over time.</p>
        </div>
        <Link href="/dashboard" className="text-sm text-slate-400 hover:text-pitch-400">← Back</Link>
      </header>

      <BenchmarkForm onSaved={reload} />

      {Object.keys(latestByMetric).length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {METRIC_CATALOG.filter((m) => latestByMetric[m.key]).map((m) => {
            const entry = latestByMetric[m.key];
            const def = metricDef(m.key);
            return (
              <div key={m.key} className="card p-4">
                <div className="stat-label">{def.label}</div>
                <div className="mt-1 text-2xl font-extrabold text-slate-100">
                  {entry.value}
                  <span className="ml-1 text-sm font-normal text-slate-500">{def.unit}</span>
                </div>
                {entry.delta != null && entry.delta !== 0 && (
                  <div className={`text-xs font-medium ${entry.delta > 0 ? "text-readiness-green" : "text-readiness-red"}`}>
                    {entry.delta > 0 ? "▲" : "▼"} {Math.abs(entry.delta)} {def.unit} since last
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <section>
        <h2 className="field-label mb-2">History</h2>
        {loading ? (
          <div className="card h-24 animate-pulse" />
        ) : !benchmarks.length ? (
          <p className="card px-4 py-8 text-center text-sm text-slate-500">No tests logged yet.</p>
        ) : (
          <ul className="space-y-2">
            {benchmarks.map((b) => (
              <li key={b.id} className="card p-4">
                <div className="mb-1 text-sm font-semibold text-slate-100">{b.test_date}</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-300">
                  {Object.entries(b.metrics).map(([k, v]) => (
                    <span key={k}>{metricDef(k).label}: <span className="font-medium text-pitch-400">{v}</span> {metricDef(k).unit}</span>
                  ))}
                </div>
                {b.notes && <p className="mt-1 text-xs italic text-slate-500">{b.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function computeLatest(rows: StrengthBenchmark[]): Record<string, { value: number; delta: number | null }> {
  const result: Record<string, { value: number; delta: number | null }> = {};
  for (const metric of METRIC_CATALOG) {
    const history = rows.filter((r) => typeof r.metrics?.[metric.key] === "number").map((r) => r.metrics[metric.key]);
    if (!history.length) continue;
    const [latest, previous] = history;
    result[metric.key] = {
      value: latest,
      delta: previous != null ? +improvementDelta(metric.key, latest, previous).toFixed(2) : null,
    };
  }
  return result;
}
