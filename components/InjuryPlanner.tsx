"use client";

import { useState } from "react";
import { invokeAI } from "@/lib/api";
import { REHAB_DISCLAIMER } from "@/lib/essentials";
import type { SportId } from "@/lib/exercises";

interface Stage {
  name: string;
  timeframe: string;
  goal: string;
  exercises: { name: string; dose: string; note: string }[];
  avoid: string[];
}
interface Plan {
  summary: string;
  seeAProfessional: string;
  stages: Stage[];
  redFlags: string[];
  progressWhen: string;
}

// Rough buckets rather than a number field — nobody knows whether it started 5
// or 7 weeks ago, and the only distinction that changes the advice is whether
// this is recent or long-standing.
const DURATIONS = [
  { label: "Days", weeks: 0 },
  { label: "1–2 weeks", weeks: 2 },
  { label: "3–6 weeks", weeks: 4 },
  { label: "2–6 months", weeks: 12 },
  { label: "Over 6 months", weeks: 30 },
];

/**
 * A graded loading plan from a description of the problem.
 *
 * The existing guides match keywords to a fixed set of protocols, which works
 * for "sore hamstring" and not at all for "outside of my knee hurts on the
 * stairs and after 20 minutes of running, six months now". This asks.
 *
 * There is no on-device fallback here on purpose. Everything else in the app
 * degrades to a local engine; a rehab plan cannot, because a plausible-looking
 * one generated from keyword matching is worse than none. Without the AI the
 * athlete gets the existing protocol guides and a clear pointer to a physio.
 */
export function InjuryPlanner({ sport, area }: { sport: SportId; area?: string }) {
  const [description, setDescription] = useState("");
  const [weeks, setWeeks] = useState<number | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [chronic, setChronic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function build() {
    setBusy(true);
    setError(null);
    try {
      const res = await invokeAI<{ plan?: Plan; chronic?: boolean }>("injury-plan", {
        description, area, weeks: weeks ?? 0, sport,
      });
      if (!res?.plan) throw new Error("no plan");
      setPlan(res.plan);
      setChronic(!!res.chronic);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setError(
        /allowance|limit/i.test(msg)
          ? msg
          : "Couldn't build a plan just now. The rehab guides below still apply — and for something persistent, a physio beats any app."
      );
    } finally {
      setBusy(false);
    }
  }

  if (plan) {
    return (
      <section className="space-y-4">
        <div className="card-premium p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-extrabold">Your plan</h2>
            <button onClick={() => setPlan(null)} className="shrink-0 text-xs text-slate-400 hover:text-pitch-400">
              Start again
            </button>
          </div>
          <p className="mt-2 text-sm text-slate-200">{plan.summary}</p>

          {/* Above the plan, not buried under it — for a long-standing problem
              this is the most useful sentence on the page. */}
          <div className={`mt-3 rounded-2xl p-3 ${chronic ? "bg-readiness-red/10" : "bg-white/[0.04]"}`}>
            <div className="stat-label !mb-1">{chronic ? "⚠️ Get this looked at" : "Worth knowing"}</div>
            <p className="text-sm text-slate-200">{plan.seeAProfessional}</p>
          </div>
        </div>

        {plan.stages.map((s, i) => (
          <div key={s.name} className="card p-5">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-pitch-400/15 text-xs font-bold text-pitch-400">
                {i + 1}
              </span>
              <h3 className="font-bold text-slate-100">{s.name}</h3>
            </div>
            <p className="mt-1 text-xs text-slate-500">{s.timeframe}</p>
            <p className="mt-2 text-sm text-slate-300">{s.goal}</p>

            <ul className="mt-3 space-y-2">
              {s.exercises.map((ex) => (
                <li key={ex.name} className="rounded-xl bg-white/[0.03] p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-100">{ex.name}</span>
                    <span className="shrink-0 text-xs text-slate-400">{ex.dose}</span>
                  </div>
                  {ex.note && <p className="mt-1 text-xs text-slate-400">{ex.note}</p>}
                </li>
              ))}
            </ul>

            {s.avoid.length > 0 && (
              <p className="mt-3 text-xs text-amber-300">
                Avoid for now: {s.avoid.join(", ")}
              </p>
            )}
          </div>
        ))}

        <div className="card p-5">
          <div className="stat-label mb-1">Move to the next stage when</div>
          <p className="text-sm text-slate-300">{plan.progressWhen}</p>
        </div>

        <div className="card border-readiness-red/25 p-5 ring-1 ring-readiness-red/20">
          <div className="stat-label !mb-2 text-readiness-red">Stop and get assessed if</div>
          <ul className="space-y-1.5">
            {plan.redFlags.map((f) => (
              <li key={f} className="flex gap-2 text-sm text-slate-200">
                <span className="shrink-0 text-readiness-red">•</span>{f}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-slate-500">{REHAB_DISCLAIMER}</p>
      </section>
    );
  }

  return (
    <section className="card-premium space-y-4 p-6">
      <div>
        <h2 className="text-xl font-extrabold">Build me a rehab plan</h2>
        <p className="mt-1 text-sm text-slate-400">
          Describe it properly — where, when it hurts, what makes it worse, what you&apos;ve already tried.
          The more you say, the less generic the plan.
        </p>
      </div>

      <label className="block">
        <span className="field-label">What&apos;s going on?</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="e.g. outside of my right knee aches on stairs and after about 20 minutes of running. No swelling. Worse the day after. I've tried rolling it and it helps for an hour."
          className="field resize-none"
        />
      </label>

      <div>
        <span className="field-label">How long has it been going on?</span>
        <div className="flex flex-wrap gap-2">
          {DURATIONS.map((d) => (
            <button
              key={d.label}
              onClick={() => setWeeks(d.weeks)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                weeks === d.weeks
                  ? "border-pitch-400/50 bg-pitch-400/10 text-pitch-400"
                  : "border-white/10 bg-white/[0.03] text-slate-300"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-readiness-red">{error}</p>}

      <button
        onClick={build}
        disabled={busy || description.trim().length < 10 || weeks === null}
        className="btn-primary disabled:opacity-40"
      >
        {busy ? "Building your plan…" : "Build my plan"}
      </button>
      {description.trim().length > 0 && description.trim().length < 10 && (
        <p className="text-xs text-slate-500">A few more words — &ldquo;knee hurts&rdquo; can&apos;t be planned around.</p>
      )}

      <p className="text-xs text-slate-500">{REHAB_DISCLAIMER}</p>
    </section>
  );
}
