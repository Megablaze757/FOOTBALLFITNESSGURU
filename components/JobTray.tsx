"use client";

import { useJobs } from "@/lib/jobs";

/**
 * A small persistent tray for work running in the background.
 *
 * Two jobs to do. It tells you something is still going while you get on with
 * something else — otherwise "run it in the background" just means "lose track
 * of it". And when a job fails it shows the REAL error, which is how a broken
 * AI endpoint gets noticed on the day it breaks rather than weeks later.
 */
export function JobTray() {
  const { jobs, dismiss } = useJobs();
  const visible = jobs.filter((j) => j.status !== "done" || Date.now() - (j.finishedAt ?? 0) < 8000);
  if (!visible.length) return null;

  return (
    /*
     * Announced, not just displayed. The whole point of this tray is that you've
     * navigated away and something finishes behind you — which a sighted user
     * catches out of the corner of their eye and a screen-reader user was never
     * told about at all. `polite` so it waits for a gap rather than cutting in
     * mid-sentence.
     */
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 bottom-28 z-[64] mx-auto flex max-w-md flex-col gap-2 lg:inset-x-auto lg:bottom-4 lg:right-4 lg:w-80"
    >
      {visible.map((j) => (
        <div
          key={j.id}
          className={`pointer-events-auto rounded-2xl border p-3 shadow-lg ${
            j.status === "error"
              ? "border-readiness-red/30 bg-[#1a1013]"
              : j.status === "done"
                ? "border-readiness-green/30 bg-[#0f1a14]"
                : "border-white/10 bg-[#12161c]"
          }`}
        >
          <div className="flex items-start gap-2.5">
            {j.status === "running" && (
              <span className="mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-pitch-400/30 border-t-pitch-400" />
            )}
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-semibold text-slate-100">
                {j.status === "running" ? j.label : j.status === "done" ? `${j.label} — done` : `${j.label} — failed`}
              </p>
              {j.status === "running" && (
                <p className="mt-0.5 text-[11px] text-slate-400">
                  Carry on using the app. Don&apos;t close or reload the tab.
                </p>
              )}
              {j.status === "error" && (
                <p className="mt-0.5 break-words text-[11px] text-slate-400">{j.error}</p>
              )}
            </div>
            {j.status !== "running" && (
              <button
                onClick={() => dismiss(j.id)}
                className="shrink-0 text-xs text-slate-500 hover:text-slate-300"
                aria-label="Dismiss"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
