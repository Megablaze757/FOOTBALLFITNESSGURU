"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { VideoUploader } from "@/components/VideoUploader";
import { FeatureLock } from "@/components/FeatureLock";
import { useTier } from "@/lib/use-tier";
import { can } from "@/lib/subscription";
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

/**
 * Removes a clip and the file behind it. The storage object goes first: if the
 * row went first and the delete then failed, the file would be orphaned in the
 * bucket — still billed, and no longer reachable to try again.
 */
function DeleteVideo({ video, onDeleted }: { video: Video; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: storageErr } = await supabase.storage.from("videos").remove([video.storage_path]);
    // A missing object isn't a failure — the row should still go.
    if (storageErr && !/not found/i.test(storageErr.message)) {
      setError(storageErr.message);
      setBusy(false);
      return;
    }
    const { error: rowErr } = await supabase.from("videos").delete().eq("id", video.id);
    setBusy(false);
    if (rowErr) { setError(rowErr.message); return; }
    onDeleted();
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        aria-label="Delete clip"
        title="Delete clip"
        className="tap-target grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 text-slate-500 transition hover:border-readiness-red/40 hover:text-readiness-red"
      >
        🗑
      </button>
    );
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex gap-1">
        <button onClick={remove} disabled={busy} className="rounded-xl bg-readiness-red/15 px-2.5 py-1.5 text-xs font-semibold text-readiness-red disabled:opacity-50">
          {busy ? "…" : "Delete"}
        </button>
        <button onClick={() => setConfirming(false)} disabled={busy} className="rounded-xl border border-white/10 px-2.5 py-1.5 text-xs text-slate-400">
          Cancel
        </button>
      </div>
      {error && <span className="max-w-[10rem] text-right text-[10px] text-readiness-red">{error}</span>}
    </div>
  );
}

export default function TrainPage() {
  const user = useCurrentUser();
  const { tier, loading: tierLoading } = useTier();

  const { data, loading, reload } = useAsync(async () => {
    const supabase = createClient();
    const [{ data: rows }, { data: plans }, { data: profile }] = await Promise.all([
      supabase.from("videos").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("ai_plans").select("video_id, analysis_json").eq("user_id", user.id),
      // Needed so the uploader says "Game" to a basketball player, not "Match".
      supabase.from("profiles").select("sport").eq("id", user.id).maybeSingle(),
    ]);
    const videos = (rows ?? []) as Video[];
    const byVideo = new Map((plans ?? []).map((p) => [p.video_id as string, p.analysis_json as VideoAnalysis]));
    const clips: Clip[] = videos
      .filter((v) => byVideo.has(v.id))
      .map((v) => ({ id: v.id, date: v.created_at.slice(0, 10), label: v.title || v.session_type || "session", analysis: byVideo.get(v.id)! }))
      .reverse(); // oldest → newest for the trend
    return { videos, clips, sport: (profile as { sport?: string } | null)?.sport ?? "football" };
  }, [user.id], `train:${user.id}`);

  const videos = data?.videos ?? [];
  const clips = data?.clips ?? [];

  return (
    <div className="animate-fade-up space-y-5">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Video analysis</h1>
        {/* Says where it runs, because that is the question people actually
            have about uploading a video of themselves — and the answer is
            unusually good. */}
        <p className="mt-1 text-sm text-slate-400">
          Film a couple of reps and get it read frame by frame, with drills for what it finds.
          Runs on your phone — the clip is never sent anywhere to be analysed.
        </p>
      </header>

      {/* THE PAYWALL BEFORE THE FORM, not after the upload.
          Video analysis is Pro, and free's quota is zero — so a free athlete
          could still pick a file, name it, choose a movement and press upload,
          and only then be told. The clips they already have stay listed below
          and still play; what is gated is adding another. */}
      {tierLoading ? (
        <div className="card h-40 animate-pulse" />
      ) : can(tier, "video_analysis") ? (
        <VideoUploader sport={data?.sport} onUploaded={reload} />
      ) : (
        <FeatureLock
          capability="video_analysis"
          title="Video analysis is part of Pro"
          blurb="Film a couple of reps on your phone and get them read frame by frame — tempo, depth, bar path, knee travel — with the drills for whatever it finds. The clip never leaves your device; the analysis runs on it."
        />
      )}

      {clips.length > 0 && <FormProgress clips={clips} />}

      <section>
        <h2 className="field-label mb-2">Your videos</h2>
        {loading ? (
          <div className="card h-20 animate-pulse" />
        ) : !videos.length ? (
          <p className="card px-4 py-6 text-center text-sm text-slate-500">
            Nothing analysed yet. Pick what you want checked above and film a couple of reps.
          </p>
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
                <li key={v.id} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    {/* Anything that finished uploading is openable — the analysis
                        runs client-side the moment you open it. */}
                    {v.status === "uploading" || v.status === "failed"
                      ? inner
                      : <Link href={`/train/view?id=${v.id}`}>{inner}</Link>}
                  </div>
                  <DeleteVideo video={v} onDeleted={reload} />
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
