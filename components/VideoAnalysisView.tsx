"use client";

import { HeatmapVideo } from "@/components/HeatmapVideo";
import { DrillChecklist } from "@/components/DrillChecklist";
import type { VideoAnalysis } from "@/lib/types";

// Shared renderer for a biomechanics analysis — used both for stored AI plans
// and for freshly-computed in-browser analyses.
export function VideoAnalysisView({ analysis, src }: { analysis: VideoAnalysis; src: string }) {
  const a = analysis;
  return (
    <div className="space-y-5">
      <HeatmapVideo src={src} points={a.heatmap_data ?? []} />
      {a.root_cause_alert && <div className="card px-4 py-3 text-sm text-readiness-red">⚠️ {a.root_cause_alert}</div>}
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Symmetry" value={`${a.symmetry_score}/100`} />
        <Stat label="Focus" value={cap(a.focus_area)} />
        <Stat label="Knee valgus L/R" value={`${a.biomechanics.knee_valgus_left}° / ${a.biomechanics.knee_valgus_right}°`} />
        <Stat label="Ground contact" value={`${a.biomechanics.ground_contact_ms} ms`} />
      </div>
      {a.pose_source === "mediapipe" ? (
        <p className="text-center text-xs text-slate-500">Analysed in your browser with on-device pose estimation.</p>
      ) : (
        <p className="text-center text-xs text-slate-500">Estimated analysis — pose tracking couldn’t read this clip, so values are approximated.</p>
      )}
      <DrillChecklist drills={a.drills ?? []} />
    </div>
  );
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
