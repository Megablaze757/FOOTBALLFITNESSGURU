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
import { MuscleGains } from "@/components/MuscleGains";
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
           { data: weighCheck }, { data: weighBody }, { data: benchmarks }, { data: allDrills }] = await Promise.all([
      supabase.from("training_logs").select("*").eq("user_id", userId).gte("log_date", sinceLong).order("log_date", { ascending: true }),
      supabase.from("nutrition_logs").select("*").eq("user_id", userId).gte("log_date", since).order("log_date", { ascending: true }),
      // NOT weight_kg. That column does not exist on profiles — it lives on
      // daily_check_ins and body_logs — and naming it made PostgREST reject this
      // whole query, so this panel also had no name and no sex. See
      // lib/schema-columns.test.ts.
      supabase.from("profiles").select("full_name, sex").eq("id", userId).maybeSingle(),
      supabase.from("subscriptions").select("*").eq("user_id", userId).maybeSingle(),
      /**
       * BODYWEIGHT, FROM WHEREVER IT WAS ACTUALLY ENTERED.
       *
       * This panel used to read profiles.weight_kg and nothing else — a column
       * that DOES NOT EXIST. weight_kg lives on daily_check_ins and body_logs;
       * profiles has never had it. So the profile query above was rejected
       * outright, this panel had no name and no sex either, and the strength
       * ranks below have never once rendered. They told athletes to "add your
       * bodyweight in your profile", naming a field that does not exist, while
       * their weight sat in the check-in table. See lib/bodyweight.ts.
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
      /**
       * EVERY logged drill, not the 90-day window above.
       *
       * MuscleGains measures from your best effort in your FIRST four weeks on
       * a lift, and a 90-day window would silently make "since you started"
       * mean "since three months ago" — anchoring a beginner's baseline to a
       * point they were already strong at, and reporting a fraction of the real
       * gain. A label that says "since you started" has to be given the start.
       *
       * Two columns and only rows that carry drills, which is the same shape
       * the Rewards page already loads for the ranks.
       */
      supabase.from("training_logs").select("log_date, drills").eq("user_id", userId)
        .not("drills", "is", null).order("log_date", { ascending: true }),
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
      }),
      sex: ((profile as { sex?: string | null } | null)?.sex === "female" ? "female" : "male") as "male" | "female",
      sub: (sub ?? null) as Subscription | null,
      tested: testedMaxesFrom(benchmarks ?? []),
      allDrills: (allDrills ?? []) as TrainingLog[],
    };
    // v3: the payload gained allDrills. A cached v2 entry has no such key, so
    // the gains card would read [] and claim "not enough history yet" to
    // somebody with two years of it, until the background revalidation landed.
  }, [userId], `history:v3:${userId}`);

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
        // Full history, not the 90-day window: ranks are best-ever, and a PR
        // from last winter is still a PR. This panel was quietly capping them.
        logs={data?.allDrills ?? []}
        bodyweight={data?.bodyweight ?? null}
        sex={data?.sex ?? "male"}
        tested={data?.tested ?? []}
      />

      {/**
        * THE NUMBERS, AS NUMBERS.
        *
        * Four facts that were each wrapped in their own card with its own
        * heading, its own padding and its own chart — a whole screen of
        * furniture to say "22 sessions". Read at a glance instead, in the
        * strip that bridges the rank above to the evidence below.
        */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Sessions" value={t.totalSessions} sub={`last ${WINDOW_DAYS} days`} />
        <Stat label="Reps" value={t.totalReps.toLocaleString()} sub="total volume" />
        <Stat
          label="Bodyweight"
          value={data?.bodyweight ? `${data.bodyweight.kg}kg` : "—"}
          sub={data?.bodyweight ? data.bodyweight.source : "not logged"}
        />
        <Stat
          label="Protein"
          value={n.avgProtein != null ? `${n.avgProtein}g` : "—"}
          sub={n.avgProtein != null ? "daily average" : "not logged"}
        />
      </div>

      {/**
        * ONE SECTION FOR TRAINING, not three cards that happen to be adjacent.
        *
        * Volume, the per-lift chart and the drills you actually do are one
        * question — "what has my training been?" — and splitting them across
        * three identical panels made the page read as a list of widgets rather
        * than an answer. The rule docs/UI-AUDIT.md sets is one obvious top per
        * page; the corollary is that everything under it has to be visibly
        * subordinate, and five equal cards are five tops.
        */}
      <section className="card divide-y divide-white/[0.06]">
        <div className="p-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="field-label !mb-0">Training volume</h2>
            <span className="text-[11px] text-slate-500">Last {WINDOW_DAYS} days</span>
          </div>
          {hasTraining ? <MiniBars data={t.volume} color="#e3b53f" unit=" reps" /> : <Empty label="Log training in your daily check-in." />}
        </div>

        {t.drillFrequency.length > 0 && (
          <div className="p-5">
            <h2 className="field-label">Most-trained drills</h2>
            <ul className="space-y-2">
              {t.drillFrequency.slice(0, 6).map((d, i) => (
                <li key={d.name} className="flex items-center gap-3">
                  <span className="w-5 text-center text-sm font-bold text-pitch-400">{i + 1}</span>
                  <span className="flex-1 truncate text-sm text-slate-200">{d.name}</span>
                  <span className="shrink-0 text-xs text-slate-400">{d.sessions}× · {d.totalSets} sets{d.bestLoad ? ` · ${d.bestLoad}kg PR` : ""}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* HOW MUCH STRONGER, per part of the body. Sits between the rank and
          the per-lift chart because that is the order the questions come in:
          am I strong, how much have I gained, and then which lift and when. */}
      <MuscleGains logs={data?.allDrills ?? []} />

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

      {/**
        * FUEL, AND A DOOR TO THE PAGE THAT OWNS IT.
        *
        * Three full-height charts here were a second nutrition page inside the
        * training page, and the athlete who wants to act on any of it has to go
        * to /nutrition anyway. Trend, then the door — the heading is the link,
        * so the label you tap matches the heading you land on.
        */}
      <section className="card p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="field-label !mb-0">Fuel</h2>
          {n.avgCalories != null && (
            <span className="text-[11px] text-slate-500">avg {n.avgCalories.toLocaleString()} kcal · {n.avgProtein}g protein</span>
          )}
        </div>
        {hasNutrition ? (
          <div className="space-y-3">
            <Labeled title="Calories"><MiniBars data={n.calories} color="#e3b53f" unit=" kcal" height={56} emptyLabel="Log what you eat on the Nutrition page." /></Labeled>
            <div className="grid gap-3 sm:grid-cols-2">
              <Labeled title="Protein"><MiniBars data={n.protein} color="#fb7185" unit="g" height={44} emptyLabel="Comes from your nutrition log." /></Labeled>
              <Labeled title="Water"><MiniBars data={n.water} color="#38bdf8" unit="L" height={44} emptyLabel="Comes from your nutrition log." /></Labeled>
            </div>
          </div>
        ) : (
          <Empty label="Track nutrition to see trends." />
        )}
        <Link href="/nutrition" className="tap-target mt-3 inline-flex min-h-[44px] items-center text-sm font-semibold text-pitch-400">
          Open Nutrition <span aria-hidden className="ml-1">→</span>
        </Link>
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

      {/**
        * TWO DOORS, AND EACH ONE SAYS WHAT IT IS FOR.
        *
        * There were three, one of them to Nutrition — which is now the link on
        * the Fuel card itself, where the reason to go there is. A row of
        * equal-weight emoji buttons at the bottom of a page is a site map, not
        * a next step; these two say what the page cannot tell you and where
        * that answer lives.
        */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/benchmarks" className="btn-ghost !justify-start gap-3 text-left">
          <span aria-hidden className="text-lg">💪</span>
          <span>
            <span className="block text-sm font-semibold text-slate-100">Test a max</span>
            <span className="block text-[11px] text-slate-400">A tested lift outranks an estimate</span>
          </span>
        </Link>
        <Link href="/body" className="btn-ghost !justify-start gap-3 text-left">
          <span aria-hidden className="text-lg">⚖️</span>
          <span>
            <span className="block text-sm font-semibold text-slate-100">Weigh in</span>
            <span className="block text-[11px] text-slate-400">Every rank is a multiple of it</span>
          </span>
        </Link>
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

/** One fact, read at a glance. Tabular figures so the row does not jitter. */
function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="card p-3">
      <div className="stat-label">{label}</div>
      <div className="mt-0.5 text-xl font-extrabold tabular-nums text-slate-100">{value}</div>
      {sub && <div className="text-[10px] capitalize text-slate-500">{sub}</div>}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <p className="rounded-2xl bg-white/[0.04] px-4 py-6 text-center text-xs text-slate-500">{label}</p>;
}
