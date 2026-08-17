"use client";

import { useState } from "react";
import type { DemoPattern, Implement } from "@/lib/exercises";
import { ExerciseSteps } from "@/components/ExerciseDemo";
import { ExerciseMuscleMap } from "@/components/ExerciseMuscleMap";

/**
 * Competitor-style teaching visual: movement and anatomy are adjacent choices,
 * not two layers fighting for space in one image. The app-owned SVG map keeps
 * this available for every exercise without media downloads or licensed art.
 */
export function ExerciseVisual({ pattern, implement, muscles, name, videoUrl }: {
  pattern: DemoPattern;
  implement?: Implement;
  muscles: readonly string[];
  name: string;
  videoUrl?: string;
}) {
  const [view, setView] = useState<"movement" | "muscles">("movement");
  const hasMap = muscles.length > 0;

  return (
    <div>
      {hasMap && (
        <div className="mb-2 flex justify-center" role="tablist" aria-label="Exercise visual">
          <div className="inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1">
            {(["movement", "muscles"] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={view === option}
                onClick={() => setView(option)}
                className={`min-h-[36px] rounded-full px-4 text-xs font-bold capitalize transition ${view === option ? "bg-pitch-400 text-ink-900" : "text-slate-400 hover:text-slate-200"}`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-2xl border border-white/10 bg-slate-100 shadow-card sm:aspect-[16/9]">
        {view === "muscles" && hasMap ? (
          <ExerciseMuscleMap muscles={muscles} name={name} className="h-full w-full !rounded-none" />
        ) : videoUrl ? (
          <video src={videoUrl} autoPlay muted loop playsInline className="h-full w-full object-cover" />
        ) : (
          <ExerciseSteps pattern={pattern} implement={implement} muscles={muscles} name={name} className="h-full w-full !rounded-none" />
        )}
      </div>
    </div>
  );
}
