"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { type IconName } from "@/components/Icon";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { positionGuides, gamedayLabel, GAMEDAY_NUTRITION, RECOVERY_GENERAL } from "@/lib/essentials";
import { positionList } from "@/lib/positions";
import { getExercise, SPORTS, type Exercise, type SportId } from "@/lib/exercises";
import { ExerciseModal } from "@/components/ExerciseDetail";
import { SkillDrills } from "@/components/SkillDrills";
import { Tabs, TabPanel } from "@/components/Tabs";
import { ProtocolCard } from "@/components/ProtocolCard";
import { FuelTimeline } from "@/components/FuelTimeline";

// The Playbook covers four unrelated topics. Stacked, that ran to six and a
// half screens on a phone; split into tabs each view is about two.
type TabId = "position" | "skills" | "fuel";
const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: "position", label: "Your position", icon: "target" },
  { id: "skills", label: "Skill drills", icon: "ball" },
  // "Injury & rehab" was here, and being a tab on a page called "Guides" is why
  // nobody could find it. It's /injury now, in the nav. Mobility went with it —
  // the warm-up was stranded under "Your position", equally unfindable for
  // anyone trying to avoid getting hurt.
  { id: "fuel", label: "Fuel & recovery", icon: "plate" },
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
      <TabPanel id="position">
      <div className="space-y-4">
        {guides.map(({ position, guide }, i) => (
        <section key={position || "all"} className="card-premium p-6">
          <div className="flex items-center gap-2">
            <span className="chip text-pitch-400">{sportLabel}</span>
            {i === 0 && guides.length > 1 && <span className="chip text-slate-400">main</span>}
          </div>
          {/* The position was a chip AND the heading. One of them was enough. */}
          <h2 className="mt-3 text-2xl font-extrabold">
            {position ? `Playing ${position}` : "Your position essentials"}
          </h2>
          <p className="mt-1 text-sm text-slate-300">{guide.summary}</p>

          {/* Two bordered panels inside a bordered card inside a bordered page
              is three frames around a bulleted list. The lists carry their own
              heading and a coloured marker; they don't need boxes to be told
              apart. */}
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Col title="Prioritise physically" items={guide.physical} icon="⚡" colour="#e3b53f" />
            <Col title="Sharpen technically" items={guide.skills} icon="🎯" colour="#38bdf8" />
          </div>

          <div className="mt-5 border-t border-white/[0.07] pt-4">
            <div className="stat-label mb-2">Key drills for you</div>
            <div className="flex flex-wrap gap-2">
              {guide.keyDrills.map((id) => {
                const ex = getExercise(id);
                if (!ex) return null;
                return (
                  <button key={id} onClick={() => setOpen(ex)} className="chip-option text-slate-200 hover:border-pitch-400/40">
                    {ex.name} <span aria-hidden>›</span>
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
      </TabPanel>
      )}

      {/* Technical work. The position guide says a centre back needs heading;
          this is where they find out how to actually practise it. */}
      {tab === "skills" && <TabPanel id="skills"><SkillDrills sport={sport} position={positions} /></TabPanel>}

      {/* One block, not two. `tab === "fuel"` was tested twice in a row with a
          separate section under each — same condition, same tab, two places to
          keep in step. */}
      {tab === "fuel" && (
      <TabPanel id="fuel">
      <div className="space-y-6">
        <section>
          <h2 className="field-label mb-1">{gameday} fuelling</h2>
          <p className="mb-3 text-xs text-slate-500">Tap the point you&apos;re at.</p>
          {/* Was six phases x three tips rendered at once — eighteen bullets and
              180 words down a rail, all the same weight, with the reader left to
              find their own place in it. There is no reason to read Friday's
              dinner advice from the changing room ninety minutes before
              kick-off. */}
          <FuelTimeline phases={GAMEDAY_NUTRITION} label={gameday} />
        </section>

        <section>
          <h2 className="field-label mb-1">Recovery protocols</h2>
          <p className="mb-3 text-xs text-slate-500">Tap one to open the steps.</p>
          {/* Was three fully-expanded protocol cards side by side — each with a
              checklist, red flags and exercise chips — squeezed into a third of
              the width and all of different heights. Collapsed, in one column,
              they're a list you can scan and open. */}
          <div className="space-y-2">
            {RECOVERY_GENERAL.map((p) => <ProtocolCard key={p.id} p={p} />)}
          </div>
        </section>
      </div>
      </TabPanel>
      )}

      {open && <ExerciseModal ex={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Col({ title, items, icon, colour }: {
  title: string; items: string[]; icon: string; colour: string;
}) {
  return (
    <div>
      <div className="stat-label mb-2">{icon} {title}</div>
      <ul className="space-y-2 text-sm text-slate-200">
        {items.map((i) => (
          <li key={i} className="flex gap-2.5">
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colour }} />
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
}
