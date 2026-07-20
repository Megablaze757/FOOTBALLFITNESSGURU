"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Whether the app has launched out of beta. Read from app_settings (a single
// row anyone can read). Cached at module scope so the badge doesn't refetch on
// every navigation. Defaults to "in beta" until we know otherwise.
let cached: boolean | null = null;

export function useLaunched(): boolean {
  const [launched, setLaunched] = useState<boolean>(cached ?? false);

  useEffect(() => {
    if (cached !== null) { setLaunched(cached); return; }
    let active = true;
    createClient()
      .from("app_settings")
      .select("launched")
      .maybeSingle()
      .then(({ data }) => {
        cached = Boolean((data as { launched?: boolean } | null)?.launched);
        if (active) setLaunched(cached);
      });
    return () => { active = false; };
  }, []);

  return launched;
}

/** Flip the flag (admin only — enforced by RLS) and update the local cache. */
export async function setLaunched(value: boolean): Promise<string | null> {
  const { error } = await createClient()
    .from("app_settings")
    .update({ launched: value, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) return error.message;
  cached = value;
  return null;
}
