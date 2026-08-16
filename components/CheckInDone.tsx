"use client";

import Link from "next/link";
import type { CheckInInput, TrainingLog, ReadinessStatus } from "@/lib/types";
import { assessReadiness } from "@/lib/readiness";
import { hasTrainingContent } from "@/lib/load";
import { describeSets, warmupSetsOf } from "@/lib/training-sets";

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
}: {
  checkIn: Partial<CheckInInput>;
  training: TrainingLog | null;
  streak: number;
  /** Acute:chronic load ratio — must be the same value Home scores with. */
  acwr: number | null;
  editing: boolean;
  onEdit: () => void;
  onAddTraining: () => void;
}) {
  const readiness = assessReadiness(checkIn as CheckInInput, { acwr });
  const color = STATUS_COLOR[readiness.status];

  const trained = hasTrainingContent(training);

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
                {training?.session_type === "active_rest" ? "Active rest logged" : "Training logged"}
                {training?.total_minutes ? ` — ${training.total_minutes} min` : ""}
                {training?.distance_km ? `, ${training.distance_km} km` : ""}
              </span>
            </div>
            {training?.notes && <p className="pl-5 text-xs text-slate-500">{training.notes}</p>}
            {(training?.drills ?? []).length > 0 && (
              <ul className="space-y-1 pl-5 text-xs text-slate-400">
                {training!.drills.map((d, i) => {
                  const warmups = warmupSetsOf(d);
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

        <div className="flex items-center justify-between gap-3 pt-1">
          {streak > 1 ? (
            <span className="chip text-pitch-400">🔥 {streak} days in a row</span>
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
    <div className="bg-ink-900 px-3 py-3 text-center">
      <dt className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className={`mt-1 truncate text-sm font-bold ${tone === "warn" ? "text-readiness-red" : "text-slate-100"}`}>
        {value}
      </dd>
    </div>
  );
}
