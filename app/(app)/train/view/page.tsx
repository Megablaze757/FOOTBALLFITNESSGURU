"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { HeatmapVideo } from "@/components/HeatmapVideo";
import { DrillChecklist } from "@/components/DrillChecklist";
import type { AiPlan, Subscription, Video } from "@/lib/types";

export default function VideoDetailPage() {
  return (
    <Suspense>
      <VideoDetailInner />
    </Suspense>
  );
}

function VideoDetailInner() {
  const user = useCurrentUser();
  const id = useSearchParams().get("id") ?? "";

  const { data, loading } = useAsync(async () => {
    const supabase = createClient();
    const { data: videoRow } = await supabase
      .from("videos").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
    if (!videoRow) return { video: null as Video | null };
    const video = videoRow as Video;
    const [{ data: signed }, { data: subRow }, { data: planRow }] = await Promise.all([
      supabase.storage.from("videos").createSignedUrl(video.storage_path, 600),
      supabase.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("ai_plans").select("*").eq("video_id", video.id).maybeSingle(),
    ]);
    return {
      video,
      src: signed?.signedUrl ?? "",
      sub: (subRow ?? null) as Subscription | null,
      plan: (planRow ?? null) as AiPlan | null,
    };
  }, [user.id, id]);

  if (loading) return <div className="card h-64 animate-pulse" />;
  if (!data?.video) return <p className="card px-4 py-8 text-center text-sm text-slate-400">Video not found.</p>;

  const { video, src, sub, plan } = data;
  const isGold = sub?.status === "active" && sub.tier === "gold";

  return (
    <div className="animate-fade-up space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold capitalize tracking-tight">{video.session_type ?? "Session"}</h1>
          <p className="text-sm text-slate-400">{video.created_at.slice(0, 10)}</p>
        </div>
        <Link href="/train" className="text-sm text-slate-400 hover:text-pitch-400">← Back</Link>
      </header>

      {!isGold ? (
        <>
          <video src={src} controls playsInline className="w-full rounded-2xl bg-black" />
          <UpgradeLock />
        </>
      ) : plan ? (
        <Analysis plan={plan} src={src} />
      ) : video.status === "failed" ? (
        <div className="card px-4 py-3 text-sm text-readiness-red">Analysis failed for this clip. Try a clearer, well-lit video.</div>
      ) : (
        <>
          <video src={src} controls playsInline className="w-full rounded-2xl bg-black" />
          <div className="card px-4 py-3 text-sm text-amber-300">Analysing your movement… this can take up to a minute. Refresh shortly.</div>
        </>
      )}
    </div>
  );
}

function Analysis({ plan, src }: { plan: AiPlan; src: string }) {
  const a = plan.analysis_json;
  const drills = plan.drill_program ?? a.drills ?? [];
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
      {a.pose_source === "synthetic" && (
        <p className="text-center text-xs text-slate-500">Demo analysis (CV worker not connected) — values are simulated.</p>
      )}
      <DrillChecklist drills={drills} />
    </div>
  );
}

function UpgradeLock() {
  return (
    <div className="card p-6 text-center">
      <div className="text-3xl">🔒</div>
      <h2 className="mt-2 text-lg font-extrabold">Biomechanics is a Gold feature</h2>
      <p className="mt-1 text-sm text-slate-400">Unlock pose heatmaps, symmetry scoring, and tailored drill programs.</p>
      <Link href="/pricing" className="btn-primary mx-auto mt-4 max-w-[14rem]">Upgrade to Gold</Link>
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
