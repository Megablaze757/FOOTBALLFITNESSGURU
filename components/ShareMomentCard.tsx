"use client";

import { useEffect, useState } from "react";
import { ShareButton } from "@/components/ShareButton";
import { pendingMoment, browserStore, type MomentInput, type ShareMoment } from "@/lib/share-moment";

/**
 * The ask, at the moment, once.
 *
 * Rendered only when there IS a moment, so it is not an empty card waiting for
 * one — and dismissed permanently by either button, because somebody who said
 * no to sharing their Gold II does not want to be asked about it again
 * tomorrow.
 *
 * Mounted after hydration on purpose: what has already been offered lives in
 * localStorage, and rendering the prompt on the server would flash it for
 * everybody, including the people who dismissed it last week.
 */
export function ShareMomentCard({ input }: { input: MomentInput }) {
  const [moment, setMoment] = useState<ShareMoment | null>(null);

  useEffect(() => {
    setMoment(pendingMoment(input, browserStore()));
  }, [input]);

  if (!moment) return null;

  const dismiss = () => {
    browserStore().remember(moment.id);
    setMoment(null);
  };

  return (
    <section className="mt-4 rounded-2xl border border-pitch-400/30 bg-pitch-400/[0.06] p-4">
      <p className="text-sm font-bold text-slate-100">{moment.headline}</p>
      <p className="mt-1 text-xs text-slate-400">
        A card with your numbers on it, and a link back. Takes one tap.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* Dismissed on the way out either way: sharing it is also an answer to
            "would you like to share this", and being asked again after doing it
            is worse than not being asked at all. */}
        <span onClickCapture={dismiss}>
          <ShareButton stats={moment.stats} />
        </span>
        <button onClick={dismiss} className="tap-target rounded-xl px-3 py-2 text-sm text-slate-400">
          Not now
        </button>
      </div>
    </section>
  );
}
