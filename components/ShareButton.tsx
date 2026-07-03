"use client";

import { useState } from "react";
import { exportShareCard, type ShareStats } from "@/lib/share-card";

export function ShareButton({ stats }: { stats: ShareStats }) {
  const [busy, setBusy] = useState(false);

  async function share() {
    setBusy(true);
    try {
      await exportShareCard(stats);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button onClick={share} disabled={busy} className="btn-ghost">
      {busy ? "Creating…" : "📸 Share my progress"}
    </button>
  );
}
