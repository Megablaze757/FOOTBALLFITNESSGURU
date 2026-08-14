"use client";

import { daysAgoLocal } from "@/lib/day";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAsync } from "@/lib/use-async";
import { summarizeTraining, summarizeNutrition } from "@/lib/history";
import { MiniBars } from "@/components/MiniBars";
import { ShareButton } from "@/components/ShareButton";
import { ExerciseProgress } from "@/components/ExerciseProgress";
import { StrengthRanks } from "@/components/StrengthRanks";
import { FeatureLock, tierOfSub } from "@/components/FeatureLock";
import { can } from "@/lib/subscription";
import type { NutritionLog, Subscription, TrainingLog } from "@/lib/types";

// The bars and totals are a month. Strength moves slower than that — a squat
// that added 10kg over the winter shows nothing across four weeks — so the
// per-exercise chart gets a quarter to work with.
const WINDOW_DAYS = 30;
const EXERCISE_WINDOW_DAYS = 90;

/**
 * What you've actually done: volume, per-lift progression, most-trained drills,
 * nutrition. The output half of "how am I doing".
 *
 * Extracted from its own page so it can live as a tab beside the recovery half
 * rather than as a separate destination. Two pages both answering "how am I
 * doing", with one linking to the other, was one page with a door in it.
 */
export function ProgressPanel({ userId }: { userId: string }) {
  // Local days. These are compared against `check_in_date` and `log_date`,
  // which are the athlete's local day — a UTC cutoff pulls in or drops a day
  // for anyone not on UTC. See lib/day.ts.
  const since = daysAgoLocal(WINDOW_DAYS);
  const sinceLong = daysAgoLocal(EXERCISE_WINDOW_DAYS);

  const { data, loading } = useAsync(async () => {
    const supabase = createClient();
    // One query for the wider window, sliced below — cheaper than asking twice.
    const [{ data: training }, { data: nutrition }, { data: profile }, { data: sub }] = await Promise.all([
      supabase.from("training_logs").select("*").eq("user_id", userId).gte("log_date", sinceLong).order("log_date", { ascending: true }),
      supabase.from("nutrition_logs").select("*").eq("user_id", userId).gte("log_date", since).order("log_date", { ascending: true }),
      supabase.from("profiles").select("full_name, weight_kg, sex").eq("id", userId).maybeSingle(),
      supabase.from("subscriptions").select("*").eq("user_id", userId).maybeSingle(),
    ]);
    const all = (training ?? []) as TrainingLog[];
    return {
      training: all.filter((l) => l.log_date >= since),
      trainingLong: all,
      nutrition: (nutrition ?? []) as NutritionLog[],
      name: profile?.full_name ?? "Athlete",
      // Ranks are multiples of bodyweight, so both of these are load-bearing.
      // Already on the row that was being fetched for the name — no extra query.
      weightKg: (profile as { weight_kg?: number | null } | null)?.weight_kg ?? null,
      sex: ((profile as { sex?: string | null } | null)?.sex === "female" ? "female" : "male") as "male" | "female",
      sub: (sub ?? null) as Subscription | null,
    };
  }, [userId], `history:v2:${userId}`);

  if (loading) {
    return (
      <div className="space-y-4">
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
    <div className="space-y-5">
      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="field-label !mb-0">Training volume</h2>
            <p className="text-[11px] text-slate-500">Last {WINDOW_DAYS} days</p>
          </div>
          <span className="text-xs text-slate-400">{t.totalSessions} sessions · {t.totalReps.toLocaleString()} reps</span>
        </div>
        {hasTraining ? <MiniBars data={t.volume} color="#e3b53f" unit=" reps" /> : <Empty label="Log training in your daily check-in." />}
      </section>

      {/* AM I STRONG — which is a different question from am I improving, and
          the one the volume bars and the per-lift chart both leave unanswered.
          Sits above the chart because a rank is the headline and a trend line
          is the evidence for it. */}
      <StrengthRanks
        logs={data?.trainingLong ?? []}
        weightKg={data?.weightKg ?? null}
        sex={data?.sex ?? "male"}
      />

      {/* The one chart that answers "am I getting stronger", which is why it's
          the thing worth paying for. */}
      {can(tierOfSub(data?.sub), "exercise_analytics") ? (
        <ExerciseProgress logs={data?.trainingLong ?? []} windowDays={EXERCISE_WINDOW_DAYS} />
      ) : (
        <FeatureLock
          capability="exercise_analytics"
          title="See every lift's progress"
          blurb="Pick any exercise and watch it climb — estimated one-rep max, total volume and the date of every personal best, over the last three months."
        />
      )}

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

      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="field-label !mb-0">Nutrition</h2>
          {n.avgCalories != null && <span className="text-xs text-slate-400">avg {n.avgCalories.toLocaleString()} kcal · {n.avgProtein}g protein</span>}
        </div>
        {hasNutrition ? (
          <div className="space-y-4">
            <Labeled title="Calories"><MiniBars data={n.calories} color="#e3b53f" unit=" kcal" height={72} emptyLabel="Log what you eat on the Nutrition page." /></Labeled>
            <Labeled title="Protein"><MiniBars data={n.protein} color="#fb7185" unit="g" height={64} emptyLabel="Comes from your nutrition log." /></Labeled>
            <Labeled title="Water"><MiniBars data={n.water} color="#38bdf8" unit="L" height={64} emptyLabel="Comes from your nutrition log." /></Labeled>
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
        <Link href="/benchmarks" className="btn-ghost">💪 Benchmarks</Link>
        <Link href="/nutrition" className="btn-ghost">🥗 Nutrition</Link>
        <Link href="/body" className="btn-ghost">📸 Weight</Link>
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
