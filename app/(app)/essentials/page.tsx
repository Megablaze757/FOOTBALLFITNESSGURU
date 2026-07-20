"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import {
  positionGuide, gamedayLabel, relevantInjuryProtocols,
  GAMEDAY_NUTRITION, RECOVERY_GENERAL, RECOVERY_INJURY, REHAB_DISCLAIMER,
  protocolsForAreas, matchInjuryText, baseAreaOf,
  type RecoveryProtocol,
} from "@/lib/essentials";
import { getExercise, SPORTS, type Exercise, type SportId } from "@/lib/exercises";
import { ExerciseModal } from "@/components/ExerciseDetail";
import { BodyMap } from "@/components/BodyMap";

// The Playbook covers four unrelated topics. Stacked, that ran to six and a
// half screens on a phone; split into tabs each view is about two.
type TabId = "position" | "injury" | "fuel";
const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "position", label: "Your position", icon: "🎯" },
  { id: "injury", label: "Injury & rehab", icon: "🩹" },
  { id: "fuel", label: "Fuel & recovery", icon: "🍝" },
];

// The pre-training sequence, in the order it should be performed.
const MOBILITY_IDS = [
  "leg_swings", "world_greatest_stretch", "hip_90_90", "ankle_rocks",
  "glute_bridge", "monster_walk", "dead_bug", "thoracic_openers",
  "scap_pull_up", "couch_stretch",
];

export default function EssentialsPage() {
  const user = useCurrentUser();
  const [open, setOpen] = useState<Exercise | null>(null);
  const [tab, setTab] = useState<TabId>("position");
  const [hurt, setHurt] = useState<Record<string, number>>({});
  const [desc, setDesc] = useState("");
  // "knee_left" -> "knee" so a tapped region maps to its rehab protocol.
  const picked = useMemo(() => [...new Set(Object.keys(hurt).map(baseAreaOf))], [hurt]);

  // Tapped areas and free text both feed the same protocol lookup; de-duped so
  // describing an ankle after tapping "ankle" doesn't show it twice.
  const matched = useMemo(() => {
    const out = [...protocolsForAreas(picked), ...matchInjuryText(desc)];
    return out.filter((p, i) => out.findIndex((q) => q.id === p.id) === i);
  }, [picked, desc]);

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
  }, [user.id], `essentials:${user.id}`);

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

      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium transition ${
              tab === t.id
                ? "border-pitch-400/50 bg-pitch-400/10 text-pitch-400"
                : "border-white/10 bg-white/[0.03] text-slate-300"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Position essentials */}
      {tab === "position" && (
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

      )}

      {/* Injury-specific recovery (only if sore) */}
      {tab === "injury" && injuryProtocols.length > 0 && (
        <section className="space-y-3">
          <h2 className="field-label">Recover your sore areas</h2>
          {injuryProtocols.map((p) => <ProtocolCard key={p.id} p={p} highlight onOpenExercise={setOpen} />)}
        </section>
      )}

      {/* Tell us directly what hurts, rather than waiting on a check-in. */}
      {tab === "injury" && (
      <section className="card-premium space-y-4 p-6">
        <div>
          <h2 className="text-xl font-extrabold">What&apos;s bothering you?</h2>
          <p className="mt-1 text-sm text-slate-400">Tap where it hurts, or describe it — we&apos;ll pull up the right rehab plan.</p>
        </div>

        {/* Same body map as the daily check-in, in tap-to-select mode. */}
        <BodyMap value={hurt} onChange={setHurt} mode="select" />

        <label className="block">
          <span className="field-label">Or describe it in your own words</span>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={2}
            placeholder="e.g. rolled my ankle at training, sore behind the knee when I sprint…"
            className="field resize-none"
          />
        </label>

        {picked.length + desc.trim().length > 0 && (
          matched.length > 0
            ? <p className="text-xs text-slate-500">Showing {matched.length} matching plan{matched.length === 1 ? "" : "s"} below.</p>
            : <p className="text-xs text-slate-500">No match yet — try tapping an area above, or see all the guides below.</p>
        )}
      </section>

      )}

      {/* Full rehab library — browsable whether or not you logged pain today. */}
      {tab === "injury" && (
      <section className="space-y-3">
        <div>
          <h2 className="field-label">{matched.length > 0 ? "Your rehab plan" : "Injury rehab guides"}</h2>
          <p className="mt-1 text-xs text-slate-500">{REHAB_DISCLAIMER}</p>
        </div>
        {matched.length > 0
          ? matched.map((p) => <ProtocolCard key={p.id} p={p} highlight onOpenExercise={setOpen} />)
          : RECOVERY_INJURY.filter((p) => !injuryProtocols.some((i) => i.id === p.id))
              .map((p) => <ProtocolCard key={p.id} p={p} collapsed onOpenExercise={setOpen} />)}
      </section>

      )}

      {/* Mobility & activation — the warm-up that prevents most of the above. */}
      {tab === "position" && (
      <section>
        <h2 className="field-label mb-1">Mobility &amp; activation</h2>
        <p className="mb-3 text-xs text-slate-500">Run through these before training — the cheapest injury prevention there is.</p>
        <div className="flex flex-wrap gap-2">
          {MOBILITY_IDS.map((id) => {
            const ex = getExercise(id);
            if (!ex) return null;
            return (
              <button key={id} onClick={() => setOpen(ex)} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-slate-200 transition hover:border-pitch-400/40 hover:bg-pitch-400/[0.06]">
                {ex.name} ›
              </button>
            );
          })}
        </div>
      </section>

      )}

      {/* Gameday nutrition timeline */}
      {tab === "fuel" && (
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

      )}

      {/* General recovery protocols */}
      {tab === "fuel" && (
      <section>
        <h2 className="field-label mb-3">Recovery protocols</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {RECOVERY_GENERAL.map((p) => <ProtocolCard key={p.id} p={p} />)}
        </div>
      </section>

      )}

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

