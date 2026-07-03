"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { PLANS, TIER_RANK } from "@/lib/subscription";
import { UpgradeButton } from "@/components/UpgradeButton";
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

  const currentTier: Tier = data?.status === "active" ? data.tier : "bronze";

  return (
    <div className="animate-fade-up space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Plans</h1>
          <p className="mt-1 text-sm text-slate-400">Unlock AI insights and the full suite.</p>
        </div>
        <Link href="/profile" className="text-sm text-slate-400 hover:text-pitch-400">← Back</Link>
      </header>

      {checkout === "success" && <div className="card px-4 py-3 text-sm text-pitch-400">🎉 Payment received. Your plan updates within a few seconds.</div>}
      {checkout === "cancelled" && <div className="card px-4 py-3 text-sm text-slate-400">Checkout cancelled — no charge was made.</div>}

      <div className="space-y-4">
        {PLANS.map((plan, i) => {
          const isCurrent = plan.id === currentTier;
          const isDowngrade = TIER_RANK[plan.id] < TIER_RANK[currentTier];
          const accent = plan.id === "gold" ? "text-pitch-400" : plan.id === "silver" ? "text-sky-300" : "text-slate-200";
          return (
            <div
              key={plan.id}
              className={`card p-5 animate-fade-up ${isCurrent ? "ring-2 ring-pitch-400/60 shadow-glow" : ""}`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-baseline justify-between">
                <h2 className={`text-lg font-extrabold ${accent}`}>{plan.name}</h2>
                <span className="text-lg font-bold">{plan.priceLabel}</span>
              </div>
              <p className="mt-0.5 text-sm text-slate-400">{plan.tagline}</p>

              <ul className="my-4 space-y-1.5 text-sm text-slate-300">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2"><span className="text-pitch-400">✓</span>{f}</li>
                ))}
              </ul>

              {isCurrent ? (
                <div className="rounded-2xl bg-white/[0.06] px-4 py-2.5 text-center text-sm font-medium text-slate-400">Current plan</div>
              ) : isDowngrade ? (
                <div className="rounded-2xl border border-white/10 px-4 py-2.5 text-center text-sm text-slate-500">Included in your plan</div>
              ) : plan.paid ? (
                <UpgradeButton tier={plan.id} label={`Upgrade to ${plan.name}`} />
              ) : null}
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-slate-500">Secure payments by Stripe. Cancel anytime.</p>
    </div>
  );
}
