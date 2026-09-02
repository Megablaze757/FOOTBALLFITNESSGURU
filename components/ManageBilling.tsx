"use client";

import { useState } from "react";
import Link from "next/link";
import { invokeAI } from "@/lib/api";
import { recordChanged } from "@/lib/data-events";
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
export function ManageBilling({ hasBilling, onPaidPlan, cancelling, paused, resumesAt, endsAt, onChanged }: {
  /** Has a Stripe customer — so there are cards and invoices to look at. */
  hasBilling: boolean;
  /**
   * Is paying for something RIGHT NOW.
   *
   * Distinct from `hasBilling`, and that conflation is the bug this fixes: a
   * Stripe customer id is permanent, so anyone who has ever subscribed keeps
   * one forever. Cancel, drop to Free, and the profile went on offering
   * "Cancel or pause" — for a plan they no longer have — with the reassurance
   * "you keep access until the end of the period you've paid for" underneath.
   * Pressing it opened a flow to cancel nothing.
   *
   * Their invoice history is still theirs, so the portal button stays.
   */
  onPaidPlan: boolean;
  /** Cancelled but still inside the paid period — reversible. */
  cancelling?: boolean;
  paused?: boolean;
  resumesAt?: string | null;
  /** When access actually ends. "The end of your period" is not an answer. */
  endsAt?: string | null;
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
      recordChanged("everything");
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
          {/* The date, not "the end of your period". Someone who has cancelled
              wants to know exactly how long they've got — making them work it
              out from a billing cycle they can't see is the sort of vagueness
              that gets read as evasive. */}
          <p className="mt-1 text-2xl font-extrabold text-accent-400">
            {paused
              ? (resumesAt ? fmt(resumesAt) : "Paused")
              : (endsAt ? fmt(endsAt) : "End of your paid period")}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {paused
              ? "No charges while it's paused, and Pro switches itself back on automatically. Nothing has been deleted."
              : `You keep everything until then${endsAt ? ` — ${daysLeft(endsAt)}` : ""}. Nothing has been deleted, and you won't be charged again.`}
          </p>
          <button onClick={resume} disabled={busy} className="btn-primary mt-3">
            {busy ? "…" : paused ? "Resume now" : "Keep my plan"}
          </button>
          {!paused && (
            <p className="mt-2 text-[11px] text-slate-500">
              Change your mind any time before then and nothing is lost.
            </p>
          )}
        </div>
        {error && <p className="mt-2 text-sm text-readiness-red">{error}</p>}
      </div>
    );
  }

  /**
   * A LAPSED SUBSCRIBER IS ON THE FREE PLAN, and should be sold to, not
   * offered a cancellation. Their receipts are still theirs, so the portal
   * stays — it is the only route to an invoice for a month they did pay for.
   */
  if (!onPaidPlan) {
    return (
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/pricing" className="btn-ghost w-auto flex-1 px-4">⭐ See plans</Link>
        <button onClick={openPortal} disabled={busy} className="btn-ghost w-auto flex-1 px-4">
          {busy ? "Opening…" : "🧾 Past invoices"}
        </button>
        {error && <p className="w-full text-sm text-readiness-red">{error}</p>}
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
    : d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

/** "12 days left" — the number people actually care about. */
function daysLeft(iso: string): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "";
  const days = Math.ceil((d - Date.now()) / 86_400_000);
  if (days <= 0) return "it ends today";
  return days === 1 ? "1 day left" : `${days} days left`;
}
