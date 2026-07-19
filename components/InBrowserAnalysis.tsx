"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { analyzeFrames, syntheticFrames, type Frame } from "@/lib/biomech";
import { VideoAnalysisView } from "@/components/VideoAnalysisView";
import type { PainMap, VideoAnalysis } from "@/lib/types";

// MediaPipe Tasks Vision (pinned). Loaded from CDN at runtime so nothing is
// bundled and it works on a static GitHub Pages host.
const MP_VER = "0.10.14";
const MP_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}/wasm`;
const MP_MODULE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}/vision_bundle.mjs`;
const MP_MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

// BlazePose landmark indices → our named joints.
const IDX: Record<string, number> = {
  left_shoulder: 11, right_shoulder: 12,
  left_hip: 23, right_hip: 24,
  left_knee: 25, right_knee: 26,
  left_ankle: 27, right_ankle: 28,
};

interface Props {
  videoId: string;
  userId: string;
  src: string;
  painMap: PainMap;
  sessionType?: string | null;
  isInSeason?: boolean;
  onPersisted?: () => void;
}

export function InBrowserAnalysis({ videoId, userId, src, painMap, sessionType, isInSeason, onPersisted }: Props) {
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");
  const [progress, setProgress] = useState("Loading pose model…");
  const [analysis, setAnalysis] = useState<VideoAnalysis | null>(null);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const ran = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    // StrictMode mounts, unmounts, then remounts. `ran` keeps us from starting
    // a second analysis, but the first mount's cleanup must not orphan the
    // in-flight one — so `alive` is restored on every mount, before that guard.
    alive.current = true;
    if (ran.current) return () => { alive.current = false; };
    ran.current = true;
    const cancelled = () => !alive.current;

    (async () => {
      let result: VideoAnalysis;
      try {
        const frames = await extractFrames(src, setProgress);
        if (frames.length < 5) throw new Error("too few readable frames");
        setProgress("Computing biomechanics…");
        result = analyzeFrames(frames, 10, { painMap, sessionType, isInSeason, source: "mediapipe" });
      } catch (err) {
        // Any failure (CORS, no pose, unsupported codec) → deterministic estimate.
        // Surface *why* rather than silently pretending we tracked the athlete.
        console.warn("In-browser pose failed, using estimate:", err);
        if (!cancelled()) setFallbackReason(err instanceof Error ? err.message : String(err));
        result = analyzeFrames(syntheticFrames(videoId), 10, { painMap, sessionType, isInSeason, source: "synthetic" });
      }
      if (cancelled()) return;
      setAnalysis(result);
      setStatus("done");
      // Best-effort persist so a refresh is instant and the coach can see it.
      void persist(userId, videoId, result).then((ok) => ok && onPersisted?.());
    })();

    return () => { alive.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "loading") {
    return (
      <div className="space-y-4">
        <video src={src} controls playsInline className="w-full rounded-2xl bg-black" />
        <div className="card flex items-center gap-3 px-4 py-3 text-sm text-pitch-300">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-pitch-500 border-t-transparent" />
          {progress}
        </div>
      </div>
    );
  }
  if (!analysis) return <div className="card px-4 py-3 text-sm text-readiness-red">Couldn’t analyse this clip.</div>;
  return (
    <div className="space-y-4">
      {fallbackReason && (
        <div className="card border-amber-400/30 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-200">
          <span className="font-semibold">Estimated, not tracked.</span> We couldn’t read poses from this clip
          ({fallbackReason}), so the numbers below are a baseline estimate. For real tracking, film in landscape
          with your whole body in frame, in good light, and upload an MP4 (H.264) a few seconds long.
        </div>
      )}
      <VideoAnalysisView analysis={analysis} src={src} />
    </div>
  );
}

// --- pose extraction --------------------------------------------------------
async function extractFrames(src: string, setProgress: (s: string) => void): Promise<Frame[]> {
  setProgress("Loading pose model…");
  const vision = await import(/* webpackIgnore: true */ MP_MODULE);
  const fileset = await vision.FilesetResolver.forVisionTasks(MP_WASM);
  // GPU delegate is unavailable on plenty of phones/browsers — fall back to CPU
  // rather than losing pose tracking entirely.
  const create = (delegate: "GPU" | "CPU") =>
    vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MP_MODEL, delegate },
      runningMode: "VIDEO",
      numPoses: 1,
    });
  let landmarker;
  try {
    landmarker = await create("GPU");
  } catch (e) {
    console.warn("GPU delegate unavailable, retrying on CPU:", e);
    landmarker = await create("CPU");
  }

  // Fetch as blob first so the <video> isn't CORS-tainted (detect needs pixels).
  setProgress("Loading your clip…");
  const blobUrl = await toBlobUrl(src);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";
  video.src = blobUrl;
  await new Promise<void>((res, rej) => {
    const timer = setTimeout(() => rej(new Error("video metadata timed out")), 15_000);
    video.onloadedmetadata = () => { clearTimeout(timer); res(); };
    video.onerror = () => { clearTimeout(timer); rej(new Error("unsupported video format")); };
  });

  const duration = Math.min(video.duration || 6, 8);
  const fps = 10;
  const times: number[] = [];
  for (let t = 0; t < duration; t += 1 / fps) times.push(t);

  const frames: Frame[] = [];
  let ts = 0;
  for (let i = 0; i < times.length; i++) {
    await seek(video, times[i]);
    ts += 100; // monotonic ms for detectForVideo
    const out = landmarker.detectForVideo(video, ts);
    const lm = out?.landmarks?.[0];
    if (lm) {
      const frame: Frame = {};
      for (const [name, idx] of Object.entries(IDX)) {
        const p = lm[idx];
        if (p) frame[name] = { x: p.x, y: p.y };
      }
      frames.push(frame);
    }
    if (i % 10 === 0) setProgress(`Analysing movement… ${Math.round((i / times.length) * 100)}%`);
  }

  landmarker.close();
  URL.revokeObjectURL(blobUrl);
  return frames;
}

function toBlobUrl(src: string): Promise<string> {
  return fetch(src).then((r) => {
    if (!r.ok) throw new Error(`fetch ${r.status}`);
    return r.blob();
  }).then((b) => URL.createObjectURL(b));
}

// Some codecs never fire "seeked" for a given timestamp — without a timeout the
// whole analysis hangs on the spinner forever. Skip the frame instead.
function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((res) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeEventListener("seeked", finish);
      res();
    };
    const timer = setTimeout(finish, 2_000);
    video.addEventListener("seeked", finish);
    video.currentTime = t;
  });
}

// --- persistence (best-effort; RLS-scoped) ----------------------------------
async function persist(userId: string, videoId: string, a: VideoAnalysis): Promise<boolean> {
  try {
    const supabase = createClient();
    const { error } = await supabase.from("ai_plans").upsert(
      {
        user_id: userId,
        video_id: videoId,
        analysis_json: a,
        drill_program: a.drills,
        focus_area: a.focus_area,
      },
      { onConflict: "video_id" }
    );
    if (error) { console.warn("persist ai_plan:", error.message); return false; }
    // Check this too — a rejected status update used to fail silently and leave
    // every analysed clip stuck showing as un-analysed.
    const { error: statusErr } = await supabase
      .from("videos").update({ status: "analyzed" }).eq("id", videoId).eq("user_id", userId);
    if (statusErr) console.warn("persist video status:", statusErr.message);
    return true;
  } catch (e) {
    console.warn("persist ai_plan threw:", e);
    return false;
  }
}
