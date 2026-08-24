"use client";

import { useEffect, useState } from "react";
import { onLoadError } from "@/lib/use-async";

/**
 * Says so when data didn't load.
 *
 * Without this, a rejected query renders as an empty state: "no sessions yet"
 * to an athlete with a full history, "no drills" on a page whose fetch was
 * refused. The screen looks fine and quietly tells the user their data is gone,
 * which is the worst way to fail — they blame the app for losing it rather than
 * pulling to refresh.
 *
 * Deliberately non-blocking. Whatever cached or partial data is on screen stays
 * there; this only adds the missing sentence.
 */
export function LoadErrorBanner() {
  const [failed, setFailed] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => onLoadError(({ key }) => {
    setDismissed(false);
    setFailed((prev) => {
      const label = friendly(key);
      return prev.includes(label) ? prev : [...prev, label];
    });
  }), []);

  if (!failed.length || dismissed) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-28 z-[65] mx-auto max-w-md rounded-2xl border border-readiness-red/30 bg-[#1a1013] p-3 shadow-lg lg:inset-x-auto lg:bottom-4 lg:right-4 lg:w-96"
    >
      <p className="text-sm font-semibold text-slate-100">Some data didn&apos;t load</p>
      <p className="mt-1 text-xs text-slate-400">
        {failed.length === 1 && failed[0] !== "data"
          ? `We couldn't fetch your ${failed[0]}. It's still saved — this is us, not you.`
          : "We couldn't reach the server for everything on this screen. Nothing has been lost."}
      </p>
      <div className="mt-2.5 flex gap-2">
        <button
          onClick={() => window.location.reload()}
          className="min-h-[44px] min-h-[2.25rem] flex-1 rounded-xl bg-pitch-400 px-3 text-xs font-bold text-slate-950"
        >
          Try again
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="min-h-[44px] min-h-[2.25rem] rounded-xl bg-white/[0.06] px-3 text-xs font-semibold text-slate-300"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

/** Cache keys are "history:v2:<uuid>" — say "progress", not that. */
function friendly(key?: string): string {
  if (!key) return "data";
  const head = key.split(":")[0];
  const names: Record<string, string> = {
    home: "dashboard",
    history: "progress",
    nutrition: "nutrition",
    journal: "today's log",
    coach: "program",
    squad: "squad",
    benchmarks: "personal bests",
    body: "body log",
    profile: "profile",
    rewards: "rewards",
    report: "report",
    train: "videos",
  };
  return names[head] ?? "data";
}