function ProtocolCard({ p, highlight, collapsed, onOpenExercise }: {
  p: RecoveryProtocol;
  highlight?: boolean;
  // Browsing the full library: show a one-line summary until asked for detail.
  collapsed?: boolean;
  onOpenExercise?: (ex: Exercise) => void;
}) {
  const body = <ProtocolBody p={p} onOpenExercise={onOpenExercise} />;
  if (collapsed) {
    return (
      <details className="card p-4">
        <summary className="flex cursor-pointer items-center gap-2 list-none">
          <span className="text-xl">{p.icon}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-slate-100">{p.title}</span>
            <span className="block text-[11px] uppercase tracking-wide text-slate-500">{p.when}</span>
          </span>
          <span className="shrink-0 text-xs text-pitch-400">View plan ›</span>
        </summary>
        <div className="mt-3">{body}</div>
      </details>
    );
  }
  return (
    <div className={`card p-4 ${highlight ? "border-readiness-red/25" : ""}`}>
      <div className="flex items-center gap-2">
        <span className="text-xl">{p.icon}</span>
        <div>
          <div className="text-sm font-bold text-slate-100">{p.title}</div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">{p.when}</div>
        </div>
      </div>
      {body}
    </div>
  );
}

function ProtocolBody({ p, onOpenExercise }: {
  p: RecoveryProtocol;
  onOpenExercise?: (ex: Exercise) => void;
}) {
  return (
    <>
      <ul className="mt-3 space-y-1.5 text-sm text-slate-300">
        {p.steps.map((s) => <li key={s} className="flex gap-2"><span className="text-pitch-400">✓</span>{s}</li>)}
      </ul>

      {/* Staged return-to-play — progress on criteria, not on dates. */}
      {p.stages && (
        <details className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <summary className="cursor-pointer text-sm font-semibold text-pitch-400">
            Return-to-play plan ({p.stages.length} stages)
          </summary>
          <ol className="mt-3 space-y-3">
            {p.stages.map((st) => (
              <li key={st.phase} className="border-l-2 border-pitch-500/40 pl-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-slate-100">{st.phase}</span>
                  <span className="chip text-slate-400">{st.window}</span>
                </div>
                <p className="mt-1 text-sm text-slate-300">{st.focus}</p>
                <p className="mt-1 text-xs text-slate-500">
                  <span className="font-semibold text-slate-400">Move on when:</span> {st.criteria}
                </p>
              </li>
            ))}
          </ol>
        </details>
      )}

      {p.redFlags && (
        <div className="mt-3 rounded-xl border border-readiness-red/30 bg-readiness-red/[0.06] p-3">
          <div className="text-xs font-bold uppercase tracking-wide text-readiness-red">🚩 Stop and get assessed if</div>
          <ul className="mt-1.5 space-y-1 text-sm text-slate-300">
            {p.redFlags.map((f) => <li key={f} className="flex gap-2"><span className="text-readiness-red">•</span>{f}</li>)}
          </ul>
        </div>
      )}

      {p.exerciseIds && (
        <div className="mt-3">
          <div className="stat-label mb-1.5">Rehab exercises</div>
          <div className="flex flex-wrap gap-1.5">
            {p.exerciseIds.map((id) => {
              const ex = getExercise(id);
              if (!ex) return null;
              return (
                <button key={id} onClick={() => onOpenExercise?.(ex)} className="chip hover:border-pitch-500/50 hover:text-pitch-400">
                  {ex.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
