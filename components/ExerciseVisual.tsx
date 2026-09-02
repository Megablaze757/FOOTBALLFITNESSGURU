"use client";

import { useState } from "react";
import { ExerciseWatch } from "@/components/ExerciseWatch";
import { ExerciseMuscleMap } from "@/components/ExerciseMuscleMap";

/**
 * Two questions an exercise card gets asked, and one answer each.
 *
 * "How does it go?" is a video — see ExerciseWatch for why it stopped being a
 * picture. "What does it work?" is the app's own anatomy map, which is the one
 * thing here a video genuinely cannot do: a clip shows a shape, not which head
 * of the triceps is taking the load.
 *
 * They stay adjacent choices rather than two layers of one image, because they
 * are answers to different questions and nobody wants both at once.
 */
export function ExerciseVisual({ muscles, name, videoUrl, youtubeId }: {
  muscles: readonly string[];
  name: string;
  videoUrl?: string | null;
  youtubeId?: string | null;
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
                className={`min-h-[44px] rounded-full px-4 text-xs font-bold capitalize transition ${view === option ? "bg-pitch-400 text-on-accent" : "text-slate-400 hover:text-slate-200"}`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      )}
      {view === "muscles" && hasMap ? (
        <div className="grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-2xl border border-white/10 bg-slate-100 shadow-card sm:aspect-[16/9]">
          <ExerciseMuscleMap muscles={muscles} name={name} className="h-full w-full !rounded-none" />
        </div>
      ) : (
        /* The player sets its own 16:9 — a video letterboxed inside a 4:3 board
           to match a drawing that is no longer there would be a frame around
           nothing. */
        <ExerciseWatch name={name} videoUrl={videoUrl} youtubeId={youtubeId} />
      )}
    </div>
  );
}
