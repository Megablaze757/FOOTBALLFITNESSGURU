"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { PlanGrid } from "@/components/PlanGrid";
import { trackOnce, track } from "@/lib/funnel";
import type { Subscription, Tier } from "@/lib/types";

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

  const { data } = useAsync(async () => {
    const supabase = createClient();
    const { data: sub } = await supabase.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle();
    return (sub ?? null) as Subscription | null;
  }, [user.id]);

  // Once per session, not once per re-render.
  useEffect(() => { trackOnce("plan_view", { from: "app" }); }, []);

  // Stripe redirects back here on success. The webhook is what actually grants
  // the subscription; this only records that the athlete got through checkout,
  // so the funnel doesn't depend on a redirect that people close early.
  useEffect(() => {
    if (checkout === "success") track("checkout_complete", { via: "redirect" });
  }, [checkout]);

  const currentTier: Tier = data?.status === "active" ? data.tier : "bronze";

  return (
    <div className="animate-fade-up space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Plans</h1>
          <p className="mt-1 text-sm text-slate-400">For individual athletes — plus a Team plan for clubs &amp; coaches.</p>
        </div>
        <Link href="/profile" className="text-sm text-slate-400 hover:text-pitch-400">← Back</Link>
      </header>

      {checkout === "success" && <div className="card px-4 py-3 text-sm text-pitch-400">🎉 Payment received. Your plan updates within a few seconds.</div>}
      {checkout === "cancelled" && <div className="card px-4 py-3 text-sm text-slate-400">Checkout cancelled — no charge was made.</div>}

      <PlanGrid mode="app" currentTier={currentTier} />
    </div>
  );
}
