"use client";

import { BackLink } from "@/components/BackLink";
import { EmptyState } from "@/components/EmptyState";
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
    const { data: prof } = await supabase.from("profiles").select("sport").eq("id", user.id).maybeSingle();
    return { rows: (rows ?? []) as StrengthBenchmark[], sport: (prof as { sport?: string } | null)?.sport ?? null };
  }, [user.id], `benchmarks:${user.id}`);

  const benchmarks = data?.rows ?? [];
  const latestByMetric = computeLatest(benchmarks);

  return (
    <div className="animate-fade-up mx-auto max-w-3xl space-y-5">
      <header className="flex flex-col">
        <BackLink href="/dashboard" label="Performance" />
        <h1 className="text-3xl font-extrabold tracking-tight">Benchmarks</h1>
        <p className="mt-1 text-sm text-slate-400">Test the same lifts and sprints now and then, so progress is measured rather than guessed.</p>
      </header>

      <BenchmarkForm onSaved={reload} sport={data?.sport} />

      {Object.keys(latestByMetric).length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
          /* "No tests logged yet." named the state and stopped. On a page whose
             entire point is measuring rather than guessing, the empty state is
             the best chance to explain why one number today is worth having —
             and to say it's a two-minute job, not a programme. */
          <div className="card">
            <EmptyState
              icon="📏"
              title="Nothing to compare against yet"
              // No button: the form that fills this is already on screen, a
              // few hundred pixels up. A CTA scrolling you to something you can
              // see is worse than a sentence pointing at it.
              body="One number today is enough to start — use the form above. Test the same thing again in a month and you'll know whether the training worked, instead of guessing from how you felt."
            />
          </div>
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
