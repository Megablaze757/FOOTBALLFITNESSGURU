"use client";

import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { ProfileForm } from "@/components/ProfileForm";
import { CoachRequests } from "@/components/CoachRequests";
import { CoachMessages } from "@/components/CoachMessages";
import { ManageBilling } from "@/components/ManageBilling";
import { PushToggle } from "@/components/PushToggle";
import { DeleteAccount } from "@/components/DeleteAccount";
import { planFor } from "@/lib/subscription";
import type { Profile, Subscription, Tier } from "@/lib/types";

export default function ProfilePage() {
  const user = useCurrentUser();

  const { data, loading, reload } = useAsync(async () => {
    const supabase = createClient();
    const [{ data: profile }, { data: sub }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle(),
    ]);
    return { profile: profile as Profile | null, sub: (sub ?? null) as Subscription | null };
  }, [user.id], `profile:${user.id}`);

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
        cancelling={!!subscription?.cancel_at_period_end}
        paused={subscription?.status === "paused"}
        resumesAt={subscription?.pause_until ?? null}
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

      <ProfileForm profile={safeProfile} email={user.email ?? ""} />

      <DeleteAccount email={user.email ?? ""} />
    </div>
  );
}
