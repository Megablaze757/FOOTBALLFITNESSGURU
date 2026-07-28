"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { analyzeFrames, syntheticFrames, type Frame } from "@/lib/biomech";
import { useJobs } from "@/lib/jobs";
import { VideoAnalysisView } from "@/components/VideoAnalysisView";
import type { PainMap, VideoAnalysis } from "@/lib/types";
import type { MovementType } from "@/lib/movement";

// MediaPipe Tasks Vision (pinned). Loaded from CDN at runtime so nothing is
// bundled and it works on a static GitHub Pages host.
const MP_VER = "0.10.14";
const MP_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}/wasm`;
const MP_MODULE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}/vision_bundle.mjs`;
const MP_MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

// Below this, MediaPipe is guessing at an occluded joint rather than seeing it.
const MIN_VISIBILITY = 0.5;

// How much footage we'll analyse, and the hard ceiling on frames so the seek
// loop can't run away on a slow phone.
export const MAX_CLIP_SECONDS = 30;
const MAX_FRAMES = 200;

// Fewer than this and the biomechanics are noise, not a measurement.
const MIN_FRAMES = 5;

/**
 * Width the video is scaled to before pose detection.
 *
 * THIS IS THE FIX FOR THE TWO CLIPS THAT NEVER ANALYSED. A modern phone films
 * at 1080p or 4K; the two that failed were 21MB and 42MB .mov files, against
 * 1.7MB for the two that worked. Every frame was being handed to MediaPipe at
 * full resolution, so each of up to 200 detections uploaded a 4K texture and ran
 * inference on it — minutes of work on a phone, and enough memory churn to get
 * the tab killed. The pose model downsamples to roughly this internally anyway,
 * and landmarks come back normalised 0-1, so drawing to a small canvas first
 * costs nothing in accuracy and is an order of magnitude cheaper.
 */
const ANALYSIS_WIDTH = 480;

/**
 * Total wall-clock budget for the sampling loop.
 *
 * A seek on a large file can take most of its 2s timeout, and 200 of those is
 * over six minutes. Past this we stop sampling and analyse the frames we have —
 * a real measurement over part of the clip beats an invented one over all of it.
 */
const SAMPLE_BUDGET_MS = 45_000;

// BlazePose landmark indices → our named joints.
const IDX: Record<string, number> = {
  left_shoulder: 11, right_shoulder: 12,
  // Arms matter: the swing contributes meaningfully to jump height, and arm
  // action is a real coaching point in sprinting too.
  left_elbow: 13, right_elbow: 14,
  left_wrist: 15, right_wrist: 16,
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
  movement?: MovementType;
  isInSeason?: boolean;
  onPersisted?: () => void;
}

interface Extraction {
  frames: Frame[];
  fps: number;
  duration: number;
  /** Set when the time budget cut sampling short, for an honest note on screen. */
  truncatedAt?: number;
}

