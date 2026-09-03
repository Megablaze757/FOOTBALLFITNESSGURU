"use client";

import { AdminShell, AdminArea } from "@/components/admin/AdminShell";
import { ReelStudio } from "@/components/ReelStudio";

/**
 * Reels get their own page rather than a tab inside the content engine.
 *
 * The engine's other tabs are a posting plan and two image exporters, all of
 * which render instantly. Recording is a foreground job that ties up the tab
 * for twenty seconds, and it now has seven content types and six hundred
 * subjects behind it — that is a screen, not a tab.
 */
export default function AdminReels() {
  return (
    <AdminShell title="Reels" note="Vertical video, recorded here, from content that already exists.">
      <AdminArea title="Reel studio" note="Pick a kind, pick a subject, record it">
        <ReelStudio />
      </AdminArea>
    </AdminShell>
  );
}
