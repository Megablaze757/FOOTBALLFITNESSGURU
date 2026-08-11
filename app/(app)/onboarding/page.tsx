"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { SPORTS, type SportId } from "@/lib/exercises";
import { FOCI, type TrainingFocus } from "@/lib/coach";
import { PositionPicker } from "@/components/PositionPicker";
import { positionLabel } from "@/lib/positions";
import { track } from "@/lib/funnel";
import { Logo } from "@/components/Logo";

const STEPS = ["Welcome", "Your sport", "About you", "All set"];

export default function OnboardingPage() {
  const user = useCurrentUser();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [sport, setSport] = useState<SportId>("football");
  const [positions, setPositions] = useState<string[]>([]);
  const [focus, setFocus] = useState<TrainingFocus>("performance");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Navigating away regardless of the result was the bug here: a refused write
  // left `onboarded` false with no sport saved, so the athlete was dropped into
  // a coach page that knew nothing about them and bounced back through
  // onboarding on the next visit, with nothing ever explaining why.
  async function finish(next: "/coach" | "/journal") {
    setSaving(true);
    setError(null);
    const { error } = await createClient().from("profiles").update({
      sport, positions, position: positions[0] ?? null, training_focus: focus, onboarded: true,
    }).eq("id", user.id);
    setSaving(false);
    if (error) { setError(`Couldn't save your details: ${error.message}`); return; }
    // Shape only — which sport, how many positions. Never the values themselves.
    track("onboarded", { sport, positions: positions.length });
    router.replace(next);
  }

  async function skip() {
    setSaving(true);
    setError(null);
    const { error } = await createClient().from("profiles").update({ onboarded: true }).eq("id", user.id);
    setSaving(false);
    if (error) { setError(`Couldn't skip: ${error.message}`); return; }
    router.replace("/home");
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col">
      {/* Progress */}
      <div className="mb-8 flex items-center gap-2">
        {STEPS.map((_, i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full transition ${i <= step ? "bg-pitch-400" : "bg-white/10"}`} />
        ))}
      </div>

      <div className="animate-fade-up flex-1">
        {step === 0 && (
          <div className="text-center">
            <Logo size={80} className="mx-auto" />
            <h1 className="mt-6 text-3xl font-extrabold tracking-tight">Welcome to PocketAthlete</h1>
            {/* Logo and heading stay centred; the paragraph doesn't. It runs to
                three lines, and a centred three-line block makes the reader
                find a new starting x for each one — on the first screen of the
                app, where the copy has the most work to do. */}
            <p className="mx-auto mt-3 max-w-sm text-left text-slate-400">Tell us two things and you&apos;ll get a four-week plan built around your sport, with every movement explained. Takes about thirty seconds.</p>
          </div>
        )}

        {step === 1 && (
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">What&apos;s your sport?</h1>
            <p className="mt-1 text-sm text-slate-400">It changes your drills, your benchmarks and what the app puts first — not just the wording.</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {SPORTS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setSport(s.id); setPositions([]); }}
                  className={`card p-5 text-left transition ${sport === s.id ? "ring-2 ring-pitch-400/70 shadow-glow" : "card-hover"}`}
                >
                  <div className="text-3xl">{s.emoji}</div>
                  <div className="mt-2 font-bold text-slate-100">{s.label}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">A bit about you</h1>
              <p className="mt-1 text-sm text-slate-400">Your position decides which skill work goes in the plan.</p>
            </div>
            <PositionPicker sport={sport} value={positions} onChange={setPositions} />
            <div>
              <span className="field-label">What are you training for?</span>
              <div className="grid grid-cols-2 gap-2">
                {FOCI.map((f) => (
                  <button key={f.id} onClick={() => setFocus(f.id)} className={`card p-3 text-left transition ${focus === f.id ? "ring-2 ring-pitch-400/70 shadow-glow" : "card-hover"}`}>
                    <div className="text-sm font-bold text-slate-100">{f.label}</div>
                    <div className="mt-0.5 text-xs text-slate-400">{f.blurb}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="text-center">
            <div className="text-6xl">🎯</div>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight">You&apos;re all set</h1>
            <p className="mx-auto mt-3 max-w-sm text-slate-400">
              Set up for <b className="text-slate-200">{positions.length ? `${positionLabel(positions)} · ` : ""}{SPORTS.find((s) => s.id === sport)?.label}</b>. Where do you want to start?
            </p>
            <div className="mt-8 space-y-3">
              <button onClick={() => finish("/coach")} disabled={saving} className="btn-primary">🏋️ Build my first program</button>
              <button onClick={() => finish("/journal")} disabled={saving} className="btn-ghost">📝 Start with a check-in</button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-2xl border border-readiness-red/30 bg-readiness-red/10 px-4 py-2.5 text-center text-sm text-slate-200">
          {error}
        </p>
      )}

      {/* Nav */}
      <div className="mt-8 flex items-center justify-between">
        {step > 0 && step < 3 ? (
          <button onClick={() => setStep((s) => s - 1)} className="tap-target -ml-2 gap-1 px-2 text-sm text-slate-400 hover:text-pitch-400">
            <span aria-hidden>←</span> Back
          </button>
        ) : <span />}
        {step < 3 ? (
          <div className="flex items-center gap-4">
            <button onClick={skip} disabled={saving} className="tap-target px-2 text-sm text-slate-500 hover:text-slate-300">Skip</button>
            <button onClick={() => setStep((s) => s + 1)} className="btn-primary w-auto px-8">{step === 0 ? "Get started" : "Next"}</button>
          </div>
        ) : <span />}
      </div>
    </div>
  );
}
