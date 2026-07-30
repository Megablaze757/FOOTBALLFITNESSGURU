"use client";

import { useEffect, useState } from "react";
import { invokeAI } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { useJobs } from "@/lib/jobs";
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
  const { start: startJob } = useJobs();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // Bring back the last plan. Without this the plan lived in component state
  // only: the job kept generating after you navigated away, but the result
  // landed in an unmounted component and no row existed anywhere, so a plan you
  // waited a minute for vanished on a tab change.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error: e } = await createClient()
        .from("rehab_plans")
        .select("plan, chronic, description, created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled || e || !data) return;
      const row = data as { plan: Plan; chronic: boolean; description: string; created_at: string };
      setPlan(row.plan);
      setChronic(row.chronic);
      setDescription(row.description);
      setSavedAt(new Date(row.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" }));
    })();
    return () => { cancelled = true; };
  }, []);

  // Runs as a background job so you can leave the page while it builds — a
  // rehab plan is a big generation and takes the best part of a minute.
  function build() {
    setBusy(true);
    setError(null);
    startJob("injury", "Building your rehab plan", buildPlan);
  }

  async function buildPlan() {
    try {
      const res = await invokeAI<{ plan?: Plan; chronic?: boolean }>("injury-plan", {
        description, area, weeks: weeks ?? 0, sport,
      });
      if (!res?.plan) throw new Error("The AI returned nothing usable.");
      setPlan(res.plan);
      setChronic(!!res.chronic);

      // Saved inside the job, so leaving the page keeps the plan rather than
      // throwing away the generation. Best-effort: a failed write must not
      // replace a plan they can see with an error, so it only warns.
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error: saveErr } = await supabase.from("rehab_plans").insert({
          user_id: user.id,
          description,
          area: area ?? null,
          weeks: weeks ?? 0,
          sport,
          chronic: !!res.chronic,
          plan: res.plan,
        });
        if (saveErr) console.warn("rehab plan not saved:", saveErr.message);
        else setSavedAt(new Date().toLocaleDateString(undefined, { day: "numeric", month: "short" }));
      }
    } catch (e) {
      // Show what actually went wrong. This used to replace every failure with
      // "couldn't build a plan just now", which is comforting, useless, and the
      // reason a broken endpoint can sit unnoticed — there is no difference on
      // screen between the AI being down, the plan needing Pro, and a bug.
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        `${msg}${/allowance|limit|Pro/i.test(msg) ? "" : " — the rehab guides below still apply, and for something persistent a physio beats any app."}`
      );
      throw e; // let the job tray report it too, in case you've navigated away
    } finally {
      setBusy(false);
    }
  }

  if (plan) {
    return (
      <section className="space-y-4">
        <div className="card-premium p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-extrabold">Your plan</h2>
              {/* Says it's kept. The old version gave no sign either way, so the
                  reasonable assumption was that closing the tab lost it — and
                  that assumption happened to be correct. */}
              {savedAt && <p className="mt-0.5 text-xs text-slate-500">Saved {savedAt} — it&apos;s here whenever you come back.</p>}
            </div>
            <button onClick={() => setPlan(null)} className="tap-target shrink-0 text-xs text-slate-400 hover:text-pitch-400">
              New plan
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
      {/* Two things gate this button and only one of them said so. Someone who
          wrote a full paragraph and didn't tap a duration got a dead button and
          a hint about description length they'd already satisfied — which reads
          as the app being broken, not as a missing field. */}
      {description.trim().length > 0 && description.trim().length < 10 && (
        <p className="text-xs text-slate-500">A few more words — &ldquo;knee hurts&rdquo; can&apos;t be planned around.</p>
      )}
      {description.trim().length >= 10 && weeks === null && !busy && (
        <p className="text-xs text-slate-500">
          Now pick how long it&apos;s been going on — it changes the plan more than anything else here.
        </p>
      )}

      <p className="text-xs text-slate-500">{REHAB_DISCLAIMER}</p>
    </section>
  );
}
