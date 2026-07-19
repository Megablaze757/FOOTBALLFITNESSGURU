"use client";

import { HeatmapVideo } from "@/components/HeatmapVideo";
import { DrillChecklist } from "@/components/DrillChecklist";
import { RingProgress } from "@/components/RingProgress";
import { KneeCompare } from "@/components/KneeCompare";
import { VideoCoachFeedback } from "@/components/VideoCoachFeedback";
import type { VideoAnalysis } from "@/lib/types";

// Shared renderer for a biomechanics analysis — used both for stored AI plans
// and for freshly-computed in-browser analyses.
export function VideoAnalysisView({ analysis, src }: { analysis: VideoAnalysis; src: string }) {
  const a = analysis;
  const form = Number.isFinite(a.form_score) ? a.form_score : a.symmetry_score;
  const reps = a.rep_count ?? 0;
  const formColor = form >= 80 ? "#34d399" : form >= 60 ? "#e3b53f" : "#fb5d6b";
  // Older saved analyses have no `view` — treat them as before rather than
  // retroactively hiding their numbers.
  const kneeReadable = a.view == null || a.view === "front" || a.view === "angled";
  const conf = a.confidence;
  return (
    <div className="space-y-5">
      <HeatmapVideo src={src} points={a.heatmap_data ?? []} />
      {a.root_cause_alert && <div className="card px-4 py-3 text-sm text-readiness-red">⚠️ {a.root_cause_alert}</div>}

      <VideoCoachFeedback analysis={a} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card flex items-center gap-4 p-5 sm:col-span-1">
          <RingProgress pct={form} color={formColor} label={`${form}`} sub="form" size={92} />
          <div>
            <div className="stat-label">Form score</div>
            <div className="text-sm text-slate-300">{formVerdict(form)}</div>
            {reps > 0 && <div className="mt-1 text-xs text-slate-400">{reps} rep{reps === 1 ? "" : "s"} detected</div>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:col-span-2">
          <Stat label="Symmetry" value={`${a.symmetry_score}/100`} />
          <Stat label="Focus" value={cap(a.focus_area)} />
          {kneeReadable
            ? <Stat label="Knee valgus L/R" value={`${a.biomechanics.knee_valgus_left}° / ${a.biomechanics.knee_valgus_right}°`} />
            : <Stat label="Knee valgus L/R" value="Needs front-on" />}
          {/* Only shown when the frame rate could actually resolve it. */}
          {a.biomechanics.ground_contact_ms != null
            ? <Stat label="Ground contact" value={`${a.biomechanics.ground_contact_ms} ms`} />
            : <Stat label="Camera view" value={cap(a.view ?? "unknown")} />}
        </div>
      </div>

      {kneeReadable && (
        <div className="card p-5">
          <div className="stat-label mb-3">You vs ideal — knee tracking</div>
          <KneeCompare valgusLeft={a.biomechanics.knee_valgus_left} valgusRight={a.biomechanics.knee_valgus_right} />
        </div>
      )}

      {conf != null && conf < 0.6 && (
        <div className="card border-amber-400/30 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-200">
          <span className="font-semibold">Low confidence ({Math.round(conf * 100)}%).</span> This clip was hard to read
          — treat the numbers as rough. Best results: film front-on, whole body in frame, good light, 5–8 seconds.
        </div>
      )}

      {a.pose_source === "mediapipe" ? (
        <p className="text-center text-xs text-slate-500">Analysed in your browser with on-device pose estimation.</p>
      ) : (
        <p className="text-center text-xs text-slate-500">Estimated analysis — pose tracking couldn’t read this clip, so values are approximated.</p>
      )}
      <DrillChecklist drills={a.drills ?? []} />
    </div>
  );
}

function formVerdict(s: number): string {
  if (s >= 85) return "Excellent movement quality";
  if (s >= 70) return "Solid — a few things to sharpen";
  if (s >= 55) return "Work to do — follow the drills";
  return "High-risk pattern — prioritise the fixes";
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="stat-label">{label}</div>
      <div className="mt-1 text-lg font-extrabold text-slate-100">{value}</div>
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
