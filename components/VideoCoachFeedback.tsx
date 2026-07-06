"use client";

import { useEffect, useRef, useState } from "react";
import { invokeAI } from "@/lib/api";
import { videoFeedbackRequest, localVideoFeedback } from "@/lib/video-coach";
import type { VideoAnalysis } from "@/lib/types";

// "Coach's take" — an AI narrative on the video analysis. Uses the deployed
// coach-chat endpoint; falls back to a deterministic local summary offline.
export function VideoCoachFeedback({ analysis }: { analysis: VideoAnalysis }) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ai, setAi] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    let cancelled = false;
    (async () => {
      try {
        const { question, context } = videoFeedbackRequest(analysis);
        const data = await invokeAI<{ answer?: string }>("coach-chat", { question, context });
        if (!data?.answer) throw new Error("fallback");
        if (!cancelled) { setText(data.answer); setAi(true); }
      } catch {
        if (!cancelled) setText(localVideoFeedback(analysis));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="card p-5">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-pitch-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-pitch-400" /> Coach&apos;s take
        </span>
        {!loading && ai && <span className="chip text-pitch-400">AI</span>}
      </div>
      {loading ? (
        <p className="text-sm text-slate-500">Analysing your movement…</p>
      ) : (
        <p className="text-sm leading-relaxed text-slate-200">{text}</p>
      )}
    </div>
  );
}
