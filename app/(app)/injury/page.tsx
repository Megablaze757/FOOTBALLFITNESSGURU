"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import {
  relevantInjuryProtocols, RECOVERY_INJURY, REHAB_DISCLAIMER,
  protocolsForAreas, matchInjuryText, baseAreaOf,
} from "@/lib/essentials";
import { getExercise, type Exercise, type SportId } from "@/lib/exercises";
import { ExerciseModal } from "@/components/ExerciseDetail";
import { InjuryPlanner } from "@/components/InjuryPlanner";
import { ProtocolCard } from "@/components/ProtocolCard";
import { BodyMap } from "@/components/BodyMap";

/**
 * Injury, rehab and mobility — its own page.
 *
 * IT WAS THE THIRD TAB OF "GUIDES". I tried to fix that with a deep link, a tool
 * tile and a soreness card on Home, and argued against a full page because the
 * four blocks shared state with the rest of Guides. That was a convenience
 * argument dressed up as a design one, and the feedback was the same twice over:
 * still can't find it.
 *
 * A tab is not a location. Nobody in pain browses a page called "Guides" hoping
 * the third tab is about them, and pain is exactly the moment someone stops
 * exploring and gives up. So it's a page, in the nav, with its own name.
 *
 * Mobility came with it — the warm-up sequence is the cheapest prevention there
 * is, and it was stranded under "Your position", where nobody looking to avoid
 * injury would find it either.
 *
 * NAMED "INJURY", NOT "INJURY & MOBILITY". It's a primary tab on mobile now, and
 * at six slots a 343px phone gives each about 57px — enough for an icon and
 * "Injury", not enough for the longer name. A short label people can find beats a
 * complete one they can't, so mobility is named in the lead and has its own
 * section instead.
 */

// The pre-training sequence, in the order it should be performed.
const MOBILITY_IDS = [
  "leg_swings", "world_greatest_stretch", "hip_90_90", "ankle_rocks",
  "glute_bridge", "monster_walk", "dead_bug", "thoracic_openers",
  "scap_pull_up", "couch_stretch",
];

export default function InjuryPage() {
  const user = useCurrentUser();
  const [open, setOpen] = useState<Exercise | null>(null);
  const [hurt, setHurt] = useState<Record<string, number>>({});
  const [desc, setDesc] = useState("");

  // "knee_left" -> "knee" so a tapped region maps to its rehab protocol.
  const picked = useMemo(() => [...new Set(Object.keys(hurt).map(baseAreaOf))], [hurt]);

  // Tapped areas and free text both feed the same lookup; de-duped so describing
  // an ankle after tapping "ankle" doesn't show it twice.
  const matched = useMemo(() => {
    const out = [...protocolsForAreas(picked), ...matchInjuryText(desc)];
    return out.filter((p, i) => out.findIndex((q) => q.id === p.id) === i);
  }, [picked, desc]);

  const { data, loading } = useAsync(async () => {
    const supabase = createClient();
    const [{ data: profile }, { data: checkIn }] = await Promise.all([
      supabase.from("profiles").select("sport").eq("id", user.id).maybeSingle(),
      supabase.from("daily_check_ins").select("pain_map").eq("user_id", user.id)
        .order("check_in_date", { ascending: false }).limit(1).maybeSingle(),
    ]);
    return {
      sport: ((profile as { sport?: string } | null)?.sport ?? "football") as SportId,
      painMap: (checkIn as { pain_map?: Record<string, number> } | null)?.pain_map ?? {},
    };
  }, [user.id], `injury:${user.id}`);

  const header = (
    <header>
      <h1 className="text-3xl font-extrabold tracking-tight">Injury</h1>
      <p className="mt-1 max-w-prose text-sm text-slate-400">
        Something hurting? Describe it and get a graded plan to load it safely. Plus the mobility
        warm-up that prevents most of it.
      </p>
    </header>
  );

  // Title first, so a link that lands here says where you are while it loads.
  if (loading || !data) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        {header}
        <div className="card h-96 animate-pulse" />
      </div>
    );
  }

  const injuryProtocols = relevantInjuryProtocols(data.painMap);

  return (
    <div className="animate-fade-up mx-auto max-w-3xl space-y-6">
      {header}

      {/* The planner first. The fixed protocols below can't handle "outside of my
          knee, six months, worse on stairs", which is what most real problems
          sound like. */}
      <InjuryPlanner sport={data.sport} area={picked[0]} />

      {/* Already told us in a check-in — no need to say it twice. */}
      {injuryProtocols.length > 0 && (
        <section className="space-y-3">
          <h2 className="field-label">From your last check-in</h2>
          {injuryProtocols.map((p) => <ProtocolCard key={p.id} p={p} highlight onOpenExercise={setOpen} />)}
        </section>
      )}

      <section className="card-premium space-y-4 p-6">
        <div>
          <h2 className="text-xl font-extrabold">What&apos;s bothering you?</h2>
          <p className="mt-1 text-sm text-slate-400">
            Tap where it hurts, or describe it — we&apos;ll pull up the right rehab plan.
          </p>
        </div>

        {/* Same body map as the check-in, in tap-to-select mode. */}
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
            : <p className="text-xs text-slate-500">No match yet — try tapping an area above, or browse all the guides below.</p>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="field-label">{matched.length > 0 ? "Your rehab plan" : "All rehab guides"}</h2>
          <p className="mt-1 text-xs text-slate-500">{REHAB_DISCLAIMER}</p>
        </div>
        {matched.length > 0
          ? matched.map((p) => <ProtocolCard key={p.id} p={p} highlight onOpenExercise={setOpen} />)
          : RECOVERY_INJURY.filter((p) => !injuryProtocols.some((i) => i.id === p.id))
              .map((p) => <ProtocolCard key={p.id} p={p} collapsed onOpenExercise={setOpen} />)}
      </section>

      {/* Prevention, not treatment — but it belongs with this, not under
          "Your position" where it was. */}
      <section>
        <h2 className="field-label mb-1">Mobility &amp; activation</h2>
        <p className="mb-3 text-xs text-slate-500">
          Run through these before training — the cheapest injury prevention there is.
        </p>
        <div className="flex flex-wrap gap-2">
          {MOBILITY_IDS.map((id) => {
            const ex = getExercise(id);
            if (!ex) return null;
            return (
              <button
                key={id}
                onClick={() => setOpen(ex)}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-slate-200 transition hover:border-pitch-400/40 hover:bg-pitch-400/[0.06]"
              >
                {ex.name} ›
              </button>
            );
          })}
        </div>
      </section>

      {open && <ExerciseModal ex={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
