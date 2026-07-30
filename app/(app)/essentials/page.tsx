"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { positionGuides, gamedayLabel, GAMEDAY_NUTRITION, RECOVERY_GENERAL } from "@/lib/essentials";
import { positionList } from "@/lib/positions";
import { getExercise, SPORTS, type Exercise, type SportId } from "@/lib/exercises";
import { ExerciseModal } from "@/components/ExerciseDetail";
import { SkillDrills } from "@/components/SkillDrills";
import { Tabs } from "@/components/Tabs";
import { ProtocolCard } from "@/components/ProtocolCard";

// The Playbook covers four unrelated topics. Stacked, that ran to six and a
// half screens on a phone; split into tabs each view is about two.
type TabId = "position" | "skills" | "fuel";
const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "position", label: "Your position", icon: "🎯" },
  { id: "skills", label: "Skill drills", icon: "⚽" },
  // "Injury & rehab" was here, and being a tab on a page called "Guides" is why
  // nobody could find it. It's /injury now, in the nav. Mobility went with it —
  // the warm-up was stranded under "Your position", equally unfindable for
  // anyone trying to avoid getting hurt.
  { id: "fuel", label: "Fuel & recovery", icon: "🍝" },
];

export default function EssentialsPage() {
  const user = useCurrentUser();
  const [open, setOpen] = useState<Exercise | null>(null);
  const router = useRouter();
  const [tab, setTab] = useState<TabId>(() => {
    if (typeof window === "undefined") return "position";
    const wanted = new URLSearchParams(window.location.search).get("tab");
    return TABS.some((t) => t.id === wanted) ? (wanted as TabId) : "position";
  });

  // ?tab=injury used to open the injury tab here, and that link is out in the
  // wild — it was the tool tile's href and Home's soreness card. Injury is its
  // own page now, so forward rather than silently showing the position guide,
  // which would look like the link was broken.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("tab") === "injury") {
      router.replace("/injury");
    }
  }, [router]);
  const { data, loading } = useAsync(async () => {
    // The check-in query went with the injury tab: this page no longer needs to
    // know what hurts, so it no longer asks.
    const { data: profile } = await createClient()
      .from("profiles").select("sport, position, positions").eq("id", user.id).maybeSingle();
    const p = profile as { sport?: string; position?: string; positions?: string[] } | null;
    return {
      sport: (p?.sport ?? "football") as SportId,
      positions: positionList(p?.positions?.length ? p.positions : p?.position),
    };
  }, [user.id], `essentials:${user.id}`);

  // Title and tabs first — see the note in nutrition/page.tsx. The tabs matter
  // here in particular: someone who followed a link to ?tab=injury should see
  // where they've landed while the query runs, not a blank card.
  if (loading || !data) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <h1 className="text-3xl font-extrabold tracking-tight">Guides</h1>
          <p className="mt-1 text-sm text-slate-400">Position essentials, matchday nutrition and recovery.</p>
        </header>
        <Tabs tabs={TABS} active={tab} onChange={setTab} label="Guide sections" />
        <div className="card h-96 animate-pulse" />
      </div>
    );
  }

  const { sport, positions } = data;
  // One card per position they play — a full back who covers at centre back
  // reads both, rather than us picking for them.
  const guides = positionGuides(sport, positions);
  const sportLabel = SPORTS.find((s) => s.id === sport)?.label ?? sport;
  const gameday = gamedayLabel(sport);

  return (
    <div className="animate-fade-up mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Guides</h1>
        <p className="mt-1 text-sm text-slate-400">Position essentials, {gameday.toLowerCase()} nutrition and recovery — tailored to you.</p>
      </header>

      {/* Was a hand-rolled copy of this markup. Four tab strips across the app,
          two implementations, and the copies had no roles, no aria-selected and
          no arrow keys — so the same control behaved differently depending on
          which page you were on. */}
      <Tabs tabs={TABS} active={tab} onChange={setTab} label="Guide sections" />

      {/* Position essentials */}
      {tab === "position" && (
      <div className="space-y-4">
        {guides.map(({ position, guide }, i) => (
        <section key={position || "all"} className="card-premium p-6">
          <div className="flex items-center gap-2">
            <span className="chip text-pitch-400">{sportLabel}</span>
            <span className="chip">{position || "All-round"}</span>
            {i === 0 && guides.length > 1 && <span className="chip text-slate-400">main</span>}
          </div>
          <h2 className="mt-3 text-xl font-extrabold">
            {position ? `${position} essentials` : "Your position essentials"}
          </h2>
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
          {!positions.length && (
            <p className="mt-4 text-xs text-slate-500">Set your position in the <Link href="/coach" className="text-pitch-400 hover:underline">AI Coach quiz</Link> to make this position-specific.</p>
          )}
        </section>
        ))}
      </div>
      )}

      {/* Technical work. The position guide says a centre back needs heading;
          this is where they find out how to actually practise it. */}
      {tab === "skills" && <SkillDrills sport={sport} position={positions} />}

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
