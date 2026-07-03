"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tier } from "@/lib/types";

// Kicks off Stripe Checkout via the create-checkout Edge Function, then redirects
// to the hosted checkout page.
export function UpgradeButton({
  tier,
  label,
  disabled,
}: {
  tier: Tier;
  label: string;
  disabled?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setError("Please sign in again.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-checkout`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ tier }),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.url) {
        setError(json.error ?? "Could not start checkout.");
        setLoading(false);
        return;
      }
      window.location.href = json.url; // hand off to Stripe
    } catch {
      setError("Network error. Try again.");
      setLoading(false);
    }
  }

  return (
    <div>
      <button onClick={handleClick} disabled={disabled || loading} className="btn-primary">
        {loading ? "Redirecting…" : label}
      </button>
      {error && <p className="mt-2 text-center text-xs text-readiness-red">{error}</p>}
    </div>
  );
}
