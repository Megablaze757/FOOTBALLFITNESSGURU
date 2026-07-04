"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { VideoAnalysisView } from "@/components/VideoAnalysisView";
import { InBrowserAnalysis } from "@/components/InBrowserAnalysis";
import type { AiPlan, PainMap, Subscription, Video } from "@/lib/types";

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

  const { data, loading, reload } = useAsync(async () => {
    const supabase = createClient();
    const empty = { video: null as Video | null, src: "", sub: null as Subscription | null, plan: null as AiPlan | null, painMap: {} as PainMap, inSeason: false };
    const { data: videoRow } = await supabase
      .from("videos").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
    if (!videoRow) return empty;
    const video = videoRow as Video;
    const [{ data: signed }, { data: subRow }, { data: planRow }, { data: checkRow }, { data: progRow }] = await Promise.all([
      supabase.storage.from("videos").createSignedUrl(video.storage_path, 600),
      supabase.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("ai_plans").select("*").eq("video_id", video.id).maybeSingle(),
      supabase.from("daily_check_ins").select("pain_map").eq("user_id", user.id)
        .order("check_in_date", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("programs").select("in_season").eq("user_id", user.id).eq("status", "active")
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    return {
      video,
      src: signed?.signedUrl ?? "",
      sub: (subRow ?? null) as Subscription | null,
      plan: (planRow ?? null) as AiPlan | null,
      painMap: ((checkRow as { pain_map: PainMap | null } | null)?.pain_map ?? {}) as PainMap,
      inSeason: Boolean((progRow as { in_season: boolean } | null)?.in_season),
    };
  }, [user.id, id]);

  if (loading) return <div className="card h-64 animate-pulse" />;
  if (!data?.video) return <p className="card px-4 py-8 text-center text-sm text-slate-400">Video not found.</p>;

  const { video, src, sub, plan, painMap, inSeason } = data;
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
        <VideoAnalysisView analysis={{ ...plan.analysis_json, drills: plan.drill_program ?? plan.analysis_json.drills ?? [] }} src={src} />
      ) : (
        <InBrowserAnalysis
          videoId={video.id}
          userId={user.id}
          src={src}
          painMap={painMap}
          sessionType={video.session_type}
          isInSeason={inSeason}
          onPersisted={reload}
        />
      )}
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

