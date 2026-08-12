"use client";

import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { tierOfSub } from "@/components/FeatureLock";
import type { Tier } from "@/lib/types";

/**
 * What the current athlete has paid for.
 *
 * WHY A HOOK. Gating a page meant adding `subscriptions` to that page's own
 * query, pulling the row apart, and remembering `status === "active"` — about
 * eight lines, at every gate. Three capabilities (`injury_plan`, `ai_chat`,
 * `ai_challenges`) were declared in CAPABILITY_TIER and checked by NOTHING in
 * the client, and the pages behind them had no query to hang a check on. A gate
 * that costs eight lines and a schema lookup is a gate that doesn't get added.
 *
 * One cache key for the whole app, so a navigation between two gated pages
 * doesn't re-ask.
 *
 * THIS IS THE COURTESY, NOT THE CONTROL. Anyone can edit `tier` in memory and
 * see the page; what stops them is `requireTier` in the Edge Functions and the
 * RLS policies behind them. This exists so the honest majority are told the
 * price instead of being shown a broken feature.
 */
export function useTier(): { tier: Tier; loading: boolean } {
  const user = useCurrentUser();
  const { data, loading } = useAsync(async () => {
    const supabase = createClient();
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("tier, status")
      .eq("user_id", user.id)
      .maybeSingle();
    return tierOfSub(sub as { tier?: Tier; status?: string } | null);
  }, [user.id], `tier:${user.id}`);

  /**
   * Free WHILE LOADING, and callers must not paint the paywall until `loading`
   * is false. Defaulting the other way would flash the whole feature at someone
   * who hasn't paid for it; defaulting this way without honouring `loading`
   * flashes a paywall at someone who has, which is worse — it reads as the app
   * losing their subscription.
   */
  return { tier: data ?? "bronze", loading };
}
