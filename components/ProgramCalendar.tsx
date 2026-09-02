"use client";

import { useState } from "react";
import type { ProgramWeek } from "@/lib/coach";
import { DrillModal } from "@/components/DrillDetail";
import { SessionDrills } from "@/components/SessionDrills";
import { sessionLength } from "@/lib/session-time";
import { WeeklyVolume } from "@/components/WeeklyVolume";
import { sessionExerciseCount } from "@/lib/program-preferences";

// Week-by-week program calendar you tick through. Each session is a tile;
// completing one calls onToggle (which also logs it to training).
export function ProgramCalendar({
  weeks, completed, onToggle,
}: {
  weeks: ProgramWeek[];
  completed: string[];
  onToggle: (sid: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);

  // The first week with unfinished sessions is the one you're on.
  const currentWeek =
    weeks.find((w) => w.sessions.some((s) => !completed.includes(`w${w.week}d${s.day}`)))?.week
    ?? weeks[weeks.length - 1]?.week;

  return (
    <section className="space-y-4">
      <h2 className="field-label">Your {weeks.length}-week program</h2>

      {weeks.map((w) => {
        const wDone = w.sessions.filter((s) => completed.includes(`w${w.week}d${s.day}`)).length;
        // Rendering every week expanded made this block over half the page on a
        // phone. Open the week you're actually working through; fold the rest.
        const isCurrent = w.week === currentWeek;
        return (
          <details key={w.week} open={isCurrent} className="group card p-3 sm:p-4">
            {/* THE WHOLE ROW OPENS THE WEEK, and it says so.
                This was a summary with no padding and no marker: the hit area
                was the height of the text, "Open" appeared only on folded weeks
                and looked like a label rather than a control, and there was no
                chevron to say the row did anything at all. On a phone that is a
                row you have to aim at to read your own programme. */}
            <summary className="tap-target -mx-1 flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-2 py-2 transition hover:bg-white/[0.04] group-open:mb-4">
              <span className="min-w-0">
                <span className="block font-bold text-slate-100">Week {w.week} · {w.theme}</span>
                <span className="block text-xs text-slate-400">
                  {w.intensity} intensity · {w.sessions.length} session{w.sessions.length === 1 ? "" : "s"}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
                <span className="tabular-nums">{wDone}/{w.sessions.length}</span>
                <span className="text-sm transition group-open:rotate-180" aria-hidden>▾</span>
              </span>
            </summary>

            {w.focusNote && (
              <p className="mb-3 rounded-lg border border-pitch-400/20 bg-pitch-400/[0.05] px-3 py-2 text-xs text-accent-300">
                {w.focusNote}
              </p>
            )}

            {/* Folded by default. It answers a question you only sometimes have,
                and the sessions are what you came to this screen for. */}
            <WeeklyVolume week={w} />

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {w.sessions.map((s) => {
                const sid = `w${w.week}d${s.day}`;
                const done = completed.includes(sid);
                return (
                  <div
                    key={sid}
                    className={`rounded-2xl border p-4 transition ${
                      s.kind === "active_rest"
                        ? "border-sky-400/15 bg-sky-400/[0.035]"
                        : done ? "border-pitch-400/30 bg-pitch-400/[0.06]" : "border-white/10 bg-white/[0.03]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Day {s.day}</div>
                        <div className="break-words text-sm font-semibold text-slate-100">{s.title.replace(/^.*· /, "")}</div>
                        {/* Whether it fits today, on the card you plan from. */}
                        <div className="text-[11px] text-slate-500">
                          {s.kind === "active_rest"
                            ? `${s.durationMinutes ?? 30} min · RPE ${s.rpe ?? 3}`
                            : `${sessionLength(s)} · ${sessionExerciseCount(s)} exercises`}
                        </div>
                      </div>
                      <button
                        onClick={() => onToggle(sid)}
                        aria-label={done ? "Mark session not done" : "Mark session done"}
                        className={`tap-pad relative grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs transition ${
                          done ? "border-pitch-400 bg-pitch-400 text-on-accent" : "border-white/20 text-transparent hover:border-pitch-400/60"
                        }`}
                      >
                        ✓
                      </button>
                    </div>
                    {s.notes && <p className="mt-2 text-xs text-slate-500">{s.notes}</p>}
                    {s.drills.length > 0 && <div className="mt-2">
                      <SessionDrills
                        drills={s.drills}
                        compact
                        onPick={setOpen}
                      />
                    </div>}
                  </div>
                );
              })}
            </div>
          </details>
        );
      })}

      {open && <DrillModal name={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
