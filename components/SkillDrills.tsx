"use client";

import { useMemo, useState } from "react";
import { skillsForSport, skillCategories, hasSkills, type SkillDrill } from "@/lib/skills";
import type { SportId } from "@/lib/exercises";

/**
 * Technical drills for a sport, led by the ones that matter for the athlete's
 * position. A centre back opens on heading and defending; a winger on crossing
 * and 1v1s. Everything else is still there below, because a position is a
 * starting point rather than a cage.
 */
export function SkillDrills({ sport, position }: { sport: SportId; position?: string | null }) {
  const [skill, setSkill] = useState<string | "all">("all");
  const [soloOnly, setSoloOnly] = useState(false);

  const categories = useMemo(() => skillCategories(sport), [sport]);
  const drills = useMemo(() => {
    const all = skillsForSport(sport, position);
    return all
      .filter((d) => skill === "all" || d.skill === skill)
      .filter((d) => !soloOnly || d.solo);
  }, [sport, position, skill, soloOnly]);

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
          {position ? `Ordered for a ${position.toLowerCase()} — ` : ""}
          the technical work, not the gym work.
        </p>
      </div>

      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <Pill label="All" active={skill === "all"} onClick={() => setSkill("all")} />
        {categories.map((c) => (
          <Pill key={c} label={c} active={skill === c} onClick={() => setSkill(c)} />
        ))}
      </div>

      {/* Most people train alone most of the time, and a drill needing three
          team-mates is useless on a Tuesday evening. */}
      <label className="flex items-center gap-2 text-xs text-slate-400">
        <input
          type="checkbox"
          checked={soloOnly}
          onChange={(e) => setSoloOnly(e.target.checked)}
          className="h-4 w-4 accent-pitch-500"
        />
        Only show drills I can do on my own
      </label>

      {drills.length === 0 ? (
        <p className="card px-4 py-6 text-center text-sm text-slate-500">
          Nothing matches — try clearing the solo filter.
        </p>
      ) : (
        <ul className="space-y-2">
          {drills.map((d) => (
            <li key={d.id}>
              <DrillCard drill={d} highlight={!!position && d.positions.includes(position)} />
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
      <summary className="flex cursor-pointer list-none items-start gap-3">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="chip text-pitch-400">{drill.skill}</span>
            {drill.solo && <span className="chip text-slate-400">solo</span>}
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
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active ? "border-pitch-400/50 bg-pitch-400/10 text-pitch-400" : "border-white/10 bg-white/[0.03] text-slate-300"
      }`}
    >
      {label}
    </button>
  );
}
