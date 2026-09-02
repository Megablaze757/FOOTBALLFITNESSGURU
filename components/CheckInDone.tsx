"use client";

import Link from "next/link";
import { whatTomorrowBrings, shouldAskForPush, type FirstWeekContext } from "@/lib/first-week";
import { PushToggle } from "@/components/PushToggle";
import { isActivityDrill, activityMinutes, matchActivity, PARTS_OF_DAY } from "@/lib/activities";
import type { CheckInInput, TrainingLog, ReadinessStatus } from "@/lib/types";
import { assessReadiness } from "@/lib/readiness";
import { hasTrainingContent } from "@/lib/load";
import { describeSets, warmupSetsOf } from "@/lib/training-sets";
import { dayBurn, burnRangeLabel, burnBasisNote } from "@/lib/energy";

const STATUS_COLOR: Record<ReadinessStatus, string> = {
  Green: "#34d399",
  Yellow: "#fbbf24",
  Red: "#fb5d6b",
};

/**
 * What the athlete sees when today's check-in is already done.
 *
 * WHY THIS EXISTS. Tapping "Check in" after you'd already checked in dropped you
 * straight back onto the full pre-filled form, with one line of grey text above
 * it saying you'd already logged. That reads as "you didn't do it properly, go
 * again" — the exact feeling this app is trying to get rid of for someone
 * fitting training around school or a job. It also wasted the one moment the
 * athlete is guaranteed to be paying attention: they've just given us data, and
 * we answered with an empty-looking chore.
 *
 * So the done state leads with the ANSWER (what their numbers mean today) and
 * offers one clear next thing, with editing demoted to a quiet link. The form
 * still exists and nothing is locked — it just stops being the greeting.
 */
