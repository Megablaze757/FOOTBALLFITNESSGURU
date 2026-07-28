"use client";

import { useState } from "react";
import Link from "next/link";
import { invokeAI } from "@/lib/api";
import { invalidate } from "@/lib/use-async";
import { CancelFlow } from "@/components/CancelFlow";

/**
 * "Cancel anytime" — the mechanism behind the promise on the landing page.
 *
 * Split deliberately in two:
 *
 *   - CARDS AND INVOICES go to Stripe's hosted portal. Card details never touch
 *     us, and it stays correct as Stripe's rules change. Hand-rolling that buys
 *     a slightly nicer form and a PCI conversation.
 *
 *   - CANCELLING is ours. Stripe's portal cancels and tells us nothing, and it
 *     can't offer a seasonal athlete a pause — which for this app is the true
 *     answer most of the time. That one screen is worth more than the rest of
 *     the portal put together.
 *
 * Someone on a comped or free plan has no Stripe customer to manage, so they
 * get the upgrade link instead of a button that would only ever error.
 */
export function ManageBilling({ hasBilling, cancelling, paused, resumesAt, onChanged }: {
  hasBilling: boolean;
  /** Cancelled but still inside the paid period — reversible. */
  cancelling?: boolean;
  paused?: boolean;
  resumesAt?: string | null;
  onChanged?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);

  if (!hasBilling) {
    return (
      <Link href="/pricing" className="btn-ghost mb-4">
        ⭐ See plans
      </Link>
    );
  }

  async function openPortal() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await invokeAI<{ url?: string }>("billing-portal", {});
      if (!url) throw new Error("No portal link came back — try again in a moment.");
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  async function resume() {
    setBusy(true);
    setError(null);
    try {
      await invokeAI("resume-subscription", {});
      invalidate();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  // Coming back is the cheapest customer there is, so it's one button and it's
  // the most prominent thing on the card.
  if (cancelling || paused) {
    return (
      <div className="mb-4">
        <div className="card p-4">
          <p className="text-sm font-semibold text-slate-100">
            {paused ? "Your plan is paused" : "Your plan is set to cancel"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {paused
              ? `No charges while it's paused${resumesAt ? `, and Pro comes back on ${fmt(resumesAt)}` : ""}. Nothing has been deleted.`
              : "You keep full access until the end of the period you've paid for. Nothing has been deleted."}
          </p>
          <button onClick={resume} disabled={busy} className="btn-primary mt-3">
            {busy ? "…" : paused ? "Resume now" : "Keep my plan"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-readiness-red">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mb-4">
      <div className="flex flex-wrap gap-2">
        <button onClick={openPortal} disabled={busy} className="btn-ghost w-auto flex-1 px-4">
          {busy ? "Opening…" : "💳 Card & invoices"}
        </button>
        <button onClick={() => setShowCancel((v) => !v)} className="btn-ghost w-auto flex-1 px-4">
          {showCancel ? "Close" : "Cancel or pause"}
        </button>
      </div>
      <p className="mt-1.5 text-xs text-slate-500">
        Cancel any time — you keep access until the end of the period you&apos;ve paid for, and
        nothing is ever deleted.
      </p>

      {showCancel && <CancelFlow onClose={() => setShowCancel(false)} onChanged={onChanged} />}
      {error && <p className="mt-2 text-sm text-readiness-red">{error}</p>}
    </div>
  );
}

function fmt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: "numeric", month: "long" });
}
