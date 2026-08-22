"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { useTier } from "@/lib/use-tier";
import { can } from "@/lib/subscription";
import { FeatureLock } from "@/components/FeatureLock";
import {
  relevantInjuryProtocols, RECOVERY_INJURY, REHAB_DISCLAIMER,
  protocolsForAreas, matchInjuryText, baseAreaOf,
} from "@/lib/essentials";
import { getExercise, type Exercise, type SportId } from "@/lib/exercises";
import { ExerciseModal } from "@/components/ExerciseDetail";
import { InjuryPlanner } from "@/components/InjuryPlanner";
import Link from "next/link";
import { SectionNav } from "@/components/SectionNav";
import { ProtocolCard } from "@/components/ProtocolCard";
import { currentPain, painAgeNote, daysBetween, PAIN_FRESH_DAYS } from "@/lib/pain";
import { todayLocal } from "@/lib/day";

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
  const { tier, loading: tierLoading } = useTier();
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
    const [{ data: profile }, { data: checkIn }, { data: program }] = await Promise.all([
      supabase.from("profiles").select("sport, sex, birth_year, training_focus, experience_years").eq("id", user.id).maybeSingle(),
      supabase.from("daily_check_ins").select("pain_map, check_in_date, fatigue_score, sleep_quality").eq("user_id", user.id)
        .order("check_in_date", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("programs").select("goal_type, in_season, plan").eq("user_id", user.id).eq("status", "active")
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const ci = checkIn as {
      pain_map?: Record<string, number>; check_in_date?: string;
      fatigue_score?: number | null; sleep_quality?: number | null;
    } | null;
    const pr = profile as {
      sport?: string; sex?: string; birth_year?: number; training_focus?: string;
      experience_years?: number;
    } | null;
    const active = program as {
      goal_type?: string; in_season?: boolean;
      plan?: { weeks?: { sessions?: { drills?: { name?: string }[] }[] }[] };
    } | null;
    /**
     * This page had the right instinct first — it refused to pre-fill the body
     * map from a check-in older than three days, because seeding a three-week-
     * old knee onto today's map "would be a confident lie about where it hurts".
     * It was the only screen that did, which is what made the rest of the app
     * program around injuries that had healed months earlier.
     *
     * Same rule, now shared and tapered rather than a cliff — see lib/pain.ts.
     * Seeding the MAP still uses the strict fresh window: a pre-ticked body part
     * is a claim about right now, and a faded 4 is not one.
     */
    const today = todayLocal();
    const fresh = ci?.check_in_date ? daysBetween(ci.check_in_date, today) <= PAIN_FRESH_DAYS : false;
    return {
      sport: (pr?.sport ?? "football") as SportId,
      painMap: currentPain(ci?.pain_map, ci?.check_in_date, today),
      recentPain: fresh ? (ci?.pain_map ?? {}) : {},
      painNote: painAgeNote(ci?.check_in_date, today),
      athleteContext: {
        age: pr?.birth_year ? new Date().getFullYear() - pr.birth_year : null,
        sex: pr?.sex ?? null,
        trainingFocus: pr?.training_focus ?? null,
        trainingExperienceYears: pr?.experience_years ?? null,
        currentGoal: active?.goal_type ?? null,
        inSeason: active?.in_season ?? null,
        fatigue: ci?.fatigue_score ?? null,
        sleepQuality: ci?.sleep_quality ?? null,
        currentPain: currentPain(ci?.pain_map, ci?.check_in_date, today),
        programExercises: Array.from(new Set(
          (active?.plan?.weeks ?? []).flatMap((week) => (week.sessions ?? []).flatMap((session) =>
            (session.drills ?? []).map((drill) => drill.name).filter((name): name is string => !!name)
          )),
        )).slice(0, 40),
      },
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
      <h1 className="text-3xl font-extrabold tracking-tight">Recovery</h1>
      {/* "Recovery" is the tab, so the lead has to carry the word "injury" —
          this page was reported unfindable twice under a narrower name, and the
          fix was never the title on its own. The triage card directly below
          still asks "Something hurting?" in as many words. */}
      <p className="mt-1 max-w-prose text-sm text-slate-400">
        Injury and rehab: a staged plan to load an injury safely, the guides behind it, and the
        mobility warm-up that prevents most of it.
      </p>
      {/* SAY THAT THE DISCOUNT IS HAPPENING. Pain now fades out of the
          programme if it is not re-reported (lib/pain.ts), which is right —
          but an athlete whose training quietly stops avoiding a knee deserves
          to be told why, and given the one tap that fixes it. */}
      {data?.painNote && (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-amber-500/90">
          {data.painNote}
          <Link href="/journal" className="font-semibold text-pitch-400 underline-offset-2 hover:underline">
            Today&apos;s log
          </Link>
        </p>
      )}
      <div className="mt-4"><SectionNav section="/injury" /></div>
    </header>
  );

  // Title first, so a link that lands here says where you are while it loads.
  if (loading || tierLoading || !data) {
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

  /**
   * `injury_plan` was declared in CAPABILITY_TIER and checked nowhere.
   *
   * The staged loading plan, the rehab protocols behind it and the matching of
   * a written description to a protocol are the paid product — this is the page
   * the capability was named for, and it was open to everyone.
   *
   * Free keeps the pain map where it has always been: on the daily check-in.
   * Saying where it hurts is part of checking in, and locking that would break
   * the one thing free is FOR. What is paid is the plan that comes back.
   */
  if (!can(tier, "injury_plan")) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        {header}
        <FeatureLock
          capability="injury_plan"
          title="The injury planner is part of Pro"
          blurb="Tell it where it hurts and get a staged plan that loads the area back to full — with the rehab protocol behind every stage, and your training built around it rather than paused. You can still log pain on your daily check-in."
        />
      </div>
    );
  }

  const fromCheckIn = relevantInjuryProtocols(data.painMap);

  /**
   * Every protocol, ranked, each appearing exactly once.
   *
   * Three overlapping lists used to be derived here and rendered as three
   * sections, which needed a dedupe pass between them precisely because a
   * carried-over check-in area matches the same protocol the body map does.
   * One list with a reason attached removes the overlap by construction.
   */
  const relevantProtocols = RECOVERY_INJURY.flatMap((p) => {
    if (fromCheckIn.some((i) => i.id === p.id)) return [{ p, reason: "from your check-in" }];
    if (matched.some((m) => m.id === p.id)) return [{ p, reason: "matches what you said" }];
    return [];
  });
  const otherProtocols = RECOVERY_INJURY.filter(
    (p) => !relevantProtocols.some((r) => r.p.id === p.id)
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
        athleteContext={data.athleteContext}
      />

      {/* ONE LIST, NOT THREE.
          There were three separate sections of the same card type — "From your
          last check-in", "Matching guides", and a "Browse all" disclosure —
          three headings and three lists to scan before reaching the mobility
          work. They're one list now, with the ones that match what you've told
          us at the top and badged.

          None of them opens on arrival. That was the wall: each protocol is
          about 175 words of steps, red flags and a four-stage return-to-play
          plan, and the relevant ones rendered fully expanded — so a check-in
          flagging a knee and an ankle put ~350 words of rehab on screen before
          the athlete had tapped anything. Knowing which protocol applies is the
          useful part; dumping it open is not. */}
      <section className="space-y-2">
        <h2 className="field-label">
          Rehab guides
          {relevantProtocols.length > 0 && (
            <span className="ml-2 font-normal normal-case tracking-normal text-slate-500">
              {relevantProtocols.length} match{relevantProtocols.length === 1 ? "es" : ""} what you&apos;ve told us
            </span>
          )}
        </h2>

        {relevantProtocols.map(({ p, reason }) => (
          <ProtocolCard key={p.id} p={p} relevant reason={reason} onOpenExercise={setOpen} />
        ))}
        {otherProtocols.map((p) => (
          <ProtocolCard key={p.id} p={p} onOpenExercise={setOpen} />
        ))}
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
                className="chip-option text-slate-200 hover:border-pitch-400/40"
              >
                {ex.name} <span aria-hidden>›</span>
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