export function CheckInDone({
  checkIn,
  training,
  streak,
  acwr,
  editing,
  onEdit,
  onAddTraining,
  weightKg,
  sex,
  age,
  firstWeek,
}: {
  checkIn: Partial<CheckInInput>;
  training: TrainingLog | null;
  streak: number;
  /** Profile bodyweight, for the days they did not type one into the log. */
  weightKg?: number | null;
  /** Both needed by the Keytel equation — the same heart rate is different work in different bodies. */
  sex?: "male" | "female" | null;
  age?: number | null;
  /**
   * Where they are in their first week, or null once they are past it.
   *
   * The done screen is the one moment somebody has just done the thing and is
   * looking for a sign it mattered — and on the very first check-in it rendered
   * an empty span, because the streak chip needs `streak > 1`.
   */
  firstWeek?: FirstWeekContext | null;
  /** Acute:chronic load ratio — must be the same value Home scores with. */
  acwr: number | null;
  editing: boolean;
  onEdit: () => void;
  onAddTraining: () => void;
}) {
  const readiness = assessReadiness(checkIn as CheckInInput, { acwr });
  const color = STATUS_COLOR[readiness.status];

  const trained = hasTrainingContent(training);

  /**
   * Sessions, not exercises.
   *
   * A day can be spin at seven and padel at one, or rugby training and then the
   * gym. Reporting that back as "Training logged — 135 min" hides the harder
   * fact: they trained twice. The count is what the athlete recognises, and it
   * is the thing the load numbers are actually reacting to.
   */
  const sessions = (training?.drills ?? []).filter(isActivityDrill).length;

  /**
   * WHAT THE DAY COST, estimated per session rather than for the day as a lump.
   *
   * Weight comes from today's entry when they gave one and from the profile
   * otherwise; with neither there is no estimate, which is the honest outcome —
   * every method here scales with bodyweight and guessing it would make the
   * number decorative.
   */
  const burn = dayBurn(
    (training?.drills ?? []).filter(isActivityDrill).map((d) => ({
      activityId: matchActivity(d.name)?.id ?? null,
      minutes: activityMinutes(d),
      intensity: d.effort ?? training?.intensity ?? null,
      // Only when there is one session to attribute it to.
      avgHr: sessions <= 1 ? training?.avg_hr ?? null : null,
      sex,
      age,
    })),
    {
      weightKg: checkIn.weight_kg ?? weightKg ?? null,
      minutes: training?.total_minutes ?? null,
      intensity: training?.intensity ?? null,
      distanceKm: training?.distance_km ?? null,
      strength: (training?.drills ?? []).some((d) => !isActivityDrill(d)),
      // A measured heart rate outranks everything above it — see lib/energy.ts.
      // It is on the DAY's log rather than per drill, so it only applies when
      // the whole day was one session; a day of spin plus padel has one HR
      // reading and two activities, and attributing it to both would double it.
      avgHr: sessions <= 1 ? training?.avg_hr ?? null : null,
      sex,
      age,
    },
  );

  const sleep = checkIn.sleep_quality ?? null;
  const fatigue = checkIn.fatigue_score ?? null;

  return (
    <section className="card overflow-hidden p-0">
      <div className="flex items-start gap-4 p-5">
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-xl font-black"
          style={{ background: `${color}22`, color }}
          aria-hidden="true"
        >
          ✓
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold tracking-tight text-slate-100">
            Checked in today
          </h2>
          <p className="mt-0.5 text-sm text-slate-400">{readiness.advice}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-3xl font-extrabold tabular-nums leading-none" style={{ color }}>
            {readiness.score}
          </div>
          <div className="mt-1 text-[0.65rem] font-bold uppercase tracking-[0.15em]" style={{ color }}>
            {readiness.status}
          </div>
        </div>
      </div>

      {/* The three numbers they just gave us, reflected back. Seeing the input
          turn into something is the whole reward for filling it in. */}
      <dl className="grid grid-cols-3 gap-px border-t border-white/10 bg-white/10">
        <Stat label="Sleep" value={sleep !== null ? `${sleep}/10` : "—"} />
        <Stat label="Fatigue" value={fatigue !== null ? `${fatigue}/10` : "—"} />
        <Stat
          label={readiness.focus_body_part ? "Watch" : "Soreness"}
          value={readiness.focus_body_part ?? "None"}
          tone={readiness.focus_body_part ? "warn" : undefined}
        />
      </dl>

      <div className="space-y-3 border-t border-white/10 p-5">
        {trained ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <span className="text-pitch-400">✓</span>
              <span>
                {training?.session_type === "rest_day"
                  ? "Rest day logged"
                  : training?.session_type === "active_rest"
                    ? "Active rest logged"
                    : sessions > 1 ? `${sessions} sessions logged` : "Training logged"}
                {/* A stopwatch reading is right for one session and wrong for
                    a day: "135:00" next to two sessions reads as a clock that
                    ran for two and a quarter hours without stopping. */}
                {sessions > 1 && training?.total_minutes
                  ? ` — ${training.total_minutes} min`
                  : training?.duration_seconds
                    ? ` — ${Math.floor(training.duration_seconds / 60)}:${String(training.duration_seconds % 60).padStart(2, "0")}`
                    : training?.total_minutes ? ` — ${training.total_minutes} min` : ""}
                {training?.distance_value
                  ? `, ${training.distance_value} ${training.distance_unit ?? "km"}`
                  : training?.distance_km ? `, ${training.distance_km} km` : ""}
              </span>
            </div>
            {/* WHAT IT PROBABLY COST, as a range.
                A single figure would be a precision nobody has: without a
                heart-rate trace the honest spread is a fifth either way, and on
                lifting it is nearer a half. See lib/energy.ts — which is also
                why this is shown and never added to the calorie target. */}
            {burn && (
              <p className="pl-5 text-xs text-slate-500">
                <span className="font-semibold text-slate-400">~{burnRangeLabel(burn)}</span>
                {" burned · "}{burnBasisNote(burn)}
              </p>
            )}
            {training?.notes && <p className="pl-5 text-xs text-slate-500">{training.notes}</p>}
            {(training?.drills ?? []).length > 0 && (
              <ul className="space-y-1 pl-5 text-xs text-slate-400">
                {training!.drills.map((d, i) => {
                  const warmups = warmupSetsOf(d);
                  // An activity is measured in minutes, and describeSets would
                  // read it as "1 × 60" — a padel match reported as one set of
                  // sixty reps. See lib/activities.ts.
                  if (isActivityDrill(d)) {
                    // When and how hard, because that is what tells two
                    // sessions apart — "Padel 60" twice in a list is a typo
                    // until one of them says morning and the other evening.
                    const when = PARTS_OF_DAY.find((p) => p.id === d.part_of_day);
                    return (
                      <li key={`${d.name}-${i}`}>
                        <span aria-hidden className="mr-1">{matchActivity(d.name)?.emoji ?? "🏃"}</span>
                        <span className="text-slate-300">{d.name}</span>
                        {when ? ` · ${when.label}` : ""} · {activityMinutes(d)} min
                        {d.effort ? ` · ${d.effort}/10` : ""}
                      </li>
                    );
                  }
                  return (
                    <li key={`${d.name}-${i}`}>
                      <span className="text-slate-300">{d.name}</span> · {describeSets(d)}
                      {warmups.length > 0 && (
                        <span className="ml-1 rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-slate-500">
                          + {warmups.length} warm-up
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-300">
              Next: add what you actually did today, so your load and next
              session adjust to it.
            </p>
            <button type="button" onClick={onAddTraining} className="btn-primary w-full">
              Add today&apos;s training
            </button>
          </>
        )}

        <div className="flex flex-wrap gap-2">
          <Link href="/coach" className="tap-target flex-1 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center text-sm font-medium text-slate-200 transition hover:border-pitch-400/40 hover:text-pitch-400">
            See today&apos;s session
          </Link>
          {readiness.focus_body_part && (
            <Link href="/injury" className="tap-target flex-1 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center text-sm font-medium text-slate-200 transition hover:border-readiness-red/40">
              Sort out my {readiness.focus_body_part.toLowerCase()}
            </Link>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            WHAT TOMORROW ACTUALLY GIVES THEM.

            This is the moment the whole retention problem lives in: somebody
            has just logged for the first time, and the screen said nothing
            about coming back. Not a slogan — every line names a thing the app
            genuinely does on that specific day, because the second day is where
            a vague promise gets found out. See lib/first-week.ts.
            ═══════════════════════════════════════════════════════════════ */}
        {firstWeek && whatTomorrowBrings(firstWeek) && (
          <p className="rounded-2xl border border-pitch-400/20 bg-pitch-400/[0.06] px-4 py-3 text-sm leading-relaxed text-slate-200">
            {whatTomorrowBrings(firstWeek)}
          </p>
        )}

        {/* ASKED ONCE, AT THE ONE MOMENT THE ANSWER IS OBVIOUS.
            Push lived on the Profile page, which nobody opens in their first
            session. Asking on load is worse — the browser remembers a refusal
            forever and the athlete had no idea what they were being asked. On
            the second check-in they have just come back, which is exactly what
            a reminder is for. */}
        {firstWeek && shouldAskForPush(firstWeek) && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <p className="mb-2 text-sm font-semibold text-slate-100">That is two days. Want a nudge?</p>
            <p className="mb-2 text-xs leading-relaxed text-slate-400">
              One reminder in the morning, only on the days you have not logged. Off again whenever you like.
            </p>
            <PushToggle />
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-1">
          {streak > 1 ? (
            <span className="chip text-pitch-400">🔥 {streak} days in a row</span>
          ) : streak === 1 ? (
            /* Day one is a streak of one, and saying so is the difference
               between a number that has started and a blank space. */
            <span className="chip text-pitch-400">🔥 Day 1</span>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onEdit}
            className="tap-target text-sm font-medium text-slate-400 underline-offset-4 hover:text-slate-200 hover:underline"
            aria-expanded={editing}
          >
            {editing ? "Hide my answers" : "Change my answers"}
          </button>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="bg-surface-base px-3 py-3 text-center">
      <dt className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className={`mt-1 truncate text-sm font-bold ${tone === "warn" ? "text-readiness-red" : "text-slate-100"}`}>
        {value}
      </dd>
    </div>
  );
}
