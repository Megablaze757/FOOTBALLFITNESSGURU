"use client";

import { useEffect, useState } from "react";
import { invokeAI } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { useJobs } from "@/lib/jobs";
import { baseAreaOf } from "@/lib/essentials";
import { BodyMap } from "@/components/BodyMap";
import type { PainMap } from "@/lib/types";
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

/**
 * The details that actually change a rehab plan, as taps.
 *
 * Ordered the way someone thinks about a niggle: when, what makes it worse,
 * what it looks like, what they've already done about it.
 */
const DESCRIPTION_HINTS = [
  "hurts on stairs",
  "worse when I sprint",
  "sore the next day",
  "aches at rest",
  "it swelled up",
  "no swelling",
  "I heard a pop",
  "stretching helps",
  "been resting it",
];

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
 *
 * IT OWNS THE BODY MAP NOW, and the page's own "What's bothering you?" card is
 * gone. There were two textareas on one screen asking the same question in
 * almost the same words — "What's going on?" here, "Or describe it in your own
 * words" there — one feeding this, one keyword-matching the static guides. An
 * athlete in pain had to describe the injury twice to get everything the page
 * offered, and nothing said why.
 *
 * Worse, the body map that fed this component's `area` prop was rendered BELOW
 * it. The natural order — this card is first — sent `area: undefined` every
 * time. You had to scroll past the planner, tap, and scroll back.
 *
 * So: one card, three steps, in the order you'd actually do them. `hurt` and
 * `description` are controlled by the page because it still needs both to match
 * the static protocols underneath.
 */
