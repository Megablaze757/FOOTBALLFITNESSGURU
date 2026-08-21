"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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

  useEffect(() => {
    let active = true;
    createClient()
      .from("notifications")
      .select("id, kind, title, body, href, created_at")
      .eq("user_id", userId)
      .eq("show_in_app", true)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => { if (active) setItems((data ?? []) as Notification[]); });
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
