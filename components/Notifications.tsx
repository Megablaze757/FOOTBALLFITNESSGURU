"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { sortNotices, subscriptionState } from "@/lib/notice-staleness";

interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  created_at: string;
}

const ICON: Record<string, string> = {
  program_assigned: "📋",
  coach_request: "🧑‍🏫",
  general: "🔔",
  check_in_reminder: "📝",
  workout_reminder: "🏃",
  weekly_summary: "📊",
  program_deadline: "⏳",
  milestone: "🏆",
  trial_ending: "⏰",
  billing: "💳",
};

/**
 * Unread notifications, shown at the top of Home.
 *
 * Deliberately a banner rather than a bell icon with a badge: there are few of
 * these and they matter (your coach set you work). A badge in the corner is
 * something you learn to ignore.
 */
export function Notifications({ userId }: { userId: string }) {
  const [items, setItems] = useState<Notification[]>([]);

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * A NOTICE IS A MOMENT, AND THIS TABLE STORES IT FOREVER.
   *
   * Reported as trial-ending reminders still showing to people who are
   * already paying. The reminder was right when it was written — we are
   * required to send it — but an unread row is displayed until somebody
   * dismisses it, so "your free trial ends soon, Pro will charge £X unless
   * you cancel" was still on the home screen a week after the charge, from
   * the app that took the money, with a Cancel link under it.
   *
   * So the subscription is loaded ALONGSIDE the notices and the stale ones
   * are dropped — see lib/notice-staleness.ts, which also explains why the
   * decision waits for both queries rather than racing them.
   * ═══════════════════════════════════════════════════════════════════════
   */
  useEffect(() => {
    let active = true;
    const supabase = createClient();
    void (async () => {
      const [notices, sub] = await Promise.all([
        supabase.from("notifications")
          .select("id, kind, title, body, href, created_at")
          .eq("user_id", userId)
          .eq("show_in_app", true)
          .is("read_at", null)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase.from("subscriptions").select("stripe_status").eq("user_id", userId).maybeSingle(),
      ]);
      if (!active) return;

      // A failed subscription read is not "no subscription" — see
      // subscriptionState, which is where that distinction is tested.
      const state = subscriptionState(sub);

      const { show, stale } = sortNotices((notices.data ?? []) as Notification[], state);
      setItems(show);

      // Cleared, not merely hidden: otherwise every device re-decides the
      // same rows forever and the backlog never drains.
      if (stale.length) {
        void supabase.from("notifications")
          .update({ read_at: new Date().toISOString() })
          .in("id", stale.map((n) => n.id));
      }
    })();
    return () => { active = false; };
  }, [userId]);

  async function dismiss(id: string) {
    // Optimistic: it's a dismissal, and having it reappear on a slow network
    // is worse than it vanishing before the write lands.
    setItems((n) => n.filter((x) => x.id !== id));
    await createClient().from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  }

  if (!items.length) return null;

  return (
    <ul className="space-y-2">
      {items.map((n) => {
        const inner = (
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-pitch-400/10 text-lg">
              {ICON[n.kind] ?? "🔔"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-slate-100">{n.title}</span>
              {n.body && <span className="mt-0.5 block text-xs text-slate-400">{n.body}</span>}
            </span>
          </div>
        );
        return (
          <li key={n.id} className="card border-pitch-400/25 p-3 ring-1 ring-pitch-400/20">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                {n.href ? <Link href={n.href} onClick={() => dismiss(n.id)}>{inner}</Link> : inner}
              </div>
              <button
                onClick={() => dismiss(n.id)}
                aria-label="Dismiss"
                className="tap-target shrink-0 px-1 text-slate-600 transition hover:text-slate-300"
              >
                ✕
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
