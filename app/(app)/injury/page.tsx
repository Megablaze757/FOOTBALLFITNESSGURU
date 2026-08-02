"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
      supabase.from("daily_check_ins").select("pain_map, check_in_date").eq("user_id", user.id)
        .order("check_in_date", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const ci = checkIn as { pain_map?: Record<string, number>; check_in_date?: string } | null;
    // Only carry pain forward from a check-in in the last three days. The query
    // takes the most recent check-in whatever its date, and pre-filling a sore
    // knee from three weeks ago onto today's map would be a confident lie about
    // where it hurts — which then feeds the rehab plan.
    const fresh = ci?.check_in_date
      ? Date.now() - new Date(ci.check_in_date).getTime() < 3 * 86400_000
      : false;
    return {
      sport: ((profile as { sport?: string } | null)?.sport ?? "football") as SportId,
      painMap: ci?.pain_map ?? {},
      recentPain: fresh ? (ci?.pain_map ?? {}) : {},
    };
  }, [user.id], `injury:${user.id}`);

  // Start the map where the athlete already said it hurts. The page fetched the
  // pain map, used it to pick protocols, and then asked from scratch anyway.
  // Seeded once: re-seeding on every render would fight anyone clearing a spot.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !data) return;
    seeded.current = true;
    if (Object.keys(data.recentPain).length) setHurt(data.recentPain);
  }, [data]);

  const header = (
    <header>
      <h1 className="text-3xl font-extrabold tracking-tight">Injury</h1>
      {/* The lead used to open "Something hurting?" and then the card directly
          below it asked the same thing. The page title plus the card's own
          heading say it; this says what else is here. */}
      <p className="mt-1 max-w-prose text-sm text-slate-400">
        A staged plan to load an injury safely, the rehab guides behind it, and the mobility
        warm-up that prevents most of it.
      </p>
    </header>
  );

  // Title first, so a link that lands here says where you are while it loads.
  if (loading || !data) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        {header}
        {/* Shaped like the planner card, which is now most of the page. An
            h-96 slab was less than half its real height, so everything below
            jumped when the query landed. */}
        <div className="card-premium p-5">
          <div className="h-6 w-48 animate-pulse rounded bg-white/[0.06]" />
          <div className="mx-auto mt-5 h-72 w-36 animate-pulse rounded-3xl bg-white/[0.05]" />
          <div className="mt-5 h-24 animate-pulse rounded-xl bg-white/[0.04]" />
          <div className="mt-4 flex gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-8 flex-1 animate-pulse rounded-full bg-white/[0.04]" />
            ))}
          </div>
          <div className="mt-5 h-11 animate-pulse rounded-2xl bg-white/[0.06]" />
        </div>
      </div>
    );
  }

  const injuryProtocols = relevantInjuryProtocols(data.painMap);

  // Seeding the map from the check-in means `matched` now derives from the very
  // areas `injuryProtocols` was built from, so without this the same card
  // renders twice — once under "From your last check-in" and again under
  // "Matching guides", a few hundred pixels apart.
  const alsoMatched = matched.filter((m) => !injuryProtocols.some((i) => i.id === m.id));

  // Everything not already on screen, so browsing never repeats a card above it.
  const browseable = RECOVERY_INJURY.filter(
    (p) => !injuryProtocols.some((i) => i.id === p.id) && !alsoMatched.some((m) => m.id === p.id)
  );

  return (
    <div className="animate-fade-up mx-auto max-w-3xl space-y-6">
      {header}

      {/* The planner is the page. It carries the body map, the description and
          the duration — one set of inputs, asked once. The fixed protocols
          underneath can't handle "outside of my knee, six months, worse on
          stairs", which is what most real problems sound like; they're the
          backup, and they read off the same answers. */}
      <InjuryPlanner
        sport={data.sport}
        hurt={hurt}
        onHurtChange={setHurt}
        description={desc}
        onDescriptionChange={setDesc}
        seeded={Object.keys(data.recentPain).length > 0}
      />

      {/* Already told us in a check-in — no need to say it twice. */}
      {injuryProtocols.length > 0 && (
        <section className="space-y-3">
          <h2 className="field-label">From your last check-in</h2>
          {injuryProtocols.map((p) => <ProtocolCard key={p.id} p={p} highlight onOpenExercise={setOpen} />)}
        </section>
      )}

      {/* Matching guides only. This used to render EVERY protocol whenever
          nothing was selected, so the page for "something hurts, help" opened on
          a catalogue of a dozen cards about other people's injuries. The full
          list is still here, behind one tap, where browsing belongs. */}
      {alsoMatched.length > 0 && (
        <section className="space-y-3">
          <h2 className="field-label">
            Matching guides
            <span className="ml-2 font-normal normal-case tracking-normal text-slate-500">
              based on what you&apos;ve told us
            </span>
          </h2>
          {alsoMatched.map((p) => <ProtocolCard key={p.id} p={p} highlight onOpenExercise={setOpen} />)}
        </section>
      )}

      <details className="group card overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between p-4 text-sm font-semibold text-slate-200">
          <span>
            Browse all rehab guides
            <span className="ml-2 text-xs font-normal text-slate-500">{browseable.length} of them</span>
          </span>
          <span className="text-xs text-slate-500 transition group-open:rotate-180">▾</span>
        </summary>
        <div className="space-y-2 border-t border-white/[0.08] p-4">
          {browseable.map((p) => <ProtocolCard key={p.id} p={p} collapsed onOpenExercise={setOpen} />)}
        </div>
      </details>

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

      {/* Once. It rendered up to three times before — in the planner form, in
          the generated plan, and above the guides — and two of those were on
          screen together on the default view. A disclaimer repeated is a
          disclaimer nobody reads. */}
      <p className="text-xs text-slate-500">{REHAB_DISCLAIMER}</p>

      {open && <ExerciseModal ex={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
