// =============================================================================
// Funnel tracking.
//
// The point is to answer "where do people fall out?" — not to build a profile
// of anyone. So this only ever records signed-in events, with no device
// identifier, no cookie and no third party. See 0045_funnel_events.sql for the
// reasoning; the short version is that storing an ID on someone's device to
// follow them around is what triggers a consent banner, and a consent banner
// would cost more signups than this data could explain.
//
// Every call is fire-and-forget. Analytics must never be able to block, slow or
// break the thing the athlete was actually doing.
// =============================================================================

import { createClient } from "./supabase/client";

/** The funnel, in order. Must match the CHECK constraint in migration 0045. */
export const FUNNEL_EVENTS = [
  "signup",
  "onboarded",
  "first_check_in",
  "paywall_hit",
  "plan_view",
  "plan_cta",
  "checkout_start",
  "checkout_complete",
  "team_enquiry",
  "cancelled",
] as const;

export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

/** The steps that make up the headline conversion story, in order. */
export const FUNNEL_STEPS: { event: FunnelEvent; label: string; note: string }[] = [
  { event: "signup", label: "Signed up", note: "Created an account" },
  { event: "onboarded", label: "Onboarded", note: "Told us their sport and position" },
  { event: "first_check_in", label: "Activated", note: "Completed a first check-in — the habit starts here" },
  { event: "paywall_hit", label: "Hit a paywall", note: "Wanted something a free plan doesn't include" },
  { event: "plan_view", label: "Viewed plans", note: "Opened the pricing page" },
  { event: "checkout_start", label: "Started checkout", note: "Opened Stripe" },
  { event: "checkout_complete", label: "Paid", note: "Subscription active" },
];

/**
 * Record an event. Never throws, never awaits anything the caller depends on.
 *
 * `meta` is for the SHAPE of an event — which plan, which locked feature —
 * never its content. Nothing free-text, nothing about anyone's body or health.
 */
export function track(event: FunnelEvent, meta: Record<string, string | number | boolean> = {}): void {
  // Fire-and-forget: no await at the call site, and every failure swallowed.
  void (async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      // Signed out means no row. That's the privacy design, not a bug —
      // anonymous traffic is counted in aggregate by the host instead.
      if (!user) return;
      await supabase.from("funnel_events").insert({ user_id: user.id, event, meta });
    } catch {
      /* analytics must never surface an error to someone mid-workout */
    }
  })();
}

/**
 * Record an event at most once per browser, for milestones that would otherwise
 * fire on every render — "viewed plans" is interesting once per session, not
 * forty times because a component re-mounted.
 */
export function trackOnce(event: FunnelEvent, meta: Record<string, string | number | boolean> = {}): void {
  const key = `pa:tracked:${event}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    // Private mode with no storage: track it anyway. A duplicate row is a much
    // smaller problem than a missing one.
  }
  track(event, meta);
}

/** Conversion between two steps, as a percentage. */
export function conversion(from: number, to: number): number {
  if (from <= 0) return 0;
  return Math.round((to / from) * 1000) / 10;
}

/**
 * The biggest drop in the funnel — the step worth fixing first.
 *
 * Returns null when there isn't enough data to be meaningful. A funnel with
 * four people in it will happily report a "90% drop-off" that is three people
 * changing their mind, and acting on that is worse than acting on nothing.
 */
export function worstStep(
  counts: Record<string, number>,
  minimum = 20,
): { from: string; to: string; lost: number; rate: number } | null {
  const steps = FUNNEL_STEPS.filter((s) => s.event !== "paywall_hit" && s.event !== "plan_view");
  const top = counts[steps[0].event] ?? 0;
  if (top < minimum) return null;

  let worst: { from: string; to: string; lost: number; rate: number } | null = null;
  for (let i = 0; i < steps.length - 1; i++) {
    const a = counts[steps[i].event] ?? 0;
    const b = counts[steps[i + 1].event] ?? 0;
    if (a <= 0) continue;
    const lost = Math.max(0, a - b);
    const rate = conversion(a, b);
    if (!worst || lost > worst.lost) {
      worst = { from: steps[i].label, to: steps[i + 1].label, lost, rate };
    }
  }
  return worst;
}