export function InBrowserAnalysis({ videoId, userId, src, painMap, sessionType, movement, isInSeason, onPersisted }: Props) {
  const { start, jobs } = useJobs();
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState("Loading pose model…");
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [partial, setPartial] = useState<string | null>(null);
  const ran = useRef(false);

  // Always current, so the mount effect can look up existing jobs without
  // re-running when the job list changes.
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  // Keyed by video so returning to a different clip doesn't adopt this one's
  // result, and returning to THIS clip doesn't start a second analysis.
  const kind = `video:${videoId}`;

  useEffect(() => {
    // StrictMode remounts the same instance, so this ref survives and the guard
    // holds. A real navigation away and back makes a new instance, which is why
    // the adopt-existing-job branch below matters.
    if (ran.current) return;
    ran.current = true;

    const prior = jobsRef.current.find((j) => j.kind === kind);
    if (prior) {
      // Already running or already finished from an earlier visit to this page.
      setJobId(prior.id);
      return;
    }

    const id = start<VideoAnalysis>(kind, "Analysing your clip", async () => {
      let result: VideoAnalysis;
      let reason: string | null = null;
      let duration: number | undefined;

      try {
        const ex = await extractFrames(src, setProgress);
        duration = ex.duration;
        if (ex.frames.length < MIN_FRAMES) {
          throw new Error(
            `only ${ex.frames.length} frames had a readable pose — the athlete may be out of frame, too far away, or the clip too dark`
          );
        }
        if (ex.truncatedAt) setPartial(`the first ${ex.truncatedAt}s`);
        setProgress("Computing biomechanics…");
        result = analyzeFrames(ex.frames, ex.fps, { painMap, sessionType, movement, isInSeason, source: "mediapipe" });
      } catch (err) {
        // Any failure (CORS, codec, no pose, too slow) → deterministic estimate.
        // Surface *why* rather than silently pretending we tracked the athlete,
        // and record it so it's diagnosable after the fact.
        console.warn("In-browser pose failed, using estimate:", err);
        reason = err instanceof Error ? err.message : String(err);
        setFallbackReason(reason);
        result = analyzeFrames(syntheticFrames(videoId), 12, { painMap, sessionType, movement, isInSeason, source: "synthetic" });
      }

      // Inside the job, so navigating away still saves the result. This used to
      // sit in the component, which meant leaving the page mid-analysis threw
      // the work away.
      const saved = await persist(userId, videoId, result, {
        error: reason,
        source: reason ? "synthetic" : "mediapipe",
        duration,
      });
      if (saved) onPersisted?.();
      return result;
    });
    setJobId(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const job = jobId ? jobs.find((j) => j.id === jobId) : undefined;
  const analysis = job?.status === "done" ? (job.result as VideoAnalysis | undefined) : undefined;

  if (!job || job.status === "running") {
    return (
      <div className="space-y-4">
        <video src={src} controls playsInline className="w-full rounded-2xl bg-black" />
        <div className="card flex items-center gap-3 px-4 py-3 text-sm text-pitch-300">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-pitch-500 border-t-transparent" />
          {progress}
        </div>
        {/* The whole point of running this as a job — say so, or nobody will
            risk leaving the page and the feature may as well not be background. */}
        <p className="px-1 text-xs text-slate-500">
          You can move to another tab — this keeps running. Don&apos;t close the app or reload.
        </p>
      </div>
    );
  }

  if (job.status === "error" || !analysis) {
    return (
      <div className="space-y-4">
        <video src={src} controls playsInline className="w-full rounded-2xl bg-black" />
        <div className="card border-readiness-red/30 px-4 py-3 text-sm text-readiness-red">
          Couldn&apos;t analyse this clip{job.error ? `: ${job.error}` : "."}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {fallbackReason && (
        <div className="card border-amber-400/30 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-200">
          <span className="font-semibold">Estimated, not tracked.</span> We couldn’t read poses from this clip
          ({fallbackReason}), so the numbers below are a baseline estimate. For real tracking, film in landscape
          with your whole body in frame, in good light, and upload a short MP4 (H.264) — under 10MB analyses
          far more reliably than a long 4K clip.
        </div>
      )}
      {!fallbackReason && partial && (
        <div className="card border-white/10 px-4 py-3 text-xs text-slate-400">
          This clip was long, so the numbers below come from {partial}. Trim to the movement itself for a
          reading over the whole thing.
        </div>
      )}
      <VideoAnalysisView analysis={analysis} src={src} />
    </div>
  );
}

// --- pose extraction --------------------------------------------------------
async function extractFrames(src: string, setProgress: (s: string) => void): Promise<Extraction> {
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
  const blobUrl = await toBlobUrl(src, setProgress);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";
  video.preload = "auto";
  video.src = blobUrl;
  await new Promise<void>((res, rej) => {
    const timer = setTimeout(() => rej(new Error("video metadata timed out")), 15_000);
    video.onloadedmetadata = () => { clearTimeout(timer); res(); };
    video.onerror = () => { clearTimeout(timer); rej(new Error("unsupported video format")); };
  });

  // A jump takes well under a second, so 10fps gives about five usable frames —
  // not enough to see a countermovement or a takeoff. Sample short clips hard
  // for technique detail, and step down on longer ones so a 30s clip still
  // finishes: every frame costs a seek, and the whole loop runs on the phone.
  const duration = Math.min(video.duration || 6, MAX_CLIP_SECONDS);
  const fps = duration <= 3 ? 30 : duration <= 6 ? 20 : duration <= 12 ? 12 : 8;
  const times: number[] = [];
  for (let t = 0; t < duration && times.length < MAX_FRAMES; t += 1 / fps) times.push(t);

  // Downscale once, reuse for every frame. See ANALYSIS_WIDTH.
  const scale = Math.min(1, ANALYSIS_WIDTH / (video.videoWidth || ANALYSIS_WIDTH));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.round((video.videoWidth || ANALYSIS_WIDTH) * scale));
  canvas.height = Math.max(2, Math.round((video.videoHeight || 270) * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas unavailable");

  const frames: Frame[] = [];
  const deadline = Date.now() + SAMPLE_BUDGET_MS;
  let truncatedAt: number | undefined;
  let ts = 0;

  try {
    for (let i = 0; i < times.length; i++) {
      // Budget check before the expensive part, so we always stop cleanly with
      // whatever we've collected rather than being killed mid-loop.
      if (Date.now() > deadline && frames.length >= MIN_FRAMES) {
        truncatedAt = Math.round(times[i]);
        break;
      }
      await seek(video, times[i]);
      ts += Math.round(1000 / fps); // monotonic ms for detectForVideo
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const out = landmarker.detectForVideo(canvas, ts);
      const lm = out?.landmarks?.[0];
      if (lm) {
        const frame: Frame = {};
        for (const [name, idx] of Object.entries(IDX)) {
          const p = lm[idx];
          // A limb hidden behind the body still gets a guessed position, and
          // trusting those produced nonsense like "84 degrees less bend on the
          // right". Drop anything the model isn't confident it can see.
          if (p && (p.visibility == null || p.visibility >= MIN_VISIBILITY)) {
            frame[name] = { x: p.x, y: p.y };
          }
        }
        frames.push(frame);
      }
      if (i % 10 === 0) setProgress(`Analysing movement… ${Math.round((i / times.length) * 100)}%`);
    }
  } finally {
    // Both leak native memory if an exception escapes the loop — on a phone
    // that's the difference between a failed clip and a killed tab.
    landmarker.close();
    URL.revokeObjectURL(blobUrl);
  }

  return { frames, fps, duration, truncatedAt };
}

function toBlobUrl(src: string, setProgress: (s: string) => void): Promise<string> {
  return fetch(src).then((r) => {
    if (!r.ok) throw new Error(`fetch ${r.status}`);
    // A 40MB clip over mobile data is a slow, silent wait otherwise.
    const mb = Number(r.headers.get("content-length") || 0) / 1048576;
    if (mb >= 8) setProgress(`Loading your clip… ${mb.toFixed(0)}MB`);
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
interface PersistMeta {
  error: string | null;
  source: "mediapipe" | "synthetic";
  duration?: number;
}

async function persist(userId: string, videoId: string, a: VideoAnalysis, meta: PersistMeta): Promise<boolean> {
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

    // Status first and on its own. It's the field the rest of the app reads, so
    // it must not be lost because a newer column isn't in PostgREST's schema
    // cache yet — the same failure mode the uploader already guards against.
    const { error: statusErr } = await supabase
      .from("videos").update({ status: "analyzed" }).eq("id", videoId).eq("user_id", userId);
    if (statusErr) console.warn("persist video status:", statusErr.message);

    // Then the diagnostics, which are allowed to fail without costing anything.
    const { error: metaErr } = await supabase.from("videos").update({
      analysis_error: meta.error,
      analysis_source: meta.source,
      ...(meta.duration ? { duration_seconds: Math.round(meta.duration) } : {}),
    }).eq("id", videoId).eq("user_id", userId);
    if (metaErr) console.warn("persist video analysis meta:", metaErr.message);

    return true;
  } catch (e) {
    console.warn("persist ai_plan threw:", e);
    return false;
  }
}
