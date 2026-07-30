"use client";

import { useEffect, useState } from "react";
import { createClient } from "./supabase/client";

/**
 * Is the signed-in user a coach?
 *
 * WHY THIS EXISTS. /squad — the whole coach product: roster, readiness at a
 * glance, assigning programs, team exercises, per-athlete analytics — had no
 * entry in the navigation at all. The only way in was a link on the Profile
 * page. So a coach signed up, set their role to Coach, and then had to guess
 * that their squad lived under Profile. An entire paid feature with no front
 * door, while ten other things had one.
 *
 * It can't just be added to NAV_ITEMS unconditionally: most users are athletes,
 * and a permanent "Squad" tab that shows a "coaches only" wall is worse than a
 * missing one. So the nav asks.
 *
 * Cached in module scope for the tab's lifetime. Both the sidebar and the tab
 * bar call this on every route change, and a role does not change between two
 * clicks — without the cache this would be a query per navigation, twice.
 */
let cached: boolean | null = null;

export function useIsCoach(): boolean {
  const [isCoach, setIsCoach] = useState(cached ?? false);

  useEffect(() => {
    if (cached !== null) return;
    let alive = true;
    void (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      const role = (data as { role?: string } | null)?.role;
      // admin included: an admin who coaches shouldn't lose the tab.
      cached = role === "coach" || role === "admin";
      if (alive) setIsCoach(cached);
    })();
    return () => { alive = false; };
  }, []);

  return isCoach;
}

/**
 * Forget the cached role.
 *
 * Called when someone changes their own role on the Profile page — otherwise
 * they'd tick "Coach", save, and the Squad tab wouldn't appear until they
 * reloaded the tab, which reads exactly like the setting didn't take.
 */
export function clearCoachRoleCache(): void {
  cached = null;
}
