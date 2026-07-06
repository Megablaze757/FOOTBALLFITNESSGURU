"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import {
  positionGuide, gamedayLabel, relevantInjuryProtocols,
  GAMEDAY_NUTRITION, RECOVERY_GENERAL,
  type RecoveryProtocol,
} from "@/lib/essentials";
import { getExercise, SPORTS, type Exercise, type SportId } from "@/lib/exercises";
import { ExerciseModal } from "@/components/ExerciseDetail";

export default function EssentialsPage() {
  const user = useCurrentUser();
  const [open, setOpen] = useState<Exercise | null>(null);

  const { data, loading } = useAsync(async () => {
    const supabase = createClient();
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: profile }, { data: checkIn }] = await Promise.all([
      supabase.from("profiles").select("sport, position").eq("id", user.id).maybeSingle(),
      supabase.from("daily_check_ins").select("pain_map").eq("user_id", user.id).order("check_in_date", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const p = profile as { sport?: string; position?: string } | null;
    return {
      sport: (p?.sport ?? "football") as SportId,
      position: p?.position ?? "",
      painMap: (checkIn as { pain_map?: Record<string, number> } | null)?.pain_map ?? {},
    };
  }, [user.id]);

  if (loading || !data) return <div className="card mx-auto max-w-3xl h-96 animate-pulse" />;

  const { sport, position } = data;
  const guide = positionGuide(sport, position);
  const sportLabel = SPORTS.find((s) => s.id === sport)?.label ?? sport;
  const gameday = gamedayLabel(sport);
  const injuryProtocols = relevantInjuryProtocols(data.painMap);

  return (
    <div className="animate-fade-up mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Playbook</h1>
        <p className="mt-1 text-sm text-slate-400">Position essentials, {gameday.toLowerCase()} nutrition and recovery — tailored to you.</p>
      </header>

      {/* Position essentials */}
      <section className="card-premium p-6">
        <div className="flex items-center gap-2">
          <span className="chip text-pitch-400">{sportLabel}</span>
          <span className="chip">{position || "All-round"}</span>
        </div>
        <h2 className="mt-3 text-xl font-extrabold">Your position essentials</h2>
        <p className="mt-1 text-sm text-slate-300">{guide.summary}</p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Col title="Prioritise physically" items={guide.physical} icon="⚡" />
          <Col title="Sharpen technically" items={guide.skills} icon="🎯" />
        </div>

        <div className="mt-4">
          <div className="stat-label mb-2">Key drills for you</div>
          <div className="flex flex-wrap gap-2">
            {guide.keyDrills.map((id) => {
              const ex = getExercise(id);
              if (!ex) return null;
              return (
                <button key={id} onClick={() => setOpen(ex)} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-slate-200 transition hover:border-pitch-400/40 hover:bg-pitch-400/[0.06]">
                  {ex.name} ›
                </button>
              );
            })}
          </div>
        </div>
        {!position && (
          <p className="mt-4 text-xs text-slate-500">Set your position in the <Link href="/coach" className="text-pitch-400 hover:underline">AI Coach quiz</Link> to make this position-specific.</p>
        )}
      </section>

      {/* Injury-specific recovery (only if sore) */}
      {injuryProtocols.length > 0 && (
        <section className="space-y-3">
          <h2 className="field-label">Recover your sore areas</h2>
          {injuryProtocols.map((p) => <ProtocolCard key={p.id} p={p} highlight />)}
        </section>
      )}

      {/* Gameday nutrition timeline */}
      <section>
        <h2 className="field-label mb-3">{gameday} nutrition</h2>
        <ol className="relative space-y-3 border-l border-white/10 pl-5">
          {GAMEDAY_NUTRITION.map((ph) => (
            <li key={ph.when} className="relative">
              <span className="absolute -left-[27px] grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-ink-800 text-base">{ph.icon}</span>
              <div className="card p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-bold text-slate-100">{ph.title}</span>
                  <span className="chip text-pitch-400">{ph.when}</span>
                </div>
                <ul className="mt-2 space-y-1 text-sm text-slate-300">
                  {ph.tips.map((t) => <li key={t} className="flex gap-2"><span className="text-slate-500">•</span>{t}</li>)}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* General recovery protocols */}
      <section>
        <h2 className="field-label mb-3">Recovery protocols</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {RECOVERY_GENERAL.map((p) => <ProtocolCard key={p.id} p={p} />)}
        </div>
      </section>

      {open && <ExerciseModal ex={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Col({ title, items, icon }: { title: string; items: string[]; icon: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="stat-label mb-2">{icon} {title}</div>
      <ul className="space-y-1.5 text-sm text-slate-200">
        {items.map((i) => <li key={i} className="flex gap-2"><span className="text-pitch-400">›</span>{i}</li>)}
      </ul>
    </div>
  );
}

function ProtocolCard({ p, highlight }: { p: RecoveryProtocol; highlight?: boolean }) {
  return (
    <div className={`card p-4 ${highlight ? "border-readiness-red/25" : ""}`}>
      <div className="flex items-center gap-2">
        <span className="text-xl">{p.icon}</span>
        <div>
          <div className="text-sm font-bold text-slate-100">{p.title}</div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">{p.when}</div>
        </div>
      </div>
      <ul className="mt-3 space-y-1.5 text-sm text-slate-300">
        {p.steps.map((s) => <li key={s} className="flex gap-2"><span className="text-pitch-400">✓</span>{s}</li>)}
      </ul>
    </div>
  );
}
