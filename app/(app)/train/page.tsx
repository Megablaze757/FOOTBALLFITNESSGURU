"use client";

import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { VideoUploader } from "@/components/VideoUploader";
import { FormProgress, type Clip } from "@/components/FormProgress";
import { MOVEMENTS } from "@/lib/movement";
import type { Video, VideoStatus, VideoAnalysis } from "@/lib/types";

const STATUS_META: Record<VideoStatus, { label: string; cls: string }> = {
  uploading: { label: "Uploading", cls: "bg-white/10 text-slate-400" },
  processing: { label: "Tap to analyse", cls: "bg-pitch-400/15 text-pitch-400" },
  ready: { label: "Tap to analyse", cls: "bg-pitch-400/15 text-pitch-400" },
  analyzed: { label: "Analysed ✓", cls: "bg-readiness-green/15 text-readiness-green" },
  failed: { label: "Failed", cls: "bg-red-500/15 text-readiness-red" },
};

export default function TrainPage() {
  const user = useCurrentUser();

  const { data, loading, reload } = useAsync(async () => {
    const supabase = createClient();
    const [{ data: rows }, { data: plans }] = await Promise.all([
      supabase.from("videos").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("ai_plans").select("video_id, analysis_json").eq("user_id", user.id),
    ]);
    const videos = (rows ?? []) as Video[];
    const byVideo = new Map((plans ?? []).map((p) => [p.video_id as string, p.analysis_json as VideoAnalysis]));
    const clips: Clip[] = videos
      .filter((v) => byVideo.has(v.id))
      .map((v) => ({ id: v.id, date: v.created_at.slice(0, 10), label: v.title || v.session_type || "session", analysis: byVideo.get(v.id)! }))
      .reverse(); // oldest → newest for the trend
    return { videos, clips };
  }, [user.id], `train:${user.id}`);

  const videos = data?.videos ?? [];
  const clips = data?.clips ?? [];

  return (
    <div className="animate-fade-up space-y-5">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Train</h1>
        <p className="mt-1 text-sm text-slate-400">Upload a clip for biomechanics analysis &amp; a drill plan.</p>
      </header>

      <VideoUploader onUploaded={reload} />

      {clips.length > 0 && <FormProgress clips={clips} />}

      <section>
        <h2 className="field-label mb-2">Your videos</h2>
        {loading ? (
          <div className="card h-20 animate-pulse" />
        ) : !videos.length ? (
          <p className="card px-4 py-8 text-center text-sm text-slate-500">No videos yet. Upload one above.</p>
        ) : (
          <ul className="space-y-2">
            {videos.map((v) => {
              const meta = STATUS_META[v.status];
              const mv = MOVEMENTS.find((m) => m.id === (v.movement ?? "general"));
              const inner = (
                <div className="card card-hover flex items-center gap-3 p-3">
                  {v.thumb_data_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.thumb_data_url} alt="" className="h-14 w-20 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <div className="grid h-14 w-20 shrink-0 place-items-center rounded-xl bg-white/[0.04] text-xl">
                      {mv?.icon ?? "🎬"}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-100">
                      {v.title || `${cap(v.session_type ?? "session")} — ${v.created_at.slice(0, 10)}`}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                      <span>{v.created_at.slice(0, 10)}</span>
                      {mv && mv.id !== "general" && <span className="text-slate-400">· {mv.label}</span>}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.cls}`}>{meta.label}</span>
                </div>
              );
              return (
                <li key={v.id}>
                  {/* Anything that finished uploading is openable — the analysis
                      runs client-side the moment you open it. */}
                  {v.status === "uploading" || v.status === "failed"
                    ? inner
                    : <Link href={`/train/view?id=${v.id}`}>{inner}</Link>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
