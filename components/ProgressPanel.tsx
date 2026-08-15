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
import { latestBodyweight } from "@/lib/bodyweight";
import { testedMaxesFrom } from "@/lib/strength-standards";
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
    const [{ data: training }, { data: nutrition }, { data: profile }, { data: sub },
           { data: weighCheck }, { data: weighBody }, { data: benchmarks }] = await Promise.all([
      supabase.from("training_logs").select("*").eq("user_id", userId).gte("log_date", sinceLong).order("log_date", { ascending: true }),
      supabase.from("nutrition_logs").select("*").eq("user_id", userId).gte("log_date", since).order("log_date", { ascending: true }),
      supabase.from("profiles").select("full_name, weight_kg, sex").eq("id", userId).maybeSingle(),
      supabase.from("subscriptions").select("*").eq("user_id", userId).maybeSingle(),
      /**
       * BODYWEIGHT, FROM WHEREVER IT WAS ACTUALLY ENTERED.
       *
       * This panel used to read profiles.weight_kg and nothing else. No screen
       * in this app writes that column — there is no weight field in onboarding
       * or on the profile page — so it is null for everybody, and the strength
       * ranks below have never once rendered. They showed "add your bodyweight
       * in your profile", naming a field that does not exist, to athletes who
       * had already entered their weight in the check-in. See lib/bodyweight.ts.
       *
       * Not windowed: ranks are best-ever, so an old weight still beats none.
       */
      supabase.from("daily_check_ins").select("check_in_date, weight_kg").eq("user_id", userId)
        .not("weight_kg", "is", null).order("check_in_date", { ascending: false }).limit(1),
      supabase.from("body_logs").select("log_date, weight_kg").eq("user_id", userId)
        .not("weight_kg", "is", null).order("log_date", { ascending: false }).limit(1),
      /**
       * TESTED MAXES. The Benchmarks page has been storing real, measured 1RMs
       * this whole time and the ranks below ignored every one of them — so an
       * athlete could test a 140kg squat and still be ranked on whatever their
       * five-rep sets estimated. Two answers to one question, on two tabs.
       *
       * Not windowed, for the same reason as the weight above: ranks are
       * best-ever, and a test ageing out would take its tier with it.
       */
      supabase.from("strength_benchmarks").select("test_date, metrics").eq("user_id", userId)
        .order("test_date", { ascending: false }),
    ]);
    const all = (training ?? []) as TrainingLog[];
    return {
      training: all.filter((l) => l.log_date >= since),
      trainingLong: all,
      nutrition: (nutrition ?? []) as NutritionLog[],
      name: profile?.full_name ?? "Athlete",
      // One number, one definition, every reader.
      bodyweight: latestBodyweight({
        checkIns: (weighCheck ?? []).map((r) => ({ date: r.check_in_date as string, kg: r.weight_kg as number })),
        weighIns: (weighBody ?? []).map((r) => ({ date: r.log_date as string, kg: r.weight_kg as number })),
        profileKg: (profile as { weight_kg?: number | null } | null)?.weight_kg ?? null,
      }),
      sex: ((profile as { sex?: string | null } | null)?.sex === "female" ? "female" : "male") as "male" | "female",
      sub: (sub ?? null) as Subscription | null,
      tested: testedMaxesFrom(benchmarks ?? []),
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
      {/**
        * THE ONE OBVIOUS TOP, which docs/UI-AUDIT.md holds every page to and
        * which this one did not have: it opened with a volume chart, and
        * "reps this month" is not what anybody comes here to find out.
        *
        * "Am I strong" is a different question from "am I improving", and it is
        * the one a rank answers. The volume bars and the per-lift chart below
        * are the evidence for it, in that order — headline first, then the
        * trend, then the detail.
        */}
      <StrengthRanks
        logs={data?.trainingLong ?? []}
        bodyweight={data?.bodyweight ?? null}
        sex={data?.sex ?? "male"}
        tested={data?.tested ?? []}
      />

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
