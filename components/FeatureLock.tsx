"use client";

import { useEffect } from "react";
import Link from "next/link";
import { planFor, tierNeededFor, TRIAL_DAYS, type Capability } from "@/lib/subscription";
import { track } from "@/lib/funnel";
import type { Tier } from "@/lib/types";

/**
 * Shown in place of a feature the current plan doesn't include.
 *
 * Says what the feature is, which plan it's on and what that costs — a lock icon
 * with "upgrade" and no price is the pattern people bounce off, because it reads
 * as a dead end rather than an offer.
 *
 * The server refuses these endpoints independently (requireTier in the Worker).
 * This is the courtesy, not the control.
 */
export function FeatureLock({ capability, title, blurb }: {
  capability: Capability;
  title: string;
  blurb: string;
}) {
  const need = tierNeededFor(capability);
  const plan = planFor(need);

  // A paywall is the clearest signal of intent the product ever gets: someone
  // wanted a thing enough to walk into the wall. Which wall, and how often, is
  // what tells you where the money is.
  useEffect(() => { track("paywall_hit", { capability, need }); }, [capability, need]);

  return (
    <div className="card p-6 text-center">
      <div className="text-3xl" aria-hidden="true">🔒</div>
      <h2 className="mt-2 text-lg font-extrabold">{title}</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-slate-400">{blurb}</p>
      <p className="mt-3 text-sm">
        <span className={need === "gold" ? "font-bold text-pitch-400" : "font-bold text-sky-300"}>
          {plan.name}
        </span>
        <span className="text-slate-400"> · {plan.priceLabel}</span>
      </p>
      {/* Lead with the trial, not with "see plans". The ask is smaller and the
          risk is visibly zero, which is the whole point of having a trial. */}
      <Link href="/pricing" className="btn-primary mx-auto mt-4 max-w-[16rem]">
        {TRIAL_DAYS > 0 ? `Try ${plan.name} free for ${TRIAL_DAYS} days` : `Get ${plan.name}`}
      </Link>
      {TRIAL_DAYS > 0 && (
        <p className="mt-2 text-xs text-slate-400">
          Cancel any time before it ends and you&apos;re not charged.
        </p>
      )}
    </div>
  );
}

/** Inline nudge for a feature that degrades rather than disappears. */
export function UpgradeNote({ capability, children }: { capability: Capability; children: React.ReactNode }) {
  const plan = planFor(tierNeededFor(capability));
  return (
    <p className="mt-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-400">
      {children}{" "}
      <Link href="/pricing" className="font-semibold text-pitch-400 hover:underline">
        {plan.name}, {plan.priceLabel} →
      </Link>
    </p>
  );
}

export function tierOfSub(sub: { status?: string; tier?: Tier } | null | undefined): Tier {
  return sub?.status === "active" && sub.tier ? sub.tier : "bronze";
}
