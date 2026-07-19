"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { SPORTS, type SportId } from "@/lib/exercises";
import { positionsForSport, FOCI, type TrainingFocus } from "@/lib/coach";

const STEPS = ["Welcome", "Your sport", "About you", "All set"];

export default function OnboardingPage() {
  const user = useCurrentUser();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [sport, setSport] = useState<SportId>("football");
  const [position, setPosition] = useState("");
  const [focus, setFocus] = useState<TrainingFocus>("performance");
  const [saving, setSaving] = useState(false);

  const positions = positionsForSport(sport);

  async function finish(next: "/coach" | "/journal") {
    setSaving(true);
    await createClient().from("profiles").update({
      sport, position: position || null, training_focus: focus, onboarded: true,
    }).eq("id", user.id);
    router.replace(next);
  }

  async function skip() {
    setSaving(true);
    await createClient().from("profiles").update({ onboarded: true }).eq("id", user.id);
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
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-pitch-400 to-pitch-600 text-4xl shadow-glow">A</div>
            <h1 className="mt-6 text-3xl font-extrabold tracking-tight">Welcome to PocketAthlete</h1>
            <p className="mx-auto mt-3 max-w-sm text-slate-400">Your AI performance coach, physio, nutritionist and analyst — in one app. Let&apos;s set it up around you in 30 seconds.</p>
          </div>
        )}

        {step === 1 && (
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">What&apos;s your sport?</h1>
            <p className="mt-1 text-sm text-slate-400">We&apos;ll tailor your drills, programs and playbook to it.</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {SPORTS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setSport(s.id); setPosition(""); }}
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
              <p className="mt-1 text-sm text-slate-400">This shapes your programs and your playbook.</p>
            </div>
            {positions.length > 0 && (
              <div>
                <span className="field-label">Your position / event</span>
                <div className="flex flex-wrap gap-2">
                  {positions.map((p) => (
                    <button key={p} onClick={() => setPosition(p)} className={`rounded-full border px-3 py-1.5 text-sm transition ${position === p ? "border-pitch-400/50 bg-pitch-400/10 text-pitch-400" : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]"}`}>{p}</button>
                  ))}
                </div>
              </div>
            )}
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
              Set up for <b className="text-slate-200">{position ? `${position} · ` : ""}{SPORTS.find((s) => s.id === sport)?.label}</b>. Where do you want to start?
            </p>
            <div className="mt-8 space-y-3">
              <button onClick={() => finish("/coach")} disabled={saving} className="btn-primary">🏋️ Build my first program</button>
              <button onClick={() => finish("/journal")} disabled={saving} className="btn-ghost">📝 Start with a check-in</button>
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <div className="mt-8 flex items-center justify-between">
        {step > 0 && step < 3 ? (
          <button onClick={() => setStep((s) => s - 1)} className="text-sm text-slate-400 hover:text-pitch-400">← Back</button>
        ) : <span />}
        {step < 3 ? (
          <div className="flex items-center gap-4">
            <button onClick={skip} disabled={saving} className="text-sm text-slate-500 hover:text-slate-300">Skip</button>
            <button onClick={() => setStep((s) => s + 1)} className="btn-primary w-auto px-8">{step === 0 ? "Get started" : "Next"}</button>
          </div>
        ) : <span />}
      </div>
    </div>
  );
}
