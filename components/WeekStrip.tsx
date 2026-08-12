"use client";

import Link from "next/link";

/**
 * The last seven days, as seven dots.
 *
 * WHY IT EXISTS. Home was cut down to one card — the right call, because eleven
 * stacked sections meant nothing said where to start. But it left the page with
 * nothing to show the moment the day's three quests were ticked, which is
 * exactly when an athlete has earned something to look at. Finish everything
 * and the reward was an emptier screen than when you arrived.
 *
 * WHY A STRIP, NOT NUMBERS. "4 sessions this week" is a fact. Seven dots with a
 * visible gap in them is a habit — you can see the Thursday you missed, and
 * that is the thing that makes anyone train on the next Thursday. It's also the
 * gamification the app already leans on, applied to the behaviour that actually
 * matters rather than to a points total.
 *
 * The data was already being fetched and thrown away: `week` was computed on
 * Home and rendered nowhere.
 */
export function WeekStrip({ days, sessions, minutes, accent, complete }: {
  days: { iso: string; letter: string; checkedIn: boolean; trained: boolean }[];
  sessions: number;
  minutes: number;
  /**
   * NOT the sport accent any more.
   *
   * It used to take it, on the reasoning that the strip should belong to the
   * same athlete as the rest of the page. In practice that made the seven-day
   * tracker orange for rugby (#f0824a) and basketball (#fb923c) — the two
   * accents nearest the warning colours — so the card that tells you the week
   * has gone well read like something was wrong with it.
   *
   * It is Progress's teal for everybody now, which is also the colour of the
   * page this strip links to. Sport tailoring belongs in what the app SAYS —
   * positions, drills, the vocabulary in lib/sport-terms.ts — rather than in
   * recolouring a chart per user until some of them get an ugly one.
   */
  accent: string;
  /** All of today's quests are done — the card leads with that. */
  complete: boolean;
}) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-100">
            {complete ? "That's today done" : "Your last 7 days"}
          </h2>
          {/* An empty week gets told what fills it, not that it's empty. Seven
              blank dots and "nothing logged yet" is the first thing a new
              athlete sees on Home, and it reads as a broken feature rather than
              a habit waiting to start. */}
          <p className="mt-0.5 text-xs text-slate-500">
            {sessions === 0
              ? "Log a session in your check-in and these fill in."
              : `${sessions} session${sessions === 1 ? "" : "s"}${
                  minutes > 0 ? ` · ${hours > 0 ? `${hours}h ` : ""}${mins}m` : ""
                }`}
          </p>
        </div>
        <Link href="/dashboard" className="tap-target -mr-2 shrink-0 gap-1 px-2 text-xs font-semibold text-slate-400 hover:text-pitch-400">
          Progress <span aria-hidden>→</span>
        </Link>
      </div>

      <ol className="mt-4 flex items-end justify-between gap-1">
        {days.map((d, i) => {
          const isToday = i === days.length - 1;
          return (
            <li key={d.iso} className="flex flex-1 flex-col items-center gap-1.5">
              {/* Two marks, not one: checking in and training are different
                  things, and a single dot would make a day you checked in but
                  rested look identical to one you skipped entirely. */}
              <span
                className="grid h-9 w-full max-w-[38px] place-items-center rounded-xl border transition"
                style={{
                  borderColor: d.trained ? accent : "rgba(255,255,255,0.08)",
                  background: d.trained ? `${accent}22` : "rgba(255,255,255,0.02)",
                }}
                // The visual carries three states; a screen reader needs them said.
                // `role="img"` is required, not decoration: aria-label is
                // prohibited on a bare <span> and browsers are free to drop it,
                // so all seven labels were silently going nowhere. A dot that
                // means "trained" IS a graphic, so this is also the honest role.
                role="img"
                aria-label={`${d.iso}: ${d.trained ? "trained" : "no session"}${d.checkedIn ? ", checked in" : ""}`}
              >
                <span
                  className="h-2 w-2 rounded-full transition"
                  style={{
                    background: d.checkedIn ? accent : "rgba(255,255,255,0.15)",
                  }}
                  aria-hidden
                />
              </span>
              <span className={`text-[10px] font-semibold uppercase ${isToday ? "text-slate-300" : "text-slate-600"}`} aria-hidden>
                {d.letter}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="mt-3 text-[11px] text-slate-600">
        Outline = trained · dot = checked in
      </p>
    </div>
  );
}
