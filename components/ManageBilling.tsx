"use client";

import { useState } from "react";
import Link from "next/link";
import { invokeAI } from "@/lib/api";

/**
 * "Cancel anytime" — the mechanism behind the promise on the landing page.
 *
 * Sends the athlete to Stripe's hosted customer portal, where they can cancel,
 * resume, change card or pull invoices. Hosted rather than hand-rolled because
 * card details never touch us and it stays correct as Stripe's rules change.
 *
 * Someone on a comped or free plan has no Stripe customer to manage, so they
 * get the upgrade link instead of a button that would only ever error.
 */
export function ManageBilling({ hasBilling }: { hasBilling: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!hasBilling) {
    return (
      <Link href="/pricing" className="btn-ghost mb-4">
        ⭐ See plans
      </Link>
    );
  }

  async function open() {
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

  return (
    <div className="mb-4">
      <button onClick={open} disabled={busy} className="btn-ghost">
        {busy ? "Opening…" : "💳 Manage plan or cancel"}
      </button>
      <p className="mt-1.5 text-xs text-slate-500">
        Cancel, restart, change your card or download invoices. Cancel any time — you keep
        access until the end of the period you&apos;ve paid for.
      </p>
      {error && <p className="mt-2 text-sm text-readiness-red">{error}</p>}
    </div>
  );
}
