"use client";

import { useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { recordChanged } from "@/lib/data-events";
import { ProfileForm } from "@/components/ProfileForm";
import { CoachRequests } from "@/components/CoachRequests";
import { CoachMessages } from "@/components/CoachMessages";
import { ManageBilling } from "@/components/ManageBilling";
import { PushToggle } from "@/components/PushToggle";
import { DeleteAccount } from "@/components/DeleteAccount";
import { planFor, hasLivePlan } from "@/lib/subscription";
import type { Profile, Subscription, Tier } from "@/lib/types";

export default function ProfilePage() {
  const user = useCurrentUser();

  const { data, loading, reload } = useAsync(async () => {
    const supabase = createClient();
    const [{ data: profile }, { data: sub }, { data: affiliate }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle(),
      // Their own affiliate row, if they have one. RLS returns nothing for
      // everybody else rather than erroring, so this is one cheap query that
      // decides whether the partner link is worth showing at all.
      supabase.from("affiliates").select("code").limit(1).maybeSingle(),
    ]);
    return {
      profile: profile as Profile | null,
      sub: (sub ?? null) as Subscription | null,
      isAffiliate: !!affiliate,
    };
  }, [user.id], `profile:${user.id}`);

  // Coming back from Stripe's portal, the change was made THERE and only
  // reaches us when the webhook lands a beat later. Reading once on arrival
  // reliably reads the state from BEFORE the change — the same race that made
  // checkout look like it had failed. Drop the cached copy and re-check a few
  // times, so a cancellation made in the portal shows up here by itself.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!new URLSearchParams(window.location.search).has("billing")) return;
    recordChanged("profile");
    let n = 0;
    const t = setInterval(() => {
      reload();
      if (++n >= 4) clearInterval(t);
    }, 2500);
    return () => clearInterval(t);
    // Once, on arrival. reload is stable enough for this and re-running would
    // restart the polling on every refetch it triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-9 w-32 animate-pulse rounded-lg bg-white/5" />
        <div className="card h-20 animate-pulse" />
        <div className="card h-80 animate-pulse" />
      </div>
    );
  }

  const subscription = data?.sub ?? null;
  const tier: Tier = subscription?.status === "active" ? subscription.tier : "bronze";
  const plan = planFor(tier);
  const safeProfile: Profile = data?.profile ?? {
    id: user.id, full_name: null, avatar_url: null, role: "athlete", experience_years: null, bio: null,
  };

  return (
    <div className="animate-fade-up mx-auto max-w-2xl">
      <header className="mb-5">
        <h1 className="text-3xl font-extrabold tracking-tight">Profile</h1>
        <p className="mt-1 text-sm text-slate-400">Your sport, position and plan. Change these and your program and targets follow.</p>
      </header>

      <CoachRequests />
      <CoachMessages athleteId={user.id} />

      <Link href="/pricing" className="card card-hover mb-4 flex items-center justify-between p-4">
        <div>
          <div className="stat-label">Plan</div>
          <div className="mt-0.5 text-lg font-extrabold">
            <span className={plan.paid ? "text-pitch-400" : "text-slate-200"}>{plan.name}</span>
          </div>
          {subscription?.cancel_at_period_end && subscription.current_period_end && (
            <div className="text-xs text-readiness-red">Cancels {subscription.current_period_end.slice(0, 10)}</div>
          )}
          {subscription?.stripe_status === "trialing" && subscription.trial_end && (
            <div className="text-xs text-pitch-400">Free trial ends {subscription.trial_end.slice(0, 10)}</div>
          )}
        </div>
        {/* Keyed on whether they've paid, not on a tier id. It used to compare
            against the gold tier by name, so a Pro subscriber was invited to
            upgrade to something that no longer exists. */}
        <span className="rounded-xl bg-gradient-to-br from-pitch-400 to-pitch-600 px-3 py-1.5 text-sm font-semibold text-ink-900">
          {plan.paid ? "Plans" : "Upgrade →"}
        </span>
      </Link>

      {/* Cancelling used to mean emailing and asking. A comped account has no
          Stripe customer behind it, so it gets the plans link instead. */}
      <ManageBilling
        hasBilling={!!subscription?.stripe_customer_id}
        // Not the same question as hasBilling. A Stripe customer id is
        // permanent, so someone who subscribed once and cancelled kept being
        // offered "Cancel or pause" on the Free plan.
        onPaidPlan={hasLivePlan(subscription)}
        cancelling={!!subscription?.cancel_at_period_end}
        paused={subscription?.status === "paused"}
        resumesAt={subscription?.pause_until ?? null}
        endsAt={subscription?.current_period_end ?? null}
        onChanged={reload}
      />

      {/* The whole loop depends on the app being opened in the morning. */}
      <PushToggle />

      {(safeProfile.role === "coach" || safeProfile.role === "admin") && (
        <Link href="/squad" className="btn-ghost mb-4">🧑‍🏫 My squad</Link>
      )}
      {safeProfile.role === "admin" && (
        <Link href="/admin" className="btn-ghost mb-4">🛠️ Admin dashboard</Link>
      )}
      {/* SHOWN ONLY TO ACTUAL AFFILIATES.
          `affiliates` is readable by an affiliate for their own row and nobody
          else's (0087), so an empty result here is the answer rather than a
          permission error — which means this link cannot appear for someone who
          would only find a "you are not a partner" page behind it. */}
      {data?.isAffiliate && (
        <Link href="/partner" className="btn-ghost mb-4">🤝 Partner dashboard</Link>
      )}

      <ProfileForm profile={safeProfile} email={user.email ?? ""} />

      <DeleteAccount email={user.email ?? ""} />
    </div>
  );
}
