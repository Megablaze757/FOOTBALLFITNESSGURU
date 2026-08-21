"use client";

import { useMemo, useState } from "react";
import { skillsForSport, skillCategories, hasSkills, drillsYouCanDo, NEEDS_LABEL, type SkillDrill } from "@/lib/skills";
import type { SportId } from "@/lib/exercises";
import { positionList, positionLabel } from "@/lib/positions";

const NEEDS_STYLE: Record<SkillDrill["needs"], string> = {
  solo: "text-readiness-green",
  partner: "text-slate-300",
  team: "text-slate-500",
};

// What you've got with you today. Ordered so each option includes the ones
// before it — with a partner you can still do the wall drills.
const HAVE_OPTIONS: { id: SkillDrill["needs"]; label: string }[] = [
  { id: "solo", label: "Just me" },
  { id: "partner", label: "Me + one" },
  { id: "team", label: "Full session" },
];

/**
 * Technical drills for a sport, led by the ones that matter for the athlete's
 * position. A centre back opens on heading and defending; a winger on crossing
 * and 1v1s. Everything else is still there below, because a position is a
 * starting point rather than a cage.
 */
export function SkillDrills({ sport, position }: { sport: SportId; position?: string | string[] | null }) {
  const [skill, setSkill] = useState<string | "all">("all");
  const [have, setHave] = useState<SkillDrill["needs"]>("team");

  // An athlete who plays two positions gets the work for both up top.
  const mine = useMemo(() => positionList(position), [position]);
  const categories = useMemo(() => skillCategories(sport), [sport]);
  const drills = useMemo(() => {
    const all = skillsForSport(sport, mine).filter((d) => skill === "all" || d.skill === skill);
    return drillsYouCanDo(all, have);
  }, [sport, mine, skill, have]);

  if (!hasSkills(sport)) {
    return (
      <p className="card px-4 py-8 text-center text-sm text-slate-500">
        No technical drills for this sport — your training is the lifting itself.
        The exercise library and your program cover it.
      </p>
    );
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="field-label !mb-1">Skill drills</h2>
        <p className="text-xs text-slate-500">
          {mine.length ? `Ordered for a ${positionLabel(mine).toLowerCase()} — ` : ""}
          the technical work, not the gym work.
        </p>
      </div>

      {/* Who have you got? Most people train alone most of the time, and a
          drill needing three team-mates is useless on a Tuesday evening. */}
      <div>
        <span className="mb-1.5 block text-xs text-slate-500">Training with</span>
        <div className="flex gap-2">
          {HAVE_OPTIONS.map((o) => (
            <button
              key={o.id}
              onClick={() => setHave(o.id)}
              className={`min-h-[44px] flex-1 rounded-xl border py-2 text-xs font-semibold transition ${
                have === o.id
                  ? "border-pitch-400/50 bg-pitch-400/10 text-pitch-400"
                  : "border-white/10 bg-white/[0.03] text-slate-300"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <Pill label="All" active={skill === "all"} onClick={() => setSkill("all")} />
        {categories.map((c) => (
          <Pill key={c} label={c} active={skill === c} onClick={() => setSkill(c)} />
        ))}
      </div>

      {drills.length === 0 ? (
        <p className="card px-4 py-6 text-center text-sm text-slate-500">
          Nothing here you can do on your own — try &ldquo;Me + one&rdquo;, or a different skill.
        </p>
      ) : (
        <ul className="space-y-2">
          {drills.map((d) => (
            <li key={d.id}>
              <DrillCard drill={d} highlight={d.positions.some((p) => mine.includes(p))} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DrillCard({ drill, highlight }: { drill: SkillDrill; highlight: boolean }) {
  return (
    <details className={`card p-4 ${highlight ? "ring-1 ring-pitch-400/30" : ""}`}>
      <summary className="min-h-[44px] flex cursor-pointer list-none items-start gap-3">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="chip text-pitch-400">{drill.skill}</span>
            <span className={`chip ${NEEDS_STYLE[drill.needs]}`}>{NEEDS_LABEL[drill.needs]}</span>
            {highlight && <span className="chip text-pitch-400">your position</span>}
          </span>
          <span className="mt-1.5 block font-bold text-slate-100">{drill.name}</span>
          <span className="mt-0.5 block text-xs text-slate-500">{drill.reps}</span>
        </span>
        <span className="shrink-0 text-xs text-slate-500">▾</span>
      </summary>

      <div className="mt-3 space-y-3 border-t border-white/5 pt-3">
        <Line label="You need" text={drill.setup} />
        <div>
          <div className="stat-label mb-1">How to run it</div>
          <ol className="space-y-1">
            {drill.how.map((s, i) => (
              <li key={s} className="flex gap-2 text-sm text-slate-300">
                <span className="shrink-0 text-pitch-400">{i + 1}.</span>{s}
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded-2xl bg-pitch-400/[0.06] p-3">
          <div className="stat-label !mb-1 text-pitch-400">The thing that matters</div>
          <p className="text-sm text-slate-200">{drill.coaching}</p>
        </div>
        <Line label="Make it harder" text={drill.progression} />
      </div>
    </details>
  );
}

function Line({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="stat-label mb-0.5">{label}</div>
      <p className="text-sm text-slate-300">{text}</p>
    </div>
  );
}

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-pressed={active} className="chip-option chip-option-sm">
      {label}
    </button>
  );
}
