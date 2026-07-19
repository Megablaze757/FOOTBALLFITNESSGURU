"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { PLANS, TIER_RANK, TEAM_PLAN } from "@/lib/subscription";
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
          <p className="mt-1 text-sm text-slate-400">For individual athletes — plus a Team plan for clubs & coaches.</p>
        </div>
        <Link href="/profile" className="text-sm text-slate-400 hover:text-pitch-400">← Back</Link>
      </header>

      {checkout === "success" && <div className="card px-4 py-3 text-sm text-pitch-400">🎉 Payment received. Your plan updates within a few seconds.</div>}
      {checkout === "cancelled" && <div className="card px-4 py-3 text-sm text-slate-400">Checkout cancelled — no charge was made.</div>}

      <div className="grid items-start gap-4 md:grid-cols-3">
        {PLANS.map((plan, i) => {
          const isCurrent = plan.id === currentTier;
          const isDowngrade = TIER_RANK[plan.id] < TIER_RANK[currentTier];
          const isGold = plan.id === "gold";
          const accent = isGold ? "text-pitch-400" : plan.id === "silver" ? "text-sky-300" : "text-slate-200";
          return (
            <div
              key={plan.id}
              className={`${isGold ? "card-premium" : "card"} animate-fade-up flex h-full flex-col p-6 ${
                isCurrent ? "ring-2 ring-pitch-400/60 shadow-glow" : ""
              }`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-center justify-between">
                <h2 className={`text-lg font-extrabold ${accent}`}>{plan.name}</h2>
                {isGold && !isCurrent && <span className="chip text-pitch-400">Most popular</span>}
              </div>
              <div className="mt-2 text-3xl font-extrabold">{plan.priceLabel}</div>
              <p className="mt-1 text-sm text-slate-400">{plan.tagline}</p>

              <ul className="my-5 flex-1 space-y-2 text-sm text-slate-300">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2"><span className={isGold ? "text-pitch-400" : "text-slate-500"}>✓</span>{f}</li>
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

      {/* Team plan */}
      <div className="card-premium flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-extrabold text-pitch-400">🏆 {TEAM_PLAN.name}</h2>
            <span className="chip text-slate-300">for clubs</span>
          </div>
          <p className="mt-1 text-sm text-slate-400">{TEAM_PLAN.tagline}</p>
          <ul className="mt-3 grid gap-x-4 gap-y-1.5 text-sm text-slate-300 sm:grid-cols-2">
            {TEAM_PLAN.features.map((f) => (
              <li key={f} className="flex gap-2"><span className="text-pitch-400">✓</span>{f}</li>
            ))}
          </ul>
        </div>
        <div className="shrink-0 text-center">
          <div className="text-3xl font-extrabold">{TEAM_PLAN.priceLabel}</div>
          <a href="mailto:sales@fitnessguru.app?subject=Fitness%20Guru%20Team%20plan" className="btn-primary mt-3 w-auto px-6">Contact us</a>
        </div>
      </div>

      <p className="text-center text-xs text-slate-500">Secure payments by Stripe. Cancel anytime.</p>
    </div>
  );
}
