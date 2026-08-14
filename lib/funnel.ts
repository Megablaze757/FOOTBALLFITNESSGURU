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
  // The two milestones that decide whether a new account ever sees the product
  // work. Neither was recorded, so "how long until someone has a plan and has
  // trained from it?" — the number the D7 target rests on — was unanswerable.
  "program_built",
  "first_session",
] as const;

export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

/**
 * A STEP IS NOT ALWAYS AN EVENT.
 *
 * `confirmed_email` is never inserted by anything — funnel_summary derives it
 * from auth.users.email_confirmed_at, because confirming an email happens on
 * Supabase's side and the app never sees the moment it does. It earns a place in
 * the funnel anyway: it sits between signing up and reaching the product, and
 * without it "Signed up -> Onboarded" silently merges two unrelated failures —
 * mail that never arrived, and a screen people abandoned — which need opposite
 * fixes.
 *
 * Kept out of FUNNEL_EVENTS deliberately. That list is the set of names track()
 * may insert and must match the CHECK constraint; putting a derived step in it
 * would invite a call that the database would then reject.
 */
export type FunnelStep = FunnelEvent | "confirmed_email";

/** The steps that make up the headline conversion story, in order. */
/**
 * TWO PATHS, NOT ONE LINE.
 *
 * These used to render as a single sequence, and the report then said things
 * like "Activated 0 · Hit a paywall 2 · 0% of previous" — which is not a drop,
 * it is a category error. Hitting a paywall does not require a check-in; the
 * two happen independently, and dividing one by the other produced a percentage
 * with nothing behind it.
 *
 * `activation` is a genuine ordered chain: each step can only happen after the
 * one above it, so a fall between them is a real loss with a place to fix it.
 * `revenue` is its own chain, entered from anywhere in the app. Percentages are
 * only ever computed inside a group, never across the boundary.
 */
export type StepGroup = "activation" | "revenue";

export const FUNNEL_STEPS: { event: FunnelStep; label: string; note: string; group: StepGroup }[] = [
  { event: "signup", label: "Signed up", note: "Created an account", group: "activation" },
  { event: "confirmed_email", label: "Confirmed email", note: "Clicked the link — until they do, they cannot reach the app at all", group: "activation" },
  { event: "onboarded", label: "Onboarded", note: "Told us their sport and position", group: "activation" },
  { event: "first_check_in", label: "Activated", note: "Completed a first check-in — the habit starts here", group: "activation" },
  { event: "paywall_hit", label: "Hit a paywall", note: "Wanted something a free plan doesn't include", group: "revenue" },
  { event: "plan_view", label: "Viewed plans", note: "Opened the pricing page", group: "revenue" },
  { event: "checkout_start", label: "Started checkout", note: "Opened Stripe", group: "revenue" },
  { event: "checkout_complete", label: "Paid", note: "Subscription active", group: "revenue" },
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
      // Elapsed seconds since the account was created, on every event.
      //
      // This is what makes the first run measurable without anyone holding a
      // stopwatch: with it on signup, onboarded, program_built and
      // first_session, "how long from account to training" is a query rather
      // than a guess. A duration is not an identifier — it says nothing about
      // who or which device, which keeps this inside 0045's rule that meta
      // describes the shape of an event and never its content.
      const created = user.created_at ? Date.parse(user.created_at) : NaN;
      const sinceSignup = Number.isFinite(created)
        ? { since_signup_s: Math.max(0, Math.round((Date.now() - created) / 1000)) }
        : {};
      await supabase.from("funnel_events").insert({
        user_id: user.id,
        event,
        meta: { ...sinceSignup, ...meta },
      });
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
  // A STEP THAT WAS NOT MEASURED IS NOT A STEP WHERE EVERYONE DIED.
  //
  // Reading an absent key as 0 makes an unmeasured step look like a total wipe
  // out, and it will always be the biggest "drop" on the report. That is not
  // hypothetical: `confirmed_email` only exists once migration 0079 is applied,
  // and the client ships before anyone runs it — so between those two moments
  // this would have reported a catastrophic loss at a step nobody had data for.
  // Absent and zero are different facts and are kept different here.
  const present = FUNNEL_STEPS.filter((s) => s.event in counts);
  const top = counts[FUNNEL_STEPS[0].event] ?? 0;
  if (top < minimum) return null;

  let worst: { from: string; to: string; lost: number; rate: number } | null = null;
  for (let i = 0; i < present.length - 1; i++) {
    const a = present[i];
    const b = present[i + 1];
    // Only inside a chain. Comparing the last activation step with the first
    // revenue one measured nothing — a paywall is reachable without a check-in,
    // so the "drop" between them was an artifact of the list order.
    if (a.group !== b.group) continue;
    const from = counts[a.event] ?? 0;
    const to = counts[b.event] ?? 0;
    if (from <= 0) continue;
    const lost = Math.max(0, from - to);
    const rate = conversion(from, to);
    if (!worst || lost > worst.lost) {
      worst = { from: a.label, to: b.label, lost, rate };
    }
  }
  return worst;
}


