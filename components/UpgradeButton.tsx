"use client";

import { useState } from "react";
import { invokeAI } from "@/lib/api";
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
    try {
      const json = await invokeAI<{ url?: string; error?: string }>("create-checkout", { tier });
      if (!json.url) {
        setError(json.error ?? "Could not start checkout — is payments configured?");
        setLoading(false);
        return;
      }
      window.location.href = json.url; // hand off to Stripe
    } catch {
      setError("Payments aren't configured yet. Add your Stripe keys to the API worker.");
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
