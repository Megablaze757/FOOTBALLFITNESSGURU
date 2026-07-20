"use client";

import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { summarizeTraining, summarizeNutrition } from "@/lib/history";
import { MiniBars } from "@/components/MiniBars";
import { ShareButton } from "@/components/ShareButton";
import type { NutritionLog, TrainingLog } from "@/lib/types";

export default function HistoryPage() {
  const user = useCurrentUser();
  const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);

  const { data, loading } = useAsync(async () => {
    const supabase = createClient();
    const [{ data: training }, { data: nutrition }, { data: profile }] = await Promise.all([
      supabase.from("training_logs").select("*").eq("user_id", user.id).gte("log_date", since).order("log_date", { ascending: true }),
      supabase.from("nutrition_logs").select("*").eq("user_id", user.id).gte("log_date", since).order("log_date", { ascending: true }),
      supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    ]);
    return { training: (training ?? []) as TrainingLog[], nutrition: (nutrition ?? []) as NutritionLog[], name: profile?.full_name ?? "Athlete" };
  }, [user.id], `history:${user.id}`);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-9 w-40 animate-pulse rounded-lg bg-white/5" />
        <div className="card h-40 animate-pulse" />
        <div className="card h-40 animate-pulse" />
      </div>
    );
  }

  const t = summarizeTraining(data?.training ?? []);
  const n = summarizeNutrition(data?.nutrition ?? []);
  const hasTraining = (data?.training?.length ?? 0) > 0;
  const hasNutrition = (data?.nutrition?.length ?? 0) > 0;

  return (
    <div className="animate-fade-up mx-auto max-w-3xl space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Progress</h1>
          <p className="mt-1 text-sm text-slate-400">Last 30 days — how you&apos;ve improved.</p>
        </div>
        <Link href="/dashboard" className="text-sm text-slate-400 hover:text-pitch-400">← Back</Link>
      </header>

      {/* Training */}
      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="field-label !mb-0">Training volume</h2>
          <span className="text-xs text-slate-400">{t.totalSessions} sessions · {t.totalReps.toLocaleString()} reps</span>
        </div>
        {hasTraining ? <MiniBars data={t.volume} color="#e3b53f" unit=" reps" /> : <Empty label="Log training in your daily check-in." />}
      </section>

      {/* Drill frequency leaderboard */}
      {t.drillFrequency.length > 0 && (
        <section className="card p-5">
          <h2 className="field-label">Most-trained drills</h2>
          <ul className="space-y-2">
            {t.drillFrequency.slice(0, 6).map((d, i) => (
              <li key={d.name} className="flex items-center gap-3">
                <span className="w-5 text-center text-sm font-bold text-pitch-400">{i + 1}</span>
                <span className="flex-1 text-sm text-slate-200">{d.name}</span>
                <span className="text-xs text-slate-400">{d.sessions}× · {d.totalSets} sets{d.bestLoad ? ` · ${d.bestLoad}kg PR` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Nutrition */}
      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="field-label !mb-0">Nutrition</h2>
          {n.avgCalories != null && <span className="text-xs text-slate-400">avg {n.avgCalories.toLocaleString()} kcal · {n.avgProtein}g protein</span>}
        </div>
        {hasNutrition ? (
          <div className="space-y-4">
            <Labeled title="Calories"><MiniBars data={n.calories} color="#e3b53f" unit=" kcal" height={72} /></Labeled>
            <Labeled title="Protein"><MiniBars data={n.protein} color="#fb7185" unit="g" height={64} /></Labeled>
            <Labeled title="Water"><MiniBars data={n.water} color="#38bdf8" unit="L" height={64} /></Labeled>
          </div>
        ) : (
          <Empty label="Track nutrition to see trends." />
        )}
      </section>

      <ShareButton
        stats={{
          name: data?.name ?? "Athlete",
          headlineValue: `${t.totalSessions}`,
          headlineLabel: "sessions this month",
          stats: [
            { label: "Total reps", value: t.totalReps.toLocaleString() },
            ...(t.drillFrequency[0]?.bestLoad ? [{ label: `${t.drillFrequency[0].name} PR`, value: `${t.drillFrequency[0].bestLoad}kg` }] : []),
            ...(n.avgProtein != null ? [{ label: "Avg protein", value: `${n.avgProtein}g` }] : []),
          ].slice(0, 3),
          caption: "Train smarter. Recover faster.",
        }}
      />

      <div className="grid grid-cols-3 gap-3">
        <Link href="/benchmarks" className="btn-ghost">💪 PRs</Link>
        <Link href="/nutrition" className="btn-ghost">🥗 Food</Link>
        <Link href="/body" className="btn-ghost">📸 Body</Link>
      </div>
    </div>
  );
}

function Labeled({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-slate-400">{title}</div>
      {children}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <p className="rounded-2xl bg-white/[0.04] px-4 py-6 text-center text-xs text-slate-500">{label}</p>;
}
