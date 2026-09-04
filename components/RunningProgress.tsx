"use client";

import Link from "next/link";
import { MiniBars } from "@/components/MiniBars";
import { ShareButton } from "@/components/ShareButton";
import { metricDef } from "@/lib/benchmarks";
import { formatPace, ZONE_LIST } from "@/lib/running";
import { summarizeRunProgress, type RunningProgressSummary } from "@/lib/run-progress";
import { todayLocal } from "@/lib/day";
import type { StrengthBenchmark, TrainingLog } from "@/lib/types";

export function RunningProgress({
  logs,
  benchmarks,
  name,
  distanceUnit,
  shareLink,
}: {
  logs: TrainingLog[];
  benchmarks: StrengthBenchmark[];
  name: string;
  distanceUnit: "km" | "mi";
  /** The athlete's own address for the share card — see athleteShareLink. */
  shareLink?: string;
}) {
  const summary = summarizeRunProgress(logs, benchmarks, todayLocal());
  const hasRuns = summary.current.runs > 0 || summary.previous.runs > 0;
  const headline = runningHeadline(summary, distanceUnit);
  const distance = (km: number) => formatKm(distanceUnit === "mi" ? km * 0.621371 : km);
  const pace = (secondsPerKm: number) => formatPace(distanceUnit === "mi" ? Math.round(secondsPerKm * 1.609344) : secondsPerKm);
  const converted = (km: number) => distanceUnit === "mi" ? km * 0.621371 : km;

  if (!hasRuns && !summary.races.length) {
    return (
      <div className="space-y-4">
        <section className="card border-l-4 border-l-sky-400 p-6">
          <span className="eyebrow text-sky-400">Your running baseline</span>
          <h2 className="mt-1 text-xl font-extrabold">Log one run to start measuring progress</h2>
          <p className="mt-2 max-w-prose text-sm text-slate-400">
            Add distance and duration to get pace and mileage. Choose the run type and zone to unlock
            Zone 2 progress and your easy-versus-hard split.
          </p>
        </section>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href="/journal" className="btn-primary">Log a run</Link>
          <Link href="/benchmarks" className="btn-ghost">Add a race result</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="card border-l-4 border-l-sky-400 p-5">
        <span className="eyebrow text-sky-400">Last 28 days</span>
        <h2 className="mt-1 text-lg font-extrabold leading-tight sm:text-xl">{headline.title}</h2>
        <p className="mt-2 max-w-prose text-sm text-slate-400">{headline.body}</p>
      </section>

      {summary.rank ? (
        <section className="card p-5">
          <div className="flex items-start gap-4">
            <div
              className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border text-2xl font-black shadow-card"
              style={{ color: summary.rank.colour, borderColor: `${summary.rank.colour}55`, background: `${summary.rank.colour}12` }}
              aria-hidden
            >
              {summary.rank.label.slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1">
              <span className="stat-label">Personal runner rank</span>
              <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-xl font-extrabold" style={{ color: summary.rank.colour }}>{summary.rank.label}</h2>
                <span className="text-xs tabular-nums text-slate-400">5k equivalent · {formatSeconds(summary.rank.best5kSeconds)}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.07]">
                <div className="h-full rounded-full" style={{ width: `${summary.rank.progressPct}%`, background: summary.rank.colour }} />
              </div>
              <div className="mt-1.5 flex justify-between gap-3 text-[10px] text-slate-500">
                <span>{summary.rank.improvementPct}% faster than your first test</span>
                <span>
                  {summary.rank.nextLabel && summary.rank.secondsToNext
                    ? `${formatSeconds(summary.rank.secondsToNext)} to ${summary.rank.nextLabel}`
                    : "Top rank"}
                </span>
              </div>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            Your 1500m, 5k and 10k results are converted to one 5k-equivalent scale. This rank rewards improvement against your own baseline, not age or sex.
          </p>
        </section>
      ) : (
        <Link href="/benchmarks" className="card flex items-center justify-between gap-3 p-4 hover:border-sky-400/20">
          <span>
            <span className="block text-sm font-bold text-slate-100">Unlock your runner rank</span>
            <span className="block text-xs text-slate-500">Log a 1500m, 5k or 10k result as your baseline</span>
          </span>
          <span className="text-sky-400" aria-hidden>→</span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <RunStat
          label="Distance"
          value={`${distance(summary.current.distanceKm)}${distanceUnit}`}
          sub={comparison(converted(summary.distanceDeltaKm), converted(summary.previous.distanceKm), distanceUnit)}
        />
        <RunStat
          label="Time running"
          value={formatDuration(summary.current.durationMinutes)}
          sub={`${summary.current.runs} run${summary.current.runs === 1 ? "" : "s"}`}
        />
        <RunStat
          label="Average pace"
          value={summary.current.avgPaceSecPerKm ? `${pace(summary.current.avgPaceSecPerKm)}/${distanceUnit}` : "—"}
          sub={paceComparison(summary.current.avgPaceSecPerKm, summary.previous.avgPaceSecPerKm, distanceUnit)}
        />
        <RunStat
          label="Longest run"
          value={summary.current.longestKm ? `${distance(summary.current.longestKm)}${distanceUnit}` : "—"}
          sub={summary.previous.longestKm ? comparison(converted(summary.current.longestKm - summary.previous.longestKm), converted(summary.previous.longestKm), distanceUnit) : "this block"}
        />
      </div>

      <section className="card p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <div>
            <span className="eyebrow text-sky-400">Consistency</span>
            <h2 className="mt-0.5 text-base font-extrabold">Weekly distance</h2>
          </div>
          <span className="text-[11px] text-slate-500">8 rolling weeks</span>
        </div>
        <MiniBars
          data={summary.weekly.map((week) => ({ ...week, value: +converted(week.value).toFixed(2) }))}
          color="#38bdf8"
          unit={distanceUnit}
          height={110}
          emptyLabel="Log distance with a run to build your mileage chart."
        />
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-white/[0.06] p-5">
          <span className="eyebrow text-sky-400">Aerobic base</span>
          <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-extrabold">Zone 2 progress</h2>
            <span className="text-[11px] text-slate-500">vs previous 28 days</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Compare like with like: easy running against your own earlier easy running, not against intervals or races.
          </p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-white/[0.06] sm:grid-cols-4 sm:divide-y-0">
          <InlineStat
            label="Distance"
            value={summary.zone2.distanceKm ? `${distance(summary.zone2.distanceKm)}${distanceUnit}` : "—"}
            sub={comparison(converted(summary.zone2.distanceDeltaKm), converted(summary.zone2.previousDistanceKm), distanceUnit)}
            good={summary.zone2.distanceDeltaKm > 0}
          />
          <InlineStat
            label="Average pace"
            value={summary.zone2.avgPaceSecPerKm ? `${pace(summary.zone2.avgPaceSecPerKm)}/${distanceUnit}` : "—"}
            sub={paceGain(summary.zone2.paceGainSecPerKm, distanceUnit)}
            good={(summary.zone2.paceGainSecPerKm ?? 0) > 0}
          />
          <InlineStat
            label="Average HR"
            value={summary.zone2.avgHr ? `${summary.zone2.avgHr}bpm` : "—"}
            sub={hrComparison(summary.zone2.avgHr, summary.zone2.previousAvgHr)}
          />
          <InlineStat
            label="Longest easy run"
            value={summary.zone2.longestKm ? `${distance(summary.zone2.longestKm)}${distanceUnit}` : "—"}
            sub={`${summary.zone2.runs} Zone 2 run${summary.zone2.runs === 1 ? "" : "s"}`}
          />
        </div>
        {summary.zone2.distanceKm === 0 && (
          <p className="border-t border-white/[0.06] px-5 py-3 text-xs text-slate-500">
            Choose Zone 2 when you log easy runs and this comparison will fill itself in.
          </p>
        )}
      </section>

      <section className="card p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="eyebrow text-sky-400">Training mix</span>
            <h2 className="mt-0.5 text-base font-extrabold">Distance by zone</h2>
          </div>
          {summary.split && (
            <span className={`chip ${summary.split.meetsTarget ? "text-readiness-green" : "text-readiness-yellow"}`}>
              {summary.split.easyPct}% easy · {summary.split.hardPct}% hard
            </span>
          )}
        </div>
        <div className="space-y-3">
          {summary.zones.map((row) => {
            const zone = ZONE_LIST.find((item) => item.id === row.zone)!;
            return (
              <div key={row.zone} className="grid grid-cols-[76px_1fr_70px] items-center gap-3">
                <div>
                  <div className="text-xs font-bold text-slate-200">Zone {zone.id}</div>
                  <div className="truncate text-[10px] text-slate-500">{zone.name}</div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full" style={{ width: `${row.pct}%`, background: zone.colour }} />
                </div>
                <div className="text-right text-xs tabular-nums text-slate-300">
                  {distance(row.distanceKm)}{distanceUnit} <span className="text-slate-600">· {row.pct}%</span>
                </div>
              </div>
            );
          })}
        </div>
        {summary.unzonedKm > 0 && (
          <p className="mt-3 text-xs text-slate-500">
            {distance(summary.unzonedKm)}{distanceUnit} has no zone yet and is excluded from the percentages.
          </p>
        )}
        {summary.split && <p className="mt-3 text-xs text-slate-400">{summary.split.note}</p>}
      </section>

      <section className="card p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <div>
            <span className="eyebrow text-sky-400">Performance</span>
            <h2 className="mt-0.5 text-base font-extrabold">Race results</h2>
          </div>
          <Link href="/benchmarks" className="text-xs font-semibold text-sky-400">Log a test →</Link>
        </div>
        {summary.races.length ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {summary.races.map((race) => (
              <div key={race.key} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="stat-label">{metricDef(race.key).label.replace(" time", "")}</span>
                  {race.isPb && <span className="chip text-sky-400">PB</span>}
                </div>
                <div className="mt-1 text-2xl font-extrabold tabular-nums text-slate-100">{formatRaceTime(race.bestMinutes)}</div>
                <div className={`mt-1 text-[11px] ${race.gainSeconds != null && race.gainSeconds > 0 ? "text-readiness-green" : "text-slate-500"}`}>
                  {race.gainSeconds == null
                    ? `Tested ${friendlyDate(race.testDate)}`
                    : race.gainSeconds > 0
                      ? `${formatSeconds(race.gainSeconds)} faster than last test`
                      : race.gainSeconds < 0
                        ? `${formatSeconds(Math.abs(race.gainSeconds))} slower than last test`
                        : "Matched the last test"}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl bg-white/[0.04] px-4 py-6 text-center text-xs text-slate-500">
            Add a 1500m, 5k or 10k result to track race-time progress and set personal pace zones.
          </p>
        )}
      </section>

      <ShareButton
        stats={{
          name,
          headlineValue: `${distance(summary.current.distanceKm)}${distanceUnit}`,
          headlineLabel: "in the last 28 days",
          stats: [
            { label: "Runs", value: String(summary.current.runs) },
            { label: "Average pace", value: summary.current.avgPaceSecPerKm ? `${pace(summary.current.avgPaceSecPerKm)}/${distanceUnit}` : "—" },
            { label: "Longest run", value: summary.current.longestKm ? `${distance(summary.current.longestKm)}${distanceUnit}` : "—" },
          ],
          caption: "Build the engine. Keep the easy days easy.",
          link: shareLink,
        }}
      />

      <p className="px-1 text-[11px] leading-relaxed text-slate-600">
        Pace uses runs with both time and distance. Zone comparisons use the zone you logged; route, weather and elevation can still move pace and heart rate.
      </p>
    </div>
  );
}

function runningHeadline(summary: RunningProgressSummary, unit: "km" | "mi"): { title: string; body: string } {
  const distance = (km: number) => unit === "mi" ? km * 0.621371 : km;
  const improvedRace = summary.races.find((race) => race.isPb && (race.gainSeconds ?? 0) > 0);
  if (improvedRace) {
    return {
      title: `New ${metricDef(improvedRace.key).label.replace(" time", "")} best: ${formatRaceTime(improvedRace.bestMinutes)}`,
      body: `${formatSeconds(improvedRace.gainSeconds!)} faster than your previous test. Race results are the clearest performance outcome; the training detail below helps explain it.`,
    };
  }
  if ((summary.zone2.paceGainSecPerKm ?? 0) >= 5) {
    return {
      title: `Your Zone 2 pace is ${formatSeconds(unit === "mi" ? summary.zone2.paceGainSecPerKm! * 1.609344 : summary.zone2.paceGainSecPerKm!)} per ${unit} faster`,
      body: `That comparison is against the previous 28 days of your own Zone 2 running. Average heart rate is shown alongside it so you can judge whether the effort stayed genuinely easy.`,
    };
  }
  if (summary.zone2.distanceDeltaKm >= 0.5) {
    return {
      title: `You added ${formatKm(distance(summary.zone2.distanceDeltaKm))}${unit} of Zone 2 work`,
      body: "More easy aerobic volume is useful progress even before race pace changes. The pace and heart-rate trend below shows how efficiently you covered it.",
    };
  }
  if (summary.distanceDeltaKm >= 0.5) {
    return {
      title: `You ran ${formatKm(distance(summary.distanceDeltaKm))}${unit} farther than the previous block`,
      body: "This compares equal 28-day windows, so a longer calendar month cannot inflate the result.",
    };
  }
  return {
    title: summary.current.runs ? `${summary.current.runs} run${summary.current.runs === 1 ? "" : "s"} are building your baseline` : "Your next block starts here",
    body: "Keep logging distance, duration and zone. Four consistent weeks make the pace, volume and intensity comparisons much more meaningful.",
  };
}

function RunStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card p-3">
      <div className="stat-label">{label}</div>
      <div className="mt-0.5 text-xl font-extrabold tabular-nums text-slate-100">{value}</div>
      <div className="mt-0.5 text-[10px] text-slate-500">{sub}</div>
    </div>
  );
}

function InlineStat({ label, value, sub, good = false }: { label: string; value: string; sub: string; good?: boolean }) {
  return (
    <div className="min-w-0 p-4">
      <div className="stat-label">{label}</div>
      <div className="mt-1 truncate text-lg font-extrabold tabular-nums text-slate-100">{value}</div>
      <div className={`mt-0.5 text-[10px] ${good ? "text-readiness-green" : "text-slate-500"}`}>{sub}</div>
    </div>
  );
}

function formatKm(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatDuration(minutes: number): string {
  if (!minutes) return "—";
  const totalSeconds = Math.round(minutes * 60);
  if (totalSeconds < 3600) return `${Math.floor(totalSeconds / 60)}m ${String(totalSeconds % 60).padStart(2, "0")}s`;
  const hours = Math.floor(totalSeconds / 3600);
  const rest = Math.floor((totalSeconds % 3600) / 60);
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function comparison(delta: number, previous: number, unit: string): string {
  if (!previous) return "first measured block";
  if (Math.abs(delta) < 0.005) return "same as previous block";
  return `${delta > 0 ? "+" : "−"}${formatKm(Math.abs(delta))}${unit} vs previous`;
}

function paceComparison(current: number | null, previous: number | null, unit: "km" | "mi"): string {
  if (current == null) return "add time + distance";
  if (previous == null) return "first measured block";
  return paceGain(previous - current, unit);
}

function paceGain(gain: number | null, unit: "km" | "mi"): string {
  if (gain == null) return "needs both 28-day blocks";
  if (gain === 0) return "same as previous";
  const converted = unit === "mi" ? gain * 1.609344 : gain;
  return `${formatSeconds(Math.abs(converted))}/${unit} ${gain > 0 ? "faster" : "slower"}`;
}

function hrComparison(current: number | null, previous: number | null): string {
  if (current == null) return "optional watch data";
  if (previous == null) return "first measured block";
  const delta = current - previous;
  if (!delta) return "same as previous";
  return `${delta > 0 ? "+" : "−"}${Math.abs(delta)}bpm vs previous`;
}

function formatSeconds(seconds: number): string {
  const whole = Math.round(seconds);
  if (whole < 60) return `${whole}s`;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function formatRaceTime(minutes: number): string {
  const seconds = Math.round(minutes * 60);
  const hours = Math.floor(seconds / 3600);
  const remainder = seconds % 3600;
  const mins = Math.floor(remainder / 60);
  const secs = String(remainder % 60).padStart(2, "0");
  return hours ? `${hours}:${String(mins).padStart(2, "0")}:${secs}` : `${mins}:${secs}`;
}

function friendlyDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
