"use client";

import { Suspense, useEffect, useState } from "react";
import { BackLink } from "@/components/BackLink";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync, invalidate } from "@/lib/use-async";
import { PlanGrid } from "@/components/PlanGrid";
import { trackOnce, track } from "@/lib/funnel";
import type { Subscription, Tier } from "@/lib/types";

/**
 * How long to wait for the webhook before admitting something is wrong. A
 * Stripe webhook normally lands in a second or two; 45s is generous enough that
 * a slow one still resolves, short enough that nobody stares at a spinner.
 */
const ACTIVATION_LIMIT_MS = 45_000;
const POLL_EVERY_MS = 2_000;

type Activation = "idle" | "waiting" | "active" | "timeout";

export default function PricingPage() {
  return (
    <Suspense>
      <PricingInner />
    </Suspense>
  );
}

function PricingInner() {
  const user = useCurrentUser();
  const params = useSearchParams();
  const checkout = params.get("checkout");

  const { data, reload } = useAsync(async () => {
    const supabase = createClient();
    const { data: sub } = await supabase.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle();
    return (sub ?? null) as Subscription | null;
  }, [user.id]);

  const [activation, setActivation] = useState<Activation>(checkout === "success" ? "waiting" : "idle");

  // Once per session, not once per re-render.
  useEffect(() => { trackOnce("plan_view", { from: "app" }); }, []);

  // Stripe redirects back here on success. The webhook is what actually grants
  // the subscription; this only records that the athlete got through checkout,
  // so the funnel doesn't depend on a redirect that people close early.
  useEffect(() => {
    if (checkout === "success") track("checkout_complete", { via: "redirect" });
  }, [checkout]);

  /**
   * Wait for the plan to actually go live, rather than claiming it will.
   *
   * This page used to say "Payment received. Your plan updates within a few
   * seconds" and then do nothing whatsoever to make that true. Two things broke
   * it, and both had to be fixed:
   *
   *  1. THE RACE. Stripe redirects the moment the card clears, but the
   *     subscription only exists once the webhook lands a beat later. Reading
   *     the row on arrival reliably read the row from before the payment.
   *
   *  2. THE CACHE. Every page keeps its own cached copy of the subscription for
   *     ten minutes (lib/use-async.ts). Even after the webhook wrote the new
   *     tier, Home, Coach and Nutrition all carried on serving the free plan
   *     from cache — so the athlete paid, was told it worked, and still hit
   *     paywalls everywhere they went.
   */
  useEffect(() => {
    if (checkout !== "success") return;
    let cancelled = false;
    const startedAt = Date.now();

    (async () => {
      const supabase = createClient();
      while (!cancelled && Date.now() - startedAt < ACTIVATION_LIMIT_MS) {
        const { data: sub } = await supabase
          .from("subscriptions").select("status").eq("user_id", user.id).maybeSingle();
        if (cancelled) return;
        if (sub?.status === "active") {
          // Drop every cached page, not just this one — the tier decides what
          // half the app renders.
          invalidate();
          setActivation("active");
          reload();
          return;
        }
        await new Promise((r) => setTimeout(r, POLL_EVERY_MS));
      }
      if (!cancelled) setActivation("timeout");
    })();

    return () => { cancelled = true; };
    // reload is stable enough for this one-shot effect; re-running it would
    // restart the poll on every refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkout, user.id]);

  const currentTier: Tier = data?.status === "active" ? data.tier : "bronze";

  return (
    <div className="animate-fade-up space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Plans</h1>
          <p className="mt-1 text-sm text-slate-400">For individual athletes — plus a Team plan for clubs &amp; coaches.</p>
        </div>
        <BackLink href="/profile" label="Profile" />
      </header>

      {activation === "waiting" && (
        <div className="card flex items-center gap-3 px-4 py-3 text-sm text-pitch-400">
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-pitch-400/30 border-t-pitch-400" />
          Payment received — activating your plan…
        </div>
      )}
      {activation === "active" && (
        <div className="card px-4 py-3 text-sm text-pitch-400">
          🎉 You&apos;re on Pro. Everything&apos;s unlocked — go and use it.
        </div>
      )}
      {activation === "timeout" && (
        <div className="card px-4 py-3 text-sm text-slate-200">
          <p className="font-semibold text-readiness-red">Your payment went through, but the plan hasn&apos;t switched over yet.</p>
          <p className="mt-1 text-slate-400">
            Nothing is lost and you won&apos;t be charged twice. Try reloading in a minute — if it&apos;s
            still not right, email{" "}
            <a href="mailto:info@pocketathlete.com?subject=Payment%20taken%20but%20plan%20not%20active" className="font-semibold text-pitch-400 hover:underline">
              info@pocketathlete.com
            </a>{" "}
            and we&apos;ll sort it straight away.
          </p>
        </div>
      )}
      {checkout === "cancelled" && <div className="card px-4 py-3 text-sm text-slate-400">Checkout cancelled — no charge was made.</div>}

      <PlanGrid mode="app" currentTier={currentTier} />
    </div>
  );
}