export function InjuryPlanner({ sport, hurt, onHurtChange, description, onDescriptionChange, seeded }: {
  sport: SportId;
  hurt: PainMap;
  onHurtChange: (next: PainMap) => void;
  description: string;
  onDescriptionChange: (next: string) => void;
  /** True when the map was pre-filled from a recent check-in, so we can say so. */
  seeded?: boolean;
}) {
  const [weeks, setWeeks] = useState<number | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [chronic, setChronic] = useState(false);
  const [busy, setBusy] = useState(false);
  const { start: startJob } = useJobs();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  // Which stage is open. Only one is ever current, and a rehab plan's three
  // stages stacked open is most of why this page scrolled forever.
  const [openStage, setOpenStage] = useState(0);

  const area = Object.keys(hurt).map(baseAreaOf)[0];

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
      onDescriptionChange(row.description);
      setSavedAt(new Date(row.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" }));
    })();
    return () => { cancelled = true; };
    // Once, on mount. onDescriptionChange is a setState from the page and stable
    // enough; listing it here would re-run the fetch on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

        {/* ONE STAGE AT A TIME. Rehab is sequential — you are in exactly one of
            these — and three full stages stacked open is a very long page of
            exercises you must not do yet. Stage one is open; the rest show their
            name and timeframe so you can see what's coming. */}
        <ol className="space-y-2">
          {plan.stages.map((s, i) => {
            const isOpen = openStage === i;
            return (
              <li key={s.name} className={`card overflow-hidden transition ${isOpen ? "" : "opacity-70"}`}>
                <button
                  onClick={() => setOpenStage(isOpen ? -1 : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 p-4 text-left"
                >
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${
                    isOpen ? "bg-pitch-400 text-slate-950" : "bg-pitch-400/15 text-pitch-400"
                  }`}>
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-slate-100">{s.name}</span>
                    <span className="block text-xs text-slate-500">{s.timeframe}</span>
                  </span>
                  <span className={`shrink-0 text-xs text-slate-500 transition ${isOpen ? "rotate-180" : ""}`}>▾</span>
                </button>

                {isOpen && (
                  <div className="border-t border-white/[0.08] p-4">
                    <p className="text-sm text-slate-300">{s.goal}</p>

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
                      <p className="mt-3 rounded-xl bg-amber-400/[0.08] px-3 py-2 text-xs text-amber-300">
                        Avoid for now: {s.avoid.join(", ")}
                      </p>
                    )}

                    {/* The criterion for leaving this stage belongs to this
                        stage. It was a separate card at the bottom of the page,
                        three stages away from the one you're actually in. */}
                    <p className="mt-3 border-t border-white/[0.06] pt-3 text-xs text-slate-400">
                      <span className="font-semibold text-slate-300">Move on when:</span> {plan.progressWhen}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ol>

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

      </section>
    );
  }

  const enoughWords = description.trim().length >= 10;
  const ready = enoughWords && weeks !== null;

  return (
    <section className="card-premium overflow-hidden">
      <div className="border-b border-white/[0.08] p-5">
        <h2 className="text-xl font-extrabold">Something hurting?</h2>
        <p className="mt-1 text-sm text-slate-400">
          Three questions and you get a staged plan to load it safely.
        </p>
      </div>

      <div className="space-y-5 p-5">
        <Step n={1} title="Where is it?" done={Object.keys(hurt).length > 0}>
          {/* The map lives here now. It used to sit in a card BELOW this one
              while this card's `area` prop read from it — so filling the form
              top to bottom, which is what everyone does, sent no area at all. */}
          <BodyMap value={hurt} onChange={onHurtChange} mode="select" />
          {seeded && (
            <p className="mt-2 text-center text-xs text-slate-500">
              Carried over from your last check-in — tap to change.
            </p>
          )}
        </Step>

        <Step n={2} title="What does it feel like?" done={enoughWords}>
          <textarea
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            rows={3}
            placeholder="Sharp? Dull? When does it bite?"
            className="field resize-none"
          />

          {/* TAPS, NOT AN ESSAY PROMPT.
              This was a 180-character worked example sitting in the box as grey
              text, under a sentence of instructions — a paragraph of prose
              asking for a paragraph of prose, on the page someone opens because
              something hurts. It read as homework, and the honest outcome of
              homework is three words and a worse plan.

              These are the details that actually change a rehab plan: when it
              hurts, what provokes it, whether it swelled, what's been tried.
              Tapping appends the phrase, so a decent description gets built by
              thumb in about four taps and can still be edited into real
              sentences. */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {DESCRIPTION_HINTS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => onDescriptionChange(
                  description.trim() ? `${description.trim().replace(/[.,]$/, "")}, ${h}` : h
                )}
                className="chip-option chip-option-sm text-slate-400 hover:border-pitch-400/40 hover:text-pitch-400"
              >
                <span aria-hidden>+</span> {h}
                <span className="sr-only">Add &ldquo;{h}&rdquo; to the description</span>
              </button>
            ))}
          </div>
        </Step>

        <Step n={3} title="How long has it been going on?" done={weeks !== null}>
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d.label}
                onClick={() => setWeeks(d.weeks)}
                aria-pressed={weeks === d.weeks}
                className="chip-option chip-option-sm"
              >
                {d.label}
              </button>
            ))}
          </div>
        </Step>

        {error && <p className="text-sm text-readiness-red">{error}</p>}

        <div>
          <button
            onClick={build}
            disabled={busy || !ready}
            className="btn-primary disabled:opacity-40"
          >
            {busy ? "Building your plan…" : "Build my plan"}
          </button>
          {/* Two things gate this button and only one of them said so. Someone
              who wrote a full paragraph and didn't tap a duration got a dead
              button and a hint about description length they'd already
              satisfied — which reads as the app being broken, not as a missing
              field. */}
          {!busy && description.trim().length > 0 && !enoughWords && (
            <p className="mt-2 text-xs text-slate-500">A few more words — &ldquo;knee hurts&rdquo; can&apos;t be planned around.</p>
          )}
          {!busy && enoughWords && weeks === null && (
            <p className="mt-2 text-xs text-slate-500">
              Now pick how long it&apos;s been going on — it changes the plan more than anything else here.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * A numbered step that ticks itself off.
 *
 * The form was three unlabelled fields in a row and a button that refused to
 * light up, with no way to see which part you hadn't done. Numbering them turns
 * "why won't this work" into "I haven't done 3".
 */
function Step({ n, title, done, children }: {
  n: number; title: string; done: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2.5">
        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold transition ${
          done ? "bg-pitch-400 text-slate-950" : "bg-white/[0.07] text-slate-400"
        }`}>
          {done ? "✓" : n}
        </span>
        <span className="text-sm font-bold text-slate-200">{title}</span>
      </div>
      <div className="pl-[34px]">{children}</div>
    </div>
  );
}
